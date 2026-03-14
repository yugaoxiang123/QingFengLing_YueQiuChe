const path = require('path');
const http = require('http');
const { startStaticServer } = require('../electron/static-server');

async function main() {
  const root = path.join(process.cwd(), 'WebGLBuild');
  const s = await startStaticServer({ root, port: 0 });
  const base = `http://127.0.0.1:${s.port}`;

  async function fetch(p) {
    await new Promise((resolve, reject) => {
      http
        .get(base + p, (res) => {
          console.log('path', p);
          console.log('status', res.statusCode);
          console.log('content-type', res.headers['content-type']);
          console.log('content-encoding', res.headers['content-encoding']);
          console.log('coop', res.headers['cross-origin-opener-policy']);
          console.log('coep', res.headers['cross-origin-embedder-policy']);
          res.resume();
          res.on('end', resolve);
        })
        .on('error', reject);
    });
  }

  await fetch('/index.html');
  await fetch('/Build/WebGLBuild.wasm');

  await s.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
