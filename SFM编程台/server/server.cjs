'use strict';

// CommonJS version of the SFM Builder server for SEA packaging.
// The SEA entry is always evaluated as CommonJS.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
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

// Embedded assets injected by build-sea.mjs (globalThis.__SFM_ASSETS__)
const ASSETS = globalThis.__SFM_ASSETS__ || null;

function safeName(name) {
  return String(name).replace(/\\/g, '/').replace(/^\/+/, '');
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = safeName(urlPath === '/' ? 'index.html' : urlPath);

  if (ASSETS && Object.prototype.hasOwnProperty.call(ASSETS, rel)) {
    const data = ASSETS[rel];
    res.writeHead(200, {
      'Content-Type': mime[path.extname(rel).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
    return;
  }

  const file = path.join(root, rel.split('/').join(path.sep));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log('==============================================');
  console.log('  SFM 编程台已启动');
  console.log(`  浏览器访问: http://localhost:${port}`);
  console.log('  关闭本窗口即可停止服务');
  console.log('==============================================');
});