/**
 * Helper para gestión y generación secuencial de IDs institucionales por rol:
 * - Coordinador / Administrador: "C001" hasta "C999"
 * - Profesor / Maestro: "M001" hasta "M999"
 */

function getRolePrefix(roleNameOrId) {
  const roleStr = String(roleNameOrId || '').toLowerCase().trim();
  if (roleStr.includes('coord') || roleStr.includes('admin') || roleStr === 'role-coord' || roleStr === 'role-admin') {
    return 'C';
  }
  return 'M';
}

/**
 * Obtiene el siguiente ID disponible para el rol indicado.
 * Incrementa secuencialmente de uno en uno (ej. C001 -> C002, M001 -> M002) hasta 999.
 * @param {string} roleNameOrId Nombre o ID del rol ('Coordinador', 'Profesor', etc.)
 * @param {object} poolOrClient Instancia de pg.Pool o pg.Client
 * @returns {Promise<string>} Identificador formateado (ej: 'C001', 'M001')
 */
async function getNextIdentifier(roleNameOrId, poolOrClient) {
  const prefix = getRolePrefix(roleNameOrId);

  const res = await poolOrClient.query(
    "SELECT identifier FROM users WHERE identifier LIKE $1",
    [`${prefix}%`]
  );

  let maxNum = 0;
  const regex = new RegExp(`^${prefix}(\\d{3,})$`, 'i');

  for (const row of res.rows) {
    if (row.identifier) {
      const match = row.identifier.trim().match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  if (nextNum > 999) {
    throw new Error(`Se ha alcanzado el límite máximo de identificadores para el prefijo ${prefix} (máximo 999 registros).`);
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/**
 * Migra y normaliza los IDs de las cuentas ya existentes en la base de datos
 * asegurando que cada Coordinador tenga C001..C999 y cada Maestro tenga M001..M999 sin repetirse.
 * @param {object} poolOrClient Instancia de pg.Pool o pg.Client
 */
async function migrateExistingUserIdentifiers(poolOrClient) {
  // 1. Coordinadores / Administradores existentes
  const coords = await poolOrClient.query(`
    SELECT u.id, u.identifier, u.created_at
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE (LOWER(r.name) LIKE '%coord%' OR LOWER(r.name) LIKE '%admin%' 
        OR LOWER(COALESCE(r.nombre, '')) LIKE '%coord%' OR LOWER(COALESCE(r.nombre, '')) LIKE '%admin%')
    ORDER BY u.created_at ASC, u.id ASC
  `);

  let cIndex = 1;
  for (const user of coords.rows) {
    const targetId = `C${String(cIndex).padStart(3, '0')}`;
    if (user.identifier !== targetId) {
      await poolOrClient.query('UPDATE users SET identifier = $1 WHERE id = $2', [targetId, user.id]);
    }
    cIndex++;
  }

  // 2. Maestros / Profesores existentes
  const teachers = await poolOrClient.query(`
    SELECT u.id, u.identifier, u.created_at
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE (LOWER(r.name) LIKE '%prof%' OR LOWER(r.name) LIKE '%maestr%' 
        OR LOWER(COALESCE(r.nombre, '')) LIKE '%prof%' OR LOWER(COALESCE(r.nombre, '')) LIKE '%maestr%')
    ORDER BY u.created_at ASC, u.id ASC
  `);

  let mIndex = 1;
  for (const user of teachers.rows) {
    const targetId = `M${String(mIndex).padStart(3, '0')}`;
    if (user.identifier !== targetId) {
      await poolOrClient.query('UPDATE users SET identifier = $1 WHERE id = $2', [targetId, user.id]);
    }
    mIndex++;
  }
}

async function generateIdentifier(roleNameOrId, poolOrClient) {
  const targetPool = poolOrClient || require('../db').pool;
  return await getNextIdentifier(roleNameOrId, targetPool);
}

module.exports = {
  getRolePrefix,
  getNextIdentifier,
  generateIdentifier,
  migrateExistingUserIdentifiers
};
