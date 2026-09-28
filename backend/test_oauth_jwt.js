const http = require('http');
const jwt = require('jsonwebtoken');
const { initDatabase, query } = require('./src/db');
const { linkOrCreateUser } = require('./src/config/passport');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('./src/middleware/auth');

function makeRequest(options, postData = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const req = http.request({ ...options, headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          cookies: res.headers['set-cookie'] || [],
          body: json
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 VERIFICACIÓN TÉCNICA: OAUTH 2.0 Y CICLO DE VIDA DE JWT');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Inicializar DB y verificar esquema
  console.log('1. Verificación de Esquema y Migraciones...');
  await initDatabase();
  const tableInfo = await query.all("PRAGMA table_info(users);");
  const columnNames = tableInfo.map(c => c.name);
  assert(columnNames.includes('google_id'), 'Columna google_id existe en users');
  assert(columnNames.includes('microsoft_id'), 'Columna microsoft_id existe en users');

  // 2. Probar Account Linking (Trust Provider por Email)
  console.log('\n2. Verificación de Account Linking (linkOrCreateUser)...');
  const testEmail = 'oauth.test@itc.edu';
  await query.run('DELETE FROM users WHERE email = ?', [testEmail]);

  // Aprovisionamiento silencioso inicial con Google
  const googleProfile = {
    id: 'google-uid-12345',
    displayName: 'Usuario OAuth Test',
    emails: [{ value: testEmail }]
  };
  const newUser = await linkOrCreateUser(googleProfile, 'google');
  assert(newUser && newUser.email === testEmail, 'Aprovisionamiento silencioso (New User) con Google');

  // Account Linking: Mismo correo vinculando Microsoft
  const msProfile = {
    id: 'ms-uid-67890',
    displayName: 'Usuario OAuth Test MS',
    emails: [{ value: testEmail }]
  };
  const linkedUser = await linkOrCreateUser(msProfile, 'microsoft');
  assert(linkedUser.id === newUser.id, 'Account Linking: Se vinculó al mismo ID de usuario existente');

  const checkUserInDb = await query.get('SELECT * FROM users WHERE id = ?', [newUser.id]);
  assert(checkUserInDb.google_id === 'google-uid-12345', 'google_id persistido correctamente');
  assert(checkUserInDb.microsoft_id === 'ms-uid-67890', 'microsoft_id vinculado y persistido correctamente');

  // 3. Iniciar Servidor Express en puerto 5001 para pruebas aisladas
  console.log('\n3. Verificación de Endpoints HTTP (Express)...');
  const express = require('express');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const passport = require('./src/config/passport');
  const authController = require('./src/controllers/authController');
  const { authenticateJWT } = require('./src/middleware/auth');

  const app = express();
  app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  // Rutas públicas
  app.post('/api/auth/select-tenant', authController.selectTenant);
  app.post('/api/auth/refresh', authController.refreshToken);
  app.post('/api/auth/logout', authController.logout);
  app.post('/api/auth/login', authController.login);

  // Rutas protegidas
  app.use('/api', authenticateJWT);
  app.get('/api/auth/me', authController.getMe);

  const server = await new Promise((resolve) => {
    const s = app.listen(5001, () => resolve(s));
  });

  try {
    // 4. Emisión de Identity Token (Fase 1)
    const identityToken = jwt.sign({ sub: newUser.id, type: 'identity' }, JWT_SECRET, { expiresIn: '10m' });
    assert(identityToken != null, 'Fase 1: Generación exitosa de Identity Token');

    // 5. Fase 2: POST /api/auth/select-tenant con Identity Token y tenantId
    const selectRes = await makeRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/select-tenant',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${identityToken}`
      }
    }, JSON.stringify({ tenantId: 'tenant-itc' }));

    assert(selectRes.statusCode === 200, `POST /api/auth/select-tenant retorna HTTP 200 OK (Recibido: ${selectRes.statusCode})`);
    assert(!!selectRes.body.accessToken, 'Respuesta incluye accessToken en cuerpo JSON');

    // Verificar Cookie HttpOnly
    const cookies = selectRes.cookies;
    const refreshCookie = cookies.find(c => c.startsWith('refresh_token='));
    assert(!!refreshCookie, 'Cabecera Set-Cookie emite refresh_token');
    assert(refreshCookie.includes('HttpOnly'), 'La cookie de refresco cuenta con flag HttpOnly');
    assert(refreshCookie.toLowerCase().includes('samesite'), 'La cookie de refresco cuenta con flag SameSite');

    // 6. Prueba de Acceso a Endpoint Protegido con Access Token
    const meRes = await makeRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${selectRes.body.accessToken}`,
        'X-Tenant-Id': 'tenant-itc'
      }
    });
    assert(meRes.statusCode === 200, `GET /api/auth/me con Access Token retorna HTTP 200 OK (Recibido: ${meRes.statusCode})`);
    assert(meRes.body.email === testEmail, `El perfil resuelto coincide con el usuario OAuth (${meRes.body.email})`);

    // 7. Prueba de Silent Refresh: POST /api/auth/refresh con Cookie HttpOnly
    const cookieHeader = refreshCookie.split(';')[0];
    const refreshRes = await makeRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/refresh',
      method: 'POST'
    }, null, cookieHeader);

    assert(refreshRes.statusCode === 200, `POST /api/auth/refresh retorna HTTP 200 OK (Recibido: ${refreshRes.statusCode})`);
    assert(!!refreshRes.body.accessToken, 'Silent Refresh genera un nuevo Access Token válido');

    // 8. Prueba de Logout: POST /api/auth/logout invalida la cookie
    const logoutRes = await makeRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/logout',
      method: 'POST'
    }, null, cookieHeader);

    assert(logoutRes.statusCode === 200, `POST /api/auth/logout retorna HTTP 200 OK (Recibido: ${logoutRes.statusCode})`);
    const clearedCookie = logoutRes.cookies.find(c => c.startsWith('refresh_token='));
    assert(clearedCookie && (clearedCookie.includes('Expires=') || clearedCookie.includes('Max-Age=0')), 'Cookie refresh_token eliminada/expirada en logout');

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`RESULTADOS: ${passed} exitosas, ${failed} fallidas`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error durante la ejecución de pruebas:', err);
  process.exit(1);
});
