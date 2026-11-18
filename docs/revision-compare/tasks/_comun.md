# Reglas comunes a T1–T5 (cada prompt las incluye por referencia)

1. **Base de código:** `main`. Crea tu propio worktree desde `origin/main` con una rama `feat/revision-compare-tN`. **No toques `C:/repo/ifc`** ni su rama `feat/urban-3d-vertical-infrastructure`: tiene trabajo sin commitear de otras tareas. Si el worktree usa junctions en `node_modules`, quítalas antes de borrarlo (si no, se borra el `node_modules` principal).
2. **Lee primero** `docs/revision-compare/10-spec.md`. Esta carpeta no está en `main`: léela en `C:/repo/ifc/docs/revision-compare/` (solo lectura) y copia a tu worktree lo que necesites. Después lee los documentos de la fase 1 que cite tu tarea.
3. **El contrato** es `src/lib/compare/revision-types.ts`, tal como está en la spec §3.5. Solo T1 puede cambiarlo. Si otra tarea necesita algo más, lo añade como campo opcional y lo anota como desviación en su RESULTADO.
4. **Local-first:** los modelos y los resultados nunca salen del navegador. Nada de llamadas a servidor.
5. **i18n:** los textos visibles van en los 10 idiomas, con el guard de i18n en verde.
6. **Commits y PR:** no mencionar herramientas de IA. La PR va contra `main`.
7. **Al terminar**, escribe `C:/repo/ifc/docs/revision-compare/tasks/Tn-RESULTADO.md` con:
   - lo hecho, con `ruta:línea`;
   - los tests y su salida;
   - lo pendiente;
   - las desviaciones de la spec.
8. **Fuera de alcance:** se anota en `C:/repo/ifc/docs/revision-compare/99-parking-lot.md` y no se hace.
9. **Tests:** usa `npx vitest run <ruta>` sobre lo tuyo, y la suite completa antes de abrir la PR. Si un test tarda 5 s y da timeout con la máquina cargada, es un flake conocido: repítelo antes de darlo por regresión.
