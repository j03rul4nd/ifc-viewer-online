# BESCOF catalogue fixtures

Catalogue objects as BESCOF delivers them: one occurrence (`IfcWindow` /
`IfcDoor`) inside Site → Building → Storey, typed through
`IfcRelDefinesByType` by an `IfcWindowType` / `IfcDoorType` that carries the
manufacturer's property sets in `HasPropertySets`. Read by
`scripts/ifc-item-data.test.ts`, which converts them with the real
web-ifc + fragments pipeline.

| File | What it pins |
|------|--------------|
| `V-70-PR.synthetic.ifc` | Stand-in for `V-70-PR.ifc`: IFC4, millimetres, window `#67` with GlobalId `2c161Q3PMaELK1P$GnzTUr`, type *Ventana V-70 practicable* with `Pset_WindowCommon`, `Pset_DoorWindowGlazingType`, `Pset_ManufacturerTypeInformation` and `BESCOF_EN14351` (35 properties), a W/(m²·K) derived unit in the project. |
| `PTA-EXT-80.synthetic.ifc` | Stand-in for `PTA-EXT-80.ifc`: a door whose occurrence redefines part of its type (`Pset_DoorCommon.Reference`) — occurrence-over-type precedence — plus an enumerated property, a property with its own unit, and base quantities. |
| `window-ifc2x3.synthetic.ifc` | IFC2x3: a window typed by an `IfcWindowStyle` (which fragments' importer does not keep by default), with an occurrence override. |

The synthetic files are hand-written STEP, generated for these tests; they
contain no client data.

**The real files.** Copy BESCOF's `V-70-PR.ifc` and `PTA-EXT-80.ifc` into
this folder and the `real file:` cases of `scripts/ifc-item-data.test.ts` run
against them too (they are skipped while the files are absent). Whether to
commit them is BESCOF's call — they are product data.
