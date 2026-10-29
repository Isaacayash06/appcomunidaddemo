"""Genera el Sidur de la app (siddur.html + siddur/*.html) a partir del proyecto
del sidur (Siddur Edot HaMizrach, Sefaria, CC0).

Reutiliza tal cual la estructura y la limpieza de texto de su build.py
(GROUPS, render_section, SHORTCUTS...), pero en vez de un único index.html de
1,2 MB escribe:

  - siddur.html            -> la página de la app (plantilla tools/siddur.template.html)
                              con la portada y los dos índices ya montados.
  - siddur/<parte>.html    -> un fragmento por tefilá (Shajarit, Minjá...), que
                              js/siddur.js descarga solo al abrirla. Así en el
                              móvil no se carga ni se pinta el libro entero.

Uso:  python tools/build_siddur.py [ruta-al-proyecto-del-sidur]
      (la ruta es obligatoria: es el proyecto fuente del sidur, no va en este repo)
"""
import hashlib
import importlib.util
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) < 2:
    sys.exit("Uso: python tools/build_siddur.py <ruta-al-proyecto-del-sidur>")
SRC = sys.argv[1]

spec = importlib.util.spec_from_file_location("sidur_build", os.path.join(SRC, "build.py"))
sb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sb)
esc = sb.esc


def build():
    out_dir = os.path.join(REPO, "src", "siddur")
    os.makedirs(out_dir, exist_ok=True)
    toc_inline, toc_drawer, parts_meta, where = [], [], [], {}
    n = 0
    for gname, parts in sb.GROUPS:
        toc_inline.append(f'<h2 class="toc-group">{esc(gname)}</h2><ol class="toc">')
        toc_drawer.append(f'<h2 class="toc-group">{esc(gname)}</h2>')
        for pid, he, es, sub, sections in parts:
            roman = sb.ROMAN[n]
            n += 1
            secs_html, links = [], []
            for i, (ses, she, files) in enumerate(sections):
                h, sid = sb.render_section(pid, i, ses, she, files, es)
                if h:
                    secs_html.append(h)
                    links.append((sid, ses, she))
                    where[sid] = pid
            for anchor, _ in sb.ANCHORS.values():
                where.setdefault(anchor, None)
            frag = (
                f'<section class="part" id="{pid}" data-es="{esc(es)}">\n'
                f'<header class="half-title"><span class="num">{roman}</span>'
                f'<h2 class="he" lang="he">{esc(he)}</h2><p class="es">{esc(es)}</p>'
                f'{sb.ORN}<p class="sub">{esc(sub)}</p></header>\n'
                + "\n".join(secs_html)
                + "</section>\n"
            )
            for anchor, _ in sb.ANCHORS.values():
                if f'id="{anchor}"' in frag:
                    where[anchor] = pid
            with open(os.path.join(out_dir, pid + ".html"), "w", encoding="utf8", newline="\n") as f:
                f.write(frag)
            where[pid] = pid
            parts_meta.append({
                "id": pid, "es": es, "he": he,
                "v": hashlib.sha1(frag.encode("utf8")).hexdigest()[:10],
            })

            # Índice de la portada (igual que el original)
            if pid in sb.SHORTCUTS:
                quick = "".join(
                    f'<li><a href="#{t}"><span class="es">{esc(l)}</span><span class="dots"></span>'
                    f'<span class="he" lang="he">{esc(h)}</span></a></li>'
                    for l, h, t in sb.SHORTCUTS[pid]
                )
                toc_inline.append(
                    f'<li class="has-sub"><details><summary><span class="es">{esc(es)}</span><span class="dots"></span>'
                    f'<span class="he" lang="he">{esc(he)}</span></summary><ul class="quick">{quick}</ul></details></li>'
                )
                drawer_items = "".join(
                    f'<li><a href="#{t}"><span class="es">{esc(l)}</span>'
                    f'<span class="he" lang="he">{esc(h)}</span></a></li>'
                    for l, h, t in sb.SHORTCUTS[pid]
                )
            else:
                toc_inline.append(
                    f'<li><a href="#{pid}"><span class="es">{esc(es)}</span><span class="dots"></span>'
                    f'<span class="he" lang="he">{esc(he)}</span></a></li>'
                )
                drawer_items = "".join(
                    f'<li><a href="#{sid}"><span class="es">{esc(ses)}</span>'
                    f'<span class="he" lang="he">{esc(she)}</span></a></li>'
                    for sid, ses, she in links
                )
            toc_drawer.append(
                f'<details class="toc-part" data-part="{pid}"><summary><span class="es">{esc(es)}</span>'
                f'<span class="he" lang="he">{esc(he)}</span></summary><ul>'
                + drawer_items
                + "</ul></details>"
            )
        toc_inline.append("</ol>")

    missing = [k for k, v in where.items() if v is None]
    if missing:
        raise SystemExit("Anclas sin parte: " + ", ".join(missing))

    data = json.dumps({"parts": parts_meta, "where": where}, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(REPO, "tools", "siddur.template.html"), encoding="utf8") as f:
        tpl = f.read()
    page = (
        tpl.replace("<!--TOC_INLINE-->", "\n".join(toc_inline))
        .replace("<!--TOC_DRAWER-->", "\n".join(toc_drawer))
        .replace("/*SIDUR_DATA*/null", data)
    )
    with open(os.path.join(REPO, "src", "siddur.html"), "w", encoding="utf8", newline="\n") as f:
        f.write(page)
    print("OK:", n, "partes ·", len(page) // 1024, "KB de página ·",
          sum(os.path.getsize(os.path.join(out_dir, p["id"] + ".html")) for p in parts_meta) // 1024, "KB de texto")


if __name__ == "__main__":
    build()
