#!/usr/bin/env node
/**
 * build.mjs — Genera la app de UNA comunidad a partir de src/ + community/<slug>.json
 *
 *   node tools/build.mjs <slug>            → dist/<slug>/
 *   node tools/build.mjs <slug> --out DIR  → carpeta de salida a elegir
 *   node tools/build.mjs --all             → todas las comunidades de community/
 *   node tools/build.mjs --schema          → regenera community/community.schema.json
 *
 * Qué hace:
 *   1. Mezcla community/_defaults.json con community/<slug>.json y lo valida.
 *   2. Copia src/ a la salida sin las páginas de los módulos desactivados.
 *   3. Sustituye los tokens {{...}} (con el escapado correcto: HTML, JS o JSON).
 *   4. Aplica el tema: cambia los colores de marca del código por los de la comunidad.
 *   5. Genera logo, avatar, placeholder e iconos de la app (sin dependencias).
 *   6. Falla si queda algún token sin resolver.
 *
 * Sin dependencias: solo Node >= 18.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const COMM = path.join(ROOT, 'community');

// ─── Módulos opcionales → páginas que los componen ─────────────────────────
const MODULES = {
  calendario:   { pages: ['calendario.html'] },
  eventos:      { pages: ['eventos.html'] },
  noticias:     { pages: ['noticias.html', 'noticia.html'] },
  shiurim:      { pages: ['shiurim.html'] },
  rav:          { pages: ['rav.html'] },
  citas:        { pages: ['citas-rabino.html'] },
  siddur:       { pages: ['siddur.html'], dirs: ['siddur'] },
  donativos:    { pages: ['donativos.html'] },
  mikve:        { pages: ['mikve.html'] },
  business:     { pages: ['business.html'] },
  servicios:    { pages: ['servicios.html'] },
  galeria:      { pages: ['galeria.html'] },
  voluntariado: { pages: ['voluntariado.html'] },
};
const HUB_PAGE = { page: 'rav-hub.html', needs: ['shiurim', 'rav', 'citas'] };

// ─── Utilidades ────────────────────────────────────────────────────────────
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

function validateShape(cfg, defs, p, errors) {
  for (const k of Object.keys(cfg)) {
    if (k === '$schema') continue;
    const here = p ? `${p}.${k}` : k;
    if (!(k in defs)) { errors.push(`clave desconocida: "${here}"`); continue; }
    const d = defs[k], v = cfg[k];
    if (isObj(d)) {
      if (!isObj(v)) { errors.push(`"${here}" debe ser un objeto`); continue; }
      validateShape(v, d, here, errors);
    } else if (Array.isArray(d)) {
      if (!Array.isArray(v)) errors.push(`"${here}" debe ser una lista`);
    } else if (typeof d !== typeof v) {
      errors.push(`"${here}" debe ser ${typeof d}, no ${typeof v}`);
    }
  }
}

const lookup = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// ─── Colores ───────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const shade = (hex, dl, ds = 0) => { const [r, g, b] = hexToRgb(hex); const [h, s, l] = rgbToHsl(r, g, b); return rgbToHex(...hslToRgb(h, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl)))); };
const mixWhite = (hex, t) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };

/** Colores de marca originales del código → colores del tema de la comunidad. */
function colorMap(theme) {
  const p = theme.primary, a = theme.accent, bg = theme.background;
  return {
    hex: [
      ['#1B2E5E', p], ['#12204A', shade(p, -0.06, 0.05)], ['#2A4080', shade(p, 0.09, -0.04)],
      ['#C9A84C', a], ['#F5EDD6', mixWhite(a, 0.82)], ['#A8892E', shade(a, -0.1)],
      ['#FAF5EE', bg],
      // tonos intermedios que el código usa en degradados y textos de acento
      ['#243D7A', shade(p, 0.07, -0.02)], ['#2D4A8A', shade(p, 0.12, -0.04)], ['#2D4A82', shade(p, 0.12, -0.04)],
      ['#9A7A2A', shade(a, -0.16)], ['#B8902E', shade(a, -0.07)], ['#B8943F', shade(a, -0.07)],
      ['#B8963E', shade(a, -0.07)], ['#A8863A', shade(a, -0.08)],
    ],
    rgb: [
      ['27,46,94', hexToRgb(p)], ['201,168,76', hexToRgb(a)], ['250,245,238', hexToRgb(bg)],
      // superposiciones oscuras (degradado sobre las fotos del login, etc.)
      ['17,28,52', hexToRgb(shade(p, -0.10, -0.04))], ['13,27,62', hexToRgb(shade(p, -0.09))], ['10,25,60', hexToRgb(shade(p, -0.10))],
      ['184,150,62', hexToRgb(shade(a, -0.07))],
    ],
  };
}
function applyColors(s, cm) {
  for (const [from, to] of cm.hex) s = s.replace(new RegExp(from + '(?![0-9a-fA-F])', 'gi'), to);
  for (const [from, to] of cm.rgb) {
    const [r, g, b] = from.split(',');
    s = s.replace(new RegExp(`(rgba?\\()\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}`, 'gi'), `$1${to[0]},${to[1]},${to[2]}`);
  }
  return s;
}

// ─── Configuración ─────────────────────────────────────────────────────────
function loadConfig(slug) {
  const file = path.join(COMM, `${slug}.json`);
  if (!fs.existsSync(file)) fail(`No existe community/${slug}.json`);
  const defs = readJson(path.join(COMM, '_defaults.json'));
  const mine = readJson(file);
  const errors = [];
  validateShape(mine, defs, '', errors);
  for (const k of Object.keys(mine.modules || {})) if (!(k in MODULES)) errors.push(`módulo desconocido: "modules.${k}"`);

  const cfg = deepMerge(defs, Object.fromEntries(Object.entries(mine).filter(([k]) => k !== '$schema')));
  if (cfg.slug && cfg.slug !== slug) errors.push(`"slug" (${cfg.slug}) no coincide con el nombre del fichero (${slug})`);
  cfg.slug = slug;

  for (const [p, v] of [['name', cfg.name], ['city', cfg.city], ['domain', cfg.domain], ['contact.email', cfg.contact.email]]) {
    if (!v || !String(v).trim()) errors.push(`falta el campo obligatorio "${p}"`);
  }
  for (const k of ['primary', 'accent', 'background']) if (!HEX.test(cfg.theme[k])) errors.push(`"theme.${k}" debe ser un color #RRGGBB`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) errors.push('el slug solo admite minúsculas, números y guiones');
  if (!/^[a-z][a-z0-9]*$/.test(cfg.app.scheme)) errors.push('"app.scheme" solo admite minúsculas y números (sin guiones)');

  // La ciudad del calendario debe existir en la lista de calendario.html
  const cal = fs.readFileSync(path.join(SRC, 'calendario.html'), 'utf8');
  const cities = [...cal.matchAll(/^\s*"([a-z]+)":\s*\{\s*name:/gm)].map((m) => m[1]);
  if (!cities.includes(cfg.location.cityKey)) errors.push(`"location.cityKey" = "${cfg.location.cityKey}" no está en la lista de ciudades (${cities.join(', ')})`);

  if (errors.length) fail(`community/${slug}.json no es válido:\n  - ${errors.join('\n  - ')}`);

  // Derivados
  cfg.shortName ||= cfg.name;
  cfg.appName ||= cfg.name;
  cfg.url = `https://${cfg.domain}`;
  const digits = (s) => String(s).replace(/\D/g, '');
  cfg.contact.privacyEmail ||= cfg.contact.email;
  cfg.contact.donationsEmail ||= cfg.contact.email;
  cfg.contact.phoneDigits = '+' + digits(cfg.contact.phone);
  cfg.contact.whatsappDigits = digits(cfg.contact.whatsapp);
  try { cfg.integrations.supabaseRef = new URL(cfg.integrations.supabaseUrl).hostname.split('.')[0]; }
  catch { fail(`"integrations.supabaseUrl" no es una URL válida: ${cfg.integrations.supabaseUrl}`); }
  cfg.taglineUpper = cfg.tagline.toUpperCase();
  cfg.taglineEnUpper = cfg.taglineEn.toUpperCase();
  cfg.buildId = 'b' + Date.now().toString(36);
  return { cfg, defs };
}

const moduleOn = (cfg, m) => cfg.modules[m] !== false;

/** Parte pública para el navegador: sin claves, datos legales ni integraciones. */
function publicConfig(cfg) {
  const { slug, name, shortName, appName, tagline, taglineEn, centerName, city, country, url, labels, mikve, rabbi, team, social, stats, membership, location, theme } = cfg;
  const contact = { email: cfg.contact.email, phone: cfg.contact.phone, whatsapp: cfg.contact.whatsapp, address: cfg.contact.address };
  const modules = {};
  for (const m of Object.keys(MODULES)) modules[m] = moduleOn(cfg, m);
  return { slug, name, shortName, appName, tagline, taglineEn, centerName, city, country, url, labels, mikve, rabbi, team, social, stats, membership, location, theme, contact, modules };
}

// ─── Sustitución de tokens ─────────────────────────────────────────────────
const TOKEN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escJs = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r?\n/g, '\\n').replace(/<\/(script)/gi, '<\\/$1');
const escJson = (s) => JSON.stringify(s).slice(1, -1);

function makeResolver(cfg, problems, where) {
  return (key, esc) => {
    const v = lookup(cfg, key);
    if (v === undefined) { problems.add(`${where}: token sin valor {{${key}}}`); return `{{${key}}}`; }
    if (v !== null && typeof v === 'object') { problems.add(`${where}: {{${key}}} no es un valor simple`); return `{{${key}}}`; }
    return esc(String(v));
  };
}

function transformHtml(s, resolve) {
  // Los bloques <script> se escapan como JS; el resto como HTML; los on*="…" como JS dentro de HTML.
  return s.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi).map((part, i) => {
    if (i % 2 === 1) return part.replace(TOKEN, (_, k) => resolve(k, escJs));
    part = part.replace(/(\son[a-z]+\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, quoted) => {
      const q = quoted[0];
      const inner = quoted.slice(1, -1).replace(TOKEN, (_, k) => resolve(k, (v) => escHtml(escJs(v))));
      return pre + q + inner + q;
    });
    return part.replace(TOKEN, (_, k) => resolve(k, escHtml));
  }).join('');
}

function transformText(file, s, cfg, cm, publicJson, problems) {
  const rel = path.relative(SRC, file);
  const resolve = makeResolver(cfg, problems, rel);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') s = transformHtml(s, resolve);
  else if (ext === '.json') s = s.replace(TOKEN, (_, k) => resolve(k, escJson));
  else if (ext === '.js') s = s.replace(TOKEN, (_, k) => resolve(k, escJs));
  else s = s.replace(TOKEN, (_, k) => resolve(k, (v) => v));
  if (rel === path.join('js', 'community.js')) {
    const mark = '"__COMMUNITY_JSON__"';
    if (s.split(mark).length !== 2) problems.add(`${rel}: el marcador ${mark} debe aparecer exactamente una vez`);
    else s = s.replace(mark, () => JSON.stringify(publicJson));
  }
  return applyColors(s, cm);
}

// ─── Iconos PNG sin dependencias ───────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function iconPng(size, primary, accent) {
  const [pr, pg, pb] = hexToRgb(primary), [ar, ag, ab] = hexToRgb(accent);
  const c = size / 2, R = size * 0.26, w = size * 0.075, dotR = size * 0.075;
  const row = size * 3 + 1, raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const cov = Math.max(Math.min(0.5 - (Math.abs(d - R) - w / 2), 1), 0) + Math.max(Math.min(0.5 - (d - dotR), 1), 0);
      const t = Math.min(cov, 1), o = y * row + 1 + x * 3;
      raw[o] = pr + (ar - pr) * t; raw[o + 1] = pg + (ag - pg) * t; raw[o + 2] = pb + (ab - pb) * t;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const ICON_SIZES = [20, 29, 40, 48, 57, 58, 60, 72, 76, 80, 87, 96, 114, 120, 144, 152, 167, 168, 180, 192, 512, 1024];

function brandAssets(cfg, cm) {
  const p = cfg.theme.primary, a = cfg.theme.accent, pl = shade(p, 0.09, -0.04);
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${escHtml(cfg.name)}"><rect width="128" height="128" rx="28" fill="${p}"/><circle cx="64" cy="64" r="33" fill="none" stroke="${a}" stroke-width="10"/><circle cx="64" cy="64" r="9.6" fill="${a}"/></svg>\n`;
  const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="${mixWhite(p, 0.88)}"/><circle cx="64" cy="50" r="22" fill="${mixWhite(p, 0.55)}"/><path d="M20 128c0-27 19-44 44-44s44 17 44 44z" fill="${mixWhite(p, 0.55)}"/></svg>\n`;
  const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${pl}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="930" cy="190" r="260" fill="${a}" opacity="0.14"/><circle cx="210" cy="660" r="320" fill="${a}" opacity="0.10"/><circle cx="600" cy="400" r="120" fill="none" stroke="${a}" stroke-width="18" opacity="0.55"/><circle cx="600" cy="400" r="26" fill="${a}" opacity="0.55"/></svg>\n`;
  return { logo, avatar, placeholder };
}

// ─── Copia del árbol ───────────────────────────────────────────────────────
const TEXT_EXT = new Set(['.html', '.js', '.css', '.json']);
const RAW_DIRS = new Set(['vendor', 'siddur']); // librerías y texto del sidur: se copian tal cual

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

function build(slug, outArg) {
  const { cfg } = loadConfig(slug);
  const out = path.resolve(outArg || path.join(ROOT, 'dist', slug));
  const cm = colorMap(cfg.theme);
  const pub = publicConfig(cfg);
  const problems = new Set();

  // Qué se queda fuera
  const skipFiles = new Set(), skipDirs = new Set();
  for (const [m, def] of Object.entries(MODULES)) {
    if (moduleOn(cfg, m)) continue;
    (def.pages || []).forEach((p) => skipFiles.add(p));
    (def.dirs || []).forEach((d) => skipDirs.add(d));
  }
  if (!HUB_PAGE.needs.some((m) => moduleOn(cfg, m))) skipFiles.add(HUB_PAGE.page);
  // Datos de ejemplo y cliente falso: solo en comunidades con integrations.demoLogin
  const demo = cfg.integrations.demoLogin === true;
  if (!demo) skipFiles.add(path.join('js', 'demo.js'));

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const written = new Set();
  for (const rel of walk(SRC)) {
    const top = rel.split(path.sep)[0];
    if (skipFiles.has(rel) || skipDirs.has(top)) continue;
    const src = path.join(SRC, rel), dst = path.join(out, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase()) || RAW_DIRS.has(top)) {
      fs.copyFileSync(src, dst); written.add(rel); continue;
    }
    let s = fs.readFileSync(src, 'utf8');
    s = transformText(src, s, cfg, cm, pub, problems);
    // <script> de la configuración en el <head> de cada página completa
    if (path.extname(rel) === '.html' && /<\/head>/i.test(s)) {
      const tags = '  <script src="js/community.js"></script>\n' + (demo ? '  <script src="js/demo.js"></script>\n' : '');
      s = s.replace(/<\/head>/i, tags + '</head>');
    }
    fs.writeFileSync(dst, s);
    written.add(rel);
  }

  // Quitar de sw.js y router.js las páginas que ya no existen
  const prune = (rel, rx) => {
    const f = path.join(out, rel);
    if (!fs.existsSync(f)) return;
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(rx, (m, page) => (fs.existsSync(path.join(out, page)) ? m : '')));
  };
  prune('sw.js', /^[ \t]*'\/([\w.-]+\.html)',?[ \t]*\r?\n/gm);
  prune('js/router.js', /'([\w-]+\.html)',?[ \t]*/g);

  // Marca generada
  const { logo, avatar, placeholder } = brandAssets(cfg, cm);
  fs.mkdirSync(path.join(out, 'img'), { recursive: true });
  fs.writeFileSync(path.join(out, 'img', 'logo.svg'), logo);
  fs.writeFileSync(path.join(out, 'img', 'avatar.svg'), avatar);
  fs.writeFileSync(path.join(out, 'img', 'placeholder.svg'), placeholder);
  for (const n of ICON_SIZES) fs.writeFileSync(path.join(out, 'img', `icon-${n}.png`), iconPng(n, cfg.theme.primary, cfg.theme.accent));
  fs.writeFileSync(path.join(out, 'community.json'), JSON.stringify({ ...pub, builtAt: new Date().toISOString() }, null, 2) + '\n');

  // Tokens sin resolver (también los que pudieran quedar escritos a mano)
  for (const rel of written) {
    const top = rel.split(path.sep)[0];
    if (RAW_DIRS.has(top) || !TEXT_EXT.has(path.extname(rel))) continue;
    const left = fs.readFileSync(path.join(out, rel), 'utf8').match(TOKEN);
    if (left) problems.add(`${rel}: quedan tokens sin resolver ${[...new Set(left)].join(' ')}`);
  }
  if (problems.size) fail(`Build de "${slug}" con problemas:\n  - ${[...problems].join('\n  - ')}`);

  const off = Object.keys(MODULES).filter((m) => !moduleOn(cfg, m));
  const warn = [];
  if (cfg.integrations.supabaseUrl === 'https://tu-proyecto.supabase.co') warn.push('integrations.supabaseUrl sin configurar: la app abre pero no tendrá datos hasta conectar un Supabase');
  if (cfg.integrations.stripePublishableKey === 'pk_test_placeholder') warn.push('integrations.stripePublishableKey sin configurar: los pagos no funcionarán');
  console.log(`✔ ${slug}  →  ${path.relative(process.cwd(), out) || out}`);
  console.log(`  ${cfg.name} · ${cfg.city} · primario ${cfg.theme.primary} · ${written.size} ficheros`);
  console.log(`  módulos desactivados: ${off.length ? off.join(', ') : 'ninguno'}`);
  warn.forEach((w) => console.log(`  ⚠ ${w}`));
  return out;
}

// ─── Esquema JSON (autocompletado en el editor) ────────────────────────────
function schemaOf(v, key) {
  if (Array.isArray(v)) return { type: 'array', items: v.length && isObj(v[0]) ? schemaOf(v[0]) : {} };
  if (isObj(v)) {
    const props = {};
    for (const k of Object.keys(v)) props[k] = schemaOf(v[k], k);
    return { type: 'object', properties: props, additionalProperties: false };
  }
  return { type: typeof v };
}
function writeSchema() {
  const defs = readJson(path.join(COMM, '_defaults.json'));
  const s = schemaOf(defs);
  s.$schema = 'http://json-schema.org/draft-07/schema#';
  s.title = 'Configuración de comunidad';
  s.properties.$schema = { type: 'string' };
  s.required = ['name', 'city', 'domain', 'contact'];
  fs.writeFileSync(path.join(COMM, 'community.schema.json'), JSON.stringify(s, null, 2) + '\n');
  console.log('✔ community/community.schema.json regenerado');
}

// ─── CLI ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--schema')) { writeSchema(); process.exit(0); }
if (args.includes('--all')) {
  const slugs = fs.readdirSync(COMM).filter((f) => f.endsWith('.json') && !f.startsWith('_') && f !== 'community.schema.json').map((f) => f.replace(/\.json$/, ''));
  slugs.forEach((s) => build(s));
  process.exit(0);
}
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) fail('Uso: node tools/build.mjs <slug> [--out DIR] | --all | --schema');
const oi = args.indexOf('--out');
build(slug, oi >= 0 ? args[oi + 1] : undefined);
