const { pool } = require('./db');
(async () => {
  try {
    const users = await pool.query("SELECT * FROM users WHERE google_id IS NOT NULL OR microsoft_id IS NOT NULL");
    console.log("OAuth Users:", users.rows);
    
    if (users.rows.length > 0) {
      const ur = await pool.query("SELECT * FROM usuarios_roles WHERE usuario_id = $1", [users.rows[0].id]);
      console.log("usuarios_roles:", ur.rows);
      
      const res = await pool.query(`
        SELECT COALESCE(r.nombre, r.name) AS rol_nombre
        FROM usuarios_roles ur
        JOIN roles r ON ur.rol_id = r.id
        WHERE ur.usuario_id = $1 AND ur.tenant_id = $2
      `, [users.rows[0].id, users.rows[0].tenant_id]);
      console.log("Select Tenant Query Result:", res.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
