const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'planta_academica_refresh_secret_jwt_key_2026';

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token ausente' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      ...decoded,
      id: decoded.sub || decoded.id
    };
    req.tenant_id = decoded.tenant_id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = {
  authenticateJWT,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
