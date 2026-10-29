#!/usr/bin/env node
/**
 * i18n-missing.mjs — Lista los textos visibles que se quedan en español en modo inglés.
 *
 *   node tools/i18n-missing.mjs [slug] [--json] [--strict]   (por defecto: demo; usa dist/<slug>, ejecuta antes el build)
 *
 * Extrae de dist/<slug> los textos que puede ver el usuario —texto de las páginas,
 * placeholder/title/aria-label/alt y cadenas de los scripts (incluidas las que pintan
 * HTML)— y los pasa por el traductor real (js/lang-en.js + js/lang-en-dict.js).
 * Lo que sigue pareciendo español y el traductor no cubre, se lista por fichero.
 *
 * Es estático: no ve textos que vienen de la base de datos, y en cadenas montadas por
 * código (`Hola ${nombre}`) solo ve los trozos fijos. Puede dar algún falso positivo.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--')) || 'demo';
const STRICT = args.includes('--strict');
const DIR = path.join(ROOT, 'dist', slug);
if (!fs.existsSync(DIR)) { console.error(`No existe dist/${slug}. Ejecuta: node tools/build.mjs ${slug}`); process.exit(1); }

// No son interfaz: el sidur tiene su propio texto, los vendor son librerías,
// y el propio diccionario/traductor no se analiza a sí mismo.
const SKIP = [/^vendor\//, /^siddur\//, /^js\/lang-en(-dict)?\.js$/, /^js\/i18n\.js$/, /^sw\.js$/, /^js\/demo\.js$/];

// ─── Traductor real, en un sandbox ──────────────────────────────────────────
function loadTranslator() {
  const store = { kehila_lang: 'en' };
  const noop = () => {};
  const document = {
    write: noop, addEventListener: noop, documentElement: { nodeType: 0 }, title: '',   // nodeType 0: walk() no recorre nada
    createTreeWalker: () => ({ nextNode: () => null }), querySelector: () => null, getElementById: () => null,
  };
  const window = {};
  const ctx = {
    window, document, console,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    location: { reload: noop }, MutationObserver: class { observe() {} }, NodeFilter: {},
    WeakMap, Map, Intl, Date, Number, Array, RegExp, String, Object, setTimeout,
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js/lang-en-dict.js'), 'utf8'), Object.assign(ctx, { window }));
  ctx.window.__KEHILA_EN = window.__KEHILA_EN;
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js/lang-en.js'), 'utf8'), ctx);
  return (s) => window.kehilaTranslate(s);
}

// ─── Extracción ─────────────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rarr: '→', larr: '←', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', copy: '©' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Textos de un trozo de HTML: nodos de texto + atributos visibles. */
function fromHtml(html, out) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/(<textarea\b[^>]*>)[\s\S]*?<\/textarea>/gi, '$1')   // su texto no, sus atributos sí
    .replace(/<[^>]*\b(?:class="[^"]*\bnotranslate\b[^"]*"|data-no-translate)[^>]*>[^<]*/gi, ' ');
  for (const m of clean.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/gi)) out.push(decode(m[2]));
  for (const m of clean.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*'([^']*)'/gi)) out.push(decode(m[2]));
  for (const t of clean.replace(/<[^>]*>/g, '\u0000').split('\u0000')) out.push(decode(t));
}

/** Cadenas de un script (sin comentarios). Las que llevan HTML se trocean como HTML. */
function fromJs(src, out) {
  let i = 0;
  const n = src.length;
  const push = (s) => { if (/<[a-z/!]/i.test(s)) fromHtml(s, out); else out.push(s); };
  let prev = '';   // último carácter significativo, para distinguir / de regex
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '/' && /[(,=:[!&|?{};\n]|^$|return$/.test(prev)) {   // literal regex: saltar
      i++; let cls = false;
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/i.test(src[i] || '')) i++;
      prev = 'x'; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (e === 'u' && /^[0-9a-f]{4}$/i.test(src.slice(j + 2, j + 6))) { s += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue; }
          s += e === 'n' ? '\n' : e; j += 2;
        } else s += src[j++];
      }
      push(s); i = j + 1; prev = 'x'; continue;
    }
    if (c === '`') {
      let j = i + 1, s = '', depth = 0;
      while (j < n) {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
        if (src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') {
          // Hueco ${…}: se marca con HOLE (luego se prueba con un valor de ejemplo) y su contenido se analiza como JS
          s += HOLE;
          let k = j + 2; depth = 1; const st = k;
          while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; else if (src[k] === '`') { k = src.indexOf('`', k + 1); } k++; }
          fromJs(src.slice(st, k - 1), out);
          j = k; continue;
        }
        s += src[j++];
      }
      push(s);
      i = j + 1; prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = /[a-z0-9_$)\]]/i.test(c) ? (/[a-z]/i.test(c) ? (prev + c).slice(-6) : 'x') : c;
    i++;
  }
}

const HOLE = '\u0001';   // hueco ${…} de una plantilla

// ─── ¿Parece español visible? ───────────────────────────────────────────────
const SPANISH = /[áéíóúñ¿¡]|\b(de|la|el|los|las|del|para|con|una|un|por|que|tu|tus|sin|más|aquí|en|y|es|al|se|su|sus|hay|esta|este|cada|todo|todos|nuevo|nueva|ver|hoy|no|sí|mi|mis|son|está|ya|o)\b/i;
const NOT_UI = [
  /^[\w-]+(\.[\w-]+)+$/,                // ficheros, dominios, rutas con puntos
  /^[a-z_]+(,\s*[a-z_]+)+$/,            // listas de columnas: 'id, titulo, fecha'
  /^[a-z][a-z0-9_]*$/,                  // identificadores / códigos: 'confirmada', 'mikve_reservas'
  /^[a-z-]+:\s*[^;]+;/i,                // CSS en línea
  /^(https?:|mailto:|tel:|\/|#|\.|data:)/i,
  /[{}]/,                               // trozos de código o de plantilla
  /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/,      // ids y clases: 'mis-preg-body'
  /^\[[\w-]+\]|^⚠️|^✅/,                 // console.log('[push] …')
  /=\s*["']|onclick|<\/?[a-z]/i,         // restos de HTML montado a trozos
  /^\s*(es|en)(-[A-Z]{2})?\s*$/,
];
function isCandidate(t) {
  if (t.length < 2 || !/[a-záéíóúñ]/i.test(t)) return false;
  if (!SPANISH.test(t)) return false;
  return !NOT_UI.some((rx) => rx.test(t));
}

// ─── Principal ──────────────────────────────────────────────────────────────
const translate = loadTranslator();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const result = {};
let total = 0;
for (const file of walk(DIR)) {
  const rel = path.relative(DIR, file).split(path.sep).join('/');
  if (SKIP.some((rx) => rx.test(rel)) || !/\.(html|js)$/.test(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const texts = [];
  if (rel.endsWith('.html')) {
    fromHtml(src, texts);
    for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) fromJs(m[1], texts);
    for (const m of src.matchAll(/\bon[a-z]+="([^"]*)"/gi)) fromJs(decode(m[1]), texts);
  } else {
    fromJs(src, texts);
  }
  const missing = new Set();
  for (const raw of texts) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!isCandidate(t.replace(/\u0001/g, ' ').replace(/\s+/g, ' ').trim())) continue;
    // Con huecos: se prueba la frase completa con un valor de ejemplo, y sin los huecos de los extremos
    // (suelen ser iconos u otro HTML, que en la página van en otro nodo).
    const variants = !t.includes(HOLE) ? [t] : [
      t.replace(/\u0001/g, '7'),
      t.replace(/\u0001/g, 'Ana'),
      t.replace(/^[\u0001\s]+|[\u0001\s]+$/g, '').replace(/\u0001/g, '7'),
    ];
    // Por defecto basta con que una variante se traduzca; con --strict, también la variante sin
    // huecos en los extremos (cuando el hueco es un icono, el texto llega solo a la página).
    const ok = (v) => translate(v) !== v;
    if (STRICT ? ok(variants[variants.length - 1]) && variants.some(ok) : variants.some(ok)) continue;
    missing.add(t.replace(/\u0001/g, '${…}'));
  }
  if (missing.size) { result[rel] = [...missing].sort(); total += missing.size; }
}

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const [f, list] of Object.entries(result).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── ${f} (${list.length})`);
    list.forEach((t) => console.log('   ' + t));
  }
  console.log(`\n${total} textos sin traducir en ${Object.keys(result).length} ficheros`);
}
process.exitCode = total ? 1 : 0;
