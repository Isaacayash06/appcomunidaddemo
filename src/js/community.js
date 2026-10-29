/**
 * community.js — Configuración de la comunidad en tiempo de ejecución.
 *
 * El build (tools/build.mjs) sustituye el marcador de la variable DATA por la parte
 * PÚBLICA de community/<slug>.json (nunca claves ni datos legales).
 * Se carga en el <head> de todas las páginas, antes que nav.js.
 *
 *   COMMUNITY.name                  → "Comunidad Demo"
 *   COMMUNITY.enabled('mikve')      → true / false
 *   COMMUNITY.team                  → equipo para contacto.html
 */
(function () {
  var DATA = "__COMMUNITY_JSON__";

  // Módulos que cuelgan de otros: el hub "rav-hub" existe si hay alguno de sus tres.
  var HUB = { 'rav-hub': ['shiurim', 'rav', 'citas'] };

  // Página → módulo (para ocultar enlaces a módulos desactivados).
  var PAGE_MODULE = {
    'calendario.html': 'calendario', 'eventos.html': 'eventos',
    'noticias.html': 'noticias', 'noticia.html': 'noticias',
    'shiurim.html': 'shiurim', 'rav.html': 'rav', 'citas-rabino.html': 'citas',
    'rav-hub.html': 'rav-hub', 'siddur.html': 'siddur', 'donativos.html': 'donativos',
    'mikve.html': 'mikve', 'business.html': 'business', 'servicios.html': 'servicios',
    'galeria.html': 'galeria', 'voluntariado.html': 'voluntariado'
  };

  DATA.enabled = function (mod) {
    if (HUB[mod]) return HUB[mod].some(function (m) { return DATA.modules[m] !== false; });
    return DATA.modules[mod] !== false;
  };

  DATA.moduleOfPage = function (href) {
    var file = String(href || '').split('#')[0].split('?')[0].split('/').pop();
    return PAGE_MODULE[file] || null;
  };

  window.COMMUNITY = DATA;
  try { document.documentElement.setAttribute('data-community', DATA.slug); } catch (e) {}

  // Oculta (sin tocar el HTML de cada página) cualquier enlace a un módulo desactivado.
  var css = Object.keys(PAGE_MODULE)
    .filter(function (p) { return !DATA.enabled(PAGE_MODULE[p]); })
    .map(function (p) { return 'a[href^="' + p + '"],a[href^="/' + p + '"]'; })
    .join(',');
  if (css) {
    var st = document.createElement('style');
    st.setAttribute('data-community-modules', '');
    st.textContent = css + '{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }
})();
