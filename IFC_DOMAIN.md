# IFC Domain Knowledge

Reference for all IFC concepts used or planned in this codebase. A future Claude session should not need to ask what any of these mean.

---

## What IFC is

IFC (Industry Foundation Classes) is an open, vendor-neutral file format for building information models (BIM). It is the lingua franca of the architecture, engineering and construction industry — every major BIM tool (Revit, ArchiCAD, Tekla, Allplan, Vectorworks) can export IFC. The format stores the complete semantic model of a building: geometry, material properties, spatial structure, relationships between elements, quantities, and metadata. The current dominant versions are IFC2x3, IFC4, and IFC4x3.

IFC is encoded as a STEP file (ISO 10303-21) — a plain-text, line-by-line format where each line is a numbered entity. Example:

```
#123= IFCWALL('3ABC...', #1, 'Exterior Wall', 'Load-bearing', $, #56, #78, $, .STANDARD.);
```

The `#123` is the **Express ID** (see below). The string `'3ABC...'` is the **GlobalId**.

---

## Spatial hierarchy

IFC models have a strict containment hierarchy:

```
IfcProject
  └── IfcSite
        └── IfcBuilding
              └── IfcBuildingStorey  (floor/level)
                    ├── IfcSpace     (room, zone)
                    └── IfcElement   (walls, slabs, doors, etc.)
```

Each level is linked to the next via `IfcRelAggregates`. Elements at the storey level are linked via `IfcRelContainedInSpatialStructure`. An `IfcSpace` can contain elements too.

This hierarchy is what Sprint 3's spatial tree will navigate. The tree is per-storey: expand a storey to see all spaces and elements on that floor.

### Key attributes at each level

| Entity | Name | LongName | Description |
|---|---|---|---|
| IfcProject | Project short name | Full project name | General description |
| IfcSite | Site ID/code | Full site name | Site description |
| IfcBuilding | Building ID/code | Full building name | Building purpose, etc. |
| IfcBuildingStorey | Storey ID ("L01") | "Level 1", "Ground Floor" | Elevation note |
| IfcSpace | Space ID ("R101") | "Office", "Corridor" | Occupancy, use |
| IfcElement | Varies by type | Same | Fire rating, structural role, etc. |

---

## Key IFC entity types in this app

The app's palette and display name tables cover these types:

| IFC Type | Display Name | Notes |
|---|---|---|
| IFCWALL / IFCWALLSTANDARDCASE | Walls | Most common element type |
| IFCSLAB / IFCSLABSTANDARDCASE | Slabs | Floors and ceilings |
| IFCBEAM / IFCBEAMSTANDARDCASE | Beams | Structural beams |
| IFCCOLUMN / IFCCOLUMNSTANDARDCASE | Columns | Structural columns |
| IFCDOOR | Doors | May have swing geometry |
| IFCWINDOW | Windows | Semi-transparent (opacity 0.45) |
| IFCROOF / IFCROOFING | Roofs | |
| IFCSTAIR / IFCSTAIRFLIGHT | Stairs | |
| IFCRAILING | Railings | |
| IFCSPACE | Spaces | Very low opacity (0.12) — room volumes |
| IFCFURNISHINGELEMENT | Furniture | |
| IFCFLOWSEGMENT / IFCPIPESEGMENT / IFCDUCTSEGMENT | MEP/Pipes/Ducts | Mechanical, electrical, plumbing |
| IFCMEMBER | Members | General structural members |
| IFCPLATE | Plates | Flat structural plates |
| IFCCOVERING | Coverings | Ceilings, floor finishes |
| IFCFOOTING / IFCPILE | Foundation elements | |

### Canonical type normalisation

The codebase uses a `canonicalType()` function that strips `STANDARDCASE` and `ELEMENTEDCASE` suffixes:

```
IFCWALLSTANDARDCASE → IFCWALL
IFCSLABSTANDARDCASE → IFCSLAB
```

This ensures palette lookups and category grouping work regardless of which IFC version uses which variant. The `STANDARDCASE` variants were deprecated in IFC4 but are still common in IFC2x3 exports (especially from Revit).

---

## ExpressID vs GlobalId

These are two completely different identifiers for the same element:

| | ExpressID | GlobalId |
|---|---|---|
| Format | Integer (e.g. `12345`) | 22-character base64 encoded GUID (e.g. `'3ABC4LKf9E8wxyz...'`) |
| Scope | Local to one file — changes on re-export | Globally unique — persists across exports of the same model |
| Usage in this app | `result.localId` from raycasting; key in `expressIDToType` map; displayed in sidebar as "Express ID" | Not currently read/displayed; needed for diff/edit and round-trip operations |
| Usage in web-ifc | Primary internal index (`GetLine(expressId)`) | Stored as IFC attribute #0 on every element |

> ⚠️ NOTE: Sprint 3 (validation and editing) will need GlobalId for identifying elements across editing sessions. The `expressIDToType` map currently uses Express IDs as keys. When the diff store is introduced, it should key non-destructive edits by GlobalId, not Express ID.

---

## Key IFC relationships

### IfcRelAggregates
Defines parent-child decomposition: `IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey`. Also used when a composite element (e.g. curtain wall) contains sub-elements.

```
#200= IFCRELAGGREGATES('...', $, $, $, #10, (#20, #30));
                                           ^      ^
                                         Parent  Children
```

### IfcRelContainedInSpatialStructure
Links physical elements to their spatial container (usually a storey or a space). An `IfcWall` on the 2nd floor is contained in the `IfcBuildingStorey` for that floor.

```
#300= IFCRELCONTAINEDINSPATIALSTRUCTURE('...', $, $, $, (#123, #456, ...), #buildingStoreyId);
                                                                ^                   ^
                                                            Elements           Their container
```

### IfcRelAssociatesClassification
Links an element to a classification system entry (e.g. Uniclass, OmniClass, NBS). Used by the validator to check that elements have required classifications. Not read in Sprint 1–2.

### IfcRelDefinesByProperties / IfcPropertySet
Properties beyond the standard IFC attributes are stored in `IfcPropertySet` objects linked to elements via `IfcRelDefinesByProperties`. Sprint 3 inline editing targets specific property sets (e.g. `Pset_WallCommon` for structural/fire properties).

---

## Common IFC errors architects encounter

These are the target validation cases for Sprint 3:

| Error | Description | IFC mechanism to check |
|---|---|---|
| Missing storey assignment | Element exists in the model but is not assigned to any `IfcBuildingStorey` via `IfcRelContainedInSpatialStructure` | Walk `IfcRelContainedInSpatialStructure.RelatingStructure` |
| Duplicate GlobalId | Two elements share the same GlobalId (bad export from some tools) | Index all GlobalIds; flag duplicates |
| Geometry but no type | Element has geometry but `PredefinedType` or type object is missing | Check attribute #8 or associated `IfcTypeObject` |
| Missing fire rating | Wall or slab has no `Pset_WallCommon.FireRating` or `Pset_SlabCommon.FireRating` | Traverse `IfcRelDefinesByProperties` |
| Missing load-bearing flag | Structural element has no `Pset_WallCommon.LoadBearing` set | Same as above |
| Uncategorised elements | Element type is not in the recognised palette (appears as grey in viewer) | Element has a type not in `IFC_PALETTE` |
| Zero-area geometry | Element has `IfcShapeRepresentation` but bounding box is essentially zero | Check `model.box` per element |

---

## Constraints of web-ifc / IfcImporter for round-trip editing

Understanding what the WASM parser **cannot** do is as important as what it can.

| Capability | Status | Notes |
|---|---|---|
| Read all entities and attributes | ✅ | Full read access via `IfcAPI.GetLine(expressId)` |
| Write modified attributes back | ✅ | `IfcAPI.WriteLine(expressId, newEntity)` |
| Round-trip to IFC STEP bytes | ✅ | `IfcAPI.ExportFileAsIFC()` returns `Uint8Array` |
| Preserve original file formatting | ❌ | Re-export reformats the entire file; line numbers change |
| Preserve EXPRESS IDs on re-export | ❌ | Express IDs may be reassigned; GlobalId is the stable key |
| Edit geometry | Partial | Simple parametric edits (wall height, slab thickness) are possible; freeform mesh edits are not |
| Add new elements | ✅ | `IfcAPI.CreateIfcEntity()` + `WriteLine` |
| Delete elements | ✅ | Set the entity to null and re-export |
| Validate against IFC schema | Partial | `web-ifc` validates type constraints at parse time; custom business rules require application logic |

> ⚠️ NOTE: Because Express IDs are unstable across re-exports, the diff store (Sprint 4) must key pending edits by GlobalId (`string`). The viewer's `expressIDToType` map uses `number` keys (Express IDs) for fast GPU operations — this is correct for per-session use but must not be serialised to OPFS or used as edit keys.

---

*Last updated: 2026-05-29 · Sprints 1–9 complete. The forward-looking "Sprint 3/4 will…" notes below are historical — spatial tree, GlobalId-keyed diff store, classification checks, and inline editing all shipped. The domain knowledge itself is current. The validator now runs 38 rules (see `ARCHITECTURE.md`).*
