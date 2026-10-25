const pool = require('../db');

// Endpoint 1: Matriz de Ocupación Dinámica
exports.getClassroomOccupancy = async (req, res) => {
    const tenant_id = req.user?.tenant_id || req.tenant_id;

    try {
        const query = `
            WITH aulas_tenant AS (
                -- Integración con el nuevo módulo de aulas (ajustado a 'classrooms' de la base de datos)
                SELECT NULLIF(COUNT(id), 0)::int AS total FROM classrooms WHERE tenant_id = $1
            ),
            bloques_horas AS (
                SELECT generate_series(7, 20) AS bloque
            ),
            dias_semana AS (
                SELECT unnest(ARRAY['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']) AS dia
            )
            SELECT 
                d.dia,
                b.bloque AS hora_inicio,
                COUNT(DISTINCT h.id)::int AS aulas_ocupadas,
                COALESCE((SELECT total FROM aulas_tenant), 0)::int AS aulas_totales,
                CASE 
                    WHEN (SELECT total FROM aulas_tenant) IS NULL THEN 0 
                    ELSE ROUND((COUNT(DISTINCT h.id)::numeric / (SELECT total FROM aulas_tenant)) * 100, 2)::float 
                END AS porcentaje_ocupacion
            FROM dias_semana d
            CROSS JOIN bloques_horas b
            LEFT JOIN horarios h 
                ON h.tenant_id = $1 
                AND h.dia = d.dia 
                AND EXTRACT(HOUR FROM h.hora_inicio::time) <= b.bloque 
                AND EXTRACT(HOUR FROM h.hora_fin::time) > b.bloque
            GROUP BY d.dia, b.bloque
            ORDER BY array_position(ARRAY['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], d.dia), b.bloque;
        `;
        
        const result = await pool.query(query, [tenant_id]);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al generar matriz de ocupación:', error);
        return res.status(500).json({ error: 'Error al generar matriz de ocupación' });
    }
};

// Endpoint 2: Índice de Utilización Docente
exports.getTeacherUtilization = async (req, res) => {
    const tenant_id = req.user?.tenant_id || req.tenant_id;
    const MIN_HOURS = 10;
    const MAX_HOURS = 40;

    try {
        const query = `
            WITH horas_docentes AS (
                SELECT 
                    profesor,
                    SUM(EXTRACT(EPOCH FROM (hora_fin::time - hora_inicio::time))/3600) AS horas_totales
                FROM horarios
                WHERE tenant_id = $1
                GROUP BY profesor
            )
            SELECT 
                COUNT(*)::int AS total_profesores,
                COUNT(*) FILTER (WHERE horas_totales >= $2 AND horas_totales <= $3)::int AS profesores_optimos,
                COUNT(*) FILTER (WHERE horas_totales < $2)::int AS profesores_subutilizados,
                COUNT(*) FILTER (WHERE horas_totales > $3)::int AS profesores_sobrecupo
            FROM horas_docentes;
        `;

        const result = await pool.query(query, [tenant_id, MIN_HOURS, MAX_HOURS]);
        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al generar analítica docente:', error);
        return res.status(500).json({ error: 'Error al generar analítica docente' });
    }
};
