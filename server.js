/**
 * server.js —— 纯 JS 本地开发服务器（零依赖，仅需 Node.js）
 * 支持 Range 请求（音频 seek 必需）、常见 MIME 类型、默认首页。
 * 用法：node server.js [端口]   （默认 8000）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const os = require('os');

const PORT = Number(process.argv[2]) || 8000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

function getLanIPv4() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        if (start >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
          return;
        }
        const chunkEnd = Math.min(end, stat.size - 1);
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': chunkEnd - start + 1,
          'Content-Range': `bytes ${start}-${chunkEnd}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath, { start, end: chunkEnd }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const lanIp = getLanIPv4();
  console.log('==========================================');
  console.log('  STELLARIS Concert - Dev Server (Node)');
  console.log(`  Bind:  ${HOST}:${PORT}  (监听所有网卡,允许局域网访问)`);
  console.log(`  Local: http://localhost:${PORT}/`);
  console.log(`  LAN:   http://${lanIp}:${PORT}/`);
  console.log(`  Root:  ${ROOT}`);
  console.log('==========================================');
  console.log('  (按 Ctrl+C 停止)');
  console.log('');
});
