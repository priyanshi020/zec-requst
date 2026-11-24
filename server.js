// Tiny static server (no deps) so ES modules load in the browser: `npm start` -> http://localhost:8080
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/web/index.html';
  const file = normalize(join(root, p));
  const allowed = file.startsWith(join(root, 'web')) || file.startsWith(join(root, 'src'));
  try {
    if (!allowed) throw new Error('forbidden');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'text/plain' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(8080, () => console.log('http://localhost:8080'));
