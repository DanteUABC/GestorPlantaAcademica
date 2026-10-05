const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

// List available tenants
async function getTenants(req, res) {
  try {
    const tenants = await query.all('SELECT id, name, slug FROM tenants ORDER BY name ASC');
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener instituciones', details: err.message });
  }
}

// List available roles
async function getRoles(req, res) {
  try {
    const roles = await query.all('SELECT id, name, description FROM roles WHERE name != "Administrador" ORDER BY name ASC');
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar roles', details: err.message });
  }
}

// Register user with tenant and role selection
async function register(req, res) {
  try {
    const { name, email, password, role_name, tenant_id, new_tenant_name, identifier } = req.body;

    if (!name || !email || !password || !role_name) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben estar presentes (nombre, correo, contraseña, rol).' });
    }

    let finalTenantId = tenant_id;

    // Si el usuario crea una nueva institución sobre la marcha
    if (!finalTenantId && new_tenant_name) {
      const slug = new_tenant_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').slice(0, 30) + '-' + Date.now().toString().slice(-4);
      finalTenantId = 'tenant-' + Date.now();
      await query.run(
        'INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)',
        [finalTenantId, new_tenant_name.trim(), slug]
      );
    }

    if (!finalTenantId) {
      return res.status(400).json({ error: 'Debe seleccionar una institución existente o especificar el nombre de una nueva.' });
    }

    // Validar existencia de la institución
    const tenant = await query.get('SELECT id, name FROM tenants WHERE id = ?', [finalTenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'La institución educativa especificada no existe.' });
    }

    // Validar rol (Solo permitir Administrador, Coordinador o Profesor)
    if (role_name === 'Alumno') {
        return res.status(400).json({ error: 'El rol Alumno ya no está disponible en el sistema.' });
    }
    const role = await query.get('SELECT id, name FROM roles WHERE name = ?', [role_name]);
    if (!role) {
      return res.status(400).json({ error: `El rol '${role_name}' no es válido.` });
    }

    // Validar si el correo ya existe dentro de este tenant (Shared Schema, Multi-tenant)
    const existingUser = await query.get('SELECT id FROM users WHERE tenant_id = ? AND email = ?', [finalTenantId, email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe un usuario con este correo electrónico en esta institución.' });
    }

    // Hashear contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'usr-' + Date.now();

    await query.run(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role_id, identifier)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, finalTenantId, name.trim(), email.toLowerCase().trim(), passwordHash, role.id, identifier || '']
    );

    // Generar JWT
    const tokenPayload = {
      id: userId,
      tenant_id: finalTenantId,
      role_name: role.name,
      role_id: role.id,
      email: email.toLowerCase().trim(),
      name: name.trim()
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        ...tokenPayload,
        tenant_name: tenant.name,
        identifier
      }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno en el servidor', details: err.message });
  }
}

// Login
async function login(req, res) {
  try {
    const { email, password, tenant_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Debe ingresar correo y contraseña' });
    }

    const cleanEmail = email.toLowerCase().trim();

    let user;
    if (tenant_id) {
      user = await query.get(
        `SELECT u.*, r.name as role_name, t.name as tenant_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.tenant_id = ? AND u.email = ?`,
        [tenant_id, cleanEmail]
      );
    } else {
      user = await query.get(
        `SELECT u.*, r.name as role_name, t.name as tenant_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.email = ?`,
        [cleanEmail]
      );
    }

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas (usuario o institución no encontrados)' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas (contraseña incorrecta)' });
    }

    const tokenPayload = {
      id: user.id,
      tenant_id: user.tenant_id,
      role_name: user.role_name,
      role_id: user.role_id,
      email: user.email,
      name: user.name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        ...tokenPayload,
        tenant_name: user.tenant_name,
        identifier: user.identifier
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno en el servidor', details: err.message });
  }
}

// Current user info
async function getMe(req, res) {
  try {
    const user = await query.get(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.identifier, r.name as role_name, t.name as tenant_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = ? AND u.tenant_id = ?`,
      [req.user.id, req.tenant_id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil', details: err.message });
  }
}

module.exports = {
  getTenants,
  getRoles,
  register,
  login,
  getMe
};
