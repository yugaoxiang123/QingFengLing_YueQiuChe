const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function withEncoding(filePath) {
  if (filePath.endsWith('.br')) return { filePath, encoding: 'br', baseExt: path.extname(filePath.slice(0, -3)) };
  if (filePath.endsWith('.gz')) return { filePath, encoding: 'gzip', baseExt: path.extname(filePath.slice(0, -3)) };
  return { filePath, encoding: null, baseExt: path.extname(filePath) };
}

function getMime(ext) {
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.wasm':
      return 'application/wasm';
    case '.data':
      return 'application/octet-stream';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function safeJoin(root, urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const cleaned = decoded.replace(/^\//, '');
  const resolved = path.resolve(root, cleaned);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return null;
  }
  return resolved;
}

function startStaticServer({ root, port = 0, headers = {} }) {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      let filePath = safeJoin(root, u.pathname);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const { filePath: fp, encoding, baseExt } = withEncoding(filePath);
      const contentType = getMime(baseExt);
      res.setHeader('Content-Type', contentType);
      if (encoding) res.setHeader('Content-Encoding', encoding);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

      for (const k of Object.keys(headers)) {
        res.setHeader(k, headers[k]);
      }

      fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  return new Promise((resolve, reject) => {
    const done = () => {
      const address = server.address();
      resolve({
        port: address && typeof address === 'object' ? address.port : port,
        close: () => new Promise((r) => server.close(() => r()))
      });
    };

    server.once('error', (e) => {
      if (e && e.code === 'EADDRINUSE' && Number(port) > 0) {
        try {
          console.warn('[server] port in use, fallback to random', port);
        } catch {}
        try {
          server.listen(0, '127.0.0.1', done);
          return;
        } catch (e2) {
          reject(e2);
          return;
        }
      }
      reject(e);
    });

    server.listen(port, '127.0.0.1', done);
  });
}

module.exports = { startStaticServer };
