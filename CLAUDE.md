# CLAUDE.md — comunidad-demo

Plantilla de app para comunidades judías. Nació de la app de Jabad Barcelona ("Kehilá"), desnudada
de su marca y datos, y convertida en una plantilla configurable. **Este repo no contiene datos de
ninguna comunidad real**: `npm run check` lo vigila.

## Cómo funciona

```
community/<slug>.json  ──┐
community/_defaults.json ┼─►  tools/build.mjs  ──►  dist/<slug>/   (web estática lista para servir)
src/  (páginas con tokens {{…}}) ─┘
```

- `src/` es la app: HTML/CSS/JS vanilla con **tokens** `{{name}}`, `{{contact.email}}`, `{{location.cityKey}}`…
- El build mezcla `_defaults.json` + `<slug>.json`, valida, sustituye los tokens, aplica el tema y copia a `dist/`.
- Un token que no existe en la configuración **rompe el build** (no se publica a medias).
- `src/js/community.js` expone `window.COMMUNITY` en el navegador: la parte pública de la configuración
  (nunca claves ni datos legales) y `COMMUNITY.enabled('mikve')`.

### Tema
Los colores de marca están escritos como hex en el código original. El build cambia cada uno por el
equivalente de `theme.primary/accent/background` (mapa en `colorMap()` de `tools/build.mjs`, con
variantes oscuras, claras y `rgba`). Si añades un color de marca nuevo al código, añádelo al mapa
o, mejor, usa `var(--color-primary)` / `var(--color-gold)`.

### Logo
`brand.assets` (por defecto `brand/default`, el logo oficial de la app) es una carpeta con `logo.png`
(interfaz: sidebar, login) e `icon-<n>.png` (favicon, PWA, iOS/Android). Se genera desde una imagen de
icono con `python3 tools/brand_assets.py <imagen.png> brand/<nombre>` (requiere Pillow). Una comunidad
puede apuntar a su propia carpeta, o poner `""` para el logo generado con los colores del tema (`logo.svg`).
En el código, el logo se referencia como `img/{{brand.logoFile}}`, nunca con el nombre de fichero fijo.

### Módulos
`modules.<nombre>: false` en la comunidad:
1. el build no copia las páginas de ese módulo (mapa `MODULES` en `tools/build.mjs`);
2. `sw.js` y `js/router.js` se podan de esas páginas;
3. `js/nav.js` quita el item del menú, de la barra inferior y de las pestañas (`navModuleOn`);
4. `js/community.js` oculta con CSS cualquier enlace suelto a esas páginas.

Para **añadir un módulo**: página en `src/`, entrada en `MODULES` (build) y en `PAGE_MODULE`
(`community.js`), id en `NAV_ID_MODULE` (`nav.js`) y clave en `_defaults.json` → `modules`.

### Modo demo
`integrations.demoLogin: true` (solo en `community/demo.json`) hace que la app funcione sin backend:
- «Entrar» acepta cualquier email/contraseña y crea un usuario local `source: 'demo'` (`login()` en `auth.js`).
- El build copia `js/demo.js` y lo carga en el `<head>`; `getSupabase()` devuelve su cliente falso, que
  responde `from().select().eq()…` con datos de ejemplo (fechas relativas a hoy, imágenes SVG con el tema).
- Las escrituras se guardan en `localStorage` (`kehila_demo_db`) y se reinician cada día. Si cambias
  `seed()`, sube `SEED_VERSION`. Subidas, pagos y funciones edge devuelven «No disponible en la demo».
- Sin `demoLogin`, `js/demo.js` no se copia: nunca llega a una comunidad real.

### Inglés (botón ES/EN)
`js/lang-en.js` traduce en el navegador todo el texto visible con el diccionario `js/lang-en-dict.js`
(`exact` frase a frase + `patterns` para frases con datos: «Tienes 3 solicitudes…»). Lo que no está en el
diccionario se queda en español. **Al añadir o cambiar un texto visible, añade su traducción** y comprueba:

    node tools/build.mjs demo && node tools/i18n-missing.mjs demo [--strict]

Lista lo que sigue en español por fichero. Quedan siempre algunos falsos positivos: nombres propios
(ciudades, «Kehilá …»), «No», mensajes de consola. Los datos de la base de datos no se traducen (en la
demo, `js/demo.js` sirve los de ejemplo ya en inglés). El texto de los rezos del sidur sigue en español:
haría falta una fuente inglesa para regenerarlo.

### Escapado de tokens
Se hace según el contexto: HTML normal → entidades; dentro de `<script>` y `.js` → string JS;
dentro de `onclick="…"` → JS y luego HTML; `.json` → JSON. Un nombre con `'`, `"` o `&` no rompe nada
(probado). Los valores deben ser simples (texto, número, booleano), no listas ni objetos:
para listas (p. ej. `team`) la página lee `window.COMMUNITY`.

## Reglas del repo

1. **Nada de comunidades reales en `src/`, `tools/` ni `community/`**: ni nombres, ni correos, ni teléfonos,
   ni fotos de personas, ni claves. Los datos reales van en la configuración de esa comunidad, fuera de
   este repo si es sensible.
2. Los ejemplos usan dominios `example.com` y teléfonos `+34 600 000 0xx`.
3. Ejecutar `npm run check` antes de cada commit.
4. Las imágenes del login/home son placeholders SVG generados (`img/placeholder.svg`, `avatar.svg` salen del
   build con los colores de la comunidad; el logo y los iconos vienen de `brand/`). No añadir fotos reales aquí.
5. Los `kehila_*` de `localStorage` son nombres técnicos internos del producto; no son marca de comunidad.

## Estructura

```
community/   _defaults.json (todo lo configurable + valores neutros), <slug>.json, community.schema.json
src/         la app (páginas, css/, js/, vendor/, siddur/)
brand/       logo oficial: default/ (logo.png + icon-<n>.png), generado con tools/brand_assets.py
tools/       build.mjs · serve.mjs · new-community.mjs · check.mjs · build_siddur.py · brand_assets.py
supabase/    backend de referencia (esquema + funciones edge). Ver supabase/README.md
dist/        salida del build (no se versiona)
```

El sidur (`src/siddur.html`, `src/siddur/*`) es **generado** desde un proyecto externo con
`python tools/build_siddur.py <ruta-al-proyecto-del-sidur>`; no editar a mano.

## Seguridad heredada (sigue pendiente)

Viene de la app original y no se ha tocado en las fases 0–2:
- Cabeceras HTTP (CSP, X-Frame-Options) sin configurar en el hosting.
- Datos personales en `localStorage` sin cifrar (`kehila_user`, etc.).
- Sin tokens CSRF; el service worker cachea algunas respuestas autenticadas.
- RGPD: los datos religiosos son categoría especial (art. 9). Cada comunidad necesita sus propios
  textos legales (`legal.*`) revisados por un abogado: los de ejemplo **no sirven en producción**.

## Hoja de ruta

| Fase | Estado |
|---|---|
| 0. Copia limpia, sin historial ni secretos | ✅ |
| 1. Desnudar Jabad (páginas específicas, marca, fotos, datos personales) | ✅ |
| 2. Configuración por comunidad + build + módulos + tema + iconos | ✅ |
| 3. Nueva base Next.js (App Router + TypeScript), portar módulos uno a uno | pendiente |
| 4. Capa de datos con adaptadores `mock` / `supabase` + modo demo (sin backend, panel para activar secciones en vivo) | pendiente |
| 5. Despliegue por comunidad (enlace de demo para enviar) | pendiente |
| 6. Móvil con Capacitor empaquetando la app (iOS/Android por comunidad) | pendiente |
| 7. Backend por comunidad: parametrizar funciones edge (`supabase/README.md`), decidir un Supabase por comunidad o uno compartido | pendiente |

Limitación actual: sin la fase 4, las pantallas que requieren sesión necesitan un Supabase real
configurado en `integrations`. La configuración (`community/*.json`) está pensada para reutilizarse tal cual en Next.js.
