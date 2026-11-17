// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// It sends the MIME types a browser game needs, refuses any path outside game/, and otherwise
// does nothing clever: this is a development convenience, not a web server for the internet.
//
// Extra conveniences for testing and screenshots: a /health endpoint that answers 200 with
// the file count (so a playtest harness can wait for the server instead of guessing),
// request logging to stderr with a timestamp, and a --port flag (default 8080).
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** Count the files under game/, for the /health endpoint. */
function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n += 1;
  }
  return n;
}

function logRequest(method: string, pathname: string, status: number) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.error(`[${stamp}] ${method} ${pathname} -> ${status}`);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    logRequest(request.method ?? 'GET', url.pathname, 400);
    response.writeHead(400).end('bad request');
    return;
  }
  // Health check for harnesses: 200 + a JSON summary, no file served.
  if (pathname === '/health') {
    const body = JSON.stringify({ ok: true, game: 'solmar-bay', files: countFiles(root), uptime: Math.round(process.uptime()) });
    logRequest(request.method ?? 'GET', pathname, 200);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    response.end(body);
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    logRequest(request.method ?? 'GET', pathname, 403);
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    logRequest(request.method ?? 'GET', pathname, 404);
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  logRequest(request.method ?? 'GET', pathname, 200);
  // A HEAD request gets the headers and no body (screenshot tools probe first).
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
  console.log(`shots: http://localhost:${port}/index.html?shot=cover&seed=7 (cover, chase, city, mission)`);
  console.log(`health: http://localhost:${port}/health`);
});
