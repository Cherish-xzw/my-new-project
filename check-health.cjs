const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Backend /api/health: HTTP ${res.statusCode}`);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.log('Backend health error:', e.message);
});

req.end();
