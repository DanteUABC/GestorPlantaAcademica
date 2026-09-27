function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !req.user.role_name) {
      return res.status(403).json({ error: 'Acceso denegado: Rol no identificado' });
    }

    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        error: `Acceso denegado: Se requiere uno de los roles [${allowedRoles.join(', ')}], pero tu rol es '${req.user.role_name}'`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};
