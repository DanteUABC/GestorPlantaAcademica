const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'planta_academica_refresh_secret_jwt_key_2026';

// Map de revocaciones activas por usuario: userId -> timestamp en milisegundos
const revokedUsers = new Map();

function invalidateUserTokens(userId) {
  if (userId) {
    revokedUsers.set(String(userId), Date.now());
  }
}

function isUserTokenRevoked(userId, tokenIatSeconds) {
  if (!userId || !revokedUsers.has(String(userId))) {
    return false;
  }
  const revokedAtMs = revokedUsers.get(String(userId));
  // Si no se proporcionó iat, asumimos revocado por precaución
  if (!tokenIatSeconds) return true;
  const tokenIssuedAtMs = tokenIatSeconds * 1000;
  return tokenIssuedAtMs <= revokedAtMs;
}

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token ausente' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.sub || decoded.id;

    if (isUserTokenRevoked(userId, decoded.iat)) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }

    req.user = {
      ...decoded,
      id: userId
    };
    req.tenant_id = decoded.tenant_id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = {
  authenticateJWT,
  invalidateUserTokens,
  isUserTokenRevoked,
  revokedUsers,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
