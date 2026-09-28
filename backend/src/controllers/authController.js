const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../middleware/auth');

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

    // Validar rol
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

// -------------------------------------------------------------
// FASE 1 Y FASE 2 JWT & OAUTH SSO
// -------------------------------------------------------------

// Callback Post-OAuth: Emite IDENTITY TOKEN
function oauthCallback(req, res) {
  // req.user viene inyectado por Passport
  if (!req.user || !req.user.id) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
  }

  const identityToken = jwt.sign(
    { sub: req.user.id, type: 'identity' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  // Redirige al frontend pasando el token en la URL de forma efímera
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/login?token=${identityToken}`);
}

// Endpoint: Seleccionar Tenant -> Emite ACCESS TOKEN y REFRESH COOKIE
async function selectTenant(req, res) {
  try {
    let userId = req.user?.sub || req.user?.id;

    // Asume que un middleware previo validó el identityToken en req.headers
    // O fallback directo verificando Authorization Bearer
    if (!userId) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.sub || decoded.id;
        } catch (e) {
          return res.status(401).json({ error: 'Token de identidad inválido o expirado' });
        }
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'No autorizado: Se requiere Identity Token' });
    }

    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId es requerido' });
    }

    // Validar existencia del tenant
    const tenant = await query.get('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Institución (tenant) no encontrada' });
    }

    // Consultar usuario en base de datos
    let user = await query.get(
      `SELECT u.*, r.name as role_name, t.name as tenant_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    let roleId = user.role_id;
    let roleName = user.role_name;

    // Si el usuario no tiene rol o pertenece a otro tenant, asignar rol por defecto
    if (!roleId || user.tenant_id !== tenantId) {
      const defaultRole = await query.get('SELECT id, name FROM roles WHERE name = ?', ['Alumno']);
      roleId = roleId || defaultRole?.id || 'role-student';
      roleName = roleName || defaultRole?.name || 'Alumno';

      await query.run(
        'UPDATE users SET tenant_id = ?, role_id = ? WHERE id = ?',
        [tenantId, roleId, userId]
      );
    }

    const accessToken = jwt.sign(
      { sub: userId, id: userId, tenant_id: tenantId, role_id: roleId, role_name: roleName, type: 'access' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { sub: userId, id: userId, tenant_id: tenantId, role_id: roleId, role_name: roleName, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Configuración de cookie HttpOnly contra XSS
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      accessToken,
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        tenant_id: tenantId,
        tenant_name: tenant.name,
        role_id: roleId,
        role_name: roleName
      }
    });
  } catch (err) {
    console.error('Error en selectTenant:', err);
    res.status(500).json({ error: 'Error interno al procesar selección de tenant', details: err.message });
  }
}

// Endpoint: Refrescar Token Silenciosamente
function refreshToken(req, res) {
  const rfToken = req.cookies?.refresh_token;
  if (!rfToken) return res.status(401).json({ error: 'No refresh token' });

  jwt.verify(rfToken, JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });

    // Re-emitimos el token contextual
    const newAccessToken = jwt.sign(
      {
        sub: decoded.sub,
        id: decoded.sub,
        tenant_id: decoded.tenant_id,
        role_id: decoded.role_id,
        role_name: decoded.role_name,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ accessToken: newAccessToken });
  });
}

// Endpoint: Logout
function logout(req, res) {
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax'
  });
  res.json({ message: 'Sesión finalizada exitosamente' });
}

module.exports = {
  getTenants,
  getRoles,
  register,
  login,
  getMe,
  oauthCallback,
  selectTenant,
  refreshToken,
  logout
};
