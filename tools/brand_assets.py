#!/usr/bin/env python3
"""
brand_assets.py — Prepara el logo de la app a partir de una imagen de icono.

    python3 tools/brand_assets.py <imagen.png> [carpeta-destino]   (por defecto: brand/default)

La imagen de entrada es un icono "de presentación": un cuadrado con esquinas
redondeadas sobre fondo claro (con sombra o sin ella). El script:

  1. localiza el cuadrado (píxeles oscuros y azulados/de color frente al fondo claro);
  2. guarda logo.png (512 px, esquinas transparentes) para la interfaz;
  3. guarda icon-<n>.png para cada tamaño de ICON_SIZES (build.mjs): cuadrado
     completo, sin transparencia (iOS/Android aplican su propia máscara),
     recortado hacia dentro lo justo para que no quede ninguna esquina redondeada.

El build copia esa carpeta a dist/<slug>/img/ cuando `brand.assets` apunta a ella.
Requiere Pillow (pip install pillow).
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ICON_SIZES = [20, 29, 40, 48, 57, 58, 60, 72, 76, 80, 87, 96, 114, 120, 144, 152, 167, 168, 180, 192, 512, 1024]


def is_logo(p, bg):
    """Píxel del cuadrado: claramente más oscuro que el fondo."""
    return sum(p) / 3 < sum(bg) / 3 - 90


def find_square(im):
    w, h = im.size
    px = im.load()
    bg = px[2, 2]
    cols = [x for x in range(w) if any(is_logo(px[x, y], bg) for y in range(0, h, 3))]
    rows = [y for y in range(h) if any(is_logo(px[x, y], bg) for x in range(0, w, 3))]
    if not cols or not rows:
        sys.exit('No se encuentra el cuadrado del icono (¿fondo oscuro?).')
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]
    # Radio de las esquinas: dónde empieza el cuadrado en su fila superior
    top = [x for x in range(x0, x1 + 1) if is_logo(px[x, y0 + 1], bg)]
    radius = max(0, top[0] - x0) if top else 0
    return (x0, y0, x1 + 1, y1 + 1), radius, bg


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2] if len(sys.argv) > 2 else 'brand/default')
    out.mkdir(parents=True, exist_ok=True)

    im = Image.open(src).convert('RGB')
    box, radius, bg = find_square(im)
    sq = im.crop(box)
    # Cuadrado exacto (el detectado puede diferir 1-10 px entre ancho y alto)
    side = max(sq.size)
    sq = sq.resize((side, side), Image.LANCZOS)
    r = round(radius * side / max(box[2] - box[0], box[3] - box[1]))
    print(f'cuadrado {box}, lado {side}px, radio {r}px')

    # Icono a sangre: recortar hacia dentro lo justo para que no quede ninguna
    # esquina redondeada (a partir de r·(1−1/√2) desde el borde todo es cuadrado).
    # Sin rellenos: el contenido queda intacto, solo pierde un margen.
    cut = math.ceil(r * (1 - 1 / math.sqrt(2))) + 6
    full = sq.crop((cut, cut, side - cut, side - cut))
    for n in ICON_SIZES:
        full.resize((n, n), Image.LANCZOS).save(out / f'icon-{n}.png', optimize=True)

    # Logo para la interfaz: esquinas transparentes (máscara supermuestreada para bordes suaves)
    scale = 4
    mask = Image.new('L', (side * scale, side * scale), 0)
    edge = 3 * scale   # unos px hacia dentro: fuera queda el antialias contra el fondo claro
    ImageDraw.Draw(mask).rounded_rectangle((edge, edge, side * scale - 1 - edge, side * scale - 1 - edge), radius=(r - 3) * scale, fill=255)
    mask = mask.resize((side, side), Image.LANCZOS)
    logo = sq.convert('RGBA')
    logo.putalpha(mask)
    logo.resize((512, 512), Image.LANCZOS).save(out / 'logo.png', optimize=True)

    print(f'✔ {out}/logo.png + {len(ICON_SIZES)} iconos')


if __name__ == '__main__':
    main()
