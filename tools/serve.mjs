#!/usr/bin/env node
/**
 * serve.mjs — Construye una comunidad y la sirve en local para probarla.
 *
 *   node tools/serve.mjs <slug> [--port 8080] [--no-build]
 *
 * Servidor estático mínimo, sin dependencias. Los .html se sirven también sin extensión.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) { console.error('Uso: node tools/serve.mjs <slug> [--port 8080] [--no-build]'); process.exit(1); }
const pi = args.indexOf('--port');
const port = pi >= 0 ? Number(args[pi + 1]) : 8080;
const dir = path.join(ROOT, 'dist', slug);

if (!args.includes('--no-build')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), slug], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (!fs.existsSync(dir)) { console.error(`No existe ${dir}. Ejecuta primero: node tools/build.mjs ${slug}`); process.exit(1); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(dir, p);
  if (!file.startsWith(dir)) { res.writeHead(403).end('403'); return; }
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`\n▶ http://localhost:${port}/   (${slug})   Ctrl+C para parar`));
