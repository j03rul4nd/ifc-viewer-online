# Contenido — munición cargada (NO disparar todo a la vez)

> Generado 2026-06-06. Estos son **drafts listos para publicar**, no una orden de publicar 14 posts en 14 días.
> Lee la decisión de distribución completa en `memory/project_refocus_save_2026-06.md` §8b.

## Reglas de oro (antes de publicar cualquiera)

1. **Rellena los slots `[TU EXPERIENCIA: …]`** con tus cicatrices reales (proyectos, números, el comentario exacto de Reddit). Ese 10% es lo que la IA no puede falsear y lo que hace que la pieza no sea slop. Sin eso, no publiques.
2. **No inventes tracción.** El proyecto hoy tiene ~0 stars. La autenticidad es contar eso, no esconderlo.
3. **Cadencia: 3-4/semana, no diaria.** Publicar a diario diluye la velocidad de engagement temprano (señal madre del algoritmo de Medium).
4. **HN y r/bim son de UN SOLO TIRO.** No los dispares hasta tener: (a) `VITE_REPORT_URL` verificado en prod, (b) 5 entrevistas hechas (mensaje clavado), (c) el benchmark `/bench` vivo (el hook "puntué N IFCs, la mediana es 71" lo hace 10× más fuerte).
5. **Métrica norte: `report_shared`** — no views ni claps ni stars. Es la única señal de que el producto sirvió y alimenta el loop coordinador→exportador.
6. **El producto aparece como PRUEBA de la historia, nunca como pitch.** Un solo CTA suave al final (link de prueba + suscripción).

## Secuencia de disparo

| Semana | Qué | Piezas |
|---|---|---|
| 1-2 (cargar) | Verificar `VITE_REPORT_URL` · 5 entrevistas · benchmark vivo | (ninguna publicación) |
| 2-3 (amplificadores) | Historia de ingeniería → backlinks + GEO + estrellas | 15 (Show HN), 04 (WASM), 05 (open-core), + post en OSArch/ThatOpen |
| 3-4 (usuarios) | Responder en hilos r/bim/r/Revit; 1 lanzamiento | 16 (r/bim), 03 (digital twins), 09 (killed AI) en Medium/LinkedIn |
| 4+ (compuesto) | SEO de alta intención + datos del benchmark | 02, 06, 08, 10, 13 (SEO) · 01, 07, 11, 12 (Medium) · 14 (pilar) |

## Índice de piezas

| # | Archivo | Plataforma | Tipo | Viral/SEO | Disparar |
|---|---|---|---|---|---|
| 01 | medium/01-9-months-browser-bim-validator.md | Medium | engineering story (ancla) | 8/4 | sem 2-3 |
| 02 | seo/02-revit-ifc-export-breaks-30s-check.md | SEO/blog | playbook | 4/9 | sem 4+ (canonical→blog) |
| 03 | medium/03-digital-twins-broken-data-quality.md | Medium/LinkedIn | anti-hype | 9/5 | sem 3 |
| 04 | medium/04-webassembly-1gb-browser-three-bug.md | Medium/HN | deep dive | 7/6 | sem 2-3 |
| 05 | medium/05-open-core-solo-dev.md | Medium/HN | founder transparency | 7/5 | sem 2-3 |
| 06 | seo/06-free-ifc-viewers-2026-compared.md | SEO/blog | comparison honesta | 5/8 | sem 4+ |
| 07 | medium/07-health-score-single-number.md | Medium | product essay | 7/5 | sem 4 |
| 08 | seo/08-ifc-guids-change-every-export.md | SEO/blog | troubleshooting | 4/9 | sem 4+ (canonical→blog) |
| 09 | medium/09-killed-ai-validation-shipped-boring.md | Medium/HN | contrarian | 9/5 | sem 3 |
| 10 | dev/10-view-ifc-browser-threejs-webifc.md | dev.to/blog | tutorial | 5/8 | sem 4+ (canonical→blog) |
| 11 | medium/11-files-never-leave-browser-constraint.md | Medium | trust essay | 7/5 | sem 4 |
| 12 | medium/12-reddit-comment-rewrote-roadmap.md | Medium | founder story | 8/4 | sem 4 |
| 13 | seo/13-reduce-ifc-file-size.md | SEO/blog | troubleshooting | 4/8 | sem 4+ (canonical→blog) |
| 14 | medium/14-field-guide-trusting-ifc.md | Medium | PILAR / evergreen | 6/7 | sem 4 (enlaza al resto) |
| 15 | launch/15-show-hn.md | Hacker News | Show HN (one-shot) | — | sem 2-3, ya cargado |
| 16 | launch/16-reddit-rbim-launch.md | Reddit r/bim | lanzamiento (one-shot) | — | sem 3-4, ya cargado |

Cada `.md` trae: front-matter (title, description ≤155, 5 tags, viral/seo, fire_when, canonical), cover SVG (1200×630, marca), un diagrama Mermaid, y el cuerpo completo. (HN y r/bim van en texto/markdown nativo, sin cover.)
