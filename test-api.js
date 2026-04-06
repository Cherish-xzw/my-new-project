const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: data.substring(0, 500) }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Testing Backend API...');
  const models = await get('http://localhost:3001/api/claude/models');
  console.log('Models:', models.status, models.data);
  const convs = await get('http://localhost:3001/api/conversations');
  console.log('Conversations:', convs.status, convs.data.substring(0, 200));
}

main().catch(console.error);
