# Version comparison (sets of IFCs across deliveries)

Toolbar → **Compare** opens `CompareModal`. The use case: a department head
reviews what changed in the team's models this week, checks that the IDS
compliance did not regress, and updates the BCF issue list — for a *set* of
files (one per discipline), not a single IFC.

## Flow

1. **Before / After** — each side is one of: loaded models, IFC files (multi),
   or a saved baseline. A worker (`snapshot.worker.ts`) reads each file once
   into a `ModelSnapshot` (`lib/compare/snapshot.ts`).
2. **Changes** — `diffSnapshotSets` keys every element by **GlobalId across the
   whole set**, so an element moved from one file to another is *modified
   (file)*, not removed + added. Categories: class, name, attribute, property,
   material, classification, container (storey), geometry, placement, file.
   Files are paired by GlobalId overlap first, then name (versions/dates
   stripped), then project GUID — the reason is shown per pair.
3. **3D** — the diff rides the existing validation overlay channel
   (`lib/compare/overlay.ts`): added = info/blue, modified = warning/amber,
   removed = error/red (only when the old version is loaded).
4. **IDS** — the same IDS runs on both snapshot sets with the pure engine
   (`runIdsChecks`), no re-parse. Failures are keyed by spec + GlobalId
   (`ids-versions.ts`), unlike `ids/ids-diff.ts` which keys by express id and
   is only valid for two runs of the same file. **Derive IDS** learns
   requirements from a delivery (`ids-from-model.ts`) and writes IDS 1.0 XML
   (`ids/ids-writer.ts`, round-trip tested against the parser).
5. **BCF** — `bcf-sync.ts`: open topics with `componentGuids` get a comment
   (removed / modified with what / unchanged / IDS resolved) and a *proposed*
   Resolved status; new topics per spec with new IDS failures and optional
   change-review groups (class × storey). Topics created by a comparison carry
   the label `version:<head label>` and are never "updated" by that same run.
6. **History** — `baseline-store.ts`: gzip JSON in IndexedDB, exportable as
   `.ifcbaseline` for sharing. Comparing next week's delivery against a
   baseline needs no old IFC.

## Snapshot

`SnapElement` = `IdsElement` (what the IDS engine checks) + `storey` + `geo`.
`psetTypes` is dropped to halve storage (IDS dataType checks are lenient
without it). `geo.h` hashes tessellation sizes + placement (1 mm, rotation
1e-4) from `StreamAllMeshes` without reading vertices; the Poblenou test pins
that the same file fingerprints identically twice. The gather uses a document
with empty applicability plus classification/material/partOf requirements so
every relationship pass runs.

## Exports

HTML report (self-contained, printable), CSV (one row per field change, BOM
for Excel), JSON (`format: ifc-version-diff`), `.ids`, `.bcfzip`.

## Limits

- Elements without a GlobalId are not compared; duplicated GlobalIds are
  counted and compared once.
- Geometry is a fingerprint, not a mesh diff: it says *that* a shape changed,
  not how.
- Baselines live in the browser that saved them until exported.
