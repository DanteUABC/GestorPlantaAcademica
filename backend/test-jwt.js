const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: '123', tenant_id: 'tenant-itc', role: 'Profesor' }, 'secret');
console.log(jwt.decode(token));
