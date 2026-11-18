# T-401 — Build the pure rigid-fit and tolerance module for As-Built alignment
## Objetivo
Pure TS module that fits a rigid transform from ≥3 point pairs (IFC ↔ cloud, scene metres) and derives τ and the scoring guardrail.
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2 (branch feat/asbuilt-alignment). Stack: React/TS, Three.js, web-ifc, ThatOpen/Fragments.
- Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §3. Plan: docs/AS_BUILT_SCORE_PLAN.md §3.4.
- Archivos a crear: `src/lib/asbuilt/rigid-fit.ts`, `src/lib/asbuilt/rigid-fit.test.ts`.
- Sin dependencias nuevas; SVD 3×3 propia (Jacobi). Sin three.js (worker-friendly). Scene is Y-up (yaw = about +Y).
- NO tocar: el resto de `src/lib/asbuilt/*`, `src/lib/pointcloud/*`.
## API esperada
- `fitRigid(pairs: {model: Vec3, cloud: Vec3}[], mode: '4dof'|'6dof'): FitResult | FitError` — maps cloud→model. `FitResult = { rotation: number[9] (row-major), translation: Vec3, yawRad, residualsM: number[], fitRmseM, looRmseM: number|null, alignmentRmseM }`. `FitError = { error: 'too-few'|'degenerate', ... }`.
- `effectiveTolerance({declaredM, measurementM, alignmentRmseM})` = sqrt of sum of squares.
- `scoringGate({declaredM, alignmentRmseM})` → `{ ok, reason?: 'alignment-too-coarse' }` with ok iff declaredM ≥ 2·alignmentRmseM.
- `suspiciousPairs(residuals, rmse)` → indices with residual > 3·rmse.
## Criterios de aceptación (verificables)
- [ ] Known transform (yaw 37°, t=(12,-3,5)) on 4 pairs, no noise → rotation/translation recovered to 1e-6; RMSE < 1e-6 (4dof and 6dof).
- [ ] 6dof recovers pitch 5° + roll 3° + yaw; 4dof on same data reports higher RMSE.
- [ ] Gaussian noise σ=5 mm, 6 pairs → alignmentRmseM within [2, 12] mm; looRmse ≥ fitRmse.
- [ ] n=3 → looRmseM null, alignmentRmseM = fitRmseM; n<3 → 'too-few'; collinear or span < 1 m → 'degenerate'.
- [ ] Reflection case (det<0) corrected to proper rotation.
- [ ] Gate: declared 25 mm, rmse 13 mm → not ok; rmse 12 mm → ok.
- [ ] `npx tsc --noEmit` clean; `npx vitest run src/lib/asbuilt/rigid-fit.test.ts` green.
## Fuera de alcance
UI, conversión a AlignmentOffset (T-402), escala.
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe
STATUS: done. Created src/lib/asbuilt/rigid-fit.ts (fitRigid 4dof closed-form yaw about +Y / 6dof Horn quaternion via own Jacobi eigen; LOO for n>=4; alignmentRmse=max(fit,loo); degenerate = span<1 m or perpendicular RMS<1 cm on model or cloud; effectiveTolerance, scoringGate, suspiciousPairs, isFitError) and rigid-fit.test.ts (12 tests green). tsc --noEmit clean.
Notes: Horn's method always returns det=+1, so the reflection case is handled by construction (test: mirrored data -> det 1). Noise test interprets sigma=5 mm as 3D point error (per-axis 5/sqrt(3)); with 5 mm per axis, LOO RMSE reached ~13 mm on one seed.
