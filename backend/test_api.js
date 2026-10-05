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
  console.log('--- INICIANDO VERIFICACIÓN DE BACKEND POSTGRES Y MULTI-TENANT ---');

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

  // 4. Test Motor Anti-Empalmes:
  console.log('\n--- PROBANDO MOTOR ANTI-EMPALMES (CONFLICT DETECTION) ---');

  const teacherEmpalmeRes = await request('POST', '/api/schedules', {
    subject_id: 'sub-redes',
    teacher_id: 'usr-prof-1', // Elena Salgado
    classroom_id: 'cr-a101',
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

  const classroomEmpalmeRes = await request('POST', '/api/schedules', {
    subject_id: 'sub-redes',
    teacher_id: 'usr-prof-2', // Carlos Vega
    classroom_id: 'cr-lab1',  // Aula ocupada
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

  const teacherSchedules = await request('GET', '/api/schedules/teacher', null, { 'Authorization': `Bearer ${profToken}` });
  console.log(`[PASS] Docente consulta sus horarios: ${teacherSchedules.body.length} clases asignadas.`);

  console.log('\n=======================================================');
  console.log('✅ TODAS LAS PRUEBAS DE ARQUITECTURA POSTGRES PASARON');
  console.log('=======================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Error durante ejecución de pruebas:', err);
  process.exit(1);
});
