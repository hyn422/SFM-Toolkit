import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.sfml': 'text/plain; charset=utf-8',
  '.sfm': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

// Embedded assets for SEA packaging (populated by build-sea.mjs)
// When EMBEDDED_ASSETS is non-null, we serve from memory instead of disk.
let EMBEDDED_ASSETS = null;
try {
  EMBEDDED_ASSETS = globalThis.__SFM_ASSETS__ || null;
} catch (_) { EMBEDDED_ASSETS = null; }

function safeName(name) {
  // normalize to forward slashes, strip leading /
  return String(name).replace(/\\/g, '/').replace(/^\/+/, '');
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = safeName(urlPath === '/' ? 'index.html' : urlPath);

  // Try embedded assets first
  if (EMBEDDED_ASSETS && Object.prototype.hasOwnProperty.call(EMBEDDED_ASSETS, rel)) {
    const data = EMBEDDED_ASSETS[rel];
    res.writeHead(200, {
      'Content-Type': mime[extname(rel).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
    return;
  }

  // Fallback to disk (dev mode)
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log('==============================================');
  console.log('  SFM 编程台已启动');
  console.log(`  浏览器访问: http://localhost:${port}`);
  console.log('  关闭本窗口即可停止服务');
  console.log('==============================================');
});
