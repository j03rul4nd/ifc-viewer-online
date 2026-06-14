# IDS_IMPLEMENTATION_PLAN.md — Full IDS Support (Production Grade)

> **Status:** Approved engineering blueprint. Single source of truth for IDS work.
> **Audience:** AI models and developers executing tasks with minimal prior context.
> **Last grounded against the codebase:** 2026-06-10 (commit lineage after `c2b09fd`).
> **Read order:** §1 → §2 → §3, then jump to your task in §6. Never start a §6 task
> without reading §2.3 (what already exists) and §7 (known failure modes).

---

## ⚑ SHIPPED STATUS — updated 2026-06-13 (READ FIRST)

> This banner is the live ledger of what has been built. The §2.3 inventory below
> describes the **original v1 baseline** (historical); the gaps it lists in §2.3.1
> are now **closed** except where noted. When in doubt, this banner + the memory
> note `project_ids_full_implementation.md` win over older prose in this doc.

| Phase | State | Notes |
|---|---|---|
| **P0** Research/fixtures | ✅ DONE | 60 buildingSMART testcases vendored (CC BY-ND, `src/lib/ids/ids-fixtures/`, pinned commit, `manifest.json` + `scripts/ids/fetch-testcases.mjs`). Golden suite `ids-testcases.test.ts` runs the **real** pipeline (parseIds → `ids-gather.ts` with web-ifc Node build → runIdsChecks) in vitest. |
| **P1** Foundations | ✅ DONE | P1-1 reason codes (`IdsReason{code,params}`) + `ids-engine-facets.ts` + `renderReasons` (EN, SDK-frozen). P1-2 worker protocol v2 (progress + cooperative cancel + Zod both directions in `worker-schemas.ts`; `runIds(xml\|doc, buffer, {signal,onProgress})`; `IdsCheckError`). P1-3 per-model store (`resultsByModel`/`previousResultByModel`/`runMetaByModel`/`runningModelId`; `clearForModel` wired in App removeModel/reset). |
| **P2** Engine correctness | ✅ DONE | P2-1 type-inherited psets · P2-2 generic attributes + name-restriction + USERDEFINED/inherited PT · P2-3 spec cardinality (synthetic fail row, `specRequiredButAbsent`/`specProhibitedButPresent`) · P2-4 ifcVersion gate **opt-in** (`IdsCheckOptions.filterByIfcVersion`, default off — testcases expect evaluation; `ifcSchemaFamily()`) · P2-5 dataType (`psetTypes`, `wrongDataType`) · P2-6 XSD regex translate + 1e-6·(\|a\|+\|b\|) tolerance + **strict lowercase booleans** + `unsupportedPattern` + `doc.warnings` · **P2-7** multi-value property shapes (enumerated/list/bounded/table → `psetValueLists`, any-match). |
| **P3** Full facet coverage | ✅ DONE | classification (ReferencedSource chain → `pathValues`/`system`), material (all set/usage shapes), partOf (6 relations, cap 32). `evalFacet` evaluates all 6 facets; `spec.unsupported` now always `[]`. `ifc-hierarchy.ts` generated from web-ifc (`scripts/ids/generate-ifc-hierarchy.mjs`). |
| **P4** Viewer integration | ✅ DONE | `setIdsHighlights` (shares the validation overlay channel — mutually exclusive at store level) + `isolateElements`. `idsStore.highlightMode`. |
| **P5** UI/UX | ✅ DONE | P5-1 `IdsPanel` docked (sibling of ValidationPanel, exclusive in bottom slot; IdsModal slimmed to loader; virtualized rows, group-by spec/element/class, keyboard) · P5-2 `.ids` drag-drop (window listener) · P5-3 analytics funnel `ids_*` · P5-4 i18n namespace `ids` EN+ES (key-parity test). |
| **P6** Import/Export | 🟢 P6-1+P6-2 DONE | JSON+CSV+HTML+BCF via `ids-report.ts` + `IdsExportMenu` (BCF reuses `exportBcfZip` from bcf.ts, snapshot via `viewer.takeSnapshot()`). HTML = standalone XSS-safe printable. **First release train (P0–P5 + P6-1/2 = "Full IDS checking") COMPLETE.** P6-3 writer + P6-4 IdsBuilder still pending (P6-4 explicitly release-2). |
| **P7** Perf / multi-model | 🟡 P7-2+P7-3 DONE | **P7-2 "check all models" DONE** (`useIdsRun.runAll` sequential, `idsStore.multiRun`, "Check all (N)" button + progress strip + per-model score chips in IdsPanel). **P7-3 run-diff strip DONE** (`ids-diff.ts` + dismissable strip, uses `previousResultByModel`). P7-1 gathered cache still TODO (architecturally tricky — gather happens in the worker, not the runner; revisit the plan's "cache in runner" assumption — likely needs a persistent worker or returning IdsElement[], both at odds with the terminate-to-free-heap design). |
| **P8** Stability hardening | ✅ DONE | 120 s watchdog (runner, reset per message), 400 MB memory guard (`window.confirm` in useIdsRun), parser fuzz (20 cases in ids.test.ts), orphan-HMR guard (IdsPanel mount → `hasActiveIdsRun()`). |
| **P9** Testing | 🟢 ONGOING | 566 tests + 4 `todo` green. **Golden suite broadened to 100 active bSI cases** (+40: classification subreference/hierarchy + same-ref AND + restrictions + empty-facet; material layer/constituent/profile sets + categories + type inheritance + optional; partof aggregate/nest/containment/group + entity/predefinedType-of-whole) — all passed first try, no latent P3 bugs. The 4 todo = **unit conversion** (IFC MILLI→SI) for bounded/table numeric matching — deliberately deferred, NOT an untasked gap. |
| **P10** Release hardening | 🟡 PARTIAL | SDK bumped **v1.5.0 → v1.6.0** (`SDK_VERSION` + docs badge; additive `reasonCodes` + full-facet coverage). readme/SDK-doc claims updated. Still TODO: landing copy `landing.json` IDS mentions, blog "Full IDS in the browser" (check `project_seo_content_research` anti-cannibalization first), PostHog `ids_*` funnel dashboard. |

**Quality gates each task:** `npm run test` + `npm run build` (incl. `tsc -b`) green.
`npm run lint` is **broken repo-wide** (eslint absent from deps) — not an IDS gap.
Build occasionally OOMs (V8 exit 134) — just retry.

---

## 0. How to use this document

- **Every file path in this document is real and was verified against the repo.** If a
  path does not exist when you start a task, STOP and re-audit — the codebase moved.
- This is a **brownfield plan**: an IDS v1 already exists and works end-to-end
  (`src/lib/ids/*`, `src/workers/ids.worker.ts`, `src/stores/idsStore.ts`,
  `src/components/IdsModal.tsx`, SDK command `ifcviewer:check-ids` in `src/App.tsx`).
  **Do not rewrite it. Extend it.** Tasks are designed as incremental, independently
  shippable diffs on top of v1.
- Tasks in §6 are ordered by dependency. Each has acceptance criteria and a rollback
  strategy. A task is *not done* until `npm run test` and `tsc -b` (part of
  `npm run build`) pass and the acceptance criteria are demonstrably met.
- **Strategic context (why this feature is an exception to the feature freeze):** the
  product's master strategy ("absorb IDS") treats IDS as one of the few non-commodity
  capabilities adjacent to the Health Score moat. The competitor Flinker ships real
  IDS 1.0; our claim "IFC, BCF & IDS" must stay honest and become *superior*, not
  paritized. Everything else in the product is under a construction freeze — IDS work
  must therefore be tight, high-leverage, and must not destabilize the validator or
  viewer.

---

# 1. Executive Context

## 1.1 Why IDS support exists

IDS (Information Delivery Specification) is buildingSMART's machine-readable standard
for "information requirements": an `.ids` XML file declares *which elements*
(applicability) must satisfy *which constraints* (requirements). BIM coordinators
receive IDS files contractually (EIR/BEP workflows) and must check IFC deliverables
against them. Today the product checks IFC quality with its **own 38-rule validator**
(Health Score); IDS is the *standards-based* complement: the client's rules instead of
ours. Supporting it fully:

1. Keeps the marketing claim "IFC, BCF & IDS" honest (it became real on 2026-06-07,
   v1 scope) and extends it to **full facet coverage**, where most free tools are
   partial.
2. Feeds the moat: IDS results can flow into the same crawlable report / BCF / badge
   loop as the Health Score.
3. Captures the "Solibri Anywhere discontinued (2026-04-13)" search vacuum — Solibri
   was the default IDS checker for many teams.

## 1.2 Product goals (in priority order)

1. **Correctness over coverage**: a wrong PASS is worse than an honest "not checked".
   v1 already reports unsupported facets per spec (`IdsSpecResult.unsupported`) —
   preserve this honesty discipline as coverage grows.
2. **Full IDS 1.0 facet coverage**: Entity, Attribute, Property, Classification,
   Material, PartOf — applicability *and* requirements, all cardinalities.
3. **Native UX**: results must feel like the existing `ValidationPanel` — grouping,
   filtering, click-to-3D, severity chips — not a bolted-on modal.
4. **100% client-side**: no server. Files never leave the browser. This is a hard
   product constraint (landing claim, privacy positioning, legal pages).
5. **Reportable**: JSON / CSV / HTML / BCF export of IDS results, reusing the
   existing export architecture.
6. **Authoring (later)**: build an IDS from the UI and export valid `.ids` XML.

## 1.3 Architectural philosophy (inherited from the codebase — do not fight it)

- **Pure core, worker shell, thin UI.** The IDS engine (`ids-engine.ts`) is a pure
  function fully unit-testable without web-ifc. Heavy IFC reading happens in a
  dedicated worker. The UI only renders store state. Same pattern as the validator
  (`validator.worker.ts` + `validationStore`).
- **Zustand stores are serialisable; non-serialisable data lives in
  `src/lib/model-registry.ts`** (ArrayBuffers, Maps). Never put an ArrayBuffer in a
  store.
- **Workers are spawned per job and terminated** (see `ids-runner.ts`,
  `runValidation`); no long-lived worker pools.
- **web-ifc in workers must be forced single-threaded** (nested pthreads fail); v1
  already patches `IfcAPI.prototype.Init` — keep this.
- **i18next with lazy namespaces**; EN bundled eagerly, everything else lazy with EN
  fallback (`src/i18n/config.ts`). No hardcoded user-facing strings.
- **Typed analytics** via wrapper functions in `src/lib/analytics.ts` (PostHog,
  cookieless `persistence: 'memory'`).
- **TypeScript strict, `tsc -b` is part of the build** — type errors block release.

## 1.4 What must NOT be broken

| Invariant | Where it lives | Why |
|---|---|---|
| Validator pipeline & Health Score | `src/workers/validator.worker.ts`, `src/lib/validator.ts`, `validationStore` | The moat. IDS must not touch its score math or worker. |
| `modelRegistry.getBuffer()` semantics (null for cache-only loads) | `src/lib/model-registry.ts:110` | IDS check needs raw IFC bytes; models restored from OPFS cache may not have them. UI must degrade gracefully (v1 already warns). |
| Buffer transfer copy in `runIds` | `src/lib/ids/ids-runner.ts:21-23` | Transferring the registry's buffer would detach it and break the validator/exporter afterwards. |
| SDK contract `ifcviewer:check-ids` → `IdsResult` | `src/App.tsx:992-1004`, `src/sdk/ifc-viewer-sdk.ts` | Published SDK v1.5.0; the result shape is a public API. Only additive changes. |
| Embed/kiosk modes | `src/lib/url-params.ts` | IDS UI must respect `ui=minimal|kiosk` (hide toolbar entries as the rest do). |
| Zustand selector stability | documented footgun at `validationStore.ts:428-443` | Mapping selectors create new arrays per call → infinite re-render. Always select stable refs + `useMemo`. |
| `tsconfig` strictness and ESLint | repo root | No `any` leaks from worker message types; use `src/lib/worker-schemas.ts` patterns (Zod) for new messages. |

## 1.5 Known technical limitations (accepted)

- `DOMParser` is unavailable in workers → IDS XML parsing stays on the **main
  thread**. Acceptable: `.ids` files are KBs–low MBs; parsing is microseconds–ms.
  (Alternative — bundling an XML parser dep into the worker — rejected: new
  dependency, no measured need. Revisit only if a real >20 MB IDS appears.)
- The IDS worker **re-parses the IFC from the raw buffer** instead of reusing the
  viewer's fragments. This is correct-by-construction (fragments don't carry full
  pset/relationship data) and isolates memory; cost is one extra parse per run.
  Mitigation for repeat runs is a gathered-elements cache (§11.4), *not* sharing
  state with the viewer.
- Multi-model scenes: v1 checks **the active model only**. Full multi-model
  aggregation is Phase 7 (§6), not before.
- IFC4X3 entities are readable through web-ifc 0.0.77, but our canonicalisation and
  hierarchy data target IFC2X3/IFC4 first; IFC4X3-specific classes are matched
  literally (documented in §3.4.2).

## 1.6 Known risks (summary — full treatment in §7)

XSD-regex vs JS-regex dialect mismatches; type-inherited properties currently
ignored (false "missing property" failures — the **single biggest correctness gap in
v1**); IFC enum `predefinedType` USERDEFINED/ObjectType indirection; spec-level
cardinality not implemented (a "required" specification with zero applicable
elements must FAIL, v1 reports `na`); memory pressure from double-parsing large
IFCs; highlight desync with multi-model scenes.

---

# 2. Current Architecture Analysis

## 2.1 Stack

React 18 + TypeScript (strict) + Vite; Zustand 5 (+devtools) for state;
framer-motion for UI motion; Tailwind utilities **with CSS-variable design tokens**
(`var(--accent)`, `var(--surface)`, `var(--border)`, `var(--ok)`, `var(--danger)`,
`var(--text*)`); i18next (12 namespaces, EN eager / others lazy); `web-ifc@0.0.77`
(WASM) for raw IFC access; `@thatopen/components|fragments@3.4` for the 3D scene;
Zod for worker message validation; Vitest (~203 tests); PostHog (cookieless).
No router — **routing is state-based** in `src/App.tsx` (`route` state), and panels
are state-toggled components, not URLs.

## 2.2 Host systems an IDS feature must integrate with

| System | Files | What IDS uses it for |
|---|---|---|
| Model lifecycle | `src/lib/loader.ts`, `src/lib/model-registry.ts`, `src/stores/sceneStore.ts` | Get `activeModelId`, raw `ifcBuffer`, `expressIDToType` map, model list. |
| Viewer | `src/lib/viewer.ts` (`ViewerAPI`, ~2.1k lines) | `selectElement(expressId, modelId)`, `focusElement`, `frameElements`, `setValidationHighlights(issues, enabled)` (per-model overlay materials, restore-on-deselect logic at lines ~768–790, 1455–1471), `isolateModel`, `takeSnapshot` (for BCF viewpoints). |
| Validation UX (the pattern to mirror) | `src/components/ValidationPanel.tsx` (2.8k lines), `validationStore` | Filters (`search/ruleIds/severities/groupBy/activeTab`), partial-issue streaming, run lifecycle status, coverage banner, waivers (`src/stores/waiverStore.ts`), run-diff (`src/lib/validation-diff.ts`). |
| Export | `src/components/ValidationExportModal.tsx`, `src/lib/bcf.ts` (+`bcf.test.ts`), `src/workers/export.worker.ts` | JSON/CSV/Certificate/BCF packaging patterns; BCF topic creation from issues. |
| Toolbar / modals | `src/components/Toolbar.tsx` (IDS button already in the validation cluster, gated by `canRun`), `IdsModal.tsx` | Entry point; modal conventions (backdrop blur, `z-[70]/[71]`, Escape-to-close, framer fade/scale). |
| i18n | `src/i18n/config.ts`, `src/i18n/registry.ts`, `src/locales/<lng>/<ns>.json` | New `ids` namespace; EN bundled + ES lazy; `missingKeyHandler` warns in dev. |
| Analytics | `src/lib/analytics.ts` | Typed `track*` wrappers; follow naming `ids_*`. |
| Errors/logging | `src/lib/errors.ts`, `src/lib/logger.ts` (`createLogger('Ids')`), `src/lib/result.ts`, `src/components/ErrorBoundary` | Graceful failure; never crash the canvas. |
| Toasts | `src/stores/toastStore.ts` (`toast(msg, 'error')`) | Transient feedback. |
| SDK / embed | `src/sdk/ifc-viewer-sdk.ts`, `src/App.tsx` postMessage switch, `docs/IFC_VIEWER_SDK.md` | `checkIds(idsXml)` is already public; additive evolution only. |

## 2.3 The existing IDS v1 — inventory (extend, don't rewrite)

| File | Role | Verified behavior |
|---|---|---|
| `src/lib/ids/ids-types.ts` | Typed model | Facets: Entity/Attribute/Property/Classification/Material/PartOf. `IdsValue = simpleValue \| restriction` (enumeration, pattern, min/max In/Exclusive, length, minLength, maxLength). Cardinality `required\|optional\|prohibited`. Engine I/O: `IdsElement` (expressId, ifcClass UPPER, predefinedType, attributes, psets), `IdsFailure`, `IdsSpecResult` (status `pass\|fail\|na`, counts, failures, `unsupported: string[]`), `IdsResult` (score 0–100). |
| `src/lib/ids/ids-value.ts` | Constraint matcher | `valueMatches(actual, constraint)`: exact + numeric-tolerant simpleValue; restriction: enumeration, anchored pattern `^(?:…)$`, bounds, length. `describeValue()` for messages. |
| `src/lib/ids/ids-parser.ts` | `.ids` XML → `IdsDocument` | DOMParser, **namespace-agnostic via `localName`**. Cardinality from `cardinality` attr or `minOccurs/maxOccurs`. Throws `IdsParseError` (malformed XML, missing `<ids>` root, zero specifications). Reads `info/title`, spec `name/description/ifcVersion`. |
| `src/lib/ids/ids-engine.ts` | Pure checker | `runIdsChecks(doc, elements)`. Applicability = every *supported* facet satisfied, **and at least one supported facet** (else not applicable). Entity matching canonicalises `STANDARDCASE`/`ELEMENTEDCASE`. Requirements honoured per cardinality; unsupported requirement kinds collected into `spec.unsupported` and **skipped, not failed**. `MAX_FAILURES_PER_SPEC = 200` (counts continue, storage capped). Score = passed/applicable element-checks across specs; 100 when nothing applicable. |
| `src/workers/ids.worker.ts` | Element gatherer + engine host | Forces single-thread WASM. `targetClasses()` narrows gathering when every spec has an entity facet with simpleValue/enumeration (else gathers all `IsIfcElement` + spatial set). `buildPsetMap()` walks `IFCRELDEFINESBYPROPERTIES` → HasProperties (NominalValue) + HasQuantities (`*Value` key). Reads root attributes Name/Description/ObjectType/Tag/GlobalId + PredefinedType. Per-element try/catch (corrupt lines skipped). Closes model, posts `result\|error`. **WASM path:** dev `${BASE_URL}node_modules/web-ifc/`, prod `BASE_URL`. |
| `src/lib/ids/ids-runner.ts` | Orchestration | `runIds(xml, buffer)`: parse on main thread, **copy** buffer, transfer to fresh worker, await single response, terminate. No progress, no cancel (gap). |
| `src/stores/idsStore.ts` | UI state | `fileName/doc/result/status('idle'\|'running'\|'done'\|'error')/error` + setters + reset. No persistence, no per-model keying (gaps). |
| `src/components/IdsModal.tsx` | UI | 560px centered modal: file input (`.ids,.xml`), Run button (disabled without doc/buffer), score summary strip, per-spec rows with expandable failures, click-to-`selectElement+focusElement`, "Not checked in v1" footnote, buffer-unavailable warning. **All strings hardcoded EN** (gap). |
| `src/lib/ids/ids.test.ts` | 9 unit tests | valueMatches all types; parser (specs/facets/cardinality/enumeration/errors); engine (pass/fail reasons, STANDARDCASE subtype, na, score 50). |
| SDK | `src/App.tsx:992-1004`, `src/sdk/ifc-viewer-sdk.ts` | `checkIds(idsXml)` → runs against active model buffer, updates idsStore, returns `IdsResult`. 120 s timeout client-side. |

### 2.3.1 v1 correctness gaps (drive the roadmap)

> **⚑ As of 2026-06-13 every gap below is CLOSED** (see the SHIPPED STATUS banner
> near the top). Kept here as the historical rationale that drove P2–P5. The one
> residual is unit conversion (bounded/table numeric matching across unit
> systems), tracked as 4 `it.todo` golden cases — a separate deferred feature.

1. **Type-inherited psets ignored.** Properties defined on `IfcWallType` via
   `IfcRelDefinesByType → HasPropertySets` are invisible to `buildPsetMap`. Real
   models put `Pset_*Common` on types constantly → **false failures**. (Fix: P2-1.)
2. **Classification / Material / PartOf facets** parsed but not evaluated. (P3.)
3. **Spec-level cardinality missing.** IDS 1.0 marks a *specification* itself
   required/optional/prohibited (applicability `minOccurs/maxOccurs`). A `required`
   spec with 0 applicable elements must **FAIL** ("the model must contain such
   elements"); a `prohibited` spec with >0 applicable elements must FAIL. v1 returns
   `na`. (P2-3.)
4. **`ifcVersion` ignored.** Specs declare target schemas (`IFC2X3 IFC4 IFC4X3_ADD2`);
   we never read the model schema. Must skip-with-reason on mismatch. (P2-4.)
5. **`dataType` ignored** on property facets. (P2-5.)
6. **Attribute facet name must be simpleValue** in v1 (restriction-named attributes
   unsupported → silently `present: false`). (P2-2.)
7. **PredefinedType USERDEFINED indirection** not handled: when
   `PredefinedType = USERDEFINED`, the effective type lives in
   `ObjectType`/`ElementType`. (P2-2.)
8. **No progress / cancellation** for long checks. (P4-1.)
9. **No per-model result keying, no run history, no diffing.** (P4/P7.)
10. **Hardcoded EN strings.** (P5-4 / §9.)
11. **XSD regex passed raw to `new RegExp`** — dialect mismatches (`\i`, `\c`,
    character class subtraction) throw or mis-match. (P2-6.)
12. **No IDS export (reports) and no authoring.** (P6.)

## 2.4 Weak areas of the host codebase relevant to IDS

- `ValidationPanel.tsx` is 2.8k lines — **do not graft IDS UI into it**; build a
  sibling (`IdsPanel`) and share leaf components only where extraction is trivial.
- `validationStore` carries deprecated aliases (`isRunning`, `spatialTree`) — when
  mirroring its shape, copy the *new* patterns (`validationStatus` lifecycle), not
  the deprecated ones.
- The viewer's highlight bookkeeping (per-model `validationHighlights` map with
  restore-on-deselect) is subtle; adding a *second* overlay channel naively will
  fight it. §3.6 defines the integration contract.

---

# 3. Proposed Architecture

## 3.1 Module map (target state)

```
src/lib/ids/
  ids-types.ts          (extended: new facets data, spec cardinality, run metadata)
  ids-value.ts          (extended: XSD-regex translation, dataType coercion)
  ids-parser.ts         (extended: spec cardinality, ifcVersion list, attr restrictions)
  ids-engine.ts         (extended: all 6 facets, spec cardinality, ifcVersion gate)
  ids-engine-facets.ts  (NEW: per-facet evaluators — keeps engine readable)
  ids-runner.ts         (extended: progress events, cancellation, element cache)
  ids-writer.ts         (NEW P6: IdsDocument → valid .ids XML, schema-conformant)
  ids-report.ts         (NEW P6: IdsResult → JSON/CSV/HTML report builders)
  ids-fixtures/         (NEW: vendored buildingSMART testcase .ids + minimal .ifc)
  ifc-hierarchy.ts      (NEW: generated IFC4 subtype→supertype map, build script)
  ids.test.ts           (grows continuously; split per area when >600 lines)
src/workers/ids.worker.ts (extended: classifications, materials, partOf graph,
                           type-inherited psets, progress posts, abort checks)
src/stores/idsStore.ts    (extended: per-model results, progress, cancel, history)
src/components/IdsPanel.tsx        (NEW P5: docked results panel, replaces results
                                    half of IdsModal; modal keeps load/run)
src/components/IdsModal.tsx        (slimmed: load + run + summary → "Open panel")
src/components/ids/               (NEW: SpecRow, FailureRow, FacetChip, IdsEmptyState…)
src/locales/en/ids.json, src/locales/es/ids.json (NEW namespace)
scripts/ids/generate-ifc-hierarchy.mjs (NEW: emits ifc-hierarchy.ts from web-ifc)
```

**Why this shape:** it is the validator's proven shape (pure lib + worker + store +
panel) applied to IDS; every layer is independently testable; the worker remains the
only place that touches web-ifc; the engine remains pure so the 203-test suite style
extends naturally.

## 3.2 Data flow (target)

```
.ids File ──(main thread)──> parseIds() ──> IdsDocument ──> idsStore.setLoaded
                                                   │
User "Run" ──> runIds(xml|doc, buffer, {signal,onProgress})
                  │ copy buffer (never transfer registry's)
                  ▼
            ids.worker.ts  ──progress──> idsStore.setProgress
                  │  open IFC → schema gate → gather elements
                  │  (attrs + own psets + TYPE psets + classifications
                  │   + materials + partOf edges)
                  ▼
            runIdsChecks(doc, elements)  (pure)
                  ▼
            IdsResult ──> idsStore.setResultForModel(modelId, result)
                  ├──> IdsPanel (grouping/filter/search)
                  ├──> ViewerAPI.setIdsHighlights(failures, modelId)  (§3.6)
                  ├──> exports (ids-report.ts / bcf.ts)
                  └──> SDK response (ifcviewer:check-ids)
```

## 3.3 Parsing architecture

- **Stays on main thread** (DOMParser; see §1.5). Parser remains
  namespace-agnostic by `localName` — this is deliberate robustness against the two
  xmlns styles in the wild (`ids:` prefixed and default-namespace) — keep it.
- **Additions** (all in `ids-parser.ts`):
  - `specification` cardinality: read `<applicability minOccurs= maxOccurs=>` →
    `spec.cardinality: 'required' | 'optional' | 'prohibited'` (default per IDS 1.0:
    required when minOccurs omitted? **No** — IDS 1.0 default is `minOccurs=0` is
    NOT assumed; the audit tool treats missing occurs as required=1. Decision:
    missing → `'required'`, matching IfcTester. Document in code comment.)
  - `ifcVersion` → parse the space-separated list into `string[]`.
  - Attribute facet `name` may be a restriction (enumeration/pattern) — type
    already allows it; parser already handles it; the *engine* gains support (P2-2).
  - `instructions` and `identifier` attributes on specs (string passthrough for
    reports).
  - Hard limits: reject files > 25 MB or > 2 000 specifications with a typed
    `IdsParseError` carrying an i18n-stable `code` (see §10.2) — prevents UI lockup
    from absurd inputs.
- **Validation stance:** we do *not* XSD-validate against `ids.xsd` in the browser
  (no XSD engine without a heavy dep). Instead: structural validation (root, specs,
  facet well-formedness) + warnings array `doc.warnings: string[]` for tolerated
  oddities (unknown facet elements, empty values). Surface warnings in UI.

## 3.4 Validation engine

### 3.4.1 Facet semantics (the contract — implement exactly this)

| Facet | Applicability semantics | Requirement semantics | Data source (worker) |
|---|---|---|---|
| entity | element's IFC class matches `name` (+ `predefinedType` if given) | same check, cardinality applies | `GetLineType`/`GetNameFromTypeCode`; PredefinedType from line (resolve USERDEFINED→ObjectType, see P2-2) |
| attribute | attribute exists & non-empty (& value matches) | required: present+match; prohibited: must be absent/non-match; optional: if present must match | root attrs from `GetLine` — extend to ALL schema attributes of the line, not just the fixed five (P2-2) |
| property | property exists in matching pset (& value matches) | + `dataType` check when declared | own psets (`IFCRELDEFINESBYPROPERTIES`) **plus type psets** (`IFCRELDEFINESBYTYPE → HasPropertySets`, occurrence overrides type) **plus quantities** (already) |
| classification | element (or its type) has a classification reference matching `system`/`value` | cardinality applies; `value` matches `ItemReference`/`Identification` **or any parent code segment** per IDS docs (match against the reference and its hierarchy `ReferencedSource` chain) | `IFCRELASSOCIATESCLASSIFICATION` → `IfcClassificationReference` (+ walk `ReferencedSource` to `IfcClassification.Name` for `system`) |
| material | element has material whose Name (any layer/profile/constituent) matches `value` | cardinality applies | `IFCRELASSOCIATESMATERIAL` → IfcMaterial / IfcMaterialLayerSet(Usage) / IfcMaterialProfileSet(Usage) / IfcMaterialConstituentSet / IfcMaterialList — collect **all** names per element |
| partOf | element participates in relation `relation` whose other side matches the nested `entity` facet | cardinality applies | edges from `IFCRELAGGREGATES`, `IFCRELNESTS`, `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELVOIDSELEMENT`+`IFCRELFILLSELEMENT`, `IFCRELASSIGNSTOGROUP` — store as `partOf: Array<{relation: string; parentClass: string; parentPredefinedType?: string\|null; parentExpressId: number}>` on `IdsElement` |

`IdsElement` grows three optional fields (additive, non-breaking):

```ts
classifications?: Array<{ system?: string|null; value?: string|null; pathValues?: string[] }>
materials?: string[]                      // every material name reachable from the element
partOf?: Array<{ relation: string; parentClass: string; parentPredefinedType?: string|null; parentExpressId: number }>
```

The engine's `evalFacet` switch gains three real branches and loses the
`supported: false` default for these kinds. `spec.unsupported` stays in the type and
the UI (forward-compat for future IDS versions), but goes empty for IDS 1.0 docs.

### 3.4.2 Entity matching & hierarchy

- Keep the exact-class semantics of IDS 1.0 (entity facet does **not** imply
  subtypes — same behavior as IfcTester/audit tool). Keep the
  STANDARDCASE/ELEMENTEDCASE canonicalisation (it is an IFC2x3→IFC4 deprecation
  alias, not a subtype leniency).
- **However**, partOf's nested entity and the gatherer's narrowing need a subtype
  map (e.g. `IFCSLAB` parent chains, `IFCBUILDINGELEMENT` abstract supertypes if a
  future IDS version allows them). Generate `src/lib/ids/ifc-hierarchy.ts` —
  `PARENT: Record<string, string>` — at build-author time via
  `scripts/ids/generate-ifc-hierarchy.mjs` reading web-ifc's schema metadata
  (`api.GetIfcEntityList` / generated enums). Static file checked in; script run
  manually when web-ifc upgrades. Tests pin a dozen known chains
  (IFCWALLSTANDARDCASE→IFCWALL→IFCBUILDINGELEMENT→…).

### 3.4.3 Value matching upgrades (`ids-value.ts`)

- **XSD→JS regex translation** before `new RegExp`: map `\i`/`\I` and `\c`/`\C`
  (XML name chars) to safe JS classes, reject character-class subtraction
  (`[a-z-[aeiou]]`) with a *warning* (treat pattern as unmatched-constraint →
  conservative FAIL with reason "unsupported pattern", never throw). Wrap RegExp
  construction in try/catch (already-anchored `^(?:…)$` stays).
- **Numeric tolerance per IDS 1.0**: floating comparisons use relative tolerance
  1e-6 (both directions) — formalize what v1 approximates, and apply to bounds too.
  **Pinned at execution (2026-06-11) by the official tolerance fixtures:** the
  exact rule is `|a − b| ≤ 1e-6 · (|a| + |b|)` (1 vs 1.000002 passes, 1 vs
  0.9999979 fails — the fixtures straddle precisely this boundary). Inclusive
  bounds widen by the tolerance, exclusive bounds narrow by it.
- **Booleans**: ~~IFC `.T./.F.` arrive as `true/false` from web-ifc; IDS simpleValues
  say `TRUE/FALSE/true/false` — normalize case-insensitively.~~ **CORRECTED at
  execution (Appendix A, testcases win):** the bSI testcase family "booleans
  must be specified as lowercase strings" expects uppercase `TRUE`/`FALSE` in an
  IDS to FAIL — booleans are matched strictly against lowercase `true`/`false`,
  no case normalization.
- **dataType coercion** (P2-5): when a property facet declares `dataType`
  (e.g. `IFCLABEL`, `IFCBOOLEAN`, `IFCLENGTHMEASURE`), check the *measured* IFC type
  of the property value. Worker must therefore record the IFC type name of each
  `NominalValue` (web-ifc exposes the wrapped object's `type`/constructor name —
  capture `String(p.NominalValue?.constructor?.name ?? '')` fallback to label-based
  heuristic). Mismatch ⇒ failure reason "wrong datatype (expected X, found Y)".

### 3.4.4 Spec-level results

`IdsSpecResult.status` gains no new variants, but the rules change:

- `cardinality: 'required'` + `applicableCount === 0` → `status: 'fail'` with a
  synthetic failure row (expressId `-1`, reason key `specRequiredButAbsent`).
- `cardinality: 'prohibited'` + `applicableCount > 0` → `'fail'`, failures = the
  applicable elements (reason `specProhibitedButPresent`).
- `cardinality: 'optional'` + 0 applicable → `'na'` (unchanged).
- `ifcVersion` mismatch with the model schema → new field
  `skippedReason?: 'ifcVersion'` and `status: 'na'`; UI shows "skipped — targets
  IFC4X3, model is IFC2X3". Worker obtains schema via `api.GetModelSchema(modelID)`
  and passes it into the engine call (engine stays pure: schema is a parameter).
  **CORRECTED at execution (2026-06-11, per Appendix A "testcases win"):** the
  official testcases declare `ifcVersion="IFC2X3"` on IFC4 fixtures and still
  expect evaluation (e.g. `ids/fail-required_specifications_need_at_least_one_applicable_entity_2_2`),
  and ifctester only filters behind an opt-in `should_filter_version` flag. So
  the gate is **opt-in**: `IdsCheckOptions.filterByIfcVersion` (default
  **false** — evaluate regardless, matching bSI). The skip machinery above
  applies only when the flag is on; the UI may instead show a non-blocking
  "targets X, model is Y" warning derived from `spec.ifcVersions` +
  `result.modelSchema`.

**Score:** unchanged formula (passed element-checks / applicable element-checks),
but required-but-absent specs contribute one failed synthetic check so the score
can't be 100 while a required spec failed. Document in code; SDK consumers see only
additive fields.

## 3.5 Worker & runner protocol (progress + cancellation)

Replace the single-response protocol with a small, Zod-validated message set
(pattern: `src/lib/worker-schemas.ts`):

```ts
// main → worker
{ type: 'check-ids', id, buffer, doc, options: { modelSchemaHint?: string } }
{ type: 'cancel',   id }
// worker → main
{ type: 'progress', id, phase: 'open'|'gather'|'check', pct: number }   // throttled ≤ 10/s
{ type: 'result',   id, result }
{ type: 'error',    id, code: IdsErrorCode, message }
```

`runIds(xml | IdsDocument, buffer, { signal?, onProgress? })`:
- Accepts a pre-parsed `IdsDocument` (avoid re-parsing on re-run).
- `AbortSignal` → posts `cancel`; worker checks a flag between gather batches
  (gathering iterates `GetAllLines` in chunks of 5 000 ids; check loop in chunks of
  1 000 elements) and exits with `error code:'cancelled'`. Runner *also* hard
  `worker.terminate()`s after 2 s grace — cancellation must never hang.
- Backwards compatibility: keep the old signature working (options optional);
  SDK path passes no signal (its own 120 s timeout remains the backstop).

**Why per-job workers stay:** memory isolation (web-ifc leaks across models are a
known class of WASM bugs), zero pool management, and terminate() is the ultimate
cancel. Cost (~worker spawn + WASM init ~100–300 ms) is acceptable for an
on-demand check. Revisit only if a "re-run on model change" auto mode ships.

## 3.6 Viewer integration (highlighting contract)

Add **one** ViewerAPI method, mirroring `setValidationHighlights`:

```ts
setIdsHighlights(failures: Array<{ expressId: number; modelId: string }>, enabled: boolean): void
```

Implementation notes (in `src/lib/viewer.ts`, next to the validation-highlight
block at ~lines 768–790 / 1455–1471):
- Reuse the per-model bookkeeping map pattern (`modelId → Map<expressId, material>`),
  a distinct `IDS_FAIL_MAT` (use the existing danger color token at ~0.85 opacity to
  stay visually distinct from selection cyan and validation tri-color).
- **Mutual exclusion rule:** IDS highlight mode and validation highlight mode are
  exclusive. Turning one on turns the other off (both store-level — `validationMode`
  vs new `idsStore.highlightMode` — and viewer-level). Rationale: two overlapping
  overlay systems on the same meshes produce restore-order bugs (§7.6); exclusivity
  is cheap and predictable for users.
- Selection interplay: copy the existing "restore validation overlay after
  deselect" logic for the IDS map (the helper at viewer.ts:778 is the template).

Click-through stays `selectElement` + `focusElement` (already in v1).

## 3.7 Event system & error handling backbone

- No new event bus: store subscriptions are the app's event system (existing
  `src/lib/event-bus.ts` is for viewer-internal events only — do not widen it).
- All IDS errors are typed: `IdsParseError` (exists) gains `code`; new
  `IdsCheckError` with `code: 'cancelled'|'worker-init'|'model-open'|'oom'|'unknown'`.
  Codes map 1:1 to i18n keys (§9/§10). Log via `createLogger('Ids')`.

## 3.8 Import/export pipeline

- **Result exports (P6-1/2):** `src/lib/ids/ids-report.ts` builds JSON (the raw
  `IdsResult` + metadata envelope: file names, timestamps, app version, model
  schema), CSV (one row per failure: spec, element name, class, expressId, GlobalId
  when gathered, reasons joined), and self-contained HTML (inline CSS, light
  branding — reuse the visual language of the Worker report in `cf-worker`).
  BCF export maps each failed spec → BCF topic, each failing element → comment +
  viewpoint component (reuse `src/lib/bcf.ts` creation utilities; v1 tests exist in
  `bcf.test.ts` to imitate). UI lives in a small `IdsExportMenu` inside the panel —
  do **not** overload `ValidationExportModal`.
- **IDS authoring/export (P6-3+):** `ids-writer.ts` serializes `IdsDocument` →
  conformant IDS 1.0 XML (correct namespace
  `http://standards.buildingsmart.org/IDS`, `xs:restriction` bases, occurs
  attributes). Round-trip property: `parseIds(writeIds(doc))` deep-equals `doc`
  (normalized) — this is the core test. Authoring UI is a later, separate task
  (IdsBuilder; templates seeded from the 38-rule validator's common checks).

## 3.9 Translation structure

New namespace **`ids`** (per the i18n decision in §9): `src/locales/en/ids.json`
(eagerly bundled — add to `EN_RESOURCES` in `src/i18n/config.ts`) and
`src/locales/es/ids.json` (lazy). Engine emits **reason codes + params**, not
prose: `IdsFailure.reasons` becomes `Array<{ code: string; params?: Record<string,string|number> }>`
(breaking change to the *internal* type; SDK keeps a `reasonsText: string[]`
compatibility projection rendered with the EN bundle at result time — see P5-4 for
the migration recipe). UI renders codes through `t('ids:reasons.'+code, params)`.

---

# 4. User Flows

## 4.1 IDS Import Flow

Entry points: (a) Toolbar "IDS" button (Shield icon, validation cluster, gated by
`canRun` — exists), (b) drag-and-drop of a `.ids` file onto the viewer (P5-2; the
upload surface in `App.tsx` currently filters IFC — extend the drop handler to
route `.ids` to the IDS flow), (c) SDK `checkIds`.

States and UI behavior (store: `idsStore`):

| State | Trigger | UI |
|---|---|---|
| `idle` (no doc) | open modal/panel | Empty state: dashed drop target, one-line explainer, "Choose .ids file", link "What is IDS?" (docs/blog) |
| doc loaded (`idle` + `doc`) | `parseIds` ok | File chip with name + spec count + per-facet coverage chips; warnings (if `doc.warnings`) as a dismissible amber list; Run enabled iff buffer available |
| parse failed | `IdsParseError` | Inline error (red, specific: "Malformed XML", "Not an IDS document", "No specifications", "File too large (25 MB max)") + toast; file chip cleared; previous doc/result **retained** (never destroy good state on a failed re-import) |
| buffer unavailable | model loaded from OPFS cache without IFC backup | Amber inline notice (exists in v1): "Reload the .ifc to run IDS." Run disabled |
| `running` | Run clicked | Progress bar with phase label (Opening model → Reading elements → Checking specs), percent, Cancel button. Run/Choose disabled. Panel remains interactive elsewhere |
| `done` | result | Summary strip (score, pass/fail/na chips) + spec list (§4.3) |
| `error` | worker/check error | Inline error with code-specific message + "Retry" (re-uses parsed doc; no re-upload). Cancelled shows neutral "Check cancelled" (not red) |

Error cases mapped (all must have i18n keys and a test):
corrupted XML → parse error; not-IDS XML (e.g. a BCF or random XML) → "missing
`<ids>` root"; zero specs; oversized file; unsupported pattern constraints →
doc-level warnings + per-failure conservative reasons; OOM in worker (web-ifc
abort) → `code:'oom'` message "Model too large for an in-browser IDS check on this
device" + suggestion to close other models; cancellation → neutral state, doc
retained.

## 4.2 IDS Validation (run) Flow

1. User clicks **Run check** (or drops `.ids` with a model already loaded — then
   auto-run is OFF by default; show the loaded state and let the user click Run.
   Opinionated: auto-running on drop surprises users with long checks).
2. `idsStore.startRun(modelId)` → status `running`, progress 0, `abortController`
   stored in a module-level ref (NOT in the store — non-serialisable; keep it in
   `ids-runner` keyed by run id).
3. Progress events throttle to UI at ≤10/s; phases weight: open 0–20 %,
   gather 20–75 %, check 75–100 %.
4. **Cancel** → button swaps to "Cancelling…" (disabled), worker aborts between
   batches, store → `idle`-with-doc (result untouched if a previous one existed).
5. Completion → `setResultForModel(modelId, result)`, toast only on failure-free
   runs? No — **no toast on completion** (the panel is already open and shows the
   result; toasts are for out-of-view feedback). Analytics `ids_check_completed`.
6. Re-run: same parsed doc, fresh buffer copy. Switching active model invalidates
   nothing — results are keyed per model; the panel shows the active model's result
   or its empty state.
7. Model removed (`modelRegistry.unregister` path / `clearValidationForModel`
   analog): `idsStore.clearForModel(modelId)` must be wired into the same removal
   code path in `App.tsx` that clears validation state. A run in flight for a
   removed model is aborted (runner tracks `modelId` per run id).

Retry flow: `error` state keeps `doc` + `fileName`; Retry = run again; if the error
was `worker-init` (WASM path), retry once automatically before surfacing (transient
dev-server hiccups).

## 4.3 Validation Results Flow

Layout (inside **IdsPanel**, §8.2):

- **Summary header**: score dial (reuse the score-color ramp
  `SCORE_COLOR` from `IdsModal.tsx:22` — extract to `src/components/ids/score.ts`),
  `passedSpecs/failedSpecs/naSpecs` chips (clickable = status filter), model name,
  IDS title + file name, run timestamp, Re-run + Cancel + Export + Highlight toggle.
- **Spec list** (virtualized with `@tanstack/react-virtual` if > 50 specs — same
  dependency the ValidationPanel already uses): each `SpecRow` = status icon,
  name, `passed/applicable` fraction, facet-kind chips of its requirements,
  description on expand, `instructions` if present, skipped reason when
  `ifcVersion`-gated.
- **Failure list per spec** (expand): rows show element Name, class, expressId,
  reasons (localized from codes). Row click → `selectElement` + `focusElement`
  (exists). Row hover → nothing 3D (hover-highlighting from a list across the
  scene is a perf trap — §7.6).
- **Filters**: text search (matches spec name, element name, class), status tabs
  (All / Failed / Passed / N/A), facet-kind multi-select. Store these in
  `idsStore.filters` mirroring `ActiveFilters` of `validationStore` (search,
  facetKinds, statusTab) — same persistence-free semantics.
- **Group-by**: `spec` (default) | `element` (one row per failing element with all
  its failed specs — coordinators fix element-by-element) | `class`. Grouping is a
  pure selector over `IdsResult` computed in `useMemo` (never in the store).
- **3D sync**: "Highlight failures" toggle (per §3.6, exclusive with validation
  mode; when enabled, the toggle in ValidationPanel shows as off and vice versa).
  "Isolate failures" button → `applyFilters` with the failing expressIds isolated
  (reuse the isolation path used by ValidationPanel; if extraction is non-trivial,
  call `viewerApiRef` directly with the documented signature at viewer.ts:196).
- **Breadcrumb/selection persistence**: selecting a failure keeps the panel open;
  the selected row gets the standard selected-row treatment; on panel close the 3D
  selection is left as is (consistent with ValidationPanel behavior).
- Truncation notice when failures hit the 200/spec cap: "Showing first 200 of N
  failing elements — export CSV for the full list."

## 4.4 IDS Export Flow

Two distinct exports — never conflate them in UI copy:

1. **Export IDS *results*** (report): menu in panel header — JSON / CSV / HTML /
   BCF. Each is a pure function of `IdsResult` + metadata (§3.8). BCF includes
   snapshot viewpoints via `viewerApi.takeSnapshot()` per failing spec (cap 10
   snapshots; beyond that, topics without viewpoints — document in tooltip).
2. **Export IDS *document*** (authoring, later phase): from IdsBuilder, serialize
   current `IdsDocument` via `ids-writer.ts` → download `.ids`. Templates:
   "Naming convention", "Required Psets per class", "Classification required",
   seeded from validator-rule equivalents. Builder edits operate on the same
   `IdsDocument` types — no parallel authoring model.

---

# 5. State Management Design

## 5.1 `idsStore` target shape (Zustand, devtools, NO persist middleware)

```ts
export type IdsStatus = 'idle' | 'running' | 'cancelling' | 'done' | 'error'

interface IdsFilters { search: string; statusTab: 'all'|'fail'|'pass'|'na'; facetKinds: string[]; groupBy: 'spec'|'element'|'class' }

interface IdsStore {
  // document (model-independent)
  fileName: string | null
  doc: IdsDocument | null            // parsed, serialisable
  docWarnings: string[]
  // runs (model-keyed)
  resultsByModel: Record<string, IdsResult>
  previousResultByModel: Record<string, IdsResult>   // for run-diff, same pattern as validationStore.cacheResultForModel
  runMetaByModel: Record<string, { at: number; idsFileName: string; durationMs: number; modelSchema: string }>
  // active run
  status: IdsStatus
  runningModelId: string | null
  progress: number                   // 0–100
  progressPhase: 'open'|'gather'|'check'|null
  error: { code: string; message: string } | null
  // UI
  filters: IdsFilters
  highlightMode: boolean
  panelOpen: boolean

  setLoaded(fileName: string, doc: IdsDocument, warnings: string[]): void
  startRun(modelId: string): void
  setProgress(pct: number, phase: ...): void
  setResultForModel(modelId: string, result: IdsResult, meta: ...): void   // snapshots prior into previousResultByModel
  setError(code: string, message: string): void
  requestCancel(): void              // status → 'cancelling' (runner observes via subscribe or explicit call)
  finishCancel(): void               // → 'idle' (doc kept)
  setFilters(p: Partial<IdsFilters>): void
  setHighlightMode(on: boolean): void   // side effect at CALLER: viewer.setIdsHighlights + turn validationMode off
  setPanelOpen(open: boolean): void
  clearForModel(modelId: string): void
  reset(): void                      // navigate-to-landing
}
```

Rules (enforced in review):
- **AbortController and Worker handles never enter the store** — they live in a
  module map inside `ids-runner.ts` keyed by run id. Store holds only serialisable
  state (registry doctrine, `model-registry.ts` header comment).
- **Cross-store side effects happen in components/runner, not inside `set`**
  (e.g. exclusivity with `validationStore.validationMode` is performed by the
  toggle handler, with both stores read via `getState()`).
- Selectors returning derived arrays must follow the documented safe pattern
  (`validationStore.ts:428-443`): select stable refs, derive with `useMemo`.

## 5.2 Transition table (single source of truth)

| From | Event | To | Side effects |
|---|---|---|---|
| any | `setLoaded` (parse ok) | keeps status; doc replaced | clear docWarnings→new; results KEPT (results reference runMeta.idsFileName so stale-doc results are labeled "run with previous IDS" in UI — see §5.4) |
| idle/done/error | `startRun(m)` | running | progress 0; error null; spawn worker; analytics `ids_check_started` |
| running | progress msg | running | progress/phase update (throttled) |
| running | result msg | done | setResultForModel; highlights refresh if highlightMode |
| running | error msg | error | toast; log |
| running | `requestCancel` | cancelling | runner aborts worker (2 s grace then terminate) |
| cancelling | worker confirms / grace timeout | idle (doc kept) | `finishCancel`; no toast (button feedback is enough) |
| running/cancelling | model removed mid-run (runningModelId) | idle | abort + clearForModel |
| any | `reset` | idle, everything null | called from the same navigate-to-landing path that calls `validationStore.reset()` and `modelRegistry.clear()` (find call sites in `App.tsx`) |

## 5.3 Race conditions & how the design kills them

1. **Stale worker response after cancel/re-run**: every run has a `crypto.randomUUID()`
   id (v1 already does this); the runner drops messages whose id ≠ current run id
   AND the store ignores `setResultForModel` when `runningModelId` is null or run id
   mismatches (pass run id through). Test: start, cancel, immediately re-run,
   resolve old worker late → result must come from run 2 only.
2. **Model switch during run**: results key on the modelId captured at `startRun`,
   not the active model at completion. UI shows a subtle "checked: <model>" label.
3. **Double-click Run**: `startRun` is a no-op when status is `running|cancelling`.
4. **Buffer mutation**: impossible — worker gets a copy (keep `ids-runner.ts:21-23`).
5. **Highlight restore vs selection**: covered by viewer-side bookkeeping (§3.6);
   the store only holds the boolean.

## 5.4 Stale-data prevention

- `runMetaByModel[m].idsFileName` vs current `fileName`: when they differ, the
  panel banners "These results were produced with *old.ids* — re-run with the
  current file." Never silently mix.
- Re-importing an IDS does **not** wipe results (users compare); the banner handles
  honesty.
- `previousResultByModel` powers a small run-diff strip ("+3 fixed, −1 new failing
  spec") in a later task (P7-3), copying `validation-diff.ts` mechanics.

---

# 6. Task Breakdown

Conventions: every task ends with `npm run test` + `npm run build` green. New
strings go through the `ids` namespace from P5-4 onward; earlier tasks may add EN
literals **only inside files that P5-4 lists for migration**. Worker protocol
changes must update Zod schemas alongside.

## Phase 0 — Research consolidation — ✅ DONE (fixtures vendored, golden suite live)

### P0-1 Vendor buildingSMART IDS test cases as fixtures
- **Objective:** ground truth for the engine. The official repo
  (`buildingSMART/IDS`, `Documentation/ImplementersDocumentation/TestCases/`) ships
  paired `.ids` + `.ifc` minimal files per facet with expected pass/fail.
- **Steps:** create `src/lib/ids/ids-fixtures/` with a curated subset (~40 cases:
  entity, attribute, property, classification, material, partOf, restrictions,
  cardinalities). Keep files tiny (<50 KB each). Add `FIXTURES.md` listing source
  commit + license (CC BY-ND? verify — if redistribution is restricted, write a
  fetch script `scripts/ids/fetch-testcases.mjs` that downloads into a git-ignored
  dir for local/CI use instead of vendoring; decide based on the LICENSE file in
  that repo at execution time).
- **Files:** new fixtures dir; `scripts/ids/fetch-testcases.mjs` (if needed).
- **Risks:** license; fixture `.ifc` files need web-ifc in Node for integration
  tests — vitest already runs web-ifc in tests elsewhere? Verify; if not, run
  engine-level tests by hand-building `IdsElement[]` mirrors of the fixture IFCs
  and reserve full worker tests for the browser e2e (vitest browser mode is in
  devDeps).
- **Acceptance:** a test file `ids-testcases.test.ts` exists, runs ≥20 cases,
  currently-unsupported cases marked `it.todo` with the task id that will enable
  them.
- **Rollback:** delete fixtures dir; no production code touched.

## Phase 1 — Foundations (refactor v1 without behavior change) — ✅ DONE

### P1-1 Extract per-facet evaluators + reason codes
- **Objective:** split `evalFacet` into `ids-engine-facets.ts`; change
  `IdsFailure.reasons` to `{code, params}[]` with an EN renderer
  `renderReasons(reasons): string[]` used by SDK/back-compat paths.
- **Files:** `ids-types.ts`, `ids-engine.ts`, new `ids-engine-facets.ts`,
  `ids.test.ts`, `IdsModal.tsx` (render via renderer), `App.tsx` SDK case (project
  `reasonsText` alongside `reasons` in the response for SDK back-compat — keep the
  old string array under the old field name in the postMessage payload only).
- **Risks:** SDK consumers reading `failures[].reasons` as strings. Mitigation: in
  the SDK response (`App.tsx` case `'ifcviewer:check-ids'`) map reasons→strings
  before responding (freeze old wire shape), while the internal type evolves. Note
  this in `docs/IFC_VIEWER_SDK.md`.
- **Common mistake:** translating codes inside the engine (engine must stay
  i18n-free/pure).
- **Acceptance:** all 9 existing tests pass (adapted), wire shape of SDK response
  byte-identical for the e2e sample, new unit test asserts codes.
- **Rollback:** revert commit; isolated.

### P1-2 Worker protocol v2 (progress + cancel + Zod)
- **Objective:** implement §3.5. Chunked gather/check loops with abort checks;
  progress posts; Zod schemas for both directions in `worker-schemas.ts` (or a new
  `ids-worker-schemas.ts` if the existing file is validator-specific — inspect and
  match repo convention).
- **Files:** `ids.worker.ts`, `ids-runner.ts`, `idsStore.ts` (progress fields),
  `IdsModal.tsx` (progress bar + cancel button).
- **Expected bugs:** progress flooding (throttle in worker, post at most every
  100 ms); cancel during WASM `Init()` (cannot interrupt — runner's 2 s grace +
  terminate covers it); terminated worker rejecting the promise twice (guard the
  `done` latch — v1's `done()` wrapper pattern is the template).
- **How to debug:** `createLogger('Ids')` debug lines for each message; devtools
  store action names `ids/progress` etc.
- **Acceptance:** manual: 50 MB+ demo IFC shows moving progress and a working
  Cancel that returns the UI to the loaded state in <2.5 s. Unit: runner resolves/
  rejects/cancels correctly against a mocked Worker.
- **Rollback:** protocol is internal; revert restores single-message v1.

### P1-3 Per-model results in `idsStore`
- **Objective:** §5.1 shape (resultsByModel, runMeta, previousResultByModel,
  clearForModel wired into the model-removal path next to
  `clearValidationForModel` call sites in `App.tsx`; reset wired into
  navigate-to-landing).
- **Files:** `idsStore.ts`, `App.tsx`, `IdsModal.tsx`.
- **Risks:** missing a removal call site → stale results for re-used modelIds.
  Grep all `clearValidationForModel` and `modelRegistry.unregister` call sites and
  mirror.
- **Acceptance:** load 2 models, run IDS on each, switch active → panel shows the
  right result; remove a model → its IDS state gone (assert via devtools).
- **Rollback:** store-internal; revert.

## Phase 2 — Engine correctness (closes the false-failure gaps) — ✅ DONE (+P2-7 multi-value)

### P2-1 Type-inherited property sets  ⚠ highest correctness value
- **Objective:** merge psets from `IFCRELDEFINESBYTYPE → RelatingType.HasPropertySets`
  into each related occurrence's pset map; occurrence psets override type psets at
  property granularity.
- **Files:** `ids.worker.ts` (`buildPsetMap` → also build `typePsetMap` keyed by
  type expressId, then a `RelDefinesByType` pass assigns merged views), tests via a
  fixture IFC (testcases include exactly this).
- **Common mistakes:** merging at pset granularity (must be per-property);
  forgetting `IfcPropertySetDefinitionSet` is not in 2x3; double counting when both
  type and occurrence define the same pset name.
- **Acceptance:** fixture "property on type satisfies requirement" passes; e2e
  Sample House run unchanged where it should be.
- **Rollback:** isolated function; revert.

### P2-2 Attribute & predefinedType fidelity
- **Objective:** (a) gather **all** attributes of a line generically: iterate
  `GetLine` object's own enumerable keys, unwrap `{value}` scalars, skip
  refs/arrays (objects without scalar `value`); (b) attribute facet `name` as
  restriction: test every gathered attribute name against the constraint, require
  ≥1 present (+value match) per cardinality; (c) PredefinedType USERDEFINED →
  effective value from `ObjectType` (occurrence) — implement in the worker when
  building `IdsElement.predefinedType`.
- **Files:** `ids.worker.ts`, `ids-engine-facets.ts`, tests.
- **Expected bugs:** numeric attrs (RefLatitude arrays) leaking — the scalar-unwrap
  guard handles; perf from generic iteration is negligible vs GetLine cost.
- **Acceptance:** testcase fixtures for attribute restriction-name and
  USERDEFINED predefinedType pass.

### P2-3 Specification-level cardinality
- **Objective:** §3.4.4 required/prohibited spec semantics + synthetic failures +
  score contribution.
- **Files:** `ids-parser.ts` (read occurs on `<applicability>`), `ids-types.ts`
  (`spec.cardinality`), `ids-engine.ts`, UI copy in panel ("Required — no
  applicable elements found in the model").
- **Risk:** breaking the e2e score-100 sample (it has applicable elements —
  unaffected). Re-baseline tests that assumed `na`.
- **Acceptance:** required+0-applicable → fail; prohibited+present → fail with
  element list; optional unchanged. Audit-tool fixtures agree.

### P2-4 `ifcVersion` gating — semantics corrected at execution (see §3.4.4)
- **Objective:** worker reads `api.GetModelSchema(modelID)` (verified present in
  web-ifc 0.0.77), normalizes via `ifcSchemaFamily()` (`IFC4X3_ADD2`→`IFC4X3`,
  tested before the overlapping `IFC4` prefix), passes to engine; specs whose
  `ifcVersions[]` exclude the schema → `status:'na'`, `skippedReason:'ifcVersion'`
  **only when `IdsCheckOptions.filterByIfcVersion` is opted in** (default off —
  the bSI testcases expect evaluation despite mismatches; Appendix A precedence).
- **Acceptance:** unit tests cover both modes + family matching; the golden suite
  passes the real fixture schema with the default (no filtering) and stays green;
  `result.modelSchema` populated for UI/meta/reports; no `ifcVersion` attr →
  applies to all schemas.

### P2-5 `dataType` checking — per §3.4.3, worker records value IFC types.
### P2-6 XSD-regex translation + tolerant numerics + boolean normalization — per §3.4.3.
- **Acceptance for both:** dedicated value-matching unit tests incl. `\c`-class
  patterns from the official testcases; invalid pattern → warning + conservative
  fail with `reason.code:'unsupportedPattern'`, never a thrown exception.

## Phase 3 — Full facet coverage — ✅ DONE

### P3-1 Worker: classification gathering
- `IFCRELASSOCIATESCLASSIFICATION`: RelatedObjects ←→
  RelatingClassification (`IfcClassificationReference`: `Identification`
  (IFC4)/`ItemReference`(2x3), `Name`); walk `ReferencedSource` chain collecting
  parent codes (`pathValues`) until `IfcClassification` (its `Name` = system).
  Classifications applied to the **type** propagate to occurrences (same
  RelDefinesByType pass as P2-1 — reuse the occurrence←type index).
- **Files:** `ids.worker.ts` (+gather), `ids-types.ts` (`classifications` field).
- **Acceptance:** testcase fixtures for classification facet (system match, value
  match, hierarchy match) pass.

### P3-2 Worker: material gathering
- `IFCRELASSOCIATESMATERIAL` → resolve every shape: `IfcMaterial.Name`;
  LayerSet(.Usage→ForLayerSet)→MaterialLayers[].Material.Name;
  ProfileSet(.Usage)→MaterialProfiles[].Material.Name; ConstituentSet→
  Constituents[].Material.Name (+Constituent.Name); MaterialList→Materials[].Name.
  Type-level associations propagate to occurrences.
- **Common mistake:** missing the `.Usage` indirection (walls/slabs almost always
  use LayerSetUsage) — testcase covers it.
- **Acceptance:** material facet fixtures pass; wall with layered material matches
  by any layer's material name.

### P3-3 Worker: partOf graph + engine evaluation
- Build edges per §3.4.1 table; engine `partOf` branch: element passes when ≥1 edge
  with `relation` (when specified; IDS uses e.g. `IFCRELAGGREGATES`) whose parent
  matches the nested entity facet (use `ifc-hierarchy.ts` only if the fixture
  semantics require walking — verify against audit tool behavior: nested entity is
  exact-class like all entity facets).
- **Risk:** edge explosion on big models — store edges per element capped at 32
  (log if exceeded; realistically ≤5).
- **Acceptance:** partOf fixtures (aggregates, nests, containedIn, voids/fills,
  group) pass.

### P3-4 Engine: enable the three facets in applicability & requirements
- Remove the `supported:false` default branch for these kinds; `applies()` keeps
  the "≥1 supported facet" rule (now effectively always true for IDS 1.0 docs);
  `spec.unsupported` retained for forward compat but normally empty.
- **Acceptance:** the full P0-1 testcase suite green except explicitly-deferred
  `it.todo`s; `IdsModal` "Not checked in v1" footnote removed/conditional.

### P3-5 Generate `ifc-hierarchy.ts`
- `scripts/ids/generate-ifc-hierarchy.mjs` (node, imports web-ifc, walks its
  schema/ inheritance metadata; if web-ifc exposes none statically, derive from the
  `@thatopen` or vendored EXPRESS schema listing — decide at execution; output a
  flat `PARENT` record + `isSubtypeOf(a,b)` helper with memoized chain walk).
- **Acceptance:** pinned chain tests; tree-shakable (pure data module).

## Phase 4 — Viewer integration — ✅ DONE

### P4-1 `setIdsHighlights` in ViewerAPI — per §3.6.
- **Files:** `src/lib/viewer.ts` (interface + impl next to validation-highlight
  block), `idsStore.highlightMode`, toggle in panel, exclusivity handler (turn off
  `validationStore.validationMode` via its toggle + viewer call).
- **Expected bugs:** restore-order with selection (copy the existing
  `restoreHighlight` helper pattern at viewer.ts:778); highlights on a removed
  model (clear inside `removeModel` like validation highlights — find where the
  viewer clears `validationHighlights` on remove and mirror).
- **Acceptance:** toggle highlights failures in red across the active model;
  selecting/deselecting an element restores its IDS overlay; enabling validation
  mode turns IDS mode off (and vice versa) with both UIs reflecting it.

### P4-2 Isolate-failures action — reuse `applyFilters` isolation (viewer.ts:196).
- **Acceptance:** isolation shows only failing elements; "Show all" restores; works
  with 2 models loaded (other model unaffected per the documented semantics).

## Phase 5 — UI/UX — ✅ DONE

### P5-1 `IdsPanel` (docked results panel)
- **Objective:** §4.3/§8.2. New `src/components/IdsPanel.tsx` + leaf components in
  `src/components/ids/`. `IdsModal` slims to loader/runner; "View results" opens
  the panel. Panel mounts in `App.tsx` alongside ValidationPanel/BcfPanel (inspect
  how BcfPanel is conditionally rendered and copy the wiring, including mobile
  behavior and `ui=minimal|kiosk` gating from `url-params.ts`).
- **Dependencies:** P1-3 (per-model results), P4-1 (highlight toggle).
- **Risks:** layout collision with ValidationPanel when both open — decide: panels
  are exclusive (opening one closes the other), consistent with how the app already
  treats right-side panels (verify in `uiStore`/App; follow the existing rule).
- **Acceptance:** keyboard: Esc closes, ↑/↓ moves failure focus, Enter selects in
  3D; virtualization beyond 50 specs / 200 visible failures; empty/loading/error
  states per §8.
- **Rollback:** feature-flag by simply not rendering the panel; modal retains full
  v1 functionality until panel ships.

### P5-2 `.ids` drag-and-drop + file-routing — extend the drop handler in `App.tsx`.
### P5-3 Analytics — `trackIdsFileLoaded{spec_count,facets}`, `trackIdsCheckStarted`,
  `trackIdsCheckCompleted{score,specs,failed,duration_ms,model_mb}`,
  `trackIdsCheckCancelled`, `trackIdsExport{format}` in `src/lib/analytics.ts`,
  following the existing wrapper style (no raw `track` calls from components).
### P5-4 i18n migration — create `ids` namespace (EN+ES), register EN eagerly in
  `config.ts` `EN_RESOURCES`, add `ids` to `ns`; migrate every string in
  IdsModal/IdsPanel/toasts; reason codes rendered via `t('ids:reasons.*')` with
  params; pluralization via i18next `_one/_other` (es uses the same suffixes).
  Spanish translations written to the same professional register as
  `src/locales/es/validation.json` (read it first for terminology: "conjunto de
  propiedades", "clasificación", "entidad").
- **Acceptance:** dev console shows zero `[i18n] Missing key ids:*` warnings while
  exercising all states in EN and ES; language switch live-updates the panel.

## Phase 6 — Import/Export — 🟢 P6-1+P6-2 DONE (JSON+CSV+HTML+BCF); P6-3 writer / P6-4 builder pending

### P6-1 Result reports: JSON + CSV (`ids-report.ts`, export menu) — §3.8.
### P6-2 Result reports: HTML + BCF (snapshots via `takeSnapshot`, topics via
  `bcf.ts`; respect its tested zip-building API — read `bcf.test.ts` first).
- **Acceptance:** BCF opens in BIMcollab ZOOM/Solibri (manual check at least once);
  CSV imports cleanly into Excel (UTF-8 BOM — copy whatever `ValidationExportModal`
  does for CSV encoding).
### P6-3 `ids-writer.ts` + round-trip tests — §3.8. Namespace
  `http://standards.buildingsmart.org/IDS`, `xsi:schemaLocation`, correct
  `xs:restriction@base` defaults (`xs:string`).
- **Acceptance:** written file passes `parseIds` round-trip deep-equal AND is
  accepted by the buildingSMART online Audit tool (manual, once).
### P6-4 IdsBuilder UI (templates, spec editor) — separate mini-spec when reached;
  out of scope for the first release train (mark explicitly: ship P0–P5 + P6-1/2
  as "Full IDS checking"; authoring is release 2).

## Phase 7 — Performance & multi-model — 🟡 P7-2+P7-3 DONE; P7-1 cache TODO (tricky)

### P7-1 Gathered-elements cache: key `(modelId, gatherSignatureHash)` where the
  signature is the sorted target-class set + facet kinds needed; cache inside the
  runner module (plain Map, cleared on `clearForModel`/`reset`); skips re-gather on
  re-run with same needs. **Never cache across buffer reloads** (key includes
  `loadedAt` from registry).
### P7-2 Multi-model run: "Check all loaded models" button → sequential runs (not
  parallel — peak memory), aggregate header strip per model.
### P7-3 Run-diff strip (vs `previousResultByModel`), mechanics copied from
  `validation-diff.ts` + `RunDiffBar`.

## Phase 8 — Stability hardening
- Kill-switch behaviors: worker watchdog (no message for 120 s → error `'timeout'`,
  mirroring the validator's 60 s watchdog convention but doubled for big models);
  memory guard: if `buffer.byteLength > 400 MB`, confirm dialog before run; OPFS
  cache-only models (null buffer) covered everywhere the run can start (modal,
  drop, SDK — SDK already throws a clear message).
- Fuzz the parser: 20 malformed-XML cases (truncated, wrong root, huge attr, DTD —
  DOMParser ignores DTD; assert no XXE surface since we never fetch).

## Phase 9 — Testing (see §12 for the matrix; tasks = implementing it)

## Phase 10 — Release hardening
- Update `docs/IFC_VIEWER_SDK.md` (facet coverage table, new result fields),
  `readme.md` claims, landing copy key `landing.json` IDS mentions (EN+ES only per
  §9 — other locales fall back to EN), blog post "Full IDS in the browser"
  (content/seo backlog rules apply — check `project_seo_content_research`
  anti-cannibalization rule before slugging).
- Bump SDK minor (additive result fields) — follow the version bump procedure used
  for v1.5.0 (`scripts/sdk/build-sdk-docs.mjs` + `vite.config.sdk.ts`).
- PostHog dashboard: add IDS funnel (loaded → started → completed → exported).

---

# 7. Known Risks & Bug Prevention

### 7.1 False failures from missing type-psets (CORRECTNESS, ACTIVE in v1)
Why: Revit/ArchiCAD exports put `Pset_*Common` on type objects. Prevention: P2-1
ships **before** any marketing of "full IDS". Debug: worker debug log of an
element's merged pset names; compare with the Sidebar properties panel (which reads
via the viewer and *does* show type psets — a user-visible inconsistency today).

### 7.2 XSD regex dialect (ACTIVE)
Why: `new RegExp('[\\i-[:]]')` throws. Prevention: P2-6 translate + try/catch +
conservative-fail reason. Debug: doc warnings list the offending pattern verbatim.

### 7.3 Race: stale worker result after cancel/re-run
Prevention: run-id filtering at both runner and store (§5.3-1) + single-shot `done`
latch. Test exists per P1-2. Debug: log dropped message ids.

### 7.4 Memory: double parse of large IFC
Why: viewer already holds fragments + registry holds raw buffer; IDS worker copies
the buffer (+WASM heap ~2–3× file size transiently). A 300 MB IFC can OOM a 32-bit
WASM heap. Prevention: P8 memory guard; worker closes model + terminates (frees
heap) — **never** keep the IfcAPI instance alive after the run; chunked gathering
avoids large intermediate arrays (psets map is the dominant allocation — it is
bounded by model content, acceptable). Debug: `performance.memory` snapshots via
`src/lib/memory-tracker.ts` (exists) around runs in dev.

### 7.5 Stale validation/IDS overlay states
Why: two overlay systems + selection restoration. Prevention: exclusivity rule
(§3.6) + clearing inside `removeModel` + `reset` paths. Debug: the viewer logs
restore failures at debug level already (viewer.ts:786 pattern) — extend for IDS map.

### 7.6 Infinite re-renders via selectors
Why: documented Zustand footgun (`validationStore.ts:428`). Prevention: never
return fresh arrays/objects from `useIdsStore(selector)`; group-by/filtering is
`useMemo` over stable `resultsByModel[modelId]` refs. Code-review checklist item.

### 7.7 Hover-highlight perf trap
Hovering failure rows must NOT call viewer highlight per mouse-move (fragments
highlight is async + materials churn). Only click selects. (BcfPanel follows the
same restraint — verify and stay consistent.)

### 7.8 Worker WASM path drift
Dev path `${BASE_URL}node_modules/web-ifc/` breaks if web-ifc relocates. Symptom:
`worker-init` errors only in dev or only in prod. Debug: the error code
distinguishes init from check; compare with `validator.worker.ts` which uses the
same convention — fix both together or neither.

### 7.9 i18n missing-key regressions
Prevention: dev `missingKeyHandler` warns; §13 includes a manual EN/ES sweep; unit
test asserts `en/ids.json` and `es/ids.json` have identical key sets (write a small
key-parity test like the repo's validation-coverage test style).

### 7.10 Import/export mismatch (writer)
Prevention: round-trip property test (P6-3) + one-time Audit-tool acceptance. Never
hand-build XML strings outside `ids-writer.ts`.

### 7.11 State corruption on hot-reload (dev)
Vite HMR re-creates components but stores persist → a `running` status with no
worker. Prevention: on `IdsPanel`/`IdsModal` mount, if status is
`running|cancelling` but the runner module has no live run for `runningModelId`,
reset status to `error{code:'orphaned'}` with a Retry. Cheap guard, big dev-QoL.

---

# 8. UI/UX System

## 8.1 Design language (extracted from the codebase — match it exactly)

- Dark glass surfaces: `bg-[rgba(12,12,16,0.97)] backdrop-blur-[20px]`, borders
  `var(--border)`/`var(--border-strong)`, radius `rounded-2xl` (containers) /
  `rounded-lg` (rows), shadows `0_24px_64px_rgba(0,0,0,0.6)`.
- Type scale is **small and technical**: 13px titles, 12–12.5px body, 10–11px meta,
  `font-mono` for numbers/ids/scores. Color tokens only — never hex literals except
  the established amber `#F5A623` (used for warnings across the app).
- Motion: framer-motion fade+scale 0.15–0.18 s on modals; no springy panel content.
- Status colors: `var(--ok)` / `var(--danger)` / `var(--text-faint)` for na; score
  ramp ≥80 ok, ≥50 amber, else danger (extract `SCORE_COLOR`).
- Icons from the local `Icons.tsx` set (Shield is the IDS mark) — check it before
  adding lucide imports; the toolbar uses the local set.

## 8.2 Component inventory (build in `src/components/ids/`)

| Component | Contract |
|---|---|
| `IdsPanel` | Docked right panel, same width/positioning class recipe as `BcfPanel` (read it first). Sections: header (title, model badge, close), summary strip, filter bar, virtualized spec list, footer actions. |
| `IdsSummaryStrip` | Score (mono, ramp color) + clickable pass/fail/na chips + run meta (relative time) + stale-IDS banner slot. |
| `SpecRow` | Status glyph (✓/✗/–, mono), name, fraction, facet chips, chevron; expanded: description, instructions, skipped-reason, failures list, truncation notice. |
| `FailureRow` | Name + class + `#expressId` mono + localized reasons (danger, 10.5px); click=select+focus; focus ring for keyboard nav. |
| `FacetChip` | Tiny rounded chip per facet kind (entity/attribute/property/classification/material/partOf) — also used in the loaded-file coverage summary. |
| `IdsProgress` | Phase label + determinate bar + Cancel. Bar uses `var(--accent)`; cancel is a ghost button. |
| `IdsEmptyState` | Dashed border, one sentence, primary action. Three variants: no-ids-loaded, no-model, results-for-other-model. |
| `IdsExportMenu` | Popover menu: JSON/CSV/HTML/BCF with per-format one-line descriptions; disabled states with tooltip reasons. |
| Confirmation dialogs | Only one: huge-model pre-run warning (P8). Use the app's existing confirm pattern (search for an existing confirm dialog component before creating one). |

## 8.3 Interaction rules

- Desktop-first; on mobile the panel becomes a bottom sheet **only if** BcfPanel
  already does — otherwise hide the IDS toolbar entry on mobile for release 1
  (check `MobileBottomNav` integration; do not invent a new mobile pattern).
- Keyboard: Esc close; `/` focuses panel search (only when panel focused); ↑/↓/Enter
  on failure rows; all buttons reachable by Tab with visible focus.
- Toasts only for: parse failure, check failure, export completion. Never for run
  completion (panel shows it) or cancellation (button feedback).
- Empty states always state the *next action*, not just the absence ("Load a .ids
  file to check this model against delivery requirements").
- Large data: virtualization thresholds per §4.3; failures cap messaging per §4.3.

---

# 9. Internationalization

- **Scope now: English + Spanish only.** The app supports 10+ locales; the i18n
  backend lazily loads `src/locales/<lng>/<ns>.json` and **falls back to EN per
  key** — so shipping only `en/ids.json` + `es/ids.json` is architecturally clean:
  FR/DE/… users see EN IDS strings until those files are added (one file per
  locale, zero code changes — this is the documented extension path).
- Namespace: `ids`. Register in `config.ts`: import `enIds` into `EN_RESOURCES`
  (eager, prevents first-render key flashes) and add `'ids'` to `ns`. ES loads via
  the existing `resourcesToBackend` lazy path — confirm `lazyLoader.ts` is
  glob-based (then no change) or registry-based (then add the namespace there).
- Key structure:

```jsonc
{
  "panel": { "title": "IDS check", "run": "Run check", "rerun": "Re-run", "cancel": "Cancel", "cancelling": "Cancelling…", "highlight": "Highlight failures", "isolate": "Isolate failures", ... },
  "states": { "emptyNoIds": "...", "emptyNoModel": "...", "bufferUnavailable": "...", "staleIds": "Results were produced with {{file}} — re-run with the current file." },
  "progress": { "open": "Opening model…", "gather": "Reading elements…", "check": "Checking specifications…" },
  "status": { "pass": "Pass", "fail": "Fail", "na": "N/A", "skippedIfcVersion": "Skipped — targets {{wanted}}, model is {{actual}}" },
  "reasons": {
    "missingRequired": "Missing required {{what}}",
    "wrongValue": "{{what}} has the wrong value — expected {{expected}}",
    "prohibitedPresent": "{{what}} is present but prohibited",
    "wrongDataType": "Wrong data type — expected {{expected}}, found {{actual}}",
    "unsupportedPattern": "Pattern not supported by this checker: {{pattern}}",
    "specRequiredButAbsent": "The model contains no elements matching this required specification",
    "specProhibitedButPresent": "Prohibited elements are present in the model"
  },
  "errors": { "malformedXml": "...", "notIds": "...", "noSpecs": "...", "tooLarge": "...", "oom": "...", "timeout": "...", "cancelled": "...", "orphaned": "..." },
  "export": { "json": "...", "csv": "...", "html": "...", "bcf": "...", "done": "Report downloaded" },
  "count_one": "{{count}} failing element",
  "count_other": "{{count}} failing elements"
}
```

- Rules: engine emits codes (§3.7) — translation happens only at render; reports
  (HTML/CSV) render with the **current UI language**, BCF topic titles in EN (BCF
  consumers are mixed-language teams; EN is the interchange convention —
  documented decision). Pluralization via i18next `_one/_other`. No string
  concatenation of translated fragments — always full-sentence keys with params.

---

# 10. Error Handling Philosophy

- **Never crash the viewer.** All IDS code paths are try/caught at the boundary
  (modal/panel handlers, runner promise, worker onmessage). The 3D canvas and
  other panels must remain functional after any IDS failure. The existing
  `ErrorBoundary` wraps panels — confirm IdsPanel is inside one (follow
  ValidationPanel's mounting).
- **Error taxonomy** (code → recoverability → UX):

| Code | Recoverable | UX |
|---|---|---|
| `malformedXml/notIds/noSpecs/tooLarge` | yes (new file) | inline + toast |
| `worker-init` | yes (1 auto-retry, then Retry) | inline |
| `model-open` (corrupt IFC for web-ifc) | no for this model | inline, suggest validator's coverage report analogue |
| `oom` | maybe (close models) | inline with guidance |
| `timeout` (watchdog) | yes (Retry) | inline |
| `cancelled` | n/a | neutral state |
| `orphaned` (HMR/zombie) | yes | inline Retry |

- Logging: `createLogger('Ids')` — debug for protocol, warn for tolerated
  oddities (doc warnings), error for failures. Telemetry: `ids_check_failed{code}`
  (no file contents, no model data — privacy posture).
- Debug mode: the logger module already gates by env — no new mechanism.

---

# 11. Performance Requirements

Measured targets (mid-range laptop, Chrome):

| Scenario | Target |
|---|---|
| Parse a 1 MB .ids (200 specs) | < 150 ms main-thread |
| Check 50 MB IFC, 20 specs, full facets | < 15 s end-to-end, UI never jankier than 16 ms frames |
| Check 150 MB IFC | < 60 s, progress visible, cancellable < 2.5 s |
| Re-run same IDS+model (cache, P7-1) | gather skipped; < 30 % of cold time |
| Panel with 2 000 failures | scroll at 60 fps (virtualized), filter < 100 ms |

Mechanisms: worker-only IFC reads; chunked loops with abort checks (no
`setTimeout` slicing needed inside a worker, but chunk boundaries are where abort
and progress live); pset/classification/material maps built in single passes over
relationship types (O(rels), not O(elements×rels)); failures capped at 200/spec
in memory (full counts kept; CSV export streams from a re-check only if ever
demanded — out of scope, document the cap); buffer copied once per run; gathered
cache per §7-1; UI virtualization per §8.

---

# 12. Testing Strategy

| Layer | Tooling | What |
|---|---|---|
| Unit: value matching | vitest, `ids.test.ts` family | every restriction type, XSD-regex translation table, tolerance, booleans, dataType coercion |
| Unit: parser | vitest | facets, cardinalities (attr + occurs), spec cardinality, ifcVersion list, warnings, all `IdsParseError` codes, fuzz set (P8) |
| Unit: engine | vitest, hand-built `IdsElement[]` | per-facet pass/fail/na matrices × required/optional/prohibited; spec-cardinality; score math incl. synthetic failures; reason codes |
| Golden: buildingSMART testcases | vitest (engine-level mirrors) + browser-mode worker run where feasible | P0-1 suite; every enabled case green, deferred cases `it.todo` |
| Integration: worker | vitest browser mode (devdep exists) or e2e via SDK | Sample House (5 walls/3 doors baseline from v1), type-pset fixture, classification fixture; progress sequence; cancel mid-gather |
| Store | vitest | transition table §5.2 row-by-row; race tests §5.3 |
| Round-trip | vitest | `parseIds(writeIds(doc))` (P6-3) |
| i18n | vitest | en/es key parity; no missing keys when rendering all reason codes |
| Stress (manual, scripted checklist) | dev build | 150 MB+ IFC, 1 000-spec IDS, cancel storms (10× start/cancel), model remove mid-run, language switch mid-run |
| Regression | existing suite | the full ~203+ tests stay green every task; validator e2e untouched |

Real-world matrix (manual, before release): Revit-exported IFC4 + an office-standard
IDS; ArchiCAD IFC2X3 + classification-heavy IDS; an IDS from the buildingSMART
Audit examples; one deliberately broken XML; one IFC4X3 file (expect literal-class
matching, documented).

---

# 13. Definition of Done ("production ready")

1. **Correctness:** all enabled buildingSMART testcases pass; type-pset inheritance
   verified against a real Revit export; no known false-PASS class of bug open.
2. **Honesty:** anything not checked is *visibly* not checked (skipped/unsupported
   reasons in UI and in every export format).
3. **Performance:** §11 targets met and recorded (numbers pasted into the PR).
4. **Resilience:** every error code in §10 reachable in a test or scripted manual
   step; viewer survives all of them; cancel always returns control < 2.5 s.
5. **UX:** §8 components match the design language (reviewed against
   ValidationPanel/BcfPanel side-by-side); keyboard flows work; empty/loading/error
   states all reachable and translated.
6. **i18n:** EN+ES complete with key parity; other locales gracefully EN.
7. **API stability:** SDK wire shape additive-only; `docs/IFC_VIEWER_SDK.md`
   updated; embed/kiosk modes respected.
8. **Docs:** this plan's §2.3 table updated to reflect shipped state; memory/docs
   note recorded; README claim verified honest.
9. **Quality gates:** `npm run test`, `npm run lint`, `npm run build` (includes
   `tsc -b`) all green; no new ESLint suppressions; no `any` in new code.
10. **Telemetry:** the IDS funnel events fire (verified in PostHog dev project).

---

## Appendix A — IDS 1.0 quick reference (for implementers)

- Root: `<ids xmlns="http://standards.buildingsmart.org/IDS">`, `<info>` (title,
  copyright, version, author, date, purpose, milestone), `<specifications>`.
- `<specification name ifcVersion identifier description instructions>` with
  `<applicability minOccurs maxOccurs>` (spec cardinality) and `<requirements>`.
- Facets: `entity(name, predefinedType)`, `attribute(name, value)`,
  `property(propertySet, baseName, value, @dataType)`,
  `classification(system, value)`, `material(value)`,
  `partOf(@relation, entity)`.
- Values: `<simpleValue>` or `<xs:restriction base>` with `enumeration`, `pattern`
  (XSD dialect, implicitly anchored), `minInclusive/maxInclusive/minExclusive/
  maxExclusive`, `length/minLength/maxLength`.
- Requirement facets carry `@cardinality` = required | optional | prohibited.
- Reference implementation to consult on ambiguity: IfcOpenShell `ifctester`
  (Python) and the buildingSMART online Audit tool. When they disagree with this
  document, the testcases repo wins, then ifctester, then this doc — and update
  this doc.

## Appendix B — Competitive UX notes (researched 2026-06)

- **Solibri**: checking-results tree grouped by rule → component, severity icons,
  result slideshows. Take: grouping + click-to-3D; avoid: modal-heavy rule setup.
- **BIMcollab Zoom / smart views**: list-driven isolation. Take: one-click isolate.
- **BlenderBIM/ifctester**: honest per-spec pass/fail + HTML report. Take: report
  format inspiration; avoid: raw technical reason strings (we localize codes).
- **Flinker** (direct competitor, has IDS 1.0 + BCF 3.0): browser-based, SDK-first.
  Our edge must be result UX depth (grouping, diffing, exports) + the existing
  validator/Health-Score integration — not raw facet parity alone.
- Common pain everywhere: silent partial coverage. Our `unsupported`/skipped
  surfacing is the differentiator — protect it in every UI/export.
