const http = require('http');

function checkServer(port, name) {
  return new Promise((resolve) => {
    http.get(`http://localhost:${port}`, (res) => {
      console.log(`${name}: HTTP ${res.statusCode}`);
      resolve(res.statusCode);
    }).on('error', (e) => {
      console.log(`${name}: Error - ${e.message}`);
      resolve(null);
    });
  });
}

async function main() {
  const backend = await checkServer(3001, 'Backend (port 3001)');
  const frontend = await checkServer(5173, 'Frontend (port 5173)');

  if (backend && frontend) {
    console.log('\nBoth servers are running successfully!');
    process.exit(0);
  } else {
    console.log('\nSome servers are not responding.');
    process.exit(1);
  }
}

main();
