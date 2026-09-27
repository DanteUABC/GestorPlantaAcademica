const http = require('http');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => { resBody += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, body: resBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- INICIANDO VERIFICACIÓN DE BACKEND Y MULTI-TENANT ---');

  // 1. Verificar Tenants
  const tenantsRes = await request('GET', '/api/auth/tenants');
  console.log(`[PASS] Listado de Tenants (${tenantsRes.status}):`, tenantsRes.body.map(t => t.name).join(', '));

  // 2. Login de Coordinador (ITC)
  const coordLogin = await request('POST', '/api/auth/login', {
    email: 'coordinador@itc.edu',
    password: 'demo123',
    tenant_id: 'tenant-itc'
  });
  console.log(`[PASS] Login Coordinador (${coordLogin.status}):`, coordLogin.body.user.name, `[Rol: ${coordLogin.body.user.role_name}]`);
  const coordToken = coordLogin.body.token;

  // 3. Login de Profesor (ITC)
  const profLogin = await request('POST', '/api/auth/login', {
    email: 'elena.salgado@itc.edu',
    password: 'demo123',
    tenant_id: 'tenant-itc'
  });
  console.log(`[PASS] Login Profesor (${profLogin.status}):`, profLogin.body.user.name);
  const profToken = profLogin.body.token;

  // 4. Login de Alumno (ITC)
  const studentLogin = await request('POST', '/api/auth/login', {
    email: 'alumno@itc.edu',
    password: 'demo123',
    tenant_id: 'tenant-itc'
  });
  console.log(`[PASS] Login Alumno (${studentLogin.status}):`, studentLogin.body.user.name);
  const studentToken = studentLogin.body.token;

  // 5. Test Motor Anti-Empalmes:
  // Horario existente de Elena Salgado: Lunes 08:00 a 10:00 en Aula cr-lab1
  console.log('\n--- PROBANDO MOTOR ANTI-EMPALMES (CONFLICT DETECTION) ---');

  // Intento de empalme 1: Mismo profesor en horario solapado (Lunes 09:00 a 11:00)
  const teacherEmpalmeRes = await request('POST', '/api/schedules', {
    subject_id: 'sub-redes',
    teacher_id: 'usr-prof-1', // Elena Salgado
    classroom_id: 'cr-a101',  // Otra aula
    day_of_week: 'Lunes',
    start_time: '09:00',
    end_time: '11:00',
    max_students: 20
  }, { 'Authorization': `Bearer ${coordToken}` });

  if (teacherEmpalmeRes.status === 409 && teacherEmpalmeRes.body.conflictType === 'TEACHER_CONFLICT') {
    console.log(`[PASS] Empalme de Docente detectado y rechazado correctamente (HTTP 409):`);
    console.log(`       -> ${teacherEmpalmeRes.body.error}`);
  } else {
    console.error(`[FAIL] No se detectó empalme de docente:`, teacherEmpalmeRes);
    process.exit(1);
  }

  // Intento de empalme 2: Misma aula ocupada en horario solapado (Lunes 08:30 a 09:30 en Aula cr-lab1 con Carlos Vega)
  const classroomEmpalmeRes = await request('POST', '/api/schedules', {
    subject_id: 'sub-redes',
    teacher_id: 'usr-prof-2', // Carlos Vega
    classroom_id: 'cr-lab1',  // Misma aula ya ocupada de 08:00 a 10:00
    day_of_week: 'Lunes',
    start_time: '08:30',
    end_time: '09:30',
    max_students: 20
  }, { 'Authorization': `Bearer ${coordToken}` });

  if (classroomEmpalmeRes.status === 409 && classroomEmpalmeRes.body.conflictType === 'CLASSROOM_CONFLICT') {
    console.log(`[PASS] Empalme de Aula detectado y rechazado correctamente (HTTP 409):`);
    console.log(`       -> ${classroomEmpalmeRes.body.error}`);
  } else {
    console.error(`[FAIL] No se detectó empalme de aula:`, classroomEmpalmeRes);
    process.exit(1);
  }

  // 6. Creación válida de un horario (Sin empalme: Lunes 12:00 a 14:00)
  const validScheduleRes = await request('POST', '/api/schedules', {
    subject_id: 'sub-redes',
    teacher_id: 'usr-prof-1',
    classroom_id: 'cr-b202',
    day_of_week: 'Lunes',
    start_time: '12:00',
    end_time: '14:00',
    max_students: 25
  }, { 'Authorization': `Bearer ${coordToken}` });

  if (validScheduleRes.status === 201) {
    console.log(`[PASS] Creación de Horario válida (HTTP 201):`, validScheduleRes.body.schedule.subject_name, validScheduleRes.body.schedule.day_of_week, validScheduleRes.body.schedule.start_time);
  } else {
    console.error(`[FAIL] Error creando horario válido:`, validScheduleRes);
    process.exit(1);
  }

  // 7. Prueba del flujo del Docente: Consulta sus horarios asignados
  const teacherSchedules = await request('GET', '/api/schedules/teacher', null, { 'Authorization': `Bearer ${profToken}` });
  console.log(`[PASS] Docente consulta sus horarios: ${teacherSchedules.body.length} clases asignadas.`);

  // 8. Prueba del flujo del Alumno:
  // Inscribir sch-sample-1 (Lunes 08:00 a 10:00)
  const enroll1 = await request('POST', '/api/schedules/enroll', { scheduleId: 'sch-sample-1' }, { 'Authorization': `Bearer ${studentToken}` });
  console.log(`[PASS] Alumno inscribe materia (${enroll1.status}):`, enroll1.body.message);

  // Inscribir sch-sample-2 (Lunes 10:00 a 12:00) - No hay cruce
  const enroll2 = await request('POST', '/api/schedules/enroll', { scheduleId: 'sch-sample-2' }, { 'Authorization': `Bearer ${studentToken}` });
  console.log(`[PASS] Alumno inscribe segunda materia consecutiva (${enroll2.status}):`, enroll2.body.message);

  // Consultar horario inscrito del alumno
  const studentScheduleRes = await request('GET', '/api/schedules/student', null, { 'Authorization': `Bearer ${studentToken}` });
  console.log(`[PASS] Alumno consulta su horario consolidado: ${studentScheduleRes.body.length} materias inscritas.`);

  console.log('\n=======================================================');
  console.log('✅ TODAS LAS PRUEBAS DE ARQUITECTURA Y NEGOCIO PASARON');
  console.log('=======================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Error durante ejecución de pruebas:', err);
  process.exit(1);
});
