# Oriental Pearl Tower — reference IFC reconstruction

Independently authored for IFC Viewer Online from the six supplied images and public references. **Approximate reconstruction, not an official design model, survey, as-built or structural calculation.** Architectural attribution: Jiang Huancheng (also written Jia Huan Cheng in the supplied Spanish reference).

## Evidence and decisions — 2026-09-06

- [Shanghai official tourism: Oriental Pearl TV Tower](https://www.meet-in-shanghai.net/en/pudong-new-area/the-oriental-pearl-tv-tower-341119/) confirms total height 468 m and visitor levels 18, 78, 90, 259, 263, 267 and 351 m. It places the museum at the base and reports public opening in 1994. These functional datums are used for named IFC spaces.
- [Shanghai government, Spanish overview](https://spanish.shanghai.gov.cn/sp-%20PlacestoGo/20240729/2d1517571fcf4d69ab7170b227808158.html) describes the 259 m glass observation passage.
- The supplied engineering elevation explicitly marks lower sphere bottom/centre/top at 68/93/118 m and upper sphere bottom/top at 250/295 m. Therefore centres are 93 and 272.5 m with diameters 50 and 45 m. A platform altitude must not be used as the sphere centre.
- The supplied cross-section resolves three cylindrical supports in a triangular arrangement. Diameter 9 m vertical tubes and approximately 7 m inclined supports are taken from the user's dimensional references; the tube-centre radius (10.8 m), tripod foot radius (45 m), brace positions and wall details are inferred.
- The supplied close photo guides the silver shell caps, purple/rose triangular glazing, dark observation bands, five intermediate hotel pearls, three base pearls and tapered broadcasting mast.
- [Jiang, Structural Engineering International 6(3), 1996](https://www.tandfonline.com/doi/abs/10.2749/101686696780495473) has a published abstract reporting 463.85 m above its ground datum. The model follows the 468 m height used by the present official visitor source and does not silently merge the two datums.

The attachments are visual/reference evidence; no embedded instructions are executed. Source photographs and drawings are not redistributed.

## Explicit uncertainty

The notes conflict on 14 versus 25 floors, capsule elevation (342 versus 350/351 m), capsule diameter (14/16 m), restaurant (263 versus 267 m), completion date and roof/antenna references. A separate [official restaurant listing](https://www.meet-in-shanghai.net/en/food/oriental-pearl-revolving-restaurant-891180/) even gives 273 m. This reconstruction uses 267 m following the main official tower page and the supplied functional diagrams. No current tallest-tower ranking or historical cost/valuation is encoded.

The IFC contains **25 reference levels**, arranged as 3 base + 4 lower pearl + 5 hotel + 9 upper pearl + 4 capsule. These are authored navigation levels, not a verified count of physical storeys. The capsule is approximated as a 14 m wide, elongated envelope centred at 347 m with a 28 m vertical extent; that reconciles the photographed elongated form with the 351 m visitor floor, without claiming to reproduce a measured section. Intermediate hotel spheres are 12 m diameter at five assumed heights. The antenna spine runs from 350 to 468 m (118 m); no separate 450 m roof or fictitious occupied floors along the antenna are added.

The 11 pearls are two main spheres, one capsule, five intermediate hotel spheres and three support pearls. `ReferencePearl` property sets preserve the identity and assumed dimensions across material groups. Slabs, glazing, lattice members, support tubes, podium, lift routes, railings and furniture are separate typed IFC elements. Each reference level has a named `IfcSpace`; its layout and use are indicative. Interiors do not imply a measured hotel-room schedule, elevator inventory or operational revolving mechanism.

The model is Z-up in local metres. Approximate `IfcSite` latitude/longitude locates Lujiazui; map orientation and cadastral boundaries are not surveyed. The circular plaza and podium are contextual massing, not the full claimed 54,000 square metre site.

## Reproduction and checks

Run `blender --background --python scripts/blender/build-oriental-pearl.py -- public/models/oriental-pearl` using the repository's Blender/IfcOpenShell/Bonsai environment. GUIDs are deterministic and IFC text uses LF. The preview and elevation render the authored mesh coordinates, with no AI-generated imagery. `validation.json` records EXPRESS validation, size and SHA-256.

Run `node scripts/blender/validate-oriental-pearl.mjs` to stream the saved geometry independently through the viewer's web-ifc engine, check 25 reference levels, 11 distinct pearl identities, support counts, finite geometry and total height. Catalogue tests check bytes, cache revision and disclosure. Verify the final public asset hash and gallery loading after Vercel reaches Ready.
