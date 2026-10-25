const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../db');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../middleware/auth');
const { getNextIdentifier, generateIdentifier } = require('../utils/identifierHelper');

// Endpoint: Seleccionar Tenant (Inyección de rol desde BD)
exports.selectTenant = async (req, res) => {
    const userId = req.user.id; 
    const { tenant_id } = req.body;

    if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id es requerido' });
    }

    try {
        // Consultar el rol del usuario para este tenant específico
        const sqlQuery = `
            SELECT COALESCE(r.nombre, r.name) AS rol_nombre
            FROM usuarios_roles ur
            JOIN roles r ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.tenant_id = $2
            LIMIT 1;
        `;
        const result = await pool.query(sqlQuery, [userId, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'No tienes acceso a esta institución o no tienes un rol asignado' });
        }

        const userRole = result.rows[0].rol_nombre;

        // Generar Access Token con payload enriquecido (sin Alumnos)
        const accessToken = jwt.sign(
            { 
                sub: userId, 
                id: userId,
                tenant_id: tenant_id,
                role: userRole,
                role_name: userRole
            }, 
            JWT_SECRET, 
            { expiresIn: '15m' }
        );

        // Generar Refresh Token
        const refreshToken = jwt.sign(
            { sub: userId, tenant_id: tenant_id }, 
            JWT_REFRESH_SECRET, 
            { expiresIn: '7d' }
        );

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ accessToken, role: userRole });
    } catch (err) {
        console.error('Error al seleccionar tenant:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Endpoint: Silent Refresh
exports.refreshToken = async (req, res) => {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        // Revalidar rol en BD
        const sqlQuery = `
            SELECT COALESCE(r.nombre, r.name) AS rol_nombre
            FROM usuarios_roles ur
            JOIN roles r ON ur.rol_id = r.id
            WHERE ur.usuario_id = $1 AND ur.tenant_id = $2
            LIMIT 1;
        `;
        const result = await pool.query(sqlQuery, [decoded.sub, decoded.tenant_id]);
        
        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Permisos revocados' });
        }

        const userRole = result.rows[0].rol_nombre;

        const newAccessToken = jwt.sign(
            { 
                sub: decoded.sub, 
                id: decoded.sub,
                tenant_id: decoded.tenant_id, 
                role: userRole,
                role_name: userRole 
            },
            JWT_SECRET,
            { expiresIn: '15m' }
        );

        return res.json({ accessToken: newAccessToken, role: userRole });
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

// Endpoint: OAuth Callback
exports.oauthCallback = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }

    if (user.isNew) {
      // Generar un token temporal para proteger la fase de registro (15m)
      const regToken = jwt.sign(
        { email: user.email, provider: user.provider, provider_id: user.provider_id },
        process.env.JWT_SECRET || JWT_SECRET,
        { expiresIn: '15m' }
      );
      // Redirigir al frontend a la vista de completar registro
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/register/external?token=${regToken}&email=${encodeURIComponent(user.email)}`);
    }

    // Lógica para usuarios que ya estaban registrados (emisión de accessToken/refreshToken)
    let roleName = user.role_name;
    let roleId = user.role_id;
    let tenantName = user.tenant_name;
    let identifier = user.identificador || user.identifier;
    let dbInfo;

    try {
      dbInfo = await pool.query(
        `SELECT u.*, COALESCE(r.nombre, r.name) AS role_name, t.name AS tenant_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE u.id = $1`,
        [user.id]
      );
      if (dbInfo && dbInfo.rows && dbInfo.rows.length > 0) {
        roleName = dbInfo.rows[0].role_name || roleName;
        roleId = dbInfo.rows[0].role_id || roleId;
        tenantName = dbInfo.rows[0].tenant_name || tenantName;
        identifier = dbInfo.rows[0].identificador || dbInfo.rows[0].identifier || identifier;
      }
    } catch (e) {
      // Continuar con los datos en memoria si la consulta no procede
    }

    const finalRole = roleName || (roleId === 'role-coord' ? 'Coordinador' : (roleId === 'role-teacher' ? 'Profesor' : roleId));
    const fullName = (dbInfo?.rows?.[0]?.nombre || dbInfo?.rows?.[0]?.apellidos)
      ? `${dbInfo.rows[0].nombre || ''} ${dbInfo.rows[0].apellidos || ''}`.trim()
      : (user.name || user.nombre || 'Usuario');

    const tokenPayload = {
      sub: user.id,
      id: user.id,
      tenant_id: user.tenant_id,
      role: finalRole,
      role_name: finalRole,
      role_id: roleId,
      email: user.email,
      nombre: dbInfo?.rows?.[0]?.nombre || user.nombre,
      apellidos: dbInfo?.rows?.[0]?.apellidos || user.apellidos,
      name: fullName,
      identificador: identifier,
      identifier: identifier
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.id, tenant_id: user.tenant_id }, process.env.JWT_REFRESH_SECRET || JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/login?token=${accessToken}`);
  } catch (err) {
    console.error('Error en OAuth callback:', err);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=server_error`);
  }
};

// Endpoint: Logout
exports.logout = (req, res) => {
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  return res.json({ message: 'Sesión cerrada exitosamente' });
};

// List available tenants (sin duplicados y filtrando registros activos)
exports.getTenants = async (req, res) => {
  try {
    let tenants = [];
    try {
      tenants = await query.all(
        "SELECT DISTINCT id, COALESCE(nombre, name) AS nombre, COALESCE(name, nombre) AS name, slug FROM tenants WHERE status = 'active' ORDER BY name ASC"
      );
    } catch (statusErr) {
      tenants = await query.all(
        "SELECT DISTINCT id, COALESCE(nombre, name) AS nombre, COALESCE(name, nombre) AS name, slug FROM tenants ORDER BY name ASC"
      );
    }

    // Filtro de unicidad por nombre para evitar instituciones repetidas o alias duplicados (ej. '1' vs 'tenant-itc')
    const seenNames = new Set();
    const uniqueTenants = [];

    // Priorizar IDs semánticos ('tenant-itc') sobre IDs numéricos antiguos ('1')
    const sorted = [...tenants].sort((a, b) => {
      const aIsNum = /^\d+$/.test(a.id);
      const bIsNum = /^\d+$/.test(b.id);
      if (aIsNum && !bIsNum) return 1;
      if (!aIsNum && bIsNum) return -1;
      return (a.name || '').localeCompare(b.name || '');
    });

    for (const t of sorted) {
      const normalizedName = (t.name || t.nombre || '').trim().toLowerCase();
      if (!seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueTenants.push({
          id: t.id,
          name: t.name || t.nombre,
          nombre: t.nombre || t.name,
          slug: t.slug
        });
      }
    }

    res.json(uniqueTenants);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener instituciones', details: err.message });
  }
};

// List available roles (Excluyendo Alumno)
exports.getRoles = async (req, res) => {
  try {
    const roles = await query.all("SELECT id, name, COALESCE(nombre, name) as nombre, description FROM roles WHERE name NOT IN ('Administrador', 'Alumno') ORDER BY name ASC");
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar roles', details: err.message });
  }
};

// Validación compartida para reutilización de dominio institucional
const isPavilionEmail = (email) => email && email.trim().toLowerCase().endsWith('@pavilion.com');

// Register user with tenant and role selection
exports.register = async (req, res) => {
  try {
    const { name, nombre, apellidos, email, password, role_name, rol_id, tenant_id, new_tenant_name, identifier, identificador } = req.body;

    const rawName = (nombre || apellidos) ? `${nombre || ''} ${apellidos || ''}`.trim() : (name || '');
    const finalRoleName = role_name || (rol_id === 1 || rol_id === '1' || rol_id === 'role-coord' ? 'Coordinador' : (rol_id === 2 || rol_id === '2' || rol_id === 'role-teacher' ? 'Profesor' : rol_id));

    if (!rawName || !email || !password || !finalRoleName) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben estar presentes (nombre, correo, contraseña, rol).' });
    }

    if (!isPavilionEmail(email)) {
      return res.status(400).json({ 
        error: 'Debe incluir la denominación @pavilion.com en su correo electrónico' 
      });
    }

    let finalTenantId = tenant_id;

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

    const tenant = await query.get('SELECT id, name FROM tenants WHERE id = ?', [finalTenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'La institución educativa especificada no existe.' });
    }

    if (finalRoleName === 'Alumno') {
      return res.status(400).json({ error: 'El rol Alumno ya no está disponible en el sistema.' });
    }

    const role = await query.get('SELECT id, name, COALESCE(nombre, name) as nombre FROM roles WHERE name = ? OR nombre = ? OR id = ?', [finalRoleName, finalRoleName, finalRoleName]);
    if (!role) {
      return res.status(400).json({ error: `El rol '${finalRoleName}' no es válido.` });
    }

    const existingUser = await query.get('SELECT id FROM users WHERE tenant_id = ? AND email = ?', [finalTenantId, email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe un usuario con este correo electrónico en esta institución.' });
    }

    let finalNombre = nombre ? nombre.trim() : '';
    let finalApellidos = apellidos ? apellidos.trim() : '';
    if (!finalNombre && rawName) {
      const parts = rawName.trim().split(' ');
      finalNombre = parts[0];
      finalApellidos = parts.slice(1).join(' ') || '';
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'usr-' + Date.now();
    const finalIdentifier = await getNextIdentifier(role.nombre || role.name, pool);

    await query.run(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, password_hash, role_id, identificador)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, finalTenantId, finalNombre, finalApellidos, email.toLowerCase().trim(), passwordHash, role.id, finalIdentifier]
    );

    const fullName = `${finalNombre} ${finalApellidos}`.trim() || rawName;

    const tokenPayload = {
      sub: userId,
      id: userId,
      tenant_id: finalTenantId,
      role: role.nombre || role.name,
      role_name: role.nombre || role.name,
      role_id: role.id,
      email: email.toLowerCase().trim(),
      nombre: finalNombre,
      apellidos: finalApellidos,
      name: fullName,
      identificador: finalIdentifier,
      identifier: finalIdentifier
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: userId, tenant_id: finalTenantId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token: accessToken,
      accessToken,
      role: role.nombre || role.name,
      user: {
        ...tokenPayload,
        tenant_name: tenant.name,
        identificador: finalIdentifier,
        identifier: finalIdentifier
      }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno en el servidor', details: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password, tenant_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Debe ingresar correo y contraseña' });
    }

    if (!isPavilionEmail(email)) {
      return res.status(400).json({ 
        error: 'Debe incluir la denominación @pavilion.com para iniciar sesión' 
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    let user;
    if (tenant_id) {
      user = await query.get(
        `SELECT u.*, COALESCE(r.nombre, r.name) as role_name, t.name as tenant_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.tenant_id = ? AND u.email = ?`,
        [tenant_id, cleanEmail]
      );
    } else {
      user = await query.get(
        `SELECT u.*, COALESCE(r.nombre, r.name) as role_name, t.name as tenant_name
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

    const fullName = (user.nombre || user.apellidos)
      ? `${user.nombre || ''} ${user.apellidos || ''}`.trim()
      : (user.name || '');
    const identifierVal = user.identificador || user.identifier || '';

    const tokenPayload = {
      sub: user.id,
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role_name,
      role_name: user.role_name,
      role_id: user.role_id,
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      name: fullName,
      identificador: identifierVal,
      identifier: identifierVal
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.id, tenant_id: user.tenant_id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Inicio de sesión exitoso',
      token: accessToken,
      accessToken,
      role: user.role_name,
      user: {
        ...tokenPayload,
        tenant_name: user.tenant_name,
        identificador: identifierVal,
        identifier: identifierVal
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno en el servidor', details: err.message });
  }
};

// Current user info
exports.getMe = async (req, res) => {
  try {
    const user = await query.get(
      `SELECT u.id, u.tenant_id, u.nombre, u.apellidos,
              TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
              u.email, u.identificador, u.identificador AS identifier,
              COALESCE(r.nombre, r.name) as role_name, t.name as tenant_name
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
};

// 2B. Nuevo endpoint POST /api/auth/external-register
exports.completeExternalRegistration = async (req, res) => {
  const { token, nombre, apellidos, rol_id, tenant_id } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token de registro inválido o expirado' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || JWT_SECRET);
  } catch (tokenErr) {
    return res.status(400).json({ error: 'Token de registro inválido o expirado' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tipoRol = (rol_id === 1 || rol_id === '1' || rol_id === 'role-coord' || String(rol_id || '').toLowerCase().includes('coord')) 
      ? 'coordinador' 
      : 'profesor'; 
    const identificador = await generateIdentifier(tipoRol, client);

    const fullName = `${nombre || ''} ${apellidos || ''}`.trim() || 'Usuario Externo';

    const insertUser = await client.query(
      `INSERT INTO usuarios (identificador, nombre, apellidos, email, provider, provider_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [identificador, nombre, apellidos, decoded.email, decoded.provider, decoded.provider_id]
    );

    const userId = insertUser.rows[0].id;

    await client.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id, tenant_id) VALUES ($1, $2, $3)`,
      [userId, rol_id, tenant_id]
    );

    await client.query('COMMIT');

    // Consultar el usuario creado completo con sus relaciones
    const userRes = await client.query(
      `SELECT u.*, COALESCE(r.nombre, r.name) AS role_name, t.name AS tenant_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    const user = userRes.rows[0] || {};
    const roleName = user.role_name || (tipoRol === 'coordinador' ? 'Coordinador' : 'Profesor');
    const finalIdentifier = user.identificador || user.identifier || identificador;

    const tokenPayload = {
      sub: user.id || userId,
      id: user.id || userId,
      tenant_id: user.tenant_id || tenant_id,
      role: roleName,
      role_name: roleName,
      role_id: user.role_id || rol_id,
      email: user.email || decoded.email,
      name: user.name || fullName,
      identifier: finalIdentifier,
      identificador: finalIdentifier
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.id || userId, tenant_id: user.tenant_id || tenant_id }, process.env.JWT_REFRESH_SECRET || JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      message: 'Registro externo completado exitosamente',
      token: accessToken,
      accessToken,
      role: roleName,
      user: {
        ...tokenPayload,
        tenant_name: user.tenant_name || 'Instituto Tecnológico Central',
        identifier: finalIdentifier,
        identificador: finalIdentifier
      }
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('Error al ejecutar ROLLBACK:', rbErr);
      }
    }

    if (error.code === '23505') {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
    }

    console.error('Error en completeExternalRegistration:', error);
    return res.status(500).json({ error: 'Error en el servidor al intentar completar el registro.' });
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.isPavilionEmail = isPavilionEmail;
exports.registerLocal = exports.register;
exports.loginLocal = exports.login;

