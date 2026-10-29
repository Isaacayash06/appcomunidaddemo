#!/usr/bin/env node
/**
 * new-community.mjs — Crea community/<slug>.json listo para editar y construir.
 *
 *   node tools/new-community.mjs <slug> --name "Kehilá Sefarad" --city sevilla \
 *        [--domain sefarad.example.com] [--primary "#0F5257"] [--accent "#E07A5F"] [--build]
 *
 *   --city  clave de la ciudad del calendario (madrid, barcelona, valencia, sevilla, ...);
 *           la lista está en src/calendario.html (CITIES).
 *   --build construye la app al terminar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

if (!slug) die('Uso: node tools/new-community.mjs <slug> --name "Nombre" --city <clave> [--domain ...] [--primary #RRGGBB] [--accent #RRGGBB] [--build]');
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('El slug solo admite minúsculas, números y guiones.');
const name = opt('name') || die('Falta --name "Nombre de la comunidad"');
const cityKey = opt('city') || die('Falta --city <clave> (p. ej. madrid, barcelona, valencia)');

// Ciudades disponibles y sus coordenadas, leídas del propio calendario
const cal = fs.readFileSync(path.join(ROOT, 'src', 'calendario.html'), 'utf8');
const rows = [...cal.matchAll(/^\s*"([a-z]+)":\s*\{\s*name:\s*"([^"]+)"[^}]*?lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+),\s*tz:\s*"([^"]+)"/gm)];
const city = rows.find((r) => r[1] === cityKey);
if (!city) die(`Ciudad "${cityKey}" no encontrada. Disponibles: ${rows.map((r) => r[1]).join(', ')}`);

const file = path.join(ROOT, 'community', `${slug}.json`);
if (fs.existsSync(file)) die(`Ya existe community/${slug}.json`);

const domain = opt('domain') || `${slug}.example.com`;
const scheme = slug.replace(/[^a-z0-9]/g, '');
const cfg = {
  $schema: './community.schema.json',
  slug,
  name,
  shortName: name.split(/\s+/).slice(-1)[0],
  city: city[2].split(' · ')[0],
  domain,
  contact: {
    email: `info@${domain}`,
    privacyEmail: `privacidad@${domain}`,
    donationsEmail: `donativos@${domain}`,
  },
  location: { cityKey, lat: Number(city[3]), lon: Number(city[4]), timezone: city[5] },
  app: { scheme, androidPackage: `com.example.${scheme}`, iosBundleId: `com.example.${scheme}` },
};
if (opt('primary') || opt('accent')) {
  cfg.theme = {};
  if (opt('primary')) cfg.theme.primary = opt('primary');
  if (opt('accent')) cfg.theme.accent = opt('accent');
}

fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log(`✔ community/${slug}.json creado`);
console.log('  Edítalo para añadir rabino, equipo, contacto, módulos, colores...');
console.log('  (los campos que no pongas usan los valores de community/_defaults.json)');
if (args.includes('--build')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), slug], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
console.log(`\n  Construir:  npm run build -- ${slug}\n  Probar:     npm run dev -- ${slug}`);
