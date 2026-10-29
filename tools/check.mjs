#!/usr/bin/env node
/**
 * check.mjs — Red de seguridad de la plantilla.   npm run check
 *
 *   1. Construye todas las comunidades de community/.
 *   2. Falla si en src/, tools/, community/ o en lo construido aparece algo de una comunidad
 *      real (marca, dominio, rutas personales, claves) que no debería viajar en la plantilla.
 *   3. Comprueba la sintaxis de todos los .js, .json y <script> inline construidos.
 *
 * Si añades contenido de una comunidad real por error, esto lo detecta antes de que salga de tu máquina.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.join('tools', 'check.mjs');

// Lo que NUNCA debe aparecer en la plantilla. Excepciones concretas en ALLOW.
const FORBIDDEN = [
  [/jabad|chabad|lubavitch/i, 'marca de Jabad'],
  [/libersohn|montnegre|benveniste/i, 'persona o dirección real'],
  [/bcnkehila|kehilabcn|vvrvuhugpvqytelhsdnk/i, 'dominio, app o proyecto de producción'],
  [/pk_live_|sk_live_|sk_test_/i, 'clave de pago escrita en el código'],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{15,}/, 'clave JWT (Supabase) escrita en el código'],
  [/@gmail\.com|@hotmail\.|@yahoo\./i, 'correo personal'],
  [/C:[\\/]+Users|\/Users\/[a-z]/i, 'ruta personal'],
  [/github_pat_|ghp_[A-Za-z0-9]{20,}/i, 'token de GitHub'],
];
const ALLOW = [/Nusaj Ari \(Jabad\)|Nusach Ari \(Jabad\)/g]; // variante litúrgica del sidur, no es una marca

const TEXT = new Set(['.html', '.js', '.css', '.json', '.md', '.mjs', '.ts', '.sql', '.txt', '.svg']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'siddur']);
let problems = 0;
const bad = (m) => { problems++; console.log('  ✖ ' + m); };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(path.join(dir, e.name));
    return [path.join(dir, e.name)];
  });
}

// 1. Construir
console.log('1. Construyendo todas las comunidades…');
const b = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--all'], { encoding: 'utf8' });
process.stdout.write(b.stdout.split('\n').filter((l) => l.startsWith('✔')).map((l) => '   ' + l).join('\n') + '\n');
if (b.status !== 0) { process.stdout.write(b.stderr); bad('el build ha fallado'); }

// 2. Restos de comunidades reales
console.log('2. Buscando restos de comunidades reales…');
const roots = ['src', 'tools', 'community', 'dist'].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d));
const sbMsg = new Set();
for (const root of roots) {
  for (const f of walk(root)) {
    const rel = path.relative(ROOT, f);
    if (rel === SELF || !TEXT.has(path.extname(f).toLowerCase())) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const clean = ALLOW.reduce((l, rx) => l.replace(rx, ''), line);
      for (const [rx, why] of FORBIDDEN) if (rx.test(clean)) bad(`${rel}:${i + 1}  ${why}: ${clean.trim().slice(0, 90)}`);
    });
  }
}
// Backend: aquí solo se vigilan datos personales y claves (la marca está documentada como pendiente en supabase/README.md)
const PERSONAL = FORBIDDEN.filter(([, why]) => /correo|ruta|clave|token/.test(why));
const sb = path.join(ROOT, 'supabase');
if (fs.existsSync(sb)) for (const f of walk(sb)) {
  if (!TEXT.has(path.extname(f).toLowerCase())) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [rx, why] of PERSONAL) if (rx.test(line)) bad(`${path.relative(ROOT, f)}:${i + 1}  ${why}`);
  });
}

// 3. Sintaxis de lo construido
console.log('3. Revisando la sintaxis de lo construido…');
const dist = path.join(ROOT, 'dist');
let blocks = 0;
if (fs.existsSync(dist)) for (const f of walk(dist)) {
  const rel = path.relative(ROOT, f), ext = path.extname(f);
  const js = (code, label) => { blocks++; try { new vm.Script(code, { filename: label }); } catch (e) { bad(`${label}: ${e.message}`); } };
  if (ext === '.js') js(fs.readFileSync(f, 'utf8'), rel);
  else if (ext === '.json') { blocks++; try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { bad(`${rel}: ${e.message}`); } }
  else if (ext === '.html') {
    let n = 0;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(m[1]) || /type=["'](?!text\/javascript|module)/.test(m[1]) || !m[2].trim()) continue;
      js(m[2], `${rel}#script${++n}`);
    }
  }
}
console.log(`   ${blocks} bloques revisados`);

console.log(problems ? `\n✖ ${problems} problema(s)\n` : '\n✔ Todo en orden\n');
process.exit(problems ? 1 : 0);
