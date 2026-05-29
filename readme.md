<div align="center">

# IFC Viewer Online

**Open an IFC file and get a Health Score — 0 to 100 — in 30 seconds.**

Free IFC viewer + validator that runs entirely in your browser.
No account. No ruleset to configure. No file size limit. Your models never leave your machine.

[**→ Try it live**](https://j03rul4nd.github.io/ifc-viewer-online/)

<br/>

[![Live demo](https://img.shields.io/badge/demo-live-22c55e?style=for-the-badge)](https://j03rul4nd.github.io/ifc-viewer-online/)
[![License: MIT](https://img.shields.io/badge/core_license-MIT-3b82f6?style=for-the-badge)](#license--open-core)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-8b5cf6?style=for-the-badge)](#contributing)
[![Stars](https://img.shields.io/github/stars/j03rul4nd/ifc-viewer-online?style=for-the-badge&color=f59e0b)](https://github.com/j03rul4nd/ifc-viewer-online/stargazers)

![React](https://img.shields.io/badge/React_18-20232a?logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=three.js&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654ff0?logo=webassembly&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646cff?logo=vite&logoColor=white)
![100% client-side](https://img.shields.io/badge/100%25-client--side-0ea5e9)

<br/>

**Read this in your language**

English · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Català](README.ca.md) · [Italiano](README.it.md) · [ไทย](README.th.md)

</div>

---

<div align="center">

[![IFC Viewer Online — load a model, validate it, and get a Health Score, all in the browser](assets/demo.gif)](https://j03rul4nd.github.io/ifc-viewer-online/)

<sub><i>Load a demo model → run a validation profile → Health Score + ranked issues, 100% in your browser. <a href="https://j03rul4nd.github.io/ifc-viewer-online/">Try it live →</a></i></sub>

</div>

> **In one sentence:** drag in an IFC, see your model in 3D, get a Health Score with a ranked list of issues, fix the common ones in a click, and export a corrected file — without uploading anything to a server.

## Contents

- [Why this exists](#why-this-exists)
- [What it does](#what-it-does)
- [See it in action](#see-it-in-action)
- [The Health Score](#the-health-score)
- [How it works (architecture)](#how-it-works-architecture)
- [What a validation issue looks like](#what-a-validation-issue-looks-like)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [The 38 validation rules](#the-38-validation-rules)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License — open core](#license--open-core)

---

## Why this exists

Most IFC validation tools have at least one of these friction points:

| Tool | Friction |
|---|---|
| buildingSMART validator | 250 MB file size limit, no 3D viewer, raw text output |
| Autodesk Viewer / BIM 360 | Uploads your model to their servers — an NDA risk |
| Sortdesk | Requires an account before you can validate |
| Data Octopus | Charges per check — expensive for regular use |
| IFC Verify | No 3D viewer — issues show as text only |
| BIMvision / Solibri Anywhere | Desktop-only, Windows-only (Solibri Anywhere discontinued April 2026) |

**IFC Viewer Online has none of those limitations.** It runs entirely in the browser via WebAssembly, with no upload, no account, and no size cap. Your models never leave your machine.

---

## What it does

| Capability | What you get |
|---|---|
| **IFC Health Check** | 38 validation rules, streamed live from a Web Worker, summarized as a single **Health Score (0–100)**. |
| **3D Viewer** | WebGL rendering via Three.js + `@thatopen/components`. Multi-model loading with independent transforms, SSAO, edge rendering, bloom, 2D floor plans and live section cuts. |
| **Non-destructive editor** | Edit property values, fix GUIDs, rename elements. Every change is a diff with full undo/redo. Export a corrected IFC binary — diffs applied in a worker, no server. |
| **BCF 2.1 import/export** | Navigate to imported BCF viewpoints. Export validation issues as a BCF 2.1 zip for Navisworks, BIMcollab, and any BCF-compatible CDE. |
| **Quantity takeoff** | Aggregates `IfcElementQuantity` across the model — area, volume, length per IFC class. |
| **OPFS geometry cache** | Parsed geometry is cached in the browser's Origin Private File System. Reloads are ~10× faster and work offline. |
| **10 languages** | EN · ES · FR · DE · PT · JA · CA · ZH · IT · TH |

**Supported IFC versions:** IFC2x3 · IFC4 · IFC4x1 · IFC4x3

---

## See it in action

> Every clip below is the **real app** running in a browser — no mockups, no edited footage. The model used is the open [Duplex Apartment](public/Ifc2x3_Duplex_Architecture.ifc) reference IFC (7,131 elements), parsed and validated 100% client-side.

### Navigate the model & inspect IFC properties

Browse the full spatial hierarchy (project → site → storey → space → element), click any element to highlight it in 3D, and read its raw IFC property sets, classifications and quantities.

![Spatial tree navigation and IFC property inspection](assets/feature-tree.gif)

### Highlight every issue in 3D

Run a validation profile, then toggle the **Overlay** to paint flagged elements directly onto the model — so a list of issues becomes something you can actually see and walk through.

![Validation issues highlighted in the 3D scene](assets/feature-overlay.gif)

### Export a corrected model

Re-export the model as **IFC** or **GLB**, or push the validation issues out as a **BCF 2.1** package and a shareable report — all generated in a Web Worker, nothing uploaded.

![Export to IFC, GLB and BCF](assets/feature-export.gif)

---

## The Health Score

Every model receives a single number from **0 to 100** — a logarithmic, diminishing-returns score derived from the weighted severity of all detected issues. It is the one number you can act on, cite, or share with a colleague.

```mermaid
flowchart LR
    A[IFC file] --> B[38 rules run<br/>in a Web Worker]
    B --> C{Issues found}
    C -->|weighted by severity| D[Health Score<br/>0 – 100]
    D --> E[Share link<br/>no upload]
    D --> F[Fix common issues<br/>1 click]
    F --> G[Export corrected IFC]
```

| Severity | Examples |
|---|---|
| **Error** | Duplicate GUIDs, broken aggregates, missing spatial containers |
| **Warning** | Missing property sets, missing materials, naming-convention violations |
| **Info** | Proxy overuse, coordinate offset, file-size anomalies, outdated schema |

---

## How it works (architecture)

The whole pipeline lives in the browser. The IFC file is parsed in a Web Worker via WebAssembly, rendered with Three.js, and validated in a second worker — **nothing about your model is sent to any server.**

```mermaid
flowchart TD
    subgraph BROWSER["Your browser — the model never leaves this boundary"]
        UI["React 18 UI<br/>Tailwind · Radix · Zustand"]
        VIEWER["Viewer (Three.js)<br/>multi-model, postprocessing"]
        CACHE[("OPFS cache<br/>~10x faster reloads")]

        subgraph WORKERS["Web Workers (WebAssembly)"]
            PARSE["ifc-parser.worker<br/>IFC → fragments"]
            VALID["validator.worker<br/>38 rules + spatial tree"]
            EXPORT["export.worker<br/>apply diffs → IFC"]
        end
    end

    FILE["📄 drag &amp; drop .ifc"] --> UI
    UI --> PARSE
    PARSE -->|fragments| VIEWER
    PARSE -->|fragments + ifc bytes| CACHE
    UI --> VALID
    VALID -->|streamed issues| UI
    VALID -->|Health Score| UI
    UI --> EXPORT
    EXPORT -->|corrected .ifc| DL["⬇ download"]
```

Three independent workers keep the UI responsive: parsing, validation, and export each run off the main thread. State is held in seven small [Zustand](https://github.com/pmndrs/zustand) stores; geometry never enters the store (only stable IDs do). See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full data-flow diagrams.

---

## What a validation issue looks like

The validator reads raw IFC STEP entities and emits structured issues. For example, this duplicated GUID in the source file:

```step
#42=  IFCWALL('3vB2Y...DUPLICATE',   #5, 'Basic Wall', $, ...);
#118= IFCWALLSTANDARDCASE('3vB2Y...DUPLICATE', #5, 'Wall', $, ...);
```

...produces a typed issue, streamed to the UI and included in the shareable report:

```jsonc
{
  "ruleId": "RULE_DUPLICATE_GUID",
  "severity": "error",
  "globalId": "3vB2Y...DUPLICATE",
  "expressIds": [42, 118],
  "message": "GlobalId is shared by 2 elements",
  "ifcClass": "IfcWall"
}
```

BCF 2.1 export wraps the same issues in the open coordination markup that Navisworks and BIMcollab understand:

```xml
<Markup>
  <Topic Guid="..." TopicType="Issue" TopicStatus="Open">
    <Title>Duplicate GlobalId on IfcWall</Title>
    <Priority>High</Priority>
  </Topic>
</Markup>
```

Every worker message is validated at runtime with [Zod](https://zod.dev) schemas (`src/lib/worker-schemas.ts`), so malformed data never reaches the UI.

---

## Tech stack

| Layer | Technology |
|---|---|
| IFC parsing | [web-ifc](https://github.com/ThatOpenCompany/web-ifc) (WebAssembly) |
| 3D rendering | [Three.js](https://threejs.org/) + [@thatopen/components](https://github.com/ThatOpenCompany/engine_components) |
| UI | React 18 + Tailwind CSS + Radix UI |
| Animations | Framer Motion + GSAP |
| State | Zustand 5 (7 stores: model, scene, validation, editor, ui, takeoff, toast) |
| Validation | Web Worker — 38 rules, streamed via `postMessage` |
| Runtime safety | Zod schemas on every worker boundary |
| Virtualized lists | @tanstack/react-virtual |
| i18n | i18next (10 languages) |
| Analytics | PostHog (client-side, no PII) |
| Build | Vite 6 + TypeScript (strict) |
| Tests | Vitest (jsdom) |
| Deploy | GitHub Pages (static, zero backend) |

---

## Getting started

```bash
git clone https://github.com/j03rul4nd/ifc-viewer-online.git
cd ifc-viewer-online
npm install
npm run dev    # → http://localhost:3000
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — required for `SharedArrayBuffer` (multithreaded WASM).

**Build**

```bash
npm run build   # → dist/
```

> The build bundles Three.js and `@thatopen/*` inline into worker chunks (~5 MB each). The `build` script already passes `--max-old-space-size=4096`. If you still hit a heap OOM, try `NODE_OPTIONS=--max-old-space-size=8192 npx vite build`.

**Test**

```bash
npm test        # vitest (jsdom)
```

---

## Project structure

```
src/
  components/      # Landing, Viewer, ValidationPanel, Sidebar, ModelTree, ScenePanel, …
  workers/         # ifc-parser.worker.ts · validator.worker.ts · export.worker.ts
  stores/          # 7 Zustand stores (model, scene, validation, editor, ui, takeoff, toast)
  hooks/           # useModelSession, useValidationRunner, useElementFocus, …
  lib/             # viewer.ts · loader.ts · validator.ts · diffStore.ts · worker-schemas.ts
  locales/         # i18n — en/ es/ fr/ de/ pt/ ja/ ca/ zh/ it/ th/
  types/           # Zod schemas + TypeScript types (ValidationRules, EditDiff, …)
public/
  ifc-validator/           # Niche landing — /ifc-validator/
  ifc-viewer-mac/          # Niche landing — /ifc-viewer-mac/
  solibri-alternative/     # Niche landing — /solibri-alternative/
  tools/fix-duplicate-guids/
  es/                      # Spanish static shell + /es/ifc-validador/
cf-worker/         # Cloudflare Worker — stateless email-capture proxy (never sees the model)
```

Reference docs that go deeper: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`IFC_DOMAIN.md`](IFC_DOMAIN.md) · [`DECISIONS.md`](DECISIONS.md) · [`ROADMAP.md`](ROADMAP.md).

---

## The 38 validation rules

Rules run in `src/workers/validator.worker.ts`, gated by a `RulesConfig`, grouped by generation:

<details>
<summary><b>Core — 18 rules</b> (names, GUIDs, types, hierarchy)</summary>

`RULE_EMPTY_NAME` · `RULE_EMPTY_LONGNAME` · `RULE_DUPLICATE_NAME` · `RULE_NAMING_CONVENTION` · `RULE_MISSING_TYPE` · `RULE_DUPLICATE_GUID` · `RULE_MISSING_PROPERTY_SET` · `RULE_ORPHAN_ELEMENT` · `RULE_WRONG_CONTAINER` · `RULE_BROKEN_AGGREGATE` · `RULE_INVALID_GUID_FORMAT` · `RULE_SPATIAL_HIERARCHY` · `RULE_CIRCULAR_REFERENCE` · `RULE_EMPTY_PROPERTY_VALUE` · `RULE_MISSING_MATERIAL` · `RULE_ELEMENT_IN_BUILDING` · `RULE_INVALID_IFC_VERSION` · `RULE_ELEMENT_CLASH` (off by default)

</details>

<details>
<summary><b>Spatial &amp; file header — 11 rules</b> (project/site/storey, ISO 19650)</summary>

`RULE_MISSING_PROJECT` · `RULE_MISSING_BUILDING` · `RULE_MISSING_STOREY` · `RULE_EMPTY_STOREY` · `RULE_FILE_DESCRIPTION_MISSING` · `RULE_FILE_AUTHOR_MISSING` · `RULE_PROJECT_LONGNAME_MISSING` · `RULE_STOREY_ELEVATION_MISSING` · `RULE_ISO19650_PROJECT_INFO` · `RULE_ISO19650_AUTHOR_INFO` · `RULE_ISO19650_FILENAME`

</details>

<details>
<summary><b>LOD, classification &amp; MEP — 9 rules</b></summary>

`RULE_MISSING_CLASSIFICATION` · `RULE_LOD_PSET_MISSING` · `RULE_LOD_QUANTITY_MISSING` · `RULE_LOD_MATERIAL_LAYER_MISSING` · `RULE_MEP_SYSTEM_MISSING` · `RULE_CLASH_MEP_STRUCTURAL` · `RULE_PROXY_OVERUSE` · `RULE_COORDINATE_OFFSET` · `RULE_FILE_SIZE_ANOMALY`

</details>

---

## Contributing

Contributions are welcome — new validation rules, translations, and bug fixes especially.

**Add a validation rule** (`src/workers/validator.worker.ts`):

1. Add the rule ID to `ValidationRules` in `src/types/index.ts`
2. Implement the `async` function — it receives the `IfcAPI` instance, `modelId`, and a `SpatialIndex` helper, and returns `ValidationIssue[]`
3. Wire it into the `runAllRules` dispatch block
4. Add i18n strings to `RULE_TRANSLATIONS` in `src/types/index.ts`
5. Set `DEFAULT_RULES[RULE_ID] = true` (or `false` if opt-in)
6. Update the rule count in the marketing copy that references "38 rules" (`index.html`, `README*.md`, `src/seo/config.ts`, the `public/*` landing pages)

**Add a translation:** copy `src/locales/en/` to a new locale folder, translate the JSON values, and register the locale in `src/i18n/config.ts`. Translations of this README are equally welcome — match the file naming (`README.<lang>.md`) and add a link to the language row at the top.

**Before opening a PR:** run `npm test` and `npm run lint`.

---

## Roadmap

The product is technically mature (multi-model viewer, 38-rule validator, non-destructive editor, BCF, 10 languages). The forward plan is **distribution-led**, not feature-led:

- **Remediation table** — deterministic "how to fix this in Revit / ArchiCAD / Tekla" content per rule, authored in i18n (no AI, no server).
- **Crawlable reports** — move the share link from a URL hash to a stateless edge route so reports unfurl on social/search (the model still never leaves the browser).
- **Revision diff** — compare two versions of a model by GlobalId.
- **IDS-lite** — project checklists in plain language.

See [`ROADMAP.md`](ROADMAP.md) for the full plan and the explicitly deferred items.

---

## License — open core

| Component | License |
|---|---|
| IFC viewer (Three.js rendering, WASM integration) | **MIT** |
| Validator (38 rules, Web Worker) | **MIT** |
| Non-destructive editor (diffs, undo/redo, IFC export) | **MIT** |
| Stores, hooks, utilities, i18n | **MIT** |
| Cloudflare Worker (email-capture backend) | Proprietary |
| Future: cloud storage, sharing API, auth, PDF reports | Proprietary |

**The core viewer and validator are MIT-licensed forever.** Fork it, self-host it, use it commercially. The cloud infrastructure for future paid features is proprietary and cannot be replicated from this repo alone.

---

## Author

[Joel Benitez](https://github.com/j03rul4nd)

If this project saved you time, a ⭐ helps other BIM people find it.

---

<div align="center">

*Built with [@thatopen/components](https://github.com/ThatOpenCompany/engine_components), [web-ifc](https://github.com/ThatOpenCompany/web-ifc), and [Three.js](https://threejs.org/).*

</div>
