function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = req.user && (req.user.role_name || req.user.role);
    if (!userRole) {
      return res.status(403).json({ error: 'Acceso denegado: Rol no identificado' });
    }

    const normalizedUserRole = String(userRole).trim().toLowerCase();
    const isAllowed = allowedRoles.some(
      (role) => String(role).trim().toLowerCase() === normalizedUserRole
    );

    if (!isAllowed) {
      return res.status(403).json({
        error: `Acceso denegado: Se requiere uno de los roles [${allowedRoles.join(', ')}], pero tu rol es '${userRole}'`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};
