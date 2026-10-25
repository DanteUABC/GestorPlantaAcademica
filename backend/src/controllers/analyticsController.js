const pool = require('../db');

/**
 * Extrae el tenant_id de forma robusta desde req.user (payload JWT enriquecido),
 * req.tenant_id (middleware auth), cabecera x-tenant-id o parámetros de consulta.
 */
function extractTenantId(req) {
    return (
        req.user?.tenant_id ||
        req.tenant_id ||
        req.user?.tenantId ||
        (typeof req.user?.tenant === 'object' ? req.user?.tenant?.id : req.user?.tenant) ||
        req.headers?.['x-tenant-id'] ||
        req.query?.tenant_id ||
        null
    );
}

// Endpoint 1: Matriz de Ocupación Dinámica
exports.getClassroomOccupancy = async (req, res) => {
    const tenant_id = extractTenantId(req);
    const rawEdificio = req.query.edificio?.trim();
    const edificio = (rawEdificio && rawEdificio !== 'Todos los Edificios') ? rawEdificio : null;

    if (!tenant_id) {
        return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    try {
        const query = `
            WITH aulas_tenant AS (
                -- Integración con el catálogo de aulas físicas del tenant (con filtro dinámico de edificio)
                SELECT NULLIF(COUNT(id), 0)::int AS total 
                FROM classrooms 
                WHERE tenant_id = $1
                  AND ($2::text IS NULL OR building = $2)
            ),
            bloques_horas AS (
                SELECT generate_series(7, 20) AS bloque
            ),
            dias_semana AS (
                SELECT unnest(ARRAY['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']) AS dia
            ),
            clases_tenant AS (
                -- Extraer clases desde la tabla oficial 'schedules' (Armado de Horarios)
                -- con filtro dinámico por edificio de aula y fallback a 'horarios'
                SELECT 
                    s.id::text AS id,
                    s.tenant_id,
                    s.classroom_id,
                    s.day_of_week AS dia,
                    s.start_time AS hora_inicio,
                    s.end_time AS hora_fin
                FROM schedules s
                LEFT JOIN classrooms cr ON s.classroom_id = cr.id
                WHERE s.tenant_id = $1
                  AND ($2::text IS NULL OR cr.building = $2)
                UNION ALL
                SELECT 
                    h.id::text AS id,
                    h.tenant_id,
                    NULL::text AS classroom_id,
                    h.dia,
                    h.hora_inicio,
                    h.hora_fin
                FROM horarios h
                WHERE h.tenant_id = $1
                  AND ($2::text IS NULL)
                  AND NOT EXISTS (
                      SELECT 1 FROM schedules s2 WHERE s2.tenant_id = $1
                  )
            )
            SELECT 
                d.dia,
                b.bloque AS hora_inicio,
                COUNT(DISTINCT c.id)::int AS aulas_ocupadas,
                COALESCE((SELECT total FROM aulas_tenant), 0)::int AS aulas_totales,
                CASE 
                    WHEN (SELECT total FROM aulas_tenant) IS NULL THEN 0 
                    ELSE ROUND((COUNT(DISTINCT c.id)::numeric / (SELECT total FROM aulas_tenant)) * 100, 2)::float 
                END AS porcentaje_ocupacion
            FROM dias_semana d
            CROSS JOIN bloques_horas b
            LEFT JOIN clases_tenant c 
                ON c.tenant_id = $1 
                AND LOWER(TRANSLATE(TRIM(c.dia), 'áéíóúÁÉÍÓÚüÜ', 'aeiouaeiouuU')) = LOWER(TRANSLATE(TRIM(d.dia), 'áéíóúÁÉÍÓÚüÜ', 'aeiouaeiouuU'))
                AND EXTRACT(HOUR FROM c.hora_inicio::time) <= b.bloque 
                AND EXTRACT(HOUR FROM c.hora_fin::time) > b.bloque
            GROUP BY d.dia, b.bloque
            ORDER BY array_position(ARRAY['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], d.dia), b.bloque;
        `;
        
        const result = await pool.query(query, [tenant_id, edificio]);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al generar matriz de ocupación:', error);
        return res.status(500).json({ error: 'Error al generar matriz de ocupación' });
    }
};

// Endpoint 2: Índice de Utilización Docente
exports.getTeacherUtilization = async (req, res) => {
    const tenant_id = extractTenantId(req);
    const rawEdificio = req.query.edificio?.trim();
    const edificio = (rawEdificio && rawEdificio !== 'Todos los Edificios') ? rawEdificio : null;
    const MIN_HOURS = 10;
    const MAX_HOURS = 40;

    if (!tenant_id) {
        return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    try {
        const query = `
            WITH clases_docentes AS (
                -- Extraer asignaciones de docentes desde la tabla oficial 'schedules' (Armado de Horarios)
                -- con filtro dinámico por edificio de aula y fallback a 'horarios'
                SELECT 
                    s.tenant_id,
                    s.teacher_id AS profesor_id,
                    COALESCE(u.name, s.teacher_id) AS profesor,
                    s.start_time AS hora_inicio,
                    s.end_time AS hora_fin
                FROM schedules s
                LEFT JOIN users u ON s.teacher_id = u.id
                LEFT JOIN classrooms cr ON s.classroom_id = cr.id
                WHERE s.tenant_id = $1
                  AND ($4::text IS NULL OR cr.building = $4)
                UNION ALL
                SELECT 
                    h.tenant_id,
                    h.profesor AS profesor_id,
                    h.profesor,
                    h.hora_inicio,
                    h.hora_fin
                FROM horarios h
                WHERE h.tenant_id = $1
                  AND ($4::text IS NULL)
                  AND NOT EXISTS (
                      SELECT 1 FROM schedules s2 WHERE s2.tenant_id = $1
                  )
            ),
            horas_docentes AS (
                SELECT 
                    profesor_id,
                    SUM(EXTRACT(EPOCH FROM (hora_fin::time - hora_inicio::time))/3600) AS horas_totales
                FROM clases_docentes
                WHERE tenant_id = $1
                GROUP BY profesor_id
            )
            SELECT 
                COUNT(*)::int AS total_profesores,
                COUNT(*) FILTER (WHERE horas_totales >= $2 AND horas_totales <= $3)::int AS profesores_optimos,
                COUNT(*) FILTER (WHERE horas_totales < $2)::int AS profesores_subutilizados,
                COUNT(*) FILTER (WHERE horas_totales > $3)::int AS profesores_sobrecupo
            FROM horas_docentes;
        `;

        const result = await pool.query(query, [tenant_id, MIN_HOURS, MAX_HOURS, edificio]);
        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al generar analítica docente:', error);
        return res.status(500).json({ error: 'Error al generar analítica docente' });
    }
};
