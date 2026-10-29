# comunidad-demo

Plantilla de app para comunidades judías. **Un fichero de configuración por comunidad, una app por fichero.**

Cada comunidad define su nombre, colores, rabino, contacto, datos legales y qué módulos quiere
(calendario, eventos, noticias, donativos, mikve…) en `community/<slug>.json`. El build genera su app completa.

## Probarlo (sin instalar nada, solo Node ≥ 18)

```bash
npm run dev -- demo            # construye y abre http://localhost:8080
npm run dev -- mediterranea    # otra comunidad: otros colores, ciudad y módulos
```

## Crear una comunidad nueva

```bash
npm run new -- sefarad --name "Kehilá Sefarad" --city sevilla --primary "#5B2A86" --accent "#F2B134" --build
```

Genera `community/sefarad.json`. Edítalo (rabino, equipo, contacto, módulos…) y reconstruye:

```bash
npm run build -- sefarad       # → dist/sefarad/
```

Los campos que no pongas salen de `community/_defaults.json`. Con la extensión JSON de tu editor
tienes autocompletado gracias a `community/community.schema.json`.

## Qué se puede configurar

| Bloque | Qué controla |
|---|---|
| `name`, `shortName`, `appName`, `tagline`, `centerName`, `city`, `domain` | Identidad y textos de marca |
| `theme` | `primary`, `accent`, `background`: toda la interfaz cambia de color |
| `modules` | Activar o desactivar secciones (`false` quita la página, el menú y los enlaces) |
| `rabbi`, `team` | Rabino y equipo (citas, contacto) |
| `contact`, `social`, `legal` | Contacto y datos legales (aviso legal, privacidad, cookies) |
| `location` | Ciudad del calendario y coordenadas (horarios de Shabat, mikve) |
| `app`, `stores` | Identificadores de la app móvil y enlaces a las tiendas |
| `integrations` | Supabase y Stripe de **esa** comunidad |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev -- <slug>` | Construye y sirve en local |
| `npm run build -- <slug>` | Construye `dist/<slug>/` |
| `npm run build:all` | Construye todas las comunidades |
| `npm run new -- <slug> --name … --city …` | Crea una comunidad nueva |
| `npm run check` | Reconstruye todo y avisa si se ha colado algo de una comunidad real o hay errores de sintaxis |
| `npm run schema` | Regenera el esquema JSON si cambias `_defaults.json` |

## Estado

Fases 0–2 hechas (copia limpia, desnudado de Jabad, configuración por comunidad).
Pendiente: modo demo con datos mock (sin backend), migración a Next.js, empaquetado móvil y
backend por comunidad. Ver `CLAUDE.md`.

> Sin datos mock todavía, las pantallas que necesitan sesión piden un proyecto Supabase configurado en `integrations`.
