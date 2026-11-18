# Revision Compare — plan y estado

Necesidad (fuente de verdad): un ingeniero de obra (Tailandia, prefabricado — SUPUESTO) recibe revisiones de planos/modelos sin cambios marcados; los busca a mano y lo que se le escapa genera conflictos en obra.

> "The thing that frustrated me and cost me time was the unmarked changes on revised drawing. Which cause time and confliction on-site."

Pendiente de confirmar con el usuario: ¿IFC, PDF/DWG 2D o ambos?

JTBD: (1) qué cambió entre A y B sin que se escape nada; (2) qué afecta a lo ya fabricado/pedido/construido; (3) documento para obra y para reclamar al proyectista; (4) rápido, archivos grandes, local-first.

Reglas: evidencia `ruta:línea` o URL, si no `SUPUESTO`; estado en esta carpeta; fuera de alcance → `99-parking-lot.md`; local-first; puertas de aprobación; no reinventar (ver memoria previa: comparación de conjuntos IFC en worktree `ifc-compare`, sin commitear).

## Fases

| Fase | Entregable | Estado |
|---|---|---|
| 1 Descubrimiento | 01-inventario, 02-dominio, 03-competencia, 04-casuisticas, 05-ux | hecho (2026-11-13) |
| Puerta 1 | síntesis 10 líneas + contradicciones | aprobada (2026-11-13), base = main |
| 2 Especificación | 10-spec.md | escrita (2026-11-13) |
| Puerta 2 | OK de la spec | aprobada (2026-11-13) |
| 3 Construcción | tasks/T1..T5 (T1 primero; T2–T4 en paralelo; T5 si confirma PDF) | T1 fusionada (#595, 4fa14db4, 2026-11-13); T2–T4 por lanzar; T5 espera respuesta del usuario sobre PDF |
| 4 Verificación | 20-verificacion.md + demo + borrador de correo | 1.ª pasada hecha (2026-11-13): 2 fallos altos (colores 3D, PDF 2D sin probar en navegador). Arreglos en curso: T2 (#5, #6, #7, #12), T4 (#4, #8), T5 (#2, #8, #9); T3 (#1, #3, #10, #14) tras fusionar T6. Despliegue bloqueado hasta re-verificar. Correo en 30-correo-usuario.md |
