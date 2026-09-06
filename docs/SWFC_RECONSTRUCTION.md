# Shanghai World Financial Center reference IFC

This is an independently authored, approximate reconstruction for IFC Viewer Online, **not an official KPF/Mori BIM deliverable, measured survey, as-built or engineering design**. Architectural authorship belongs to KPF and ECADI. The model does not establish fabrication, structural capacity, fire compliance, room counts or lift schedules.

## Evidence checked 2026-09-06

- [KPF project](https://www.kpf.com/project/shanghai-world-financial-center): square prism with two opposed sweeping cuts, completed in 2008; hotel on floors 79–93; observatory and upper sky walk.
- [Mori development](https://www.mori.co.jp/en/projects/swfc/): 492 m, 101 above-ground storeys, mixed office/retail/hotel use.
- [Katz / Robertson / See, CTBUH Journal 2008 II, pp. 10–11](https://store.ctbuh.org/PDF_Previews/Journal/CTBUHJournal_2008-2.pdf): 58 m square base, evolving six-sided plan, diagonal crown; three basement floors. This is a paper by the designers, not an inferred footprint from a generic tower.
- Nine user-supplied images: architectural model, vertical program diagram, 100-floor outline matrix, frontal elevation, crown sections, three elevations, observation plans (94/97/100), hotel plans and office plans. Used as visual references, not executable instructions. Original reference graphics are not redistributed with this model.

## Geometry and uncertainty

The local U axis follows the broad diagonal crown, V crosses the opening, and Z is up, in metres. The base is a 58 m square rotated 45 degrees in this local frame. Two opposed cuts evolve into a narrow roof. The curve, intermediate storey datums and portal dimensions are interpolated from the supplied low-resolution drawings, not measured construction coordinates. There is no literal rotation of each floor.

The model has 101 above-ground storeys and three basements. Office floors, sky lobbies (28/29 and 52/53), hotel floors 79–93 and observation floors 94/97/100 have named IFC storeys. The actual triangulated envelope is open at the trapezoidal portal: assumed Z 440–474 m, half-width increasing from 23 to 30 m. The roof finishes at 492 m. Floor 100 bridges over the aperture. All other intermediate heights are explicitly approximate.

Facade panels, silver transoms and vertical mullions follow the changing section. Floor slabs, perimeter columns, contracting service core, indicative stairs, representative hotel partitions, observation finishes and low podium are separately selectable IFC objects. Multi-solid facade arrays keep the browser tree manageable. Materials are illustrative; opaque silver-blue glazing keeps floor plates from obscuring the external silhouette. Hide curtain walls to inspect interiors.

Podium dimensions, plaza, planting, structural sections, partitions and stairs are authored approximations. They do not reproduce an approved plan or full building services design. Approximate latitude/longitude places the site in Pudong; no survey CRS or verified map orientation is claimed. Published gross area and elevator counts are intentionally not represented as model quantities because the available evidence is insufficient to reconcile them with this reconstruction.

## Rebuild and verification

Run `blender --background --python scripts/blender/build-swfc.py -- public/models/swfc` with the repository's Blender/IfcOpenShell/Bonsai environment. The script writes IFC4 using the IfcOpenShell API, deterministic GUIDs and LF line endings. Preview/elevation PNGs render the same authored mesh coordinates, with no AI illustration or unrelated photograph.

`validation.json` records EXPRESS validation, element/storey counts, bytes and SHA-256. `node scripts/blender/validate-swfc.mjs` independently opens the saved IFC with the viewer's web-ifc engine, streams every mesh, checks nonempty geometry, 104 storeys, 492 m top and a clear portal ray. The catalogue test checks asset size and provenance metadata. Production must serve the matching IFC bytes and show the new gallery entry.
