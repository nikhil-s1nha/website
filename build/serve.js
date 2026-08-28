#!/usr/bin/env node
/* Local preview that behaves like Vercel does in production.
   The important part is cleanUrls: /thoughts/losing has to serve thoughts/losing.html,
   which a plain static server will not do, so links would 404 while testing.
   Run: node build/serve.js [port] */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8899;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

/* try, in order: the exact file, the cleanUrl .html, the directory index */
function resolve(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]).replace(/^\/+/, '');
  const base = path.join(ROOT, rel);
  if (!base.startsWith(ROOT)) return null;                 // no escaping the site root
  for (const c of [base, base + '.html', path.join(base, 'index.html')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

http.createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<pre style="font:14px ui-monospace;padding:2rem">404  ' + req.url + '</pre>');
  }

  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = fs.statSync(file).size;

  // range requests, so seeking inside a recording works the way it will in production
  const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
  if (range && /^(audio|video)/.test(type)) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? parseInt(range[2], 10) : size - 1;
    res.writeHead(206, {
      'content-type': type,
      'content-range': 'bytes ' + start + '-' + end + '/' + size,
      'accept-ranges': 'bytes',
      'content-length': end - start + 1,
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log('serving ' + ROOT);
  console.log('  http://localhost:' + PORT + '/thoughts');
  console.log('  http://localhost:' + PORT + '/thoughts#poetry');
  console.log('cleanUrls on, matching vercel.json. Ctrl+C to stop.');
});
