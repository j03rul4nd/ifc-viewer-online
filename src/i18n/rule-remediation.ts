// ── Per-rule remediation guidance (deterministic content table, no AI) ─────────
//
// "How do I fix this issue in my authoring tool?" — authored by hand, one entry
// per rule × authoring tool, translated per locale. See DECISIONS.md D-22.
//
// Shape mirrors RULE_TRANSLATIONS in src/types/index.ts:
//   language → ruleId → RuleRemediation
// with an EN fallback so no locale ever renders blank while it is being
// translated. Adding a locale = adding one top-level key; no other file changes.
//
// This is content, not engineering. Keep each tool entry to 1–3 short sentences
// of concrete, tool-specific steps. Omit a tool when there is no meaningful
// authoring-tool fix (the `summary` still applies and the UI falls back to it).

export type AuthoringTool = 'revit' | 'archicad' | 'tekla' | 'allplan'

export const AUTHORING_TOOLS: readonly AuthoringTool[] = [
  'revit',
  'archicad',
  'tekla',
  'allplan',
]

export interface RuleRemediation {
  /** Tool-agnostic one-liner: what the fix achieves. */
  summary: string
  /** Tool-specific steps. Missing tools fall back to the summary. */
  tools: Partial<Record<AuthoringTool, string>>
}

export const RULE_REMEDIATION: Partial<
  Record<string, Partial<Record<string, RuleRemediation>>>
> = {
  en: {
    // ── Naming & identity ────────────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Give the element a meaningful Name so it is identifiable in schedules, the model tree and downstream coordination.',
      tools: {
        revit:
          'Revit maps a family Type Name to the IFC Name on export. Open the element’s Type Properties and give the type a descriptive name instead of the default (e.g. rename "Basic Wall 1"). For instance-level naming, map a shared parameter to IfcName in the IFC export mapping table.',
        archicad:
          'Select the element and open the IFC Manager (right-click ▸ IFC Manager) or the Classification & Properties palette; set IfcRoot.Name there, or define the mapping in the IFC Translator’s property settings before exporting.',
        tekla:
          'The part Name field maps to the IFC Name. Open the part properties, enter a Name, and confirm the IFC export setting maps that attribute to IfcName.',
        allplan:
          'Assign an attribute that Allplan maps to IfcName via the Properties palette, or set the IfcName mapping in the IFC export configuration.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Set the LongName on spaces, storeys and the building — it carries the human-readable room/level name used in schedules and COBie.',
      tools: {
        revit:
          'For spaces, set the Room/Area Name (Revit maps Room Name → IfcLongName and Room Number → IfcName). For storeys, give each Level a descriptive Name. For the building, set the name in the IFC export options.',
        archicad:
          'Set the Zone Name for spaces (maps to IfcLongName) and name storeys via Design ▸ Story Settings. Set the building long name in File ▸ Info ▸ Project Info / the IFC Translator.',
        tekla:
          'Spaces and storeys are seldom authored in Tekla; where present, set the Name/UDA mapped to IfcLongName, or set storey names in the IFC export spatial settings.',
        allplan:
          'Set the room name (maps to IfcLongName), name storeys in the building structure, and set the building long name in the IFC export.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Make sibling element names unique (or rely on type + instance number) so elements are distinguishable in schedules and coordination.',
      tools: {
        revit:
          'Duplicate names usually come from identical type names or marks. Use the instance Mark parameter (unique per element) or rename types, and resolve Revit’s duplicate-Mark warnings.',
        archicad:
          'Use the ID Manager (Document ▸ ID Manager) to auto-assign unique element IDs so siblings don’t share a Name.',
        tekla:
          'Run numbering (Drawings & reports ▸ Numbering) so each part gets a unique position/part mark mapped to Name.',
        allplan:
          'Assign unique attribute values (e.g. component number) via the attribute palette so siblings don’t share a Name.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Rename elements to follow the project’s BEP naming pattern (usually defined in the EIR / ISO 19650 information requirements).',
      tools: {
        revit:
          'Standardise type names and the parameter mapped to IfcName to match the BEP. Use a shared parameter or a Dynamo script for bulk renaming, then map it to IfcName on export.',
        archicad:
          'Apply the standard via the ID Manager and align the property mapped to IfcName (Classification & Properties palette) with the BEP.',
        tekla:
          'Configure the numbering series and part naming to match the BEP, then re-run numbering.',
        allplan:
          'Use attribute templates / favourites to enforce the BEP naming and map that attribute to IfcName on export.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Every element must have a unique GlobalId. This tool can auto-fix duplicates (click Apply fix); to prevent it at the source, fix the export workflow below.',
      tools: {
        revit:
          'Duplicate GUIDs usually come from copy/pasting elements between models or across linked files. Avoid duplicating elements across exported models and re-export from a clean copy. For grouped or mirrored elements sharing an IfcGUID parameter, clear that parameter so Revit regenerates a unique value.',
        archicad:
          'Duplicate GUIDs typically arise from copying elements between projects or merging modules. Re-generate unique IDs (Design ▸ Element ID Manager) and avoid copying elements across files without regenerating GlobalIds.',
        tekla:
          'Duplicate GUIDs come from copied objects across models. Re-export from the source model — Tekla assigns a unique GUID per object at creation.',
        allplan:
          'Duplicate GUIDs come from copying objects between documents. Recreate or re-export the affected objects so Allplan regenerates unique GlobalIds.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'GlobalId must be a 22-character IFC base-64 string. This tool can auto-fix the format; at the source, avoid post-processing that rewrites GUIDs.',
      tools: {
        revit:
          'Revit writes compliant IfcGUIDs by default. Invalid formats usually come from third-party scripts or a manually edited IfcGUID parameter — clear the parameter so Revit regenerates a valid 22-character GUID on export.',
        archicad:
          'ARCHICAD generates compliant GlobalIds. Invalid values usually come from external edits or add-ons; regenerate IDs or re-export without the offending add-on.',
        tekla:
          'Tekla writes valid GUIDs natively; invalid values typically come from interop scripts — re-export from the native model.',
        allplan:
          'Allplan generates valid GlobalIds; if invalid, recreate or re-export the affected objects.',
      },
    },
    // ── Structure & hierarchy ────────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Place the element inside a spatial container (storey or space) so it appears in the model tree and in downstream tools.',
      tools: {
        revit:
          'Orphans come from elements not assigned to a Level (groups, imported geometry, unhosted elements). Assign the element to a Level so Revit exports it inside an IfcBuildingStorey.',
        archicad:
          'Check the element’s Home Story setting — elements with no home story export as orphans. Assign one.',
        tekla:
          'Assign the part to the phase/level structure used by the IFC export so it receives a spatial container; check the export’s spatial structure settings.',
        allplan:
          'Assign the element to a storey node in the building structure palette so it isn’t exported orphaned.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Move the element into the correct spatial container — physical building elements belong in a storey (or space), not directly under Site or Project.',
      tools: {
        revit:
          'Reassign the element to a building Level. Site components and topography are fine at site scope, but building elements must sit on a Level.',
        archicad:
          'Set the element’s Home Story to the correct storey; avoid placing building elements at site scope.',
        tekla:
          'Adjust the spatial container mapping in the IFC export so parts land in the correct storey rather than the site.',
        allplan:
          'Move the object to the correct storey node in the building structure.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Fix the broken aggregation relationship — this is almost always an export/interop artefact, so re-export from the authoring tool.',
      tools: {
        revit:
          'Re-export with an up-to-date IFC exporter. If it persists, audit the model (Manage ▸ Purge Unused) and check for corrupt groups or assemblies.',
        archicad:
          'Re-export with the latest ARCHICAD IFC add-on; run a model check if corruption persists.',
        tekla:
          'Re-export from Tekla — broken aggregates indicate an interop fault, not a modelling error.',
        allplan:
          'Re-export from Allplan with an up-to-date IFC interface.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Ensure the spatial structure follows Project ▸ Site ▸ Building ▸ Storey. Fix it in the authoring tool’s project setup before export.',
      tools: {
        revit:
          'Revit builds this hierarchy automatically from Project ▸ Site ▸ Building ▸ Levels. A broken hierarchy usually means missing Levels or a custom export — verify Levels exist and use the default IFC site/building assignment.',
        archicad:
          'Check the hierarchy in the IFC Translator and Story Settings: stories under the building, building under the site.',
        tekla:
          'Configure the full spatial hierarchy (project/site/building/storey) in the IFC export dialog so it is complete and correctly ordered.',
        allplan:
          'Define the full building structure (project/site/building/storey) in the structure palette before exporting.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Remove the circular relationship — an element cannot be its own ancestor. This is an export/interop artefact; re-export from a clean copy.',
      tools: {
        revit:
          'Re-export with an up-to-date IFC exporter from a clean copy; if it persists, audit and purge the model.',
        archicad:
          'Re-export with the latest IFC add-on; run a model check to find the offending relationship.',
        tekla:
          'Re-export from the native model — Tekla does not normally create reference cycles.',
        allplan:
          'Re-export from Allplan; recreate the affected objects if the cycle persists.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Place the element inside a storey rather than directly under the building.',
      tools: {
        revit:
          'Assign the element to a Level so it exports under an IfcBuildingStorey instead of the building.',
        archicad:
          'Set the element’s Home Story so it isn’t placed at building scope.',
        tekla:
          'Map the part to a storey in the IFC export spatial settings.',
        allplan:
          'Move the object to a storey node in the building structure.',
      },
    },
    // ── Properties & types ───────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Associate the element with a type (IfcWallType, IfcDoorType, …) so type properties and quantities propagate.',
      tools: {
        revit:
          'Revit family types export as IfcTypeObjects automatically. Missing types usually mean in-place families or generic models — convert them to loadable families with defined types, and keep type export enabled in the IFC options.',
        archicad:
          'Use favourites / building materials and keep "Type Product" export enabled in the IFC Translator so element types are written.',
        tekla:
          'Assign a profile and material so the part exports with a type; verify the IFC export writes type objects.',
        allplan:
          'Use library objects / SmartParts with defined types and enable type export in the IFC interface.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Add the required property set(s) defined by the project’s BEP/EIR to the element before export.',
      tools: {
        revit:
          'Add the missing parameters and map them to the required Pset via a User Defined PropertySets file referenced in the IFC export setup.',
        archicad:
          'Define the required Pset in the Property Manager, assign it to the relevant classifications, and map it in the IFC Translator.',
        tekla:
          'Add the properties as UDAs and map them to the required Pset in the IFC export additional property sets.',
        allplan:
          'Create the attributes and map them to the required Pset in the IFC export configuration.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Fill in the empty property value — an empty property is treated as missing by downstream checks.',
      tools: {
        revit:
          'Find the parameter and enter a value (or remove the empty parameter). A schedule is the fastest way to find and fill blanks in bulk.',
        archicad:
          'Use the Property Manager or an interactive schedule to find and populate empty property values.',
        tekla:
          'Populate the empty UDA values via the inquire/report tools before export.',
        allplan:
          'Fill the empty attribute values via the attribute palette or a list before export.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Assign a material to the element so it carries material data (expected from LOD 200/300 onward).',
      tools: {
        revit:
          'Assign a material to the element’s structure (Edit Type ▸ Structure, or the Material parameter). Revit exports defined materials as IfcMaterial / layer sets.',
        archicad:
          'Assign a Building Material (not just a surface) to the element; ARCHICAD exports Building Materials as IfcMaterial.',
        tekla:
          'Set the part material in the part properties; Tekla exports it as the associated IFC material.',
        allplan:
          'Assign a material/format attribute to the element so it exports with a material association.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Export to a current IFC schema (IFC4 / IFC4.3) unless the recipient explicitly requires IFC2x3.',
      tools: {
        revit:
          'In the IFC export dialog, set File Version to IFC4 (e.g. Reference View or Design Transfer View) instead of IFC2x3.',
        archicad:
          'In the IFC Translator, choose an IFC4-based export preset instead of IFC2x3.',
        tekla:
          'In the IFC export, select the IFC4 export type rather than IFC2x3.',
        allplan:
          'Select IFC4 (or IFC4.3) as the export schema in the IFC interface settings.',
      },
    },
    // ── Clash ────────────────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Resolve the geometric clash between elements in the authoring tool — move, trim, or join the conflicting elements.',
      tools: {
        revit:
          'Run Collaborate ▸ Interference Check to locate clashes, then move/trim/join the elements to resolve the overlap.',
        archicad:
          'Use Design ▸ Collision Detection to find overlaps, then adjust the conflicting elements.',
        tekla:
          'Use Manage ▸ Clash Check to find and resolve overlapping parts.',
        allplan:
          'Use the collision check to locate overlaps and adjust the conflicting elements.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Resolve the MEP-vs-structure clash — reroute the MEP run or coordinate a penetration/sleeve with the structural model.',
      tools: {
        revit:
          'Run Interference Check between the MEP and structural categories, then reroute services or add coordinated openings/sleeves.',
        archicad:
          'Use Collision Detection between MEP and structural elements, then reroute or add openings.',
        tekla:
          'Run a clash check against the linked MEP reference model and add penetrations/openings where needed.',
        allplan:
          'Use collision check between MEP and structure and reroute or add openings.',
      },
    },
    // ── File header & project metadata ───────────────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Every IFC must contain exactly one IfcProject. A missing project means a broken export — re-export the full model.',
      tools: {
        revit:
          'Revit always writes an IfcProject. A missing one indicates a corrupt or partial export — re-export the full model rather than an isolated selection.',
        archicad:
          'Re-export the project; export the model, not an isolated element set that drops the project root.',
        tekla:
          'Re-export the full model so the IfcProject root is written.',
        allplan:
          'Re-export from the project so the IfcProject entity is included.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Add a building to the spatial structure — define an IfcBuilding in the authoring tool’s project setup.',
      tools: {
        revit:
          'Revit creates the building automatically; a missing one usually means a site-only custom export. Verify the project has Levels and use the default building assignment in the IFC options.',
        archicad:
          'Ensure a building exists in the project hierarchy / IFC Translator and that stories sit under it.',
        tekla:
          'Define the building in the IFC export spatial structure settings.',
        allplan:
          'Add a building node in the building structure palette.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Add at least one storey (level) under the building.',
      tools: {
        revit:
          'Create Levels in the project; Revit exports Levels as IfcBuildingStoreys. A model with no Levels exports no storeys.',
        archicad:
          'Define stories via Design ▸ Story Settings so the building has storeys.',
        tekla:
          'Define levels/storeys in the IFC export spatial settings.',
        allplan:
          'Add storey nodes under the building in the structure palette.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Populate the empty storey or remove it — empty storeys clutter the spatial tree and often signal mis-assigned elements.',
      tools: {
        revit:
          'Delete unused Levels, or check that elements meant for that Level are assigned to it (not a neighbouring Level).',
        archicad:
          'Remove the unused story or reassign elements’ Home Story so the storey isn’t empty.',
        tekla:
          'Remove the empty level from the export or reassign parts to it.',
        allplan:
          'Delete the empty storey node or reassign objects to it.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Give every storey a defined elevation — it is required to place levels vertically and to generate floor plans.',
      tools: {
        revit:
          'Levels always carry an elevation in Revit; a null usually means a custom export. Verify Levels have numeric elevations and use the default IFC level export.',
        archicad:
          'Set each story’s elevation in Design ▸ Story Settings so it isn’t null.',
        tekla:
          'Ensure each level has a defined elevation in the level/grid settings before export.',
        allplan:
          'Define each storey’s height/elevation in the building structure so it exports a value.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Set the file description (usually the MVD / view definition) in the export options — it is part of the STEP header metadata.',
      tools: {
        revit:
          'FILE_DESCRIPTION is set from the chosen MVD (e.g. Reference View). Selecting a proper export setup in the IFC dialog populates it.',
        archicad:
          'The IFC Translator’s MVD selection populates FILE_DESCRIPTION; choose a defined export preset.',
        tekla:
          'The export type / MVD sets FILE_DESCRIPTION; choose a defined IFC export configuration.',
        allplan:
          'Select a defined IFC export preset so the file description / MVD is written.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Fill in the author and organisation in the export or project info — required for traceability (ISO 19650).',
      tools: {
        revit:
          'Set the author in the IFC export setup (Modify setup) or in Manage ▸ Project Information; this populates the STEP FILE_NAME author field.',
        archicad:
          'Set author and company in File ▸ Info ▸ Project Info and the IFC Translator so they are written to the header.',
        tekla:
          'Set the author/organisation in the IFC export advanced settings.',
        allplan:
          'Set author/organisation in the project info / IFC export settings.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Set the project long name (the descriptive project title) in the authoring tool’s project information.',
      tools: {
        revit:
          'Set Project Name / Project Issue Name in Manage ▸ Project Information and map it to IfcProject.LongName in the IFC export setup.',
        archicad:
          'Set the project name/description in File ▸ Info ▸ Project Info; the IFC Translator maps it to IfcProject.LongName.',
        tekla:
          'Set the project name in Project properties and map it to IfcProject.LongName in the export.',
        allplan:
          'Set the project name/description in project info so IfcProject.LongName is populated.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Complete the project metadata (long name, description, project phase/type) required by ISO 19650 information requirements.',
      tools: {
        revit:
          'Fill Project Name, Description and status/phase in Manage ▸ Project Information and map them to the IfcProject fields in the IFC export setup.',
        archicad:
          'Complete the project info in File ▸ Info ▸ Project Info and map the fields in the IFC Translator.',
        tekla:
          'Complete the project properties and map them to the IfcProject fields in the export.',
        allplan:
          'Complete the project info so IfcProject carries LongName, Description and ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Add both the author and the organisation to the export so the deliverable is traceable per ISO 19650.',
      tools: {
        revit:
          'Set author and organisation in the IFC export setup / Project Information so both appear in the STEP header.',
        archicad:
          'Set author and company in Project Info and the IFC Translator.',
        tekla:
          'Set author and organisation in the IFC export advanced settings.',
        allplan:
          'Set author and organisation in the project / IFC export settings.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Name the export file using the ISO 19650 pattern: Project-Originator-Volume-Level-Type-Role-Number.',
      tools: {
        revit:
          'Revit takes the filename from the export Save dialog — name the file per the ISO 19650 pattern when exporting (or rename it afterwards).',
        archicad:
          'Set the filename per the ISO 19650 pattern in the export dialog, or rename the exported file.',
        tekla:
          'Name the IFC output per the ISO 19650 pattern in the export dialog.',
        allplan:
          'Name the exported file per the ISO 19650 pattern in the export dialog.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Add the property sets required at the declared LOD/LOIN level (per the project’s information delivery plan).',
      tools: {
        revit:
          'Map the LOD-required parameters to their Psets via a User Defined PropertySets file in the IFC export, and ensure the elements actually carry those parameters.',
        archicad:
          'Define the LOD Psets in the Property Manager, assign them to the relevant classifications, and map them in the IFC Translator.',
        tekla:
          'Add the LOD-required properties as UDAs and map them to the Psets in the export.',
        allplan:
          'Create the LOD attributes and map them to the required Psets in the IFC export.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Enable base-quantity export so elements carry IfcElementQuantity (area/volume/length) at the declared LOD.',
      tools: {
        revit:
          'Enable "Export base quantities" in the IFC export options; Revit then writes IfcElementQuantity for elements.',
        archicad:
          'Enable base-quantity export in the IFC Translator’s settings.',
        tekla:
          'Enable quantity / base-quantity export in the IFC export configuration.',
        allplan:
          'Enable base quantities in the IFC export settings.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Define layered construction on walls and slabs so they export an IfcMaterialLayerSetUsage at LOD 300+.',
      tools: {
        revit:
          'Define the wall/floor Type’s Structure layers (Edit Type ▸ Structure) with materials; Revit exports compound structures as IfcMaterialLayerSet.',
        archicad:
          'Use Composite structures (not a single Building Material) for walls/slabs so layers export as an IfcMaterialLayerSet.',
        tekla:
          'Tekla parts are typically single-material; for layered elements define the layers/materials so the layer set exports, or confirm this rule applies to your discipline.',
        allplan:
          'Use multi-layer components so the material layer set is exported.',
      },
    },
    // ── Classification ───────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Attach a classification reference (Uniclass, OmniClass, etc.) so the element carries its standard code as IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Use a classification add-in (e.g. the free Classification Manager for Revit) to assign a Uniclass/OmniClass code, or map a shared parameter to IfcClassificationReference in the IFC export setup. Without a mapping Revit exports no classification.',
        archicad:
          'Open the Classification & Properties palette, choose a classification system (built-in or imported), and assign the element a classification item. ARCHICAD exports these as IfcClassificationReference automatically.',
        tekla:
          'Assign the classification via a UDA or the Tekla–IFC property mapping, then map that attribute to IfcClassificationReference in the IFC export additional property sets.',
        allplan:
          'Assign the classification code through the object attributes and ensure the IFC export configuration maps it to IfcClassificationReference.',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Assign MEP elements to a system so they export inside an IfcSystem — needed for system-based coordination.',
      tools: {
        revit:
          'Ensure ducts/pipes/equipment belong to a named Revit System; unassigned elements export with no IfcSystem. Use the System Browser to find and assign them.',
        archicad:
          'Assign MEP elements to an MEP system in the MEP Modeler so they export within an IfcSystem.',
        allplan:
          'Assign MEP objects to a system/network so they export inside an IfcSystem.',
      },
    },
    // ── Geometry & file health ───────────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Reduce IfcBuildingElementProxy elements by mapping them to proper IFC classes — proxies carry no semantic type.',
      tools: {
        revit:
          'Proxies come from in-place families, generic models, or unmapped categories. Use the IFC export class mapping table to map those categories to real IFC types instead of IfcBuildingElementProxy, and convert in-place families to loadable families.',
        archicad:
          'Assign proper classifications / IFC types to objects (especially Morphs and custom objects) so they don’t export as proxies.',
        tekla:
          'Map custom or proxy parts to the correct IFC entity in the IFC export settings.',
        allplan:
          'Assign the correct IFC type to generic objects so they aren’t exported as proxies.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Keep the model near the internal origin and georeference it properly, instead of modelling at large real-world coordinates.',
      tools: {
        revit:
          'Don’t model far from Revit’s internal origin. Use Shared Coordinates with a Survey Point / Project Base Point and export with current shared coordinates so geometry stays near origin while georeferencing is preserved.',
        archicad:
          'Set the Survey Point and Project Origin; keep the model near origin and use IFC georeferencing (IfcMapConversion) instead of a large offset.',
        tekla:
          'Set the base/work point and keep the model near origin; use the IFC export base point so coordinates aren’t huge.',
        allplan:
          'Set a project georeferencing/base point and keep geometry near origin rather than at real-world coordinates.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Reduce file weight: lower tessellation/detail, avoid embedded textures, and export only what is needed.',
      tools: {
        revit:
          'Lower the level of detail for export, avoid exporting imported CAD and very high-poly families, and split disciplines. The Reference View MVD produces lighter tessellated geometry.',
        archicad:
          'Reduce curve/segment resolution, avoid embedding textures, use a lean IFC Translator preset, and export only the needed elements.',
        tekla:
          'Reduce the export geometry detail/representation and avoid exporting reference models unnecessarily.',
        allplan:
          'Lower the geometry resolution and avoid embedding textures in the IFC export.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Re-host or delete orphan IfcOpeningElement voids — every opening must cut a host element through IfcRelVoidsElement.',
      tools: {
        revit:
          'Orphan openings come from deleted/edited hosts or loosely exported shaft openings. Delete stray openings and recreate the void on its host (wall/floor/roof) so the relationship exports, and re-host doors/windows if the cut was lost.',
        archicad:
          'Openings must belong to a wall or slab. Remove free-standing opening objects and use the Opening tool (or door/window) anchored to the host so ArchiCAD exports IfcRelVoidsElement.',
        tekla:
          'Recreate the cut/opening as a feature of its host part instead of a loose object, so the void references a host on export.',
        allplan:
          'Place openings with the wall/slab opening tools so they belong to a host; delete detached opening solids.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Give each IfcBuildingStorey a distinct Elevation — levels at the same height break plan generation and storey filtering.',
      tools: {
        revit:
          'Two levels share the same elevation. In the Levels view give each Level a unique elevation (or delete the duplicate), and export only true building storeys as levels (turn off “Building Story”/export on the others).',
        archicad:
          'Open Story Settings and set a unique elevation per story; merge or delete duplicated stories at the same height.',
        tekla:
          'In the level/phase list assign a unique elevation to each level used for the IFC storey structure and remove duplicates.',
        allplan:
          'In the building structure set distinct heights per storey and remove duplicate storeys that resolve to the same elevation.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Order storeys so their Elevation rises from bottom to top — out-of-order levels confuse section/plan tools and reviewers.',
      tools: {
        revit:
          'A lower level has a higher elevation (or vice versa). Fix the level elevations or the export order so storeys read bottom-to-top, and check basement/roof levels with negative elevations.',
        archicad:
          'In Story Settings fix the height of any out-of-sequence story so elevations rise with the story index.',
        tekla:
          'Reorder/renumber the levels so their elevations ascend; correct any level whose height contradicts its position.',
        allplan:
          'In the building structure reorder storeys or fix their heights so elevations increase upward.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Export in SI metric (millimetres/metres) — imperial length units break interoperability with most IFC/BIM tools.',
      tools: {
        revit:
          'Revit’s internal units are imperial but IFC should be metric. Set Project Units to metric (or confirm the IFC export uses SI/metric) so the file’s IFCSIUNIT is metre-based.',
        archicad:
          'Set the project Working Units (and Calculation Units) to metric so the IFC schema exports SI length units.',
        tekla:
          'Switch the environment/role or export settings to metric so the IFC LENGTHUNIT is SI (mm/m).',
        allplan:
          'Set the length units to metric in the project options so the IFC export uses SI units.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Add area quantities to IfcSpace — export BaseQuantities so each space carries NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'Rooms export as IfcSpace but quantities are missing. Enable “Export base quantities” (Pset/QTO) in the IFC export options and make sure Rooms are properly bounded/placed so areas compute.',
        archicad:
          'Use Zones for spaces and enable Base Quantities in the IFC Translator so IfcSpace exports NetFloorArea/GrossFloorArea.',
        tekla:
          'Spaces are limited in Tekla; if required, define them and enable quantity export, or generate them in the architectural model.',
        allplan:
          'Create Rooms (spaces) and enable IFC quantity export so IfcSpace carries area quantities.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Connect MEP segments through ports — disconnected pipes/ducts export without IfcDistributionPort relationships and break system tracing.',
      tools: {
        revit:
          'Disconnected ducts/pipes export without ports. Fix open connectors in the MEP model (no gaps/loose ends), keep segments joined into connected systems, and enable system/port export so IfcDistributionPort relationships are written.',
        archicad:
          'Use the MEP Modeler so routes stay connected end-to-end; export MEP systems to include ports/connections.',
        tekla:
          'MEP is not Tekla’s domain; model connected MEP in the dedicated MEP tool so segments carry ports, then federate.',
        allplan:
          'Model MEP runs connected end-to-end (no open ends) so the IFC export writes distribution ports between segments.',
      },
    },
  },
  es: {
    // ── Nomenclatura e identidad ─────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Asigna un Nombre significativo al elemento para que sea identificable en tablas de planificación, el árbol del modelo y la coordinación posterior.',
      tools: {
        revit:
          'Revit asigna el Nombre de Tipo de la familia al IfcName en la exportación. Abre las Propiedades de tipo del elemento y dale al tipo un nombre descriptivo en lugar del valor por defecto (p. ej. renombra "Basic Wall 1"). Para nombrar a nivel de ejemplar, asigna un parámetro compartido a IfcName en la tabla de mapeo de exportación IFC.',
        archicad:
          'Selecciona el elemento y abre el Gestor IFC (clic derecho ▸ Gestor IFC) o la paleta de Clasificación y Propiedades; define ahí IfcRoot.Name, o configura el mapeo en los ajustes de propiedades del Traductor IFC antes de exportar.',
        tekla:
          'El campo Name de la pieza se asigna al IfcName. Abre las propiedades de la pieza, introduce un Name y confirma que el ajuste de exportación IFC asigna ese atributo a IfcName.',
        allplan:
          'Asigna un atributo que Allplan mapee a IfcName mediante la paleta de Propiedades, o define el mapeo de IfcName en la configuración de exportación IFC.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Define el LongName en espacios, plantas y el edificio: contiene el nombre legible de la sala/nivel que se usa en tablas y en COBie.',
      tools: {
        revit:
          'Para espacios, define el Nombre de Habitación/Área (Revit asigna Nombre de Habitación → IfcLongName y Número de Habitación → IfcName). Para plantas, da a cada Nivel un Nombre descriptivo. Para el edificio, define el nombre en las opciones de exportación IFC.',
        archicad:
          'Define el Nombre de Zona en los espacios (se asigna a IfcLongName) y nombra las plantas en Diseño ▸ Configuración de plantas. Define el nombre largo del edificio en Archivo ▸ Info ▸ Info del proyecto / el Traductor IFC.',
        tekla:
          'Los espacios y plantas rara vez se modelan en Tekla; cuando existan, define el Name/UDA asignado a IfcLongName, o define los nombres de planta en los ajustes espaciales de la exportación IFC.',
        allplan:
          'Define el nombre de la sala (se asigna a IfcLongName), nombra las plantas en la estructura del edificio y define el nombre largo del edificio en la exportación IFC.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Haz que los nombres de elementos hermanos sean únicos (o apóyate en tipo + número de ejemplar) para que se distingan en tablas y coordinación.',
      tools: {
        revit:
          'Los nombres duplicados suelen venir de nombres de tipo o marcas idénticos. Usa el parámetro de ejemplar Marca (único por elemento) o renombra los tipos, y resuelve las advertencias de Marca duplicada de Revit.',
        archicad:
          'Usa el Gestor de ID (Documento ▸ Gestor de ID) para asignar automáticamente ID de elemento únicos y que los hermanos no compartan Nombre.',
        tekla:
          'Ejecuta la numeración (Dibujos e informes ▸ Numeración) para que cada pieza obtenga una marca de posición/pieza única asignada al Name.',
        allplan:
          'Asigna valores de atributo únicos (p. ej. número de componente) mediante la paleta de atributos para que los hermanos no compartan Nombre.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Renombra los elementos para seguir el patrón de nomenclatura del BEP del proyecto (normalmente definido en el EIR / requisitos de información ISO 19650).',
      tools: {
        revit:
          'Normaliza los nombres de tipo y el parámetro asignado a IfcName para que coincidan con el BEP. Usa un parámetro compartido o un script de Dynamo para renombrar en lote, y luego asígnalo a IfcName en la exportación.',
        archicad:
          'Aplica el estándar mediante el Gestor de ID y alinea la propiedad asignada a IfcName (paleta de Clasificación y Propiedades) con el BEP.',
        tekla:
          'Configura la serie de numeración y el nombrado de piezas para que coincidan con el BEP, y vuelve a ejecutar la numeración.',
        allplan:
          'Usa plantillas de atributos / favoritos para imponer la nomenclatura del BEP y asigna ese atributo a IfcName en la exportación.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Cada elemento debe tener un GlobalId único. Esta herramienta puede corregir duplicados automáticamente (pulsa Aplicar corrección); para evitarlo en origen, corrige el flujo de exportación indicado abajo.',
      tools: {
        revit:
          'Los GUID duplicados suelen venir de copiar y pegar elementos entre modelos o entre archivos vinculados. Evita duplicar elementos entre modelos exportados y vuelve a exportar desde una copia limpia. Para elementos agrupados o reflejados que comparten un parámetro IfcGUID, borra ese parámetro para que Revit regenere un valor único.',
        archicad:
          'Los GUID duplicados suelen surgir al copiar elementos entre proyectos o fusionar módulos. Regenera ID únicos (Diseño ▸ Gestor de ID de elemento) y evita copiar elementos entre archivos sin regenerar los GlobalId.',
        tekla:
          'Los GUID duplicados vienen de objetos copiados entre modelos. Vuelve a exportar desde el modelo origen: Tekla asigna un GUID único por objeto al crearlo.',
        allplan:
          'Los GUID duplicados vienen de copiar objetos entre documentos. Recrea o vuelve a exportar los objetos afectados para que Allplan regenere GlobalId únicos.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'El GlobalId debe ser una cadena IFC base-64 de 22 caracteres. Esta herramienta puede corregir el formato automáticamente; en origen, evita el posprocesado que reescribe GUID.',
      tools: {
        revit:
          'Revit escribe IfcGUID conformes por defecto. Los formatos no válidos suelen venir de scripts de terceros o de un parámetro IfcGUID editado a mano: borra el parámetro para que Revit regenere un GUID válido de 22 caracteres al exportar.',
        archicad:
          'ARCHICAD genera GlobalId conformes. Los valores no válidos suelen venir de ediciones externas o complementos; regenera los ID o vuelve a exportar sin el complemento problemático.',
        tekla:
          'Tekla escribe GUID válidos de forma nativa; los valores no válidos suelen venir de scripts de interoperabilidad: vuelve a exportar desde el modelo nativo.',
        allplan:
          'Allplan genera GlobalId válidos; si no lo son, recrea o vuelve a exportar los objetos afectados.',
      },
    },
    // ── Estructura y jerarquía ───────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Coloca el elemento dentro de un contenedor espacial (planta o espacio) para que aparezca en el árbol del modelo y en las herramientas posteriores.',
      tools: {
        revit:
          'Los huérfanos vienen de elementos no asignados a un Nivel (grupos, geometría importada, elementos sin anfitrión). Asigna el elemento a un Nivel para que Revit lo exporte dentro de un IfcBuildingStorey.',
        archicad:
          'Comprueba el ajuste de Planta de origen del elemento: los elementos sin planta de origen se exportan como huérfanos. Asígnale una.',
        tekla:
          'Asigna la pieza a la estructura de fase/nivel que usa la exportación IFC para que reciba un contenedor espacial; revisa los ajustes de estructura espacial de la exportación.',
        allplan:
          'Asigna el elemento a un nodo de planta en la paleta de estructura del edificio para que no se exporte huérfano.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Mueve el elemento al contenedor espacial correcto: los elementos físicos del edificio pertenecen a una planta (o espacio), no directamente bajo el Emplazamiento o el Proyecto.',
      tools: {
        revit:
          'Reasigna el elemento a un Nivel del edificio. Los componentes de emplazamiento y la topografía pueden estar a nivel de emplazamiento, pero los elementos del edificio deben estar en un Nivel.',
        archicad:
          'Define la Planta de origen del elemento en la planta correcta; evita colocar elementos del edificio a nivel de emplazamiento.',
        tekla:
          'Ajusta el mapeo del contenedor espacial en la exportación IFC para que las piezas vayan a la planta correcta y no al emplazamiento.',
        allplan:
          'Mueve el objeto al nodo de planta correcto en la estructura del edificio.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Corrige la relación de agregación rota: casi siempre es un artefacto de exportación/interoperabilidad, así que vuelve a exportar desde la herramienta de autoría.',
      tools: {
        revit:
          'Vuelve a exportar con un exportador IFC actualizado. Si persiste, audita el modelo (Gestionar ▸ Purgar no utilizados) y busca grupos o ensamblajes corruptos.',
        archicad:
          'Vuelve a exportar con el complemento IFC de ARCHICAD más reciente; ejecuta una comprobación del modelo si la corrupción persiste.',
        tekla:
          'Vuelve a exportar desde Tekla: las agregaciones rotas indican un fallo de interoperabilidad, no un error de modelado.',
        allplan:
          'Vuelve a exportar desde Allplan con una interfaz IFC actualizada.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Asegura que la estructura espacial siga Proyecto ▸ Emplazamiento ▸ Edificio ▸ Planta. Corrígelo en la configuración del proyecto de la herramienta de autoría antes de exportar.',
      tools: {
        revit:
          'Revit construye esta jerarquía automáticamente a partir de Proyecto ▸ Emplazamiento ▸ Edificio ▸ Niveles. Una jerarquía rota suele indicar Niveles ausentes o una exportación personalizada: verifica que existan Niveles y usa la asignación de emplazamiento/edificio IFC por defecto.',
        archicad:
          'Comprueba la jerarquía en el Traductor IFC y en la Configuración de plantas: las plantas bajo el edificio, el edificio bajo el emplazamiento.',
        tekla:
          'Configura la jerarquía espacial completa (proyecto/emplazamiento/edificio/planta) en el diálogo de exportación IFC para que esté completa y bien ordenada.',
        allplan:
          'Define la estructura completa del edificio (proyecto/emplazamiento/edificio/planta) en la paleta de estructura antes de exportar.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Elimina la relación circular: un elemento no puede ser su propio ancestro. Es un artefacto de exportación/interoperabilidad; vuelve a exportar desde una copia limpia.',
      tools: {
        revit:
          'Vuelve a exportar con un exportador IFC actualizado desde una copia limpia; si persiste, audita y purga el modelo.',
        archicad:
          'Vuelve a exportar con el complemento IFC más reciente; ejecuta una comprobación del modelo para encontrar la relación problemática.',
        tekla:
          'Vuelve a exportar desde el modelo nativo: Tekla normalmente no crea ciclos de referencia.',
        allplan:
          'Vuelve a exportar desde Allplan; recrea los objetos afectados si el ciclo persiste.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Coloca el elemento dentro de una planta en lugar de directamente bajo el edificio.',
      tools: {
        revit:
          'Asigna el elemento a un Nivel para que se exporte bajo un IfcBuildingStorey en lugar del edificio.',
        archicad:
          'Define la Planta de origen del elemento para que no quede a nivel de edificio.',
        tekla:
          'Asigna la pieza a una planta en los ajustes espaciales de la exportación IFC.',
        allplan:
          'Mueve el objeto a un nodo de planta en la estructura del edificio.',
      },
    },
    // ── Propiedades y tipos ──────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Asocia el elemento a un tipo (IfcWallType, IfcDoorType, …) para que se propaguen las propiedades y cantidades de tipo.',
      tools: {
        revit:
          'Los tipos de familia de Revit se exportan como IfcTypeObject automáticamente. La falta de tipos suele indicar familias in situ o modelos genéricos: conviértelos en familias cargables con tipos definidos y mantén activada la exportación de tipos en las opciones IFC.',
        archicad:
          'Usa favoritos / materiales de construcción y mantén activada la exportación de "Type Product" en el Traductor IFC para que se escriban los tipos de elemento.',
        tekla:
          'Asigna un perfil y un material para que la pieza se exporte con un tipo; verifica que la exportación IFC escriba objetos de tipo.',
        allplan:
          'Usa objetos de biblioteca / SmartParts con tipos definidos y activa la exportación de tipos en la interfaz IFC.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Añade al elemento el conjunto o conjuntos de propiedades requeridos por el BEP/EIR del proyecto antes de exportar.',
      tools: {
        revit:
          'Añade los parámetros que faltan y asígnalos al Pset requerido mediante un archivo de User Defined PropertySets referenciado en la configuración de exportación IFC.',
        archicad:
          'Define el Pset requerido en el Gestor de propiedades, asígnalo a las clasificaciones pertinentes y mapéalo en el Traductor IFC.',
        tekla:
          'Añade las propiedades como UDA y asígnalas al Pset requerido en los conjuntos de propiedades adicionales de la exportación IFC.',
        allplan:
          'Crea los atributos y asígnalos al Pset requerido en la configuración de exportación IFC.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Rellena el valor de propiedad vacío: las comprobaciones posteriores tratan una propiedad vacía como ausente.',
      tools: {
        revit:
          'Localiza el parámetro e introduce un valor (o elimina el parámetro vacío). Una tabla de planificación es la forma más rápida de encontrar y rellenar huecos en lote.',
        archicad:
          'Usa el Gestor de propiedades o una tabla interactiva para encontrar y rellenar los valores de propiedad vacíos.',
        tekla:
          'Rellena los valores de UDA vacíos mediante las herramientas de consulta/informe antes de exportar.',
        allplan:
          'Rellena los valores de atributo vacíos mediante la paleta de atributos o una lista antes de exportar.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Asigna un material al elemento para que porte datos de material (esperado a partir de LOD 200/300).',
      tools: {
        revit:
          'Asigna un material a la estructura del elemento (Editar tipo ▸ Estructura, o el parámetro Material). Revit exporta los materiales definidos como IfcMaterial / conjuntos de capas.',
        archicad:
          'Asigna un Material de construcción (no solo una superficie) al elemento; ARCHICAD exporta los Materiales de construcción como IfcMaterial.',
        tekla:
          'Define el material de la pieza en sus propiedades; Tekla lo exporta como el material IFC asociado.',
        allplan:
          'Asigna un atributo de material/formato al elemento para que se exporte con una asociación de material.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Exporta a un esquema IFC actual (IFC4 / IFC4.3) salvo que el destinatario exija explícitamente IFC2x3.',
      tools: {
        revit:
          'En el diálogo de exportación IFC, establece la Versión de archivo en IFC4 (p. ej. Reference View o Design Transfer View) en lugar de IFC2x3.',
        archicad:
          'En el Traductor IFC, elige un preajuste de exportación basado en IFC4 en lugar de IFC2x3.',
        tekla:
          'En la exportación IFC, selecciona el tipo de exportación IFC4 en lugar de IFC2x3.',
        allplan:
          'Selecciona IFC4 (o IFC4.3) como esquema de exportación en los ajustes de la interfaz IFC.',
      },
    },
    // ── Interferencias ───────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Resuelve la interferencia geométrica entre elementos en la herramienta de autoría: mueve, recorta o une los elementos en conflicto.',
      tools: {
        revit:
          'Ejecuta Colaborar ▸ Comprobación de interferencias para localizar interferencias y luego mueve/recorta/une los elementos para resolver el solape.',
        archicad:
          'Usa Diseño ▸ Detección de colisiones para encontrar solapes y luego ajusta los elementos en conflicto.',
        tekla:
          'Usa Gestionar ▸ Comprobación de interferencias para encontrar y resolver piezas solapadas.',
        allplan:
          'Usa la comprobación de colisiones para localizar solapes y ajustar los elementos en conflicto.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Resuelve la interferencia MEP-estructura: redirige el trazado MEP o coordina una penetración/pasamuros con el modelo estructural.',
      tools: {
        revit:
          'Ejecuta la Comprobación de interferencias entre las categorías MEP y estructurales, y luego redirige las instalaciones o añade aberturas/pasamuros coordinados.',
        archicad:
          'Usa la Detección de colisiones entre elementos MEP y estructurales, y luego redirige o añade aberturas.',
        tekla:
          'Ejecuta una comprobación de interferencias contra el modelo de referencia MEP vinculado y añade penetraciones/aberturas donde sea necesario.',
        allplan:
          'Usa la comprobación de colisiones entre MEP y estructura y redirige o añade aberturas.',
      },
    },
    // ── Cabecera de archivo y metadatos del proyecto ─────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Todo IFC debe contener exactamente un IfcProject. Que falte indica una exportación rota: vuelve a exportar el modelo completo.',
      tools: {
        revit:
          'Revit siempre escribe un IfcProject. Que falte indica una exportación corrupta o parcial: vuelve a exportar el modelo completo en lugar de una selección aislada.',
        archicad:
          'Vuelve a exportar el proyecto; exporta el modelo, no un conjunto de elementos aislado que prescinda de la raíz del proyecto.',
        tekla:
          'Vuelve a exportar el modelo completo para que se escriba la raíz IfcProject.',
        allplan:
          'Vuelve a exportar desde el proyecto para que se incluya la entidad IfcProject.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Añade un edificio a la estructura espacial: define un IfcBuilding en la configuración del proyecto de la herramienta de autoría.',
      tools: {
        revit:
          'Revit crea el edificio automáticamente; que falte suele indicar una exportación personalizada solo de emplazamiento. Verifica que el proyecto tenga Niveles y usa la asignación de edificio por defecto en las opciones IFC.',
        archicad:
          'Asegúrate de que exista un edificio en la jerarquía del proyecto / Traductor IFC y de que las plantas estén bajo él.',
        tekla:
          'Define el edificio en los ajustes de estructura espacial de la exportación IFC.',
        allplan:
          'Añade un nodo de edificio en la paleta de estructura del edificio.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Añade al menos una planta (nivel) bajo el edificio.',
      tools: {
        revit:
          'Crea Niveles en el proyecto; Revit exporta los Niveles como IfcBuildingStorey. Un modelo sin Niveles no exporta plantas.',
        archicad:
          'Define plantas en Diseño ▸ Configuración de plantas para que el edificio tenga plantas.',
        tekla:
          'Define niveles/plantas en los ajustes espaciales de la exportación IFC.',
        allplan:
          'Añade nodos de planta bajo el edificio en la paleta de estructura.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Rellena la planta vacía o elimínala: las plantas vacías saturan el árbol espacial y a menudo indican elementos mal asignados.',
      tools: {
        revit:
          'Elimina los Niveles no usados, o comprueba que los elementos destinados a ese Nivel estén asignados a él (y no a un Nivel contiguo).',
        archicad:
          'Elimina la planta no usada o reasigna la Planta de origen de los elementos para que la planta no quede vacía.',
        tekla:
          'Elimina el nivel vacío de la exportación o reasígnale piezas.',
        allplan:
          'Elimina el nodo de planta vacío o reasígnale objetos.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Da a cada planta una elevación definida: es necesaria para situar los niveles verticalmente y para generar plantas de planta.',
      tools: {
        revit:
          'Los Niveles siempre llevan una elevación en Revit; un valor nulo suele indicar una exportación personalizada. Verifica que los Niveles tengan elevaciones numéricas y usa la exportación de niveles IFC por defecto.',
        archicad:
          'Define la elevación de cada planta en Diseño ▸ Configuración de plantas para que no sea nula.',
        tekla:
          'Asegúrate de que cada nivel tenga una elevación definida en los ajustes de nivel/retícula antes de exportar.',
        allplan:
          'Define la altura/elevación de cada planta en la estructura del edificio para que se exporte un valor.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Define la descripción del archivo (normalmente el MVD / definición de vista) en las opciones de exportación: forma parte de los metadatos de cabecera STEP.',
      tools: {
        revit:
          'FILE_DESCRIPTION se establece a partir del MVD elegido (p. ej. Reference View). Seleccionar una configuración de exportación adecuada en el diálogo IFC lo rellena.',
        archicad:
          'La selección de MVD del Traductor IFC rellena FILE_DESCRIPTION; elige un preajuste de exportación definido.',
        tekla:
          'El tipo de exportación / MVD define FILE_DESCRIPTION; elige una configuración de exportación IFC definida.',
        allplan:
          'Selecciona un preajuste de exportación IFC definido para que se escriba la descripción del archivo / MVD.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Rellena el autor y la organización en la exportación o en la info del proyecto: es necesario para la trazabilidad (ISO 19650).',
      tools: {
        revit:
          'Define el autor en la configuración de exportación IFC (Modificar configuración) o en Gestionar ▸ Información del proyecto; esto rellena el campo de autor de FILE_NAME en STEP.',
        archicad:
          'Define autor y empresa en Archivo ▸ Info ▸ Info del proyecto y en el Traductor IFC para que se escriban en la cabecera.',
        tekla:
          'Define el autor/organización en los ajustes avanzados de la exportación IFC.',
        allplan:
          'Define autor/organización en la info del proyecto / ajustes de exportación IFC.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Define el nombre largo del proyecto (el título descriptivo del proyecto) en la información del proyecto de la herramienta de autoría.',
      tools: {
        revit:
          'Define Nombre del proyecto / Nombre de emisión en Gestionar ▸ Información del proyecto y asígnalo a IfcProject.LongName en la configuración de exportación IFC.',
        archicad:
          'Define el nombre/descripción del proyecto en Archivo ▸ Info ▸ Info del proyecto; el Traductor IFC lo asigna a IfcProject.LongName.',
        tekla:
          'Define el nombre del proyecto en las propiedades del proyecto y asígnalo a IfcProject.LongName en la exportación.',
        allplan:
          'Define el nombre/descripción del proyecto en la info del proyecto para que se rellene IfcProject.LongName.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Completa los metadatos del proyecto (nombre largo, descripción, fase/tipo de proyecto) requeridos por los requisitos de información de la ISO 19650.',
      tools: {
        revit:
          'Rellena Nombre del proyecto, Descripción y estado/fase en Gestionar ▸ Información del proyecto y asígnalos a los campos de IfcProject en la configuración de exportación IFC.',
        archicad:
          'Completa la info del proyecto en Archivo ▸ Info ▸ Info del proyecto y mapea los campos en el Traductor IFC.',
        tekla:
          'Completa las propiedades del proyecto y asígnalas a los campos de IfcProject en la exportación.',
        allplan:
          'Completa la info del proyecto para que IfcProject porte LongName, Description y ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Añade tanto el autor como la organización a la exportación para que el entregable sea trazable según la ISO 19650.',
      tools: {
        revit:
          'Define autor y organización en la configuración de exportación IFC / Información del proyecto para que ambos aparezcan en la cabecera STEP.',
        archicad:
          'Define autor y empresa en la Info del proyecto y en el Traductor IFC.',
        tekla:
          'Define autor y organización en los ajustes avanzados de la exportación IFC.',
        allplan:
          'Define autor y organización en el proyecto / ajustes de exportación IFC.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Nombra el archivo de exportación con el patrón ISO 19650: Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número.',
      tools: {
        revit:
          'Revit toma el nombre de archivo del diálogo Guardar de la exportación: nombra el archivo según el patrón ISO 19650 al exportar (o renómbralo después).',
        archicad:
          'Define el nombre de archivo según el patrón ISO 19650 en el diálogo de exportación, o renombra el archivo exportado.',
        tekla:
          'Nombra el archivo IFC de salida según el patrón ISO 19650 en el diálogo de exportación.',
        allplan:
          'Nombra el archivo exportado según el patrón ISO 19650 en el diálogo de exportación.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Añade los conjuntos de propiedades requeridos en el nivel de LOD/LOIN declarado (según el plan de entrega de información del proyecto).',
      tools: {
        revit:
          'Asigna los parámetros requeridos por el LOD a sus Pset mediante un archivo de User Defined PropertySets en la exportación IFC, y asegúrate de que los elementos realmente porten esos parámetros.',
        archicad:
          'Define los Pset del LOD en el Gestor de propiedades, asígnalos a las clasificaciones pertinentes y mapéalos en el Traductor IFC.',
        tekla:
          'Añade las propiedades requeridas por el LOD como UDA y asígnalas a los Pset en la exportación.',
        allplan:
          'Crea los atributos del LOD y asígnalos a los Pset requeridos en la exportación IFC.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Activa la exportación de cantidades base para que los elementos porten IfcElementQuantity (área/volumen/longitud) en el LOD declarado.',
      tools: {
        revit:
          'Activa "Exportar cantidades base" en las opciones de exportación IFC; Revit escribirá entonces IfcElementQuantity para los elementos.',
        archicad:
          'Activa la exportación de cantidades base en los ajustes del Traductor IFC.',
        tekla:
          'Activa la exportación de cantidades / cantidades base en la configuración de exportación IFC.',
        allplan:
          'Activa las cantidades base en los ajustes de exportación IFC.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Define una construcción por capas en muros y losas para que exporten un IfcMaterialLayerSetUsage en LOD 300+.',
      tools: {
        revit:
          'Define las capas de Estructura del Tipo de muro/suelo (Editar tipo ▸ Estructura) con materiales; Revit exporta las estructuras compuestas como IfcMaterialLayerSet.',
        archicad:
          'Usa estructuras Compuestas (no un único Material de construcción) en muros/losas para que las capas se exporten como un IfcMaterialLayerSet.',
        tekla:
          'Las piezas de Tekla suelen ser de un solo material; para elementos por capas define las capas/materiales para que el conjunto de capas se exporte, o confirma si esta regla aplica a tu disciplina.',
        allplan:
          'Usa componentes multicapa para que se exporte el conjunto de capas de material.',
      },
    },
    // ── Clasificación ────────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Adjunta una referencia de clasificación (Uniclass, OmniClass, etc.) para que el elemento porte su código estándar como IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Usa un complemento de clasificación (p. ej. el gratuito Classification Manager for Revit) para asignar un código Uniclass/OmniClass, o asigna un parámetro compartido a IfcClassificationReference en la configuración de exportación IFC. Sin un mapeo, Revit no exporta clasificación.',
        archicad:
          'Abre la paleta de Clasificación y Propiedades, elige un sistema de clasificación (integrado o importado) y asigna al elemento un ítem de clasificación. ARCHICAD los exporta como IfcClassificationReference automáticamente.',
        tekla:
          'Asigna la clasificación mediante una UDA o el mapeo de propiedades Tekla–IFC, y luego asigna ese atributo a IfcClassificationReference en los conjuntos de propiedades adicionales de la exportación IFC.',
        allplan:
          'Asigna el código de clasificación a través de los atributos del objeto y asegúrate de que la configuración de exportación IFC lo asigne a IfcClassificationReference.',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Asigna los elementos MEP a un sistema para que se exporten dentro de un IfcSystem, necesario para la coordinación basada en sistemas.',
      tools: {
        revit:
          'Asegúrate de que conductos/tuberías/equipos pertenezcan a un Sistema de Revit con nombre; los elementos sin asignar se exportan sin IfcSystem. Usa el Navegador de sistemas para localizarlos y asignarlos.',
        archicad:
          'Asigna los elementos MEP a un sistema MEP en el MEP Modeler para que se exporten dentro de un IfcSystem.',
        allplan:
          'Asigna los objetos MEP a un sistema/red para que se exporten dentro de un IfcSystem.',
      },
    },
    // ── Geometría y salud del archivo ────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Reduce los elementos IfcBuildingElementProxy asignándolos a clases IFC adecuadas: los proxies no portan un tipo semántico.',
      tools: {
        revit:
          'Los proxies vienen de familias in situ, modelos genéricos o categorías sin mapear. Usa la tabla de mapeo de clases de exportación IFC para asignar esas categorías a tipos IFC reales en lugar de IfcBuildingElementProxy, y convierte las familias in situ en familias cargables.',
        archicad:
          'Asigna clasificaciones / tipos IFC adecuados a los objetos (especialmente Morfos y objetos personalizados) para que no se exporten como proxies.',
        tekla:
          'Asigna las piezas personalizadas o proxy a la entidad IFC correcta en los ajustes de exportación IFC.',
        allplan:
          'Asigna el tipo IFC correcto a los objetos genéricos para que no se exporten como proxies.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Mantén el modelo cerca del origen interno y georreferéncialo correctamente, en lugar de modelar en grandes coordenadas reales.',
      tools: {
        revit:
          'No modeles lejos del origen interno de Revit. Usa Coordenadas compartidas con un Punto topográfico / Punto base del proyecto y exporta con las coordenadas compartidas actuales para que la geometría quede cerca del origen y se preserve la georreferenciación.',
        archicad:
          'Define el Punto topográfico y el Origen del proyecto; mantén el modelo cerca del origen y usa la georreferenciación IFC (IfcMapConversion) en lugar de un gran desfase.',
        tekla:
          'Define el punto base/de trabajo y mantén el modelo cerca del origen; usa el punto base de la exportación IFC para que las coordenadas no sean enormes.',
        allplan:
          'Define una georreferenciación/punto base del proyecto y mantén la geometría cerca del origen en lugar de en coordenadas reales.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Reduce el peso del archivo: baja la teselación/detalle, evita texturas incrustadas y exporta solo lo necesario.',
      tools: {
        revit:
          'Baja el nivel de detalle para la exportación, evita exportar CAD importado y familias de muchos polígonos, y separa por disciplinas. El MVD Reference View produce geometría teselada más ligera.',
        archicad:
          'Reduce la resolución de curvas/segmentos, evita incrustar texturas, usa un preajuste de Traductor IFC ligero y exporta solo los elementos necesarios.',
        tekla:
          'Reduce el detalle/representación de geometría de la exportación y evita exportar modelos de referencia innecesariamente.',
        allplan:
          'Baja la resolución de geometría y evita incrustar texturas en la exportación IFC.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Revincula o elimina los IfcOpeningElement huérfanos — todo hueco debe cortar un elemento anfitrión mediante IfcRelVoidsElement.',
      tools: {
        revit:
          'Los huecos huérfanos vienen de anfitriones borrados/editados o de huecos de shaft sueltos. Borra los huecos sueltos y recrea el vaciado sobre su anfitrión (muro/suelo/cubierta) para que se exporte la relación, y vuelve a alojar puertas/ventanas si se perdió el corte.',
        archicad:
          'Los huecos deben pertenecer a un muro o forjado. Elimina los objetos de hueco sueltos y usa la Herramienta de Hueco (o puerta/ventana) anclada al anfitrión para que ArchiCAD exporte IfcRelVoidsElement.',
        tekla:
          'Recrea el corte/hueco como una operación (feature) de su parte anfitriona en lugar de un objeto suelto, para que el vaciado referencie un anfitrión al exportar.',
        allplan:
          'Coloca los huecos con las herramientas de hueco de muro/forjado para que pertenezcan a un anfitrión; elimina los sólidos de hueco desvinculados.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Asigna una Elevation distinta a cada IfcBuildingStorey — las plantas con la misma cota rompen la generación de planos y el filtrado por planta.',
      tools: {
        revit:
          'Dos niveles comparten la misma cota. En la vista de Niveles da una cota única a cada Nivel (o borra el duplicado), y exporta como planta solo los niveles reales (desactiva “Planta de edificio”/exportación en los demás).',
        archicad:
          'Abre Configuración de Planta y fija una elevación única por planta; fusiona o elimina las plantas duplicadas a la misma altura.',
        tekla:
          'En la lista de niveles/fases asigna una cota única a cada nivel usado para la estructura de plantas IFC y elimina los duplicados.',
        allplan:
          'En la estructura del edificio define alturas distintas por planta y elimina las plantas duplicadas que resuelven a la misma cota.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordena las plantas para que su Elevation crezca de abajo arriba — las cotas desordenadas confunden a las herramientas de sección/plano y a los revisores.',
      tools: {
        revit:
          'Un nivel inferior tiene una cota mayor (o al revés). Corrige las cotas de los niveles o el orden de exportación para que las plantas vayan de abajo arriba, y revisa los niveles de sótano/cubierta con cotas negativas.',
        archicad:
          'En Configuración de Planta corrige la altura de cualquier planta fuera de secuencia para que las cotas asciendan con el índice de planta.',
        tekla:
          'Reordena/renumera los niveles para que sus cotas asciendan; corrige cualquier nivel cuya altura contradiga su posición.',
        allplan:
          'En la estructura del edificio reordena las plantas o corrige sus alturas para que las cotas aumenten hacia arriba.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Exporta en métrico SI (milímetros/metros) — las unidades imperiales rompen la interoperabilidad con la mayoría de herramientas IFC/BIM.',
      tools: {
        revit:
          'Las unidades internas de Revit son imperiales, pero el IFC debe ser métrico. Pon las Unidades de proyecto en métrico (o confirma que la exportación IFC usa SI/métrico) para que el IFCSIUNIT sea en metros.',
        archicad:
          'Configura las Unidades de Trabajo (y de Cálculo) del proyecto en métrico para que el esquema IFC exporte unidades de longitud SI.',
        tekla:
          'Cambia el entorno/rol o los ajustes de exportación a métrico para que el LENGTHUNIT del IFC sea SI (mm/m).',
        allplan:
          'Configura las unidades de longitud en métrico en las opciones del proyecto para que la exportación IFC use unidades SI.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Añade cantidades de área a los IfcSpace — exporta BaseQuantities para que cada espacio lleve NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'Las habitaciones se exportan como IfcSpace pero sin cantidades. Activa “Exportar cantidades base” (Pset/QTO) en las opciones de exportación IFC y asegúrate de que las Habitaciones estén bien delimitadas/colocadas para que se calculen las áreas.',
        archicad:
          'Usa Zonas para los espacios y activa las Cantidades Base en el Traductor IFC para que IfcSpace exporte NetFloorArea/GrossFloorArea.',
        tekla:
          'Los espacios son limitados en Tekla; si se requieren, defínelos y activa la exportación de cantidades, o genéralos en el modelo de arquitectura.',
        allplan:
          'Crea Habitaciones (espacios) y activa la exportación de cantidades IFC para que IfcSpace lleve cantidades de área.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Conecta los segmentos MEP mediante puertos — las tuberías/conductos desconectados se exportan sin relaciones IfcDistributionPort y rompen el trazado de sistemas.',
      tools: {
        revit:
          'Los conductos/tuberías desconectados se exportan sin puertos. Corrige los conectores abiertos en el modelo MEP (sin huecos ni extremos sueltos), mantén los segmentos unidos en sistemas conectados y activa la exportación de sistemas/puertos para que se escriban las relaciones IfcDistributionPort.',
        archicad:
          'Usa el MEP Modeler para que las rutas queden conectadas de extremo a extremo; exporta los sistemas MEP para incluir puertos/conexiones.',
        tekla:
          'El MEP no es el dominio de Tekla; modela el MEP conectado en la herramienta MEP correspondiente para que los segmentos lleven puertos, y luego fedéralo.',
        allplan:
          'Modela los trazados MEP conectados de extremo a extremo (sin extremos abiertos) para que la exportación IFC escriba los puertos de distribución entre segmentos.',
      },
    },
  },
  fr: {
    // ── Nommage et identité ──────────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Donnez un Nom explicite à l’élément pour qu’il soit identifiable dans les nomenclatures, l’arborescence du modèle et la coordination en aval.',
      tools: {
        revit:
          'Revit mappe le Nom de type d’une famille vers l’IfcName à l’export. Ouvrez les Propriétés de type de l’élément et donnez au type un nom descriptif au lieu de la valeur par défaut (p. ex. renommez « Basic Wall 1 »). Pour un nommage à l’occurrence, mappez un paramètre partagé vers IfcName dans la table de mappage d’export IFC.',
        archicad:
          'Sélectionnez l’élément et ouvrez le Gestionnaire IFC (clic droit ▸ Gestionnaire IFC) ou la palette Classification et propriétés ; définissez-y IfcRoot.Name, ou configurez le mappage dans les paramètres de propriétés du Traducteur IFC avant l’export.',
        tekla:
          'Le champ Name de la pièce est mappé vers l’IfcName. Ouvrez les propriétés de la pièce, saisissez un Name et confirmez que le réglage d’export IFC mappe cet attribut vers IfcName.',
        allplan:
          'Affectez un attribut qu’Allplan mappe vers IfcName via la palette Propriétés, ou définissez le mappage IfcName dans la configuration d’export IFC.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Définissez le LongName sur les espaces, étages et le bâtiment : il porte le nom lisible de la pièce/du niveau utilisé dans les nomenclatures et COBie.',
      tools: {
        revit:
          'Pour les espaces, définissez le Nom de pièce/surface (Revit mappe Nom de pièce → IfcLongName et Numéro de pièce → IfcName). Pour les étages, donnez à chaque Niveau un Nom descriptif. Pour le bâtiment, définissez le nom dans les options d’export IFC.',
        archicad:
          'Définissez le Nom de zone pour les espaces (mappé vers IfcLongName) et nommez les étages via Conception ▸ Réglages d’étage. Définissez le nom long du bâtiment dans Fichier ▸ Info ▸ Info projet / le Traducteur IFC.',
        tekla:
          'Les espaces et étages sont rarement modélisés dans Tekla ; lorsqu’ils existent, définissez le Name/UDA mappé vers IfcLongName, ou définissez les noms d’étage dans les réglages spatiaux de l’export IFC.',
        allplan:
          'Définissez le nom de la pièce (mappé vers IfcLongName), nommez les étages dans la structure du bâtiment et définissez le nom long du bâtiment à l’export IFC.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Rendez uniques les noms des éléments frères (ou appuyez-vous sur type + numéro d’occurrence) afin qu’ils soient distinguables dans les nomenclatures et la coordination.',
      tools: {
        revit:
          'Les noms en double viennent souvent de noms de type ou de repères identiques. Utilisez le paramètre d’occurrence Repère (unique par élément) ou renommez les types, et résolvez les avertissements de Repère en double de Revit.',
        archicad:
          'Utilisez le Gestionnaire d’ID (Document ▸ Gestionnaire d’ID) pour attribuer automatiquement des ID d’élément uniques afin que les frères ne partagent pas un Nom.',
        tekla:
          'Lancez la numérotation (Dessins et rapports ▸ Numérotation) pour que chaque pièce reçoive un repère de position/pièce unique mappé vers Name.',
        allplan:
          'Affectez des valeurs d’attribut uniques (p. ex. numéro de composant) via la palette d’attributs pour que les frères ne partagent pas un Nom.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Renommez les éléments selon le modèle de nommage du BEP du projet (généralement défini dans l’EIR / les exigences d’information ISO 19650).',
      tools: {
        revit:
          'Normalisez les noms de type et le paramètre mappé vers IfcName pour respecter le BEP. Utilisez un paramètre partagé ou un script Dynamo pour le renommage en masse, puis mappez-le vers IfcName à l’export.',
        archicad:
          'Appliquez le standard via le Gestionnaire d’ID et alignez la propriété mappée vers IfcName (palette Classification et propriétés) sur le BEP.',
        tekla:
          'Configurez la série de numérotation et le nommage des pièces pour respecter le BEP, puis relancez la numérotation.',
        allplan:
          'Utilisez des modèles d’attributs / favoris pour imposer le nommage du BEP et mappez cet attribut vers IfcName à l’export.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Chaque élément doit avoir un GlobalId unique. Cet outil peut corriger automatiquement les doublons (cliquez sur Appliquer la correction) ; pour l’éviter à la source, corrigez le flux d’export ci-dessous.',
      tools: {
        revit:
          'Les GUID en double viennent souvent du copier-coller d’éléments entre modèles ou entre fichiers liés. Évitez de dupliquer des éléments entre modèles exportés et réexportez depuis une copie propre. Pour les éléments groupés ou symétrisés partageant un paramètre IfcGUID, effacez ce paramètre afin que Revit régénère une valeur unique.',
        archicad:
          'Les GUID en double surviennent souvent en copiant des éléments entre projets ou en fusionnant des modules. Régénérez des ID uniques (Conception ▸ Gestionnaire d’ID d’élément) et évitez de copier des éléments entre fichiers sans régénérer les GlobalId.',
        tekla:
          'Les GUID en double viennent d’objets copiés entre modèles. Réexportez depuis le modèle source : Tekla attribue un GUID unique par objet à la création.',
        allplan:
          'Les GUID en double viennent de la copie d’objets entre documents. Recréez ou réexportez les objets concernés pour qu’Allplan régénère des GlobalId uniques.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'Le GlobalId doit être une chaîne IFC base-64 de 22 caractères. Cet outil peut corriger automatiquement le format ; à la source, évitez tout post-traitement qui réécrit les GUID.',
      tools: {
        revit:
          'Revit écrit des IfcGUID conformes par défaut. Les formats invalides viennent généralement de scripts tiers ou d’un paramètre IfcGUID édité à la main : effacez le paramètre pour que Revit régénère un GUID valide de 22 caractères à l’export.',
        archicad:
          'ARCHICAD génère des GlobalId conformes. Les valeurs invalides viennent généralement d’éditions externes ou de modules complémentaires ; régénérez les ID ou réexportez sans le module fautif.',
        tekla:
          'Tekla écrit des GUID valides nativement ; les valeurs invalides viennent généralement de scripts d’interopérabilité : réexportez depuis le modèle natif.',
        allplan:
          'Allplan génère des GlobalId valides ; s’ils sont invalides, recréez ou réexportez les objets concernés.',
      },
    },
    // ── Structure et hiérarchie ──────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Placez l’élément dans un conteneur spatial (étage ou espace) pour qu’il apparaisse dans l’arborescence du modèle et dans les outils en aval.',
      tools: {
        revit:
          'Les orphelins viennent d’éléments non affectés à un Niveau (groupes, géométrie importée, éléments sans hôte). Affectez l’élément à un Niveau pour que Revit l’exporte dans un IfcBuildingStorey.',
        archicad:
          'Vérifiez le réglage d’Étage de référence de l’élément : les éléments sans étage de référence s’exportent comme orphelins. Affectez-en un.',
        tekla:
          'Affectez la pièce à la structure de phase/niveau utilisée par l’export IFC pour qu’elle reçoive un conteneur spatial ; vérifiez les réglages de structure spatiale de l’export.',
        allplan:
          'Affectez l’élément à un nœud d’étage dans la palette de structure du bâtiment pour qu’il ne soit pas exporté orphelin.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Déplacez l’élément dans le bon conteneur spatial : les éléments physiques du bâtiment appartiennent à un étage (ou espace), pas directement sous le Site ou le Projet.',
      tools: {
        revit:
          'Réaffectez l’élément à un Niveau du bâtiment. Les composants de site et la topographie peuvent rester à l’échelle du site, mais les éléments du bâtiment doivent être sur un Niveau.',
        archicad:
          'Définissez l’Étage de référence de l’élément sur le bon étage ; évitez de placer des éléments du bâtiment à l’échelle du site.',
        tekla:
          'Ajustez le mappage du conteneur spatial dans l’export IFC pour que les pièces aboutissent au bon étage plutôt qu’au site.',
        allplan:
          'Déplacez l’objet vers le bon nœud d’étage dans la structure du bâtiment.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Corrigez la relation d’agrégation rompue : c’est presque toujours un artefact d’export/interopérabilité, réexportez donc depuis l’outil de création.',
      tools: {
        revit:
          'Réexportez avec un exportateur IFC à jour. Si cela persiste, auditez le modèle (Gérer ▸ Purger les éléments inutilisés) et recherchez des groupes ou ensembles corrompus.',
        archicad:
          'Réexportez avec le module IFC ARCHICAD le plus récent ; lancez une vérification du modèle si la corruption persiste.',
        tekla:
          'Réexportez depuis Tekla : les agrégats rompus indiquent un défaut d’interopérabilité, pas une erreur de modélisation.',
        allplan:
          'Réexportez depuis Allplan avec une interface IFC à jour.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Assurez-vous que la structure spatiale suit Projet ▸ Site ▸ Bâtiment ▸ Étage. Corrigez-la dans la configuration du projet de l’outil de création avant l’export.',
      tools: {
        revit:
          'Revit construit cette hiérarchie automatiquement à partir de Projet ▸ Site ▸ Bâtiment ▸ Niveaux. Une hiérarchie rompue signifie souvent des Niveaux manquants ou un export personnalisé : vérifiez l’existence des Niveaux et utilisez l’affectation site/bâtiment IFC par défaut.',
        archicad:
          'Vérifiez la hiérarchie dans le Traducteur IFC et les Réglages d’étage : les étages sous le bâtiment, le bâtiment sous le site.',
        tekla:
          'Configurez la hiérarchie spatiale complète (projet/site/bâtiment/étage) dans la boîte de dialogue d’export IFC pour qu’elle soit complète et correctement ordonnée.',
        allplan:
          'Définissez la structure complète du bâtiment (projet/site/bâtiment/étage) dans la palette de structure avant l’export.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Supprimez la relation circulaire : un élément ne peut pas être son propre ancêtre. C’est un artefact d’export/interopérabilité ; réexportez depuis une copie propre.',
      tools: {
        revit:
          'Réexportez avec un exportateur IFC à jour depuis une copie propre ; si cela persiste, auditez et purgez le modèle.',
        archicad:
          'Réexportez avec le module IFC le plus récent ; lancez une vérification du modèle pour trouver la relation fautive.',
        tekla:
          'Réexportez depuis le modèle natif : Tekla ne crée normalement pas de cycles de référence.',
        allplan:
          'Réexportez depuis Allplan ; recréez les objets concernés si le cycle persiste.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Placez l’élément dans un étage plutôt que directement sous le bâtiment.',
      tools: {
        revit:
          'Affectez l’élément à un Niveau pour qu’il s’exporte sous un IfcBuildingStorey au lieu du bâtiment.',
        archicad:
          'Définissez l’Étage de référence de l’élément pour qu’il ne soit pas à l’échelle du bâtiment.',
        tekla:
          'Mappez la pièce vers un étage dans les réglages spatiaux de l’export IFC.',
        allplan:
          'Déplacez l’objet vers un nœud d’étage dans la structure du bâtiment.',
      },
    },
    // ── Propriétés et types ──────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Associez l’élément à un type (IfcWallType, IfcDoorType, …) pour que les propriétés et quantités de type se propagent.',
      tools: {
        revit:
          'Les types de famille Revit s’exportent automatiquement comme IfcTypeObject. L’absence de types signifie souvent des familles in situ ou des modèles génériques : convertissez-les en familles chargeables avec des types définis et gardez l’export de types activé dans les options IFC.',
        archicad:
          'Utilisez des favoris / matériaux de construction et gardez l’export « Type Product » activé dans le Traducteur IFC pour que les types d’élément soient écrits.',
        tekla:
          'Affectez un profil et un matériau pour que la pièce s’exporte avec un type ; vérifiez que l’export IFC écrit des objets de type.',
        allplan:
          'Utilisez des objets de bibliothèque / SmartParts avec des types définis et activez l’export de types dans l’interface IFC.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Ajoutez à l’élément le ou les jeux de propriétés requis par le BEP/EIR du projet avant l’export.',
      tools: {
        revit:
          'Ajoutez les paramètres manquants et mappez-les vers le Pset requis via un fichier User Defined PropertySets référencé dans la configuration d’export IFC.',
        archicad:
          'Définissez le Pset requis dans le Gestionnaire de propriétés, affectez-le aux classifications concernées et mappez-le dans le Traducteur IFC.',
        tekla:
          'Ajoutez les propriétés comme UDA et mappez-les vers le Pset requis dans les jeux de propriétés supplémentaires de l’export IFC.',
        allplan:
          'Créez les attributs et mappez-les vers le Pset requis dans la configuration d’export IFC.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Renseignez la valeur de propriété vide : les vérifications en aval considèrent une propriété vide comme manquante.',
      tools: {
        revit:
          'Repérez le paramètre et saisissez une valeur (ou supprimez le paramètre vide). Une nomenclature est le moyen le plus rapide de trouver et remplir les vides en masse.',
        archicad:
          'Utilisez le Gestionnaire de propriétés ou une nomenclature interactive pour trouver et renseigner les valeurs de propriété vides.',
        tekla:
          'Renseignez les valeurs d’UDA vides via les outils d’interrogation/rapport avant l’export.',
        allplan:
          'Renseignez les valeurs d’attribut vides via la palette d’attributs ou une liste avant l’export.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Affectez un matériau à l’élément pour qu’il porte des données de matériau (attendu à partir du LOD 200/300).',
      tools: {
        revit:
          'Affectez un matériau à la structure de l’élément (Modifier le type ▸ Structure, ou le paramètre Matériau). Revit exporte les matériaux définis comme IfcMaterial / jeux de couches.',
        archicad:
          'Affectez un Matériau de construction (pas seulement une surface) à l’élément ; ARCHICAD exporte les Matériaux de construction comme IfcMaterial.',
        tekla:
          'Définissez le matériau de la pièce dans ses propriétés ; Tekla l’exporte comme le matériau IFC associé.',
        allplan:
          'Affectez un attribut de matériau/format à l’élément pour qu’il s’exporte avec une association de matériau.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Exportez vers un schéma IFC actuel (IFC4 / IFC4.3) sauf si le destinataire exige explicitement IFC2x3.',
      tools: {
        revit:
          'Dans la boîte de dialogue d’export IFC, réglez la Version de fichier sur IFC4 (p. ex. Reference View ou Design Transfer View) au lieu d’IFC2x3.',
        archicad:
          'Dans le Traducteur IFC, choisissez un préréglage d’export basé sur IFC4 au lieu d’IFC2x3.',
        tekla:
          'Dans l’export IFC, sélectionnez le type d’export IFC4 plutôt qu’IFC2x3.',
        allplan:
          'Sélectionnez IFC4 (ou IFC4.3) comme schéma d’export dans les réglages de l’interface IFC.',
      },
    },
    // ── Conflits (clash) ─────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Résolvez le conflit géométrique entre éléments dans l’outil de création : déplacez, ajustez ou joignez les éléments en conflit.',
      tools: {
        revit:
          'Lancez Collaborer ▸ Vérification des interférences pour localiser les conflits, puis déplacez/ajustez/joignez les éléments pour résoudre le chevauchement.',
        archicad:
          'Utilisez Conception ▸ Détection de collisions pour trouver les chevauchements, puis ajustez les éléments en conflit.',
        tekla:
          'Utilisez Gérer ▸ Vérification des conflits pour trouver et résoudre les pièces qui se chevauchent.',
        allplan:
          'Utilisez la vérification de collisions pour localiser les chevauchements et ajuster les éléments en conflit.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Résolvez le conflit CVC-structure : reroutez le tracé CVC ou coordonnez une pénétration/un fourreau avec le modèle structurel.',
      tools: {
        revit:
          'Lancez la Vérification des interférences entre les catégories CVC et structurelles, puis reroutez les réseaux ou ajoutez des réservations/fourreaux coordonnés.',
        archicad:
          'Utilisez la Détection de collisions entre éléments CVC et structurels, puis reroutez ou ajoutez des réservations.',
        tekla:
          'Lancez une vérification de conflits avec le modèle de référence CVC lié et ajoutez des pénétrations/réservations si nécessaire.',
        allplan:
          'Utilisez la vérification de collisions entre CVC et structure et reroutez ou ajoutez des réservations.',
      },
    },
    // ── En-tête de fichier et métadonnées projet ─────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Tout IFC doit contenir exactement un IfcProject. Son absence indique un export rompu : réexportez le modèle complet.',
      tools: {
        revit:
          'Revit écrit toujours un IfcProject. Son absence indique un export corrompu ou partiel : réexportez le modèle complet plutôt qu’une sélection isolée.',
        archicad:
          'Réexportez le projet ; exportez le modèle, pas un ensemble d’éléments isolé qui supprime la racine du projet.',
        tekla:
          'Réexportez le modèle complet pour que la racine IfcProject soit écrite.',
        allplan:
          'Réexportez depuis le projet pour que l’entité IfcProject soit incluse.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Ajoutez un bâtiment à la structure spatiale : définissez un IfcBuilding dans la configuration du projet de l’outil de création.',
      tools: {
        revit:
          'Revit crée le bâtiment automatiquement ; son absence signifie souvent un export personnalisé limité au site. Vérifiez que le projet a des Niveaux et utilisez l’affectation de bâtiment par défaut dans les options IFC.',
        archicad:
          'Assurez-vous qu’un bâtiment existe dans la hiérarchie du projet / le Traducteur IFC et que les étages sont sous lui.',
        tekla:
          'Définissez le bâtiment dans les réglages de structure spatiale de l’export IFC.',
        allplan:
          'Ajoutez un nœud de bâtiment dans la palette de structure du bâtiment.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Ajoutez au moins un étage (niveau) sous le bâtiment.',
      tools: {
        revit:
          'Créez des Niveaux dans le projet ; Revit exporte les Niveaux comme IfcBuildingStorey. Un modèle sans Niveaux n’exporte aucun étage.',
        archicad:
          'Définissez des étages via Conception ▸ Réglages d’étage pour que le bâtiment ait des étages.',
        tekla:
          'Définissez les niveaux/étages dans les réglages spatiaux de l’export IFC.',
        allplan:
          'Ajoutez des nœuds d’étage sous le bâtiment dans la palette de structure.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Remplissez l’étage vide ou supprimez-le : les étages vides encombrent l’arborescence spatiale et signalent souvent des éléments mal affectés.',
      tools: {
        revit:
          'Supprimez les Niveaux inutilisés, ou vérifiez que les éléments destinés à ce Niveau lui sont affectés (et non à un Niveau voisin).',
        archicad:
          'Supprimez l’étage inutilisé ou réaffectez l’Étage de référence des éléments pour que l’étage ne soit pas vide.',
        tekla:
          'Supprimez le niveau vide de l’export ou réaffectez-lui des pièces.',
        allplan:
          'Supprimez le nœud d’étage vide ou réaffectez-lui des objets.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Donnez à chaque étage une altitude définie : elle est nécessaire pour situer les niveaux verticalement et générer les plans d’étage.',
      tools: {
        revit:
          'Les Niveaux portent toujours une altitude dans Revit ; une valeur nulle signifie généralement un export personnalisé. Vérifiez que les Niveaux ont des altitudes numériques et utilisez l’export de niveaux IFC par défaut.',
        archicad:
          'Définissez l’altitude de chaque étage dans Conception ▸ Réglages d’étage pour qu’elle ne soit pas nulle.',
        tekla:
          'Assurez-vous que chaque niveau a une altitude définie dans les réglages de niveau/trame avant l’export.',
        allplan:
          'Définissez la hauteur/l’altitude de chaque étage dans la structure du bâtiment pour qu’une valeur soit exportée.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Définissez la description du fichier (généralement le MVD / la définition de vue) dans les options d’export : elle fait partie des métadonnées d’en-tête STEP.',
      tools: {
        revit:
          'FILE_DESCRIPTION est défini d’après le MVD choisi (p. ex. Reference View). Choisir une configuration d’export adéquate dans la boîte de dialogue IFC le renseigne.',
        archicad:
          'La sélection de MVD du Traducteur IFC renseigne FILE_DESCRIPTION ; choisissez un préréglage d’export défini.',
        tekla:
          'Le type d’export / MVD définit FILE_DESCRIPTION ; choisissez une configuration d’export IFC définie.',
        allplan:
          'Sélectionnez un préréglage d’export IFC défini pour que la description du fichier / MVD soit écrite.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Renseignez l’auteur et l’organisation dans l’export ou l’info projet : requis pour la traçabilité (ISO 19650).',
      tools: {
        revit:
          'Définissez l’auteur dans la configuration d’export IFC (Modifier la configuration) ou dans Gérer ▸ Informations sur le projet ; cela renseigne le champ auteur de FILE_NAME dans STEP.',
        archicad:
          'Définissez l’auteur et la société dans Fichier ▸ Info ▸ Info projet et le Traducteur IFC pour qu’ils soient écrits dans l’en-tête.',
        tekla:
          'Définissez l’auteur/l’organisation dans les réglages avancés de l’export IFC.',
        allplan:
          'Définissez l’auteur/l’organisation dans l’info projet / les réglages d’export IFC.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Définissez le nom long du projet (le titre descriptif du projet) dans les informations projet de l’outil de création.',
      tools: {
        revit:
          'Définissez Nom du projet / Nom d’émission dans Gérer ▸ Informations sur le projet et mappez-le vers IfcProject.LongName dans la configuration d’export IFC.',
        archicad:
          'Définissez le nom/la description du projet dans Fichier ▸ Info ▸ Info projet ; le Traducteur IFC le mappe vers IfcProject.LongName.',
        tekla:
          'Définissez le nom du projet dans les propriétés du projet et mappez-le vers IfcProject.LongName à l’export.',
        allplan:
          'Définissez le nom/la description du projet dans l’info projet pour que IfcProject.LongName soit renseigné.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Complétez les métadonnées du projet (nom long, description, phase/type de projet) requises par les exigences d’information ISO 19650.',
      tools: {
        revit:
          'Renseignez Nom du projet, Description et statut/phase dans Gérer ▸ Informations sur le projet et mappez-les vers les champs IfcProject dans la configuration d’export IFC.',
        archicad:
          'Complétez l’info projet dans Fichier ▸ Info ▸ Info projet et mappez les champs dans le Traducteur IFC.',
        tekla:
          'Complétez les propriétés du projet et mappez-les vers les champs IfcProject à l’export.',
        allplan:
          'Complétez l’info projet pour que IfcProject porte LongName, Description et ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Ajoutez à la fois l’auteur et l’organisation à l’export pour que le livrable soit traçable selon l’ISO 19650.',
      tools: {
        revit:
          'Définissez l’auteur et l’organisation dans la configuration d’export IFC / Informations sur le projet pour que les deux figurent dans l’en-tête STEP.',
        archicad:
          'Définissez l’auteur et la société dans l’Info projet et le Traducteur IFC.',
        tekla:
          'Définissez l’auteur et l’organisation dans les réglages avancés de l’export IFC.',
        allplan:
          'Définissez l’auteur et l’organisation dans le projet / les réglages d’export IFC.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Nommez le fichier d’export selon le modèle ISO 19650 : Projet-Émetteur-Volume-Niveau-Type-Rôle-Numéro.',
      tools: {
        revit:
          'Revit prend le nom de fichier dans la boîte de dialogue Enregistrer de l’export : nommez le fichier selon le modèle ISO 19650 à l’export (ou renommez-le ensuite).',
        archicad:
          'Définissez le nom de fichier selon le modèle ISO 19650 dans la boîte de dialogue d’export, ou renommez le fichier exporté.',
        tekla:
          'Nommez le fichier IFC de sortie selon le modèle ISO 19650 dans la boîte de dialogue d’export.',
        allplan:
          'Nommez le fichier exporté selon le modèle ISO 19650 dans la boîte de dialogue d’export.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Ajoutez les jeux de propriétés requis au niveau de LOD/LOIN déclaré (selon le plan de livraison de l’information du projet).',
      tools: {
        revit:
          'Mappez les paramètres requis par le LOD vers leurs Pset via un fichier User Defined PropertySets dans l’export IFC, et assurez-vous que les éléments portent réellement ces paramètres.',
        archicad:
          'Définissez les Pset du LOD dans le Gestionnaire de propriétés, affectez-les aux classifications concernées et mappez-les dans le Traducteur IFC.',
        tekla:
          'Ajoutez les propriétés requises par le LOD comme UDA et mappez-les vers les Pset à l’export.',
        allplan:
          'Créez les attributs du LOD et mappez-les vers les Pset requis dans l’export IFC.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Activez l’export des quantités de base pour que les éléments portent IfcElementQuantity (surface/volume/longueur) au LOD déclaré.',
      tools: {
        revit:
          'Activez « Exporter les quantités de base » dans les options d’export IFC ; Revit écrit alors IfcElementQuantity pour les éléments.',
        archicad:
          'Activez l’export des quantités de base dans les réglages du Traducteur IFC.',
        tekla:
          'Activez l’export des quantités / quantités de base dans la configuration d’export IFC.',
        allplan:
          'Activez les quantités de base dans les réglages d’export IFC.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Définissez une construction en couches sur les murs et dalles pour qu’ils exportent un IfcMaterialLayerSetUsage au LOD 300+.',
      tools: {
        revit:
          'Définissez les couches de Structure du Type de mur/sol (Modifier le type ▸ Structure) avec des matériaux ; Revit exporte les structures composées comme IfcMaterialLayerSet.',
        archicad:
          'Utilisez des structures Composites (pas un Matériau de construction unique) pour les murs/dalles afin que les couches s’exportent comme un IfcMaterialLayerSet.',
        tekla:
          'Les pièces Tekla sont généralement mono-matériau ; pour les éléments en couches, définissez les couches/matériaux pour que le jeu de couches s’exporte, ou vérifiez si cette règle s’applique à votre discipline.',
        allplan:
          'Utilisez des composants multicouches pour que le jeu de couches de matériau soit exporté.',
      },
    },
    // ── Classification ───────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Attachez une référence de classification (Uniclass, OmniClass, etc.) pour que l’élément porte son code standard comme IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Utilisez un module de classification (p. ex. le gratuit Classification Manager for Revit) pour affecter un code Uniclass/OmniClass, ou mappez un paramètre partagé vers IfcClassificationReference dans la configuration d’export IFC. Sans mappage, Revit n’exporte aucune classification.',
        archicad:
          'Ouvrez la palette Classification et propriétés, choisissez un système de classification (intégré ou importé) et affectez à l’élément un élément de classification. ARCHICAD les exporte comme IfcClassificationReference automatiquement.',
        tekla:
          'Affectez la classification via une UDA ou le mappage de propriétés Tekla–IFC, puis mappez cet attribut vers IfcClassificationReference dans les jeux de propriétés supplémentaires de l’export IFC.',
        allplan:
          'Affectez le code de classification via les attributs de l’objet et assurez-vous que la configuration d’export IFC le mappe vers IfcClassificationReference.',
      },
    },
    // ── CVC / MEP ────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Affectez les éléments CVC à un système pour qu’ils s’exportent dans un IfcSystem — nécessaire à la coordination par systèmes.',
      tools: {
        revit:
          'Assurez-vous que gaines/tuyaux/équipements appartiennent à un Système Revit nommé ; les éléments non affectés s’exportent sans IfcSystem. Utilisez le Navigateur de systèmes pour les repérer et les affecter.',
        archicad:
          'Affectez les éléments CVC à un système CVC dans le MEP Modeler pour qu’ils s’exportent dans un IfcSystem.',
        allplan:
          'Affectez les objets CVC à un système/réseau pour qu’ils s’exportent dans un IfcSystem.',
      },
    },
    // ── Géométrie et santé du fichier ────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Réduisez les éléments IfcBuildingElementProxy en les mappant vers des classes IFC adéquates : les proxys ne portent aucun type sémantique.',
      tools: {
        revit:
          'Les proxys viennent de familles in situ, de modèles génériques ou de catégories non mappées. Utilisez la table de mappage des classes d’export IFC pour mapper ces catégories vers de vrais types IFC au lieu d’IfcBuildingElementProxy, et convertissez les familles in situ en familles chargeables.',
        archicad:
          'Affectez des classifications / types IFC adéquats aux objets (en particulier les Morphes et objets personnalisés) pour qu’ils ne s’exportent pas comme proxys.',
        tekla:
          'Mappez les pièces personnalisées ou proxy vers la bonne entité IFC dans les réglages d’export IFC.',
        allplan:
          'Affectez le bon type IFC aux objets génériques pour qu’ils ne soient pas exportés comme proxys.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Gardez le modèle près de l’origine interne et géoréférencez-le correctement, au lieu de modéliser à de grandes coordonnées réelles.',
      tools: {
        revit:
          'Ne modélisez pas loin de l’origine interne de Revit. Utilisez les Coordonnées partagées avec un Point topographique / Point de base du projet et exportez avec les coordonnées partagées actuelles pour que la géométrie reste près de l’origine tout en préservant le géoréférencement.',
        archicad:
          'Définissez le Point topographique et l’Origine du projet ; gardez le modèle près de l’origine et utilisez le géoréférencement IFC (IfcMapConversion) au lieu d’un grand décalage.',
        tekla:
          'Définissez le point de base/de travail et gardez le modèle près de l’origine ; utilisez le point de base de l’export IFC pour que les coordonnées ne soient pas énormes.',
        allplan:
          'Définissez un géoréférencement/point de base du projet et gardez la géométrie près de l’origine plutôt qu’à des coordonnées réelles.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Réduisez le poids du fichier : baissez la tessellation/le détail, évitez les textures incorporées et n’exportez que le nécessaire.',
      tools: {
        revit:
          'Baissez le niveau de détail pour l’export, évitez d’exporter le CAO importé et les familles très détaillées, et séparez les disciplines. Le MVD Reference View produit une géométrie tessellée plus légère.',
        archicad:
          'Réduisez la résolution des courbes/segments, évitez d’incorporer des textures, utilisez un préréglage de Traducteur IFC léger et n’exportez que les éléments nécessaires.',
        tekla:
          'Réduisez le détail/la représentation de la géométrie d’export et évitez d’exporter inutilement les modèles de référence.',
        allplan:
          'Baissez la résolution de la géométrie et évitez d’incorporer des textures dans l’export IFC.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Re-rattachez ou supprimez les IfcOpeningElement orphelins — chaque ouverture doit percer un élément hôte via IfcRelVoidsElement.',
      tools: {
        revit:
          'Les ouvertures orphelines viennent d’hôtes supprimés/modifiés ou de trémies exportées isolément. Supprimez les ouvertures isolées et recréez le percement sur son hôte (mur/sol/toit) pour exporter la relation, et re-percez portes/fenêtres si le percement a été perdu.',
        archicad:
          'Les ouvertures doivent appartenir à un mur ou une dalle. Supprimez les objets d’ouverture isolés et utilisez l’outil Ouverture (ou porte/fenêtre) ancré à l’hôte pour qu’ArchiCAD exporte IfcRelVoidsElement.',
        tekla:
          'Recréez le percement/l’ouverture comme une fonction (feature) de sa pièce hôte plutôt qu’un objet isolé, pour que le vide référence un hôte à l’export.',
        allplan:
          'Placez les ouvertures avec les outils d’ouverture de mur/dalle pour qu’elles appartiennent à un hôte ; supprimez les solides d’ouverture détachés.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Donnez une Elevation distincte à chaque IfcBuildingStorey — des niveaux à la même cote cassent la génération de plans et le filtrage par étage.',
      tools: {
        revit:
          'Deux niveaux partagent la même cote. Dans la vue Niveaux donnez une cote unique à chaque niveau (ou supprimez le doublon) et n’exportez comme étage que les vrais niveaux de bâtiment (désactivez « Étage »/export sur les autres).',
        archicad:
          'Ouvrez les Réglages d’étage et fixez une altitude unique par étage ; fusionnez ou supprimez les étages dupliqués à la même hauteur.',
        tekla:
          'Dans la liste des niveaux/phases attribuez une cote unique à chaque niveau utilisé pour la structure d’étages IFC et supprimez les doublons.',
        allplan:
          'Dans la structure du bâtiment définissez des hauteurs distinctes par étage et supprimez les étages dupliqués qui aboutissent à la même cote.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordonnez les étages pour que leur Elevation croisse du bas vers le haut — des cotes désordonnées perturbent les outils de coupe/plan et les relecteurs.',
      tools: {
        revit:
          'Un niveau inférieur a une cote plus haute (ou l’inverse). Corrigez les cotes des niveaux ou l’ordre d’export pour que les étages se lisent de bas en haut, et vérifiez les niveaux de sous-sol/toit à cotes négatives.',
        archicad:
          'Dans les Réglages d’étage corrigez la hauteur de tout étage hors séquence pour que les cotes montent avec l’indice d’étage.',
        tekla:
          'Réordonnez/renumérotez les niveaux pour que leurs cotes montent ; corrigez tout niveau dont la hauteur contredit sa position.',
        allplan:
          'Dans la structure du bâtiment réordonnez les étages ou corrigez leurs hauteurs pour que les cotes augmentent vers le haut.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Exportez en métrique SI (millimètres/mètres) — les unités impériales cassent l’interopérabilité avec la plupart des outils IFC/BIM.',
      tools: {
        revit:
          'Les unités internes de Revit sont impériales, mais l’IFC doit être métrique. Mettez les Unités du projet en métrique (ou vérifiez que l’export IFC utilise SI/métrique) pour que l’IFCSIUNIT soit en mètres.',
        archicad:
          'Réglez les Unités de travail (et de calcul) du projet en métrique pour que le schéma IFC exporte des unités de longueur SI.',
        tekla:
          'Passez l’environnement/rôle ou les réglages d’export en métrique pour que le LENGTHUNIT de l’IFC soit SI (mm/m).',
        allplan:
          'Réglez les unités de longueur en métrique dans les options du projet pour que l’export IFC utilise des unités SI.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Ajoutez des quantités de surface aux IfcSpace — exportez les BaseQuantities pour que chaque espace porte NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'Les pièces s’exportent en IfcSpace mais sans quantités. Activez « Exporter les quantités de base » (Pset/QTO) dans les options d’export IFC et assurez-vous que les Pièces sont bien délimitées/placées pour calculer les surfaces.',
        archicad:
          'Utilisez les Zones pour les espaces et activez les Quantités de base dans le Traducteur IFC pour qu’IfcSpace exporte NetFloorArea/GrossFloorArea.',
        tekla:
          'Les espaces sont limités dans Tekla ; s’ils sont requis, définissez-les et activez l’export des quantités, ou générez-les dans le modèle d’architecture.',
        allplan:
          'Créez des Pièces (espaces) et activez l’export des quantités IFC pour qu’IfcSpace porte des quantités de surface.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Connectez les segments MEP via des ports — tuyaux/gaines déconnectés s’exportent sans relations IfcDistributionPort et cassent le traçage des systèmes.',
      tools: {
        revit:
          'Les gaines/tuyaux déconnectés s’exportent sans ports. Corrigez les connecteurs ouverts dans le modèle MEP (pas de coupures ni d’extrémités libres), gardez les segments reliés en systèmes connectés et activez l’export systèmes/ports pour écrire les relations IfcDistributionPort.',
        archicad:
          'Utilisez le MEP Modeler pour que les tracés restent connectés bout à bout ; exportez les systèmes MEP pour inclure ports/connexions.',
        tekla:
          'Le MEP n’est pas le domaine de Tekla ; modélisez un MEP connecté dans l’outil MEP dédié pour que les segments portent des ports, puis fédérez.',
        allplan:
          'Modélisez les réseaux MEP connectés bout à bout (sans extrémités ouvertes) pour que l’export IFC écrive les ports de distribution entre segments.',
      },
    },
  },
  de: {
    // ── Benennung & Identität ────────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Geben Sie dem Element einen aussagekräftigen Namen, damit es in Listen, im Modellbaum und in der nachgelagerten Koordination identifizierbar ist.',
      tools: {
        revit:
          'Revit ordnet den Familien-Typnamen beim Export dem IfcName zu. Öffnen Sie die Typeneigenschaften des Elements und geben Sie dem Typ statt des Standardwerts einen beschreibenden Namen (z. B. „Basic Wall 1“ umbenennen). Für eine Benennung auf Exemplarebene ordnen Sie einen gemeinsam genutzten Parameter in der IFC-Export-Zuordnungstabelle dem IfcName zu.',
        archicad:
          'Wählen Sie das Element aus und öffnen Sie den IFC-Manager (Rechtsklick ▸ IFC-Manager) oder die Palette Klassifizierung und Eigenschaften; setzen Sie dort IfcRoot.Name, oder definieren Sie die Zuordnung in den Eigenschaftseinstellungen des IFC-Übersetzers vor dem Export.',
        tekla:
          'Das Feld Name des Teils wird dem IfcName zugeordnet. Öffnen Sie die Teileigenschaften, geben Sie einen Name ein und prüfen Sie, dass die IFC-Exporteinstellung dieses Attribut dem IfcName zuordnet.',
        allplan:
          'Weisen Sie ein Attribut zu, das Allplan über die Eigenschaften-Palette dem IfcName zuordnet, oder legen Sie die IfcName-Zuordnung in der IFC-Exportkonfiguration fest.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Setzen Sie den LongName an Räumen, Geschossen und dem Gebäude — er trägt den lesbaren Raum-/Geschossnamen, der in Listen und COBie verwendet wird.',
      tools: {
        revit:
          'Setzen Sie für Räume den Raum-/Flächennamen (Revit ordnet Raumname → IfcLongName und Raumnummer → IfcName zu). Geben Sie jeder Ebene einen beschreibenden Namen für Geschosse. Setzen Sie den Gebäudenamen in den IFC-Exportoptionen.',
        archicad:
          'Setzen Sie den Zonennamen für Räume (wird IfcLongName zugeordnet) und benennen Sie Geschosse über Ablage ▸ Geschosseinstellungen. Setzen Sie den langen Gebäudenamen in Ablage ▸ Info ▸ Projektinfo / dem IFC-Übersetzer.',
        tekla:
          'Räume und Geschosse werden in Tekla selten modelliert; falls vorhanden, setzen Sie den Name/UDA, der IfcLongName zugeordnet ist, oder setzen Sie Geschossnamen in den räumlichen IFC-Exporteinstellungen.',
        allplan:
          'Setzen Sie den Raumnamen (wird IfcLongName zugeordnet), benennen Sie Geschosse in der Bauwerksstruktur und setzen Sie den langen Gebäudenamen im IFC-Export.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Machen Sie Namen gleichgeordneter Elemente eindeutig (oder stützen Sie sich auf Typ + Exemplarnummer), damit Elemente in Listen und Koordination unterscheidbar sind.',
      tools: {
        revit:
          'Doppelte Namen stammen meist von identischen Typnamen oder Beschriftungen. Verwenden Sie den Exemplarparameter Beschriftung (eindeutig je Element) oder benennen Sie Typen um und beheben Sie Revits Warnungen zu doppelten Beschriftungen.',
        archicad:
          'Verwenden Sie den ID-Manager (Dokumentation ▸ ID-Manager), um automatisch eindeutige Element-IDs zu vergeben, damit gleichgeordnete Elemente keinen Namen teilen.',
        tekla:
          'Führen Sie die Nummerierung aus (Zeichnungen & Berichte ▸ Nummerierung), damit jedes Teil eine eindeutige Positions-/Teilmarke erhält, die dem Name zugeordnet ist.',
        allplan:
          'Vergeben Sie eindeutige Attributwerte (z. B. Bauteilnummer) über die Attribut-Palette, damit gleichgeordnete Elemente keinen Namen teilen.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Benennen Sie Elemente nach dem Benennungsschema des BEP (üblicherweise in den EIR / ISO-19650-Informationsanforderungen definiert) um.',
      tools: {
        revit:
          'Vereinheitlichen Sie Typnamen und den dem IfcName zugeordneten Parameter gemäß BEP. Nutzen Sie einen gemeinsam genutzten Parameter oder ein Dynamo-Skript zum Massenumbenennen und ordnen Sie es beim Export dem IfcName zu.',
        archicad:
          'Wenden Sie den Standard über den ID-Manager an und richten Sie die dem IfcName zugeordnete Eigenschaft (Palette Klassifizierung und Eigenschaften) am BEP aus.',
        tekla:
          'Konfigurieren Sie die Nummerierungsserie und die Teilebenennung gemäß BEP und führen Sie die Nummerierung erneut aus.',
        allplan:
          'Verwenden Sie Attributvorlagen / Favoriten, um die BEP-Benennung durchzusetzen, und ordnen Sie dieses Attribut beim Export dem IfcName zu.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Jedes Element muss eine eindeutige GlobalId haben. Dieses Tool kann Duplikate automatisch beheben (auf Korrektur anwenden klicken); um es an der Quelle zu verhindern, korrigieren Sie den Export-Workflow unten.',
      tools: {
        revit:
          'Doppelte GUIDs entstehen meist durch Kopieren/Einfügen von Elementen zwischen Modellen oder verknüpften Dateien. Vermeiden Sie das Duplizieren von Elementen über exportierte Modelle hinweg und exportieren Sie aus einer sauberen Kopie neu. Bei gruppierten oder gespiegelten Elementen, die einen IfcGUID-Parameter teilen, löschen Sie diesen Parameter, damit Revit einen eindeutigen Wert neu erzeugt.',
        archicad:
          'Doppelte GUIDs entstehen typischerweise beim Kopieren von Elementen zwischen Projekten oder beim Zusammenführen von Modulen. Erzeugen Sie eindeutige IDs neu (Ablage ▸ Element-ID-Manager) und vermeiden Sie das Kopieren von Elementen zwischen Dateien ohne Neuerzeugung der GlobalIds.',
        tekla:
          'Doppelte GUIDs stammen von kopierten Objekten über Modelle hinweg. Exportieren Sie aus dem Quellmodell neu — Tekla vergibt bei der Erstellung je Objekt eine eindeutige GUID.',
        allplan:
          'Doppelte GUIDs stammen vom Kopieren von Objekten zwischen Dokumenten. Erstellen oder exportieren Sie die betroffenen Objekte neu, damit Allplan eindeutige GlobalIds neu erzeugt.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'Die GlobalId muss eine 22-stellige IFC-Base-64-Zeichenfolge sein. Dieses Tool kann das Format automatisch beheben; vermeiden Sie an der Quelle eine Nachbearbeitung, die GUIDs umschreibt.',
      tools: {
        revit:
          'Revit schreibt standardmäßig konforme IfcGUIDs. Ungültige Formate stammen meist von Drittanbieter-Skripten oder einem manuell bearbeiteten IfcGUID-Parameter — löschen Sie den Parameter, damit Revit beim Export eine gültige 22-stellige GUID neu erzeugt.',
        archicad:
          'ARCHICAD erzeugt konforme GlobalIds. Ungültige Werte stammen meist aus externen Bearbeitungen oder Add-ons; erzeugen Sie IDs neu oder exportieren Sie ohne das verursachende Add-on neu.',
        tekla:
          'Tekla schreibt gültige GUIDs nativ; ungültige Werte stammen typischerweise aus Interop-Skripten — exportieren Sie aus dem nativen Modell neu.',
        allplan:
          'Allplan erzeugt gültige GlobalIds; falls ungültig, erstellen oder exportieren Sie die betroffenen Objekte neu.',
      },
    },
    // ── Struktur & Hierarchie ────────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Platzieren Sie das Element in einem räumlichen Container (Geschoss oder Raum), damit es im Modellbaum und in nachgelagerten Tools erscheint.',
      tools: {
        revit:
          'Verwaiste Elemente stammen von Elementen ohne Ebenenzuordnung (Gruppen, importierte Geometrie, wirtsfreie Elemente). Weisen Sie das Element einer Ebene zu, damit Revit es innerhalb eines IfcBuildingStorey exportiert.',
        archicad:
          'Prüfen Sie die Einstellung Stammgeschoss des Elements — Elemente ohne Stammgeschoss werden als verwaist exportiert. Weisen Sie eines zu.',
        tekla:
          'Weisen Sie das Teil der vom IFC-Export verwendeten Phasen-/Ebenenstruktur zu, damit es einen räumlichen Container erhält; prüfen Sie die Einstellungen der räumlichen Struktur des Exports.',
        allplan:
          'Weisen Sie das Element einem Geschossknoten in der Bauwerksstruktur-Palette zu, damit es nicht verwaist exportiert wird.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Verschieben Sie das Element in den richtigen räumlichen Container — physische Bauelemente gehören in ein Geschoss (oder einen Raum), nicht direkt unter Grundstück oder Projekt.',
      tools: {
        revit:
          'Weisen Sie das Element einer Gebäude-Ebene neu zu. Grundstückskomponenten und Topografie dürfen auf Grundstücksebene liegen, aber Bauelemente müssen auf einer Ebene liegen.',
        archicad:
          'Setzen Sie das Stammgeschoss des Elements auf das richtige Geschoss; vermeiden Sie das Platzieren von Bauelementen auf Grundstücksebene.',
        tekla:
          'Passen Sie die Zuordnung des räumlichen Containers im IFC-Export an, damit Teile im richtigen Geschoss statt auf dem Grundstück landen.',
        allplan:
          'Verschieben Sie das Objekt zum richtigen Geschossknoten in der Bauwerksstruktur.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Beheben Sie die fehlerhafte Aggregationsbeziehung — fast immer ein Export-/Interop-Artefakt, exportieren Sie daher aus dem Autorenwerkzeug neu.',
      tools: {
        revit:
          'Exportieren Sie mit einem aktuellen IFC-Exporter neu. Falls es weiterhin auftritt, prüfen Sie das Modell (Verwalten ▸ Nicht verwendete bereinigen) und suchen Sie nach beschädigten Gruppen oder Baugruppen.',
        archicad:
          'Exportieren Sie mit dem neuesten ARCHICAD-IFC-Add-on neu; führen Sie eine Modellprüfung aus, falls die Beschädigung weiterhin besteht.',
        tekla:
          'Exportieren Sie aus Tekla neu — fehlerhafte Aggregate weisen auf einen Interop-Fehler hin, nicht auf einen Modellierungsfehler.',
        allplan:
          'Exportieren Sie aus Allplan mit einer aktuellen IFC-Schnittstelle neu.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Stellen Sie sicher, dass die räumliche Struktur Projekt ▸ Grundstück ▸ Gebäude ▸ Geschoss folgt. Korrigieren Sie sie vor dem Export im Projekt-Setup des Autorenwerkzeugs.',
      tools: {
        revit:
          'Revit baut diese Hierarchie automatisch aus Projekt ▸ Grundstück ▸ Gebäude ▸ Ebenen auf. Eine fehlerhafte Hierarchie bedeutet meist fehlende Ebenen oder einen benutzerdefinierten Export — prüfen Sie, dass Ebenen existieren, und nutzen Sie die Standard-IFC-Grundstücks-/Gebäudezuordnung.',
        archicad:
          'Prüfen Sie die Hierarchie im IFC-Übersetzer und in den Geschosseinstellungen: Geschosse unter dem Gebäude, Gebäude unter dem Grundstück.',
        tekla:
          'Konfigurieren Sie die vollständige räumliche Hierarchie (Projekt/Grundstück/Gebäude/Geschoss) im IFC-Exportdialog, damit sie vollständig und korrekt geordnet ist.',
        allplan:
          'Definieren Sie die vollständige Bauwerksstruktur (Projekt/Grundstück/Gebäude/Geschoss) in der Struktur-Palette vor dem Export.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Entfernen Sie die zirkuläre Beziehung — ein Element kann nicht sein eigener Vorfahr sein. Dies ist ein Export-/Interop-Artefakt; exportieren Sie aus einer sauberen Kopie neu.',
      tools: {
        revit:
          'Exportieren Sie mit einem aktuellen IFC-Exporter aus einer sauberen Kopie neu; falls es weiterhin auftritt, prüfen und bereinigen Sie das Modell.',
        archicad:
          'Exportieren Sie mit dem neuesten IFC-Add-on neu; führen Sie eine Modellprüfung aus, um die fehlerhafte Beziehung zu finden.',
        tekla:
          'Exportieren Sie aus dem nativen Modell neu — Tekla erzeugt normalerweise keine Referenzzyklen.',
        allplan:
          'Exportieren Sie aus Allplan neu; erstellen Sie die betroffenen Objekte neu, falls der Zyklus weiterhin besteht.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Platzieren Sie das Element in einem Geschoss statt direkt unter dem Gebäude.',
      tools: {
        revit:
          'Weisen Sie das Element einer Ebene zu, damit es unter einem IfcBuildingStorey statt dem Gebäude exportiert wird.',
        archicad:
          'Setzen Sie das Stammgeschoss des Elements, damit es nicht auf Gebäudeebene liegt.',
        tekla:
          'Ordnen Sie das Teil in den räumlichen IFC-Exporteinstellungen einem Geschoss zu.',
        allplan:
          'Verschieben Sie das Objekt zu einem Geschossknoten in der Bauwerksstruktur.',
      },
    },
    // ── Eigenschaften & Typen ────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Verknüpfen Sie das Element mit einem Typ (IfcWallType, IfcDoorType, …), damit Typeigenschaften und Mengen weitergegeben werden.',
      tools: {
        revit:
          'Revit-Familientypen werden automatisch als IfcTypeObject exportiert. Fehlende Typen bedeuten meist Vor-Ort-Familien oder generische Modelle — wandeln Sie sie in ladbare Familien mit definierten Typen um und halten Sie den Typexport in den IFC-Optionen aktiviert.',
        archicad:
          'Verwenden Sie Favoriten / Baustoffe und halten Sie den Export „Type Product“ im IFC-Übersetzer aktiviert, damit Elementtypen geschrieben werden.',
        tekla:
          'Weisen Sie ein Profil und ein Material zu, damit das Teil mit einem Typ exportiert wird; prüfen Sie, dass der IFC-Export Typobjekte schreibt.',
        allplan:
          'Verwenden Sie Bibliotheksobjekte / SmartParts mit definierten Typen und aktivieren Sie den Typexport in der IFC-Schnittstelle.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Fügen Sie dem Element die vom BEP/EIR des Projekts geforderten Eigenschaftssätze vor dem Export hinzu.',
      tools: {
        revit:
          'Fügen Sie die fehlenden Parameter hinzu und ordnen Sie sie dem geforderten Pset über eine im IFC-Export-Setup referenzierte User-Defined-PropertySets-Datei zu.',
        archicad:
          'Definieren Sie das geforderte Pset im Eigenschaften-Manager, weisen Sie es den relevanten Klassifizierungen zu und ordnen Sie es im IFC-Übersetzer zu.',
        tekla:
          'Fügen Sie die Eigenschaften als UDAs hinzu und ordnen Sie sie dem geforderten Pset in den zusätzlichen Eigenschaftssätzen des IFC-Exports zu.',
        allplan:
          'Erstellen Sie die Attribute und ordnen Sie sie dem geforderten Pset in der IFC-Exportkonfiguration zu.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Füllen Sie den leeren Eigenschaftswert aus — eine leere Eigenschaft wird von nachgelagerten Prüfungen als fehlend behandelt.',
      tools: {
        revit:
          'Finden Sie den Parameter und geben Sie einen Wert ein (oder entfernen Sie den leeren Parameter). Eine Liste ist der schnellste Weg, Leerstellen in großer Zahl zu finden und zu füllen.',
        archicad:
          'Verwenden Sie den Eigenschaften-Manager oder eine interaktive Liste, um leere Eigenschaftswerte zu finden und zu füllen.',
        tekla:
          'Füllen Sie die leeren UDA-Werte über die Abfrage-/Berichtswerkzeuge vor dem Export.',
        allplan:
          'Füllen Sie die leeren Attributwerte über die Attribut-Palette oder eine Liste vor dem Export.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Weisen Sie dem Element ein Material zu, damit es Materialdaten trägt (ab LOD 200/300 erwartet).',
      tools: {
        revit:
          'Weisen Sie der Struktur des Elements ein Material zu (Typ bearbeiten ▸ Struktur, oder den Parameter Material). Revit exportiert definierte Materialien als IfcMaterial / Schichtensätze.',
        archicad:
          'Weisen Sie dem Element einen Baustoff (nicht nur eine Oberfläche) zu; ARCHICAD exportiert Baustoffe als IfcMaterial.',
        tekla:
          'Setzen Sie das Teilmaterial in den Teileigenschaften; Tekla exportiert es als zugehöriges IFC-Material.',
        allplan:
          'Weisen Sie dem Element ein Material-/Format-Attribut zu, damit es mit einer Materialzuordnung exportiert wird.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Exportieren Sie in ein aktuelles IFC-Schema (IFC4 / IFC4.3), sofern der Empfänger nicht ausdrücklich IFC2x3 verlangt.',
      tools: {
        revit:
          'Setzen Sie im IFC-Exportdialog die Dateiversion auf IFC4 (z. B. Reference View oder Design Transfer View) statt IFC2x3.',
        archicad:
          'Wählen Sie im IFC-Übersetzer eine IFC4-basierte Export-Voreinstellung statt IFC2x3.',
        tekla:
          'Wählen Sie im IFC-Export den Exporttyp IFC4 statt IFC2x3.',
        allplan:
          'Wählen Sie IFC4 (oder IFC4.3) als Exportschema in den Einstellungen der IFC-Schnittstelle.',
      },
    },
    // ── Kollision (Clash) ────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Lösen Sie die geometrische Kollision zwischen Elementen im Autorenwerkzeug — verschieben, stutzen oder verbinden Sie die kollidierenden Elemente.',
      tools: {
        revit:
          'Führen Sie Zusammenarbeit ▸ Kollisionsüberprüfung aus, um Kollisionen zu finden, und verschieben/stutzen/verbinden Sie dann die Elemente, um die Überschneidung zu lösen.',
        archicad:
          'Verwenden Sie Ablage ▸ Kollisionserkennung, um Überschneidungen zu finden, und passen Sie dann die kollidierenden Elemente an.',
        tekla:
          'Verwenden Sie Verwalten ▸ Kollisionsprüfung, um überlappende Teile zu finden und zu lösen.',
        allplan:
          'Verwenden Sie die Kollisionsprüfung, um Überschneidungen zu finden und die kollidierenden Elemente anzupassen.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Lösen Sie die TGA-Tragwerk-Kollision — verlegen Sie die TGA-Trasse um oder koordinieren Sie eine Durchdringung/Hülse mit dem Tragwerksmodell.',
      tools: {
        revit:
          'Führen Sie die Kollisionsüberprüfung zwischen TGA- und Tragwerkskategorien aus und verlegen Sie dann Leitungen um oder fügen Sie koordinierte Öffnungen/Hülsen hinzu.',
        archicad:
          'Verwenden Sie die Kollisionserkennung zwischen TGA- und Tragwerkselementen und verlegen Sie dann um oder fügen Sie Öffnungen hinzu.',
        tekla:
          'Führen Sie eine Kollisionsprüfung gegen das verknüpfte TGA-Referenzmodell aus und fügen Sie bei Bedarf Durchdringungen/Öffnungen hinzu.',
        allplan:
          'Verwenden Sie die Kollisionsprüfung zwischen TGA und Tragwerk und verlegen Sie um oder fügen Sie Öffnungen hinzu.',
      },
    },
    // ── Dateikopf & Projektmetadaten ─────────────────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Jede IFC muss genau ein IfcProject enthalten. Ein fehlendes Projekt bedeutet einen fehlerhaften Export — exportieren Sie das vollständige Modell neu.',
      tools: {
        revit:
          'Revit schreibt immer ein IfcProject. Ein fehlendes weist auf einen beschädigten oder unvollständigen Export hin — exportieren Sie das vollständige Modell statt einer isolierten Auswahl neu.',
        archicad:
          'Exportieren Sie das Projekt neu; exportieren Sie das Modell, nicht einen isolierten Elementsatz, der die Projektwurzel weglässt.',
        tekla:
          'Exportieren Sie das vollständige Modell neu, damit die IfcProject-Wurzel geschrieben wird.',
        allplan:
          'Exportieren Sie aus dem Projekt neu, damit die Entität IfcProject enthalten ist.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Fügen Sie der räumlichen Struktur ein Gebäude hinzu — definieren Sie ein IfcBuilding im Projekt-Setup des Autorenwerkzeugs.',
      tools: {
        revit:
          'Revit erstellt das Gebäude automatisch; ein fehlendes bedeutet meist einen benutzerdefinierten Export nur des Grundstücks. Prüfen Sie, dass das Projekt Ebenen hat, und nutzen Sie die Standard-Gebäudezuordnung in den IFC-Optionen.',
        archicad:
          'Stellen Sie sicher, dass ein Gebäude in der Projekthierarchie / im IFC-Übersetzer existiert und Geschosse darunter liegen.',
        tekla:
          'Definieren Sie das Gebäude in den Einstellungen der räumlichen Struktur des IFC-Exports.',
        allplan:
          'Fügen Sie einen Gebäudeknoten in der Bauwerksstruktur-Palette hinzu.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Fügen Sie mindestens ein Geschoss (Ebene) unter dem Gebäude hinzu.',
      tools: {
        revit:
          'Erstellen Sie Ebenen im Projekt; Revit exportiert Ebenen als IfcBuildingStorey. Ein Modell ohne Ebenen exportiert keine Geschosse.',
        archicad:
          'Definieren Sie Geschosse über Ablage ▸ Geschosseinstellungen, damit das Gebäude Geschosse hat.',
        tekla:
          'Definieren Sie Ebenen/Geschosse in den räumlichen IFC-Exporteinstellungen.',
        allplan:
          'Fügen Sie Geschossknoten unter dem Gebäude in der Struktur-Palette hinzu.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Füllen Sie das leere Geschoss oder entfernen Sie es — leere Geschosse überladen den räumlichen Baum und deuten oft auf falsch zugeordnete Elemente hin.',
      tools: {
        revit:
          'Löschen Sie nicht verwendete Ebenen, oder prüfen Sie, dass für diese Ebene vorgesehene Elemente ihr (und nicht einer benachbarten Ebene) zugewiesen sind.',
        archicad:
          'Entfernen Sie das nicht verwendete Geschoss oder weisen Sie das Stammgeschoss der Elemente neu zu, damit das Geschoss nicht leer ist.',
        tekla:
          'Entfernen Sie die leere Ebene aus dem Export oder weisen Sie ihr Teile neu zu.',
        allplan:
          'Löschen Sie den leeren Geschossknoten oder weisen Sie ihm Objekte neu zu.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Geben Sie jedem Geschoss eine definierte Höhe — sie ist erforderlich, um Ebenen vertikal zu platzieren und Grundrisse zu erzeugen.',
      tools: {
        revit:
          'Ebenen tragen in Revit immer eine Höhe; ein Null-Wert bedeutet meist einen benutzerdefinierten Export. Prüfen Sie, dass Ebenen numerische Höhen haben, und nutzen Sie den Standard-IFC-Ebenenexport.',
        archicad:
          'Setzen Sie die Höhe jedes Geschosses in Ablage ▸ Geschosseinstellungen, damit sie nicht null ist.',
        tekla:
          'Stellen Sie sicher, dass jede Ebene vor dem Export in den Ebenen-/Rastereinstellungen eine definierte Höhe hat.',
        allplan:
          'Definieren Sie Höhe/Niveau jedes Geschosses in der Bauwerksstruktur, damit ein Wert exportiert wird.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Setzen Sie die Dateibeschreibung (üblicherweise das MVD / die Sichtdefinition) in den Exportoptionen — sie ist Teil der STEP-Kopfmetadaten.',
      tools: {
        revit:
          'FILE_DESCRIPTION wird aus dem gewählten MVD gesetzt (z. B. Reference View). Die Auswahl eines geeigneten Export-Setups im IFC-Dialog füllt es.',
        archicad:
          'Die MVD-Auswahl des IFC-Übersetzers füllt FILE_DESCRIPTION; wählen Sie eine definierte Export-Voreinstellung.',
        tekla:
          'Der Exporttyp / das MVD setzt FILE_DESCRIPTION; wählen Sie eine definierte IFC-Exportkonfiguration.',
        allplan:
          'Wählen Sie eine definierte IFC-Export-Voreinstellung, damit die Dateibeschreibung / das MVD geschrieben wird.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Füllen Sie Autor und Organisation im Export oder in der Projektinfo aus — für die Rückverfolgbarkeit erforderlich (ISO 19650).',
      tools: {
        revit:
          'Setzen Sie den Autor im IFC-Export-Setup (Setup ändern) oder in Verwalten ▸ Projektinformationen; dies füllt das Autorfeld von FILE_NAME in STEP.',
        archicad:
          'Setzen Sie Autor und Firma in Ablage ▸ Info ▸ Projektinfo und dem IFC-Übersetzer, damit sie in den Kopf geschrieben werden.',
        tekla:
          'Setzen Sie Autor/Organisation in den erweiterten Einstellungen des IFC-Exports.',
        allplan:
          'Setzen Sie Autor/Organisation in der Projektinfo / den IFC-Exporteinstellungen.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Setzen Sie den langen Projektnamen (den beschreibenden Projekttitel) in den Projektinformationen des Autorenwerkzeugs.',
      tools: {
        revit:
          'Setzen Sie Projektname / Projektausgabename in Verwalten ▸ Projektinformationen und ordnen Sie es im IFC-Export-Setup IfcProject.LongName zu.',
        archicad:
          'Setzen Sie Projektname/-beschreibung in Ablage ▸ Info ▸ Projektinfo; der IFC-Übersetzer ordnet es IfcProject.LongName zu.',
        tekla:
          'Setzen Sie den Projektnamen in den Projekteigenschaften und ordnen Sie ihn beim Export IfcProject.LongName zu.',
        allplan:
          'Setzen Sie Projektname/-beschreibung in der Projektinfo, damit IfcProject.LongName gefüllt wird.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Vervollständigen Sie die Projektmetadaten (langer Name, Beschreibung, Projektphase/-typ), die von den ISO-19650-Informationsanforderungen verlangt werden.',
      tools: {
        revit:
          'Füllen Sie Projektname, Beschreibung und Status/Phase in Verwalten ▸ Projektinformationen und ordnen Sie sie im IFC-Export-Setup den IfcProject-Feldern zu.',
        archicad:
          'Vervollständigen Sie die Projektinfo in Ablage ▸ Info ▸ Projektinfo und ordnen Sie die Felder im IFC-Übersetzer zu.',
        tekla:
          'Vervollständigen Sie die Projekteigenschaften und ordnen Sie sie beim Export den IfcProject-Feldern zu.',
        allplan:
          'Vervollständigen Sie die Projektinfo, damit IfcProject LongName, Description und ObjectType trägt.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Fügen Sie sowohl Autor als auch Organisation zum Export hinzu, damit das Lieferobjekt gemäß ISO 19650 rückverfolgbar ist.',
      tools: {
        revit:
          'Setzen Sie Autor und Organisation im IFC-Export-Setup / in den Projektinformationen, damit beide im STEP-Kopf erscheinen.',
        archicad:
          'Setzen Sie Autor und Firma in der Projektinfo und dem IFC-Übersetzer.',
        tekla:
          'Setzen Sie Autor und Organisation in den erweiterten Einstellungen des IFC-Exports.',
        allplan:
          'Setzen Sie Autor und Organisation im Projekt / den IFC-Exporteinstellungen.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Benennen Sie die Exportdatei nach dem ISO-19650-Schema: Projekt-Urheber-Volumen-Ebene-Typ-Rolle-Nummer.',
      tools: {
        revit:
          'Revit übernimmt den Dateinamen aus dem Speichern-Dialog des Exports — benennen Sie die Datei beim Export nach dem ISO-19650-Schema (oder benennen Sie sie danach um).',
        archicad:
          'Setzen Sie den Dateinamen nach dem ISO-19650-Schema im Exportdialog, oder benennen Sie die exportierte Datei um.',
        tekla:
          'Benennen Sie die IFC-Ausgabe nach dem ISO-19650-Schema im Exportdialog.',
        allplan:
          'Benennen Sie die exportierte Datei nach dem ISO-19650-Schema im Exportdialog.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Fügen Sie die auf der deklarierten LOD/LOIN-Stufe geforderten Eigenschaftssätze hinzu (gemäß dem Informationslieferungsplan des Projekts).',
      tools: {
        revit:
          'Ordnen Sie die vom LOD geforderten Parameter über eine User-Defined-PropertySets-Datei im IFC-Export ihren Psets zu und stellen Sie sicher, dass die Elemente diese Parameter tatsächlich tragen.',
        archicad:
          'Definieren Sie die LOD-Psets im Eigenschaften-Manager, weisen Sie sie den relevanten Klassifizierungen zu und ordnen Sie sie im IFC-Übersetzer zu.',
        tekla:
          'Fügen Sie die vom LOD geforderten Eigenschaften als UDAs hinzu und ordnen Sie sie beim Export den Psets zu.',
        allplan:
          'Erstellen Sie die LOD-Attribute und ordnen Sie sie den geforderten Psets im IFC-Export zu.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Aktivieren Sie den Export von Basismengen, damit Elemente IfcElementQuantity (Fläche/Volumen/Länge) auf der deklarierten LOD-Stufe tragen.',
      tools: {
        revit:
          'Aktivieren Sie „Basismengen exportieren“ in den IFC-Exportoptionen; Revit schreibt dann IfcElementQuantity für Elemente.',
        archicad:
          'Aktivieren Sie den Export von Basismengen in den Einstellungen des IFC-Übersetzers.',
        tekla:
          'Aktivieren Sie den Export von Mengen / Basismengen in der IFC-Exportkonfiguration.',
        allplan:
          'Aktivieren Sie Basismengen in den IFC-Exporteinstellungen.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Definieren Sie einen Schichtaufbau an Wänden und Decken, damit sie bei LOD 300+ ein IfcMaterialLayerSetUsage exportieren.',
      tools: {
        revit:
          'Definieren Sie die Struktur-Schichten des Wand-/Boden-Typs (Typ bearbeiten ▸ Struktur) mit Materialien; Revit exportiert mehrschichtige Aufbauten als IfcMaterialLayerSet.',
        archicad:
          'Verwenden Sie mehrschichtige Aufbauten (nicht einen einzelnen Baustoff) für Wände/Decken, damit Schichten als IfcMaterialLayerSet exportiert werden.',
        tekla:
          'Tekla-Teile sind typischerweise einschichtig; definieren Sie für mehrschichtige Elemente die Schichten/Materialien, damit der Schichtensatz exportiert wird, oder prüfen Sie, ob diese Regel für Ihre Disziplin gilt.',
        allplan:
          'Verwenden Sie mehrschichtige Bauteile, damit der Materialschichtensatz exportiert wird.',
      },
    },
    // ── Klassifizierung ──────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Hängen Sie eine Klassifizierungsreferenz (Uniclass, OmniClass usw.) an, damit das Element seinen Standardcode als IfcRelAssociatesClassification trägt.',
      tools: {
        revit:
          'Verwenden Sie ein Klassifizierungs-Add-in (z. B. den kostenlosen Classification Manager for Revit), um einen Uniclass-/OmniClass-Code zuzuweisen, oder ordnen Sie einen gemeinsam genutzten Parameter im IFC-Export-Setup IfcClassificationReference zu. Ohne Zuordnung exportiert Revit keine Klassifizierung.',
        archicad:
          'Öffnen Sie die Palette Klassifizierung und Eigenschaften, wählen Sie ein Klassifizierungssystem (integriert oder importiert) und weisen Sie dem Element ein Klassifizierungselement zu. ARCHICAD exportiert diese automatisch als IfcClassificationReference.',
        tekla:
          'Weisen Sie die Klassifizierung über eine UDA oder die Tekla–IFC-Eigenschaftszuordnung zu und ordnen Sie dieses Attribut dann in den zusätzlichen Eigenschaftssätzen des IFC-Exports IfcClassificationReference zu.',
        allplan:
          'Weisen Sie den Klassifizierungscode über die Objektattribute zu und stellen Sie sicher, dass die IFC-Exportkonfiguration ihn IfcClassificationReference zuordnet.',
      },
    },
    // ── TGA / MEP ────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Weisen Sie TGA-Elemente einem System zu, damit sie innerhalb eines IfcSystem exportiert werden — für die systembasierte Koordination erforderlich.',
      tools: {
        revit:
          'Stellen Sie sicher, dass Kanäle/Rohre/Geräte zu einem benannten Revit-System gehören; nicht zugewiesene Elemente werden ohne IfcSystem exportiert. Verwenden Sie den System-Browser, um sie zu finden und zuzuweisen.',
        archicad:
          'Weisen Sie TGA-Elemente im MEP Modeler einem TGA-System zu, damit sie innerhalb eines IfcSystem exportiert werden.',
        allplan:
          'Weisen Sie TGA-Objekte einem System/Netz zu, damit sie innerhalb eines IfcSystem exportiert werden.',
      },
    },
    // ── Geometrie & Dateizustand ─────────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Reduzieren Sie IfcBuildingElementProxy-Elemente, indem Sie sie passenden IFC-Klassen zuordnen — Proxys tragen keinen semantischen Typ.',
      tools: {
        revit:
          'Proxys stammen von Vor-Ort-Familien, generischen Modellen oder nicht zugeordneten Kategorien. Verwenden Sie die IFC-Export-Klassenzuordnungstabelle, um diese Kategorien echten IFC-Typen statt IfcBuildingElementProxy zuzuordnen, und wandeln Sie Vor-Ort-Familien in ladbare Familien um.',
        archicad:
          'Weisen Sie Objekten passende Klassifizierungen / IFC-Typen zu (insbesondere Morphs und benutzerdefinierte Objekte), damit sie nicht als Proxys exportiert werden.',
        tekla:
          'Ordnen Sie benutzerdefinierte oder Proxy-Teile in den IFC-Exporteinstellungen der richtigen IFC-Entität zu.',
        allplan:
          'Weisen Sie generischen Objekten den richtigen IFC-Typ zu, damit sie nicht als Proxys exportiert werden.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Halten Sie das Modell nahe dem internen Ursprung und georeferenzieren Sie es korrekt, statt mit großen realen Koordinaten zu modellieren.',
      tools: {
        revit:
          'Modellieren Sie nicht weit vom internen Ursprung von Revit entfernt. Verwenden Sie gemeinsame Koordinaten mit einem Vermessungspunkt / Projektbasispunkt und exportieren Sie mit den aktuellen gemeinsamen Koordinaten, damit die Geometrie nahe dem Ursprung bleibt und die Georeferenzierung erhalten bleibt.',
        archicad:
          'Setzen Sie den Vermessungspunkt und den Projektursprung; halten Sie das Modell nahe dem Ursprung und verwenden Sie die IFC-Georeferenzierung (IfcMapConversion) statt eines großen Versatzes.',
        tekla:
          'Setzen Sie den Basis-/Arbeitspunkt und halten Sie das Modell nahe dem Ursprung; verwenden Sie den Basispunkt des IFC-Exports, damit die Koordinaten nicht riesig werden.',
        allplan:
          'Setzen Sie eine Projekt-Georeferenzierung/einen Basispunkt und halten Sie die Geometrie nahe dem Ursprung statt bei realen Koordinaten.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Reduzieren Sie das Dateigewicht: senken Sie Tessellierung/Detail, vermeiden Sie eingebettete Texturen und exportieren Sie nur das Nötige.',
      tools: {
        revit:
          'Senken Sie den Detaillierungsgrad für den Export, vermeiden Sie den Export von importiertem CAD und sehr polygonreichen Familien und trennen Sie Disziplinen. Das MVD Reference View erzeugt leichtere tessellierte Geometrie.',
        archicad:
          'Reduzieren Sie die Kurven-/Segmentauflösung, vermeiden Sie das Einbetten von Texturen, verwenden Sie eine schlanke IFC-Übersetzer-Voreinstellung und exportieren Sie nur die nötigen Elemente.',
        tekla:
          'Reduzieren Sie das Detail/die Darstellung der Exportgeometrie und vermeiden Sie den unnötigen Export von Referenzmodellen.',
        allplan:
          'Senken Sie die Geometrieauflösung und vermeiden Sie das Einbetten von Texturen im IFC-Export.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Verwaiste IfcOpeningElement-Aussparungen neu zuordnen oder löschen — jede Öffnung muss über IfcRelVoidsElement ein Wirtselement durchdringen.',
      tools: {
        revit:
          'Verwaiste Öffnungen stammen von gelöschten/geänderten Wirten oder lose exportierten Schacht-Öffnungen. Löschen Sie lose Öffnungen und erzeugen Sie die Aussparung erneut am Wirt (Wand/Decke/Dach), damit die Beziehung exportiert wird; setzen Sie Türen/Fenster bei verlorenem Schnitt neu ein.',
        archicad:
          'Öffnungen müssen zu einer Wand/Decke gehören. Entfernen Sie freistehende Öffnungsobjekte und nutzen Sie das Öffnungswerkzeug (oder Tür/Fenster) am Wirt verankert, damit ArchiCAD IfcRelVoidsElement exportiert.',
        tekla:
          'Erzeugen Sie den Schnitt/die Öffnung als Feature des Wirt-Teils statt als loses Objekt, damit die Aussparung beim Export auf einen Wirt verweist.',
        allplan:
          'Setzen Sie Öffnungen mit den Wand-/Decken-Öffnungswerkzeugen, damit sie zu einem Wirt gehören; löschen Sie losgelöste Öffnungskörper.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Geben Sie jedem IfcBuildingStorey eine eindeutige Elevation — Geschosse mit gleicher Höhe stören Plangenerierung und Geschossfilter.',
      tools: {
        revit:
          'Zwei Ebenen teilen dieselbe Höhe. Vergeben Sie in der Ebenen-Ansicht je Ebene eine eindeutige Höhe (oder löschen Sie das Duplikat) und exportieren Sie nur echte Geschosse als Ebene (bei anderen „Geschossebene“/Export deaktivieren).',
        archicad:
          'Öffnen Sie die Geschoss-Einstellungen und setzen Sie je Geschoss eine eindeutige Höhe; führen Sie doppelte Geschosse gleicher Höhe zusammen oder löschen Sie sie.',
        tekla:
          'Weisen Sie in der Ebenen-/Phasenliste jeder für die IFC-Geschossstruktur genutzten Ebene eine eindeutige Höhe zu und entfernen Sie Duplikate.',
        allplan:
          'Setzen Sie in der Bauwerksstruktur unterschiedliche Höhen je Geschoss und entfernen Sie doppelte Geschosse mit gleicher Höhe.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordnen Sie Geschosse so, dass ihre Elevation von unten nach oben steigt — vertauschte Höhen verwirren Schnitt-/Plan-Werkzeuge und Prüfer.',
      tools: {
        revit:
          'Eine untere Ebene hat eine höhere Höhe (oder umgekehrt). Korrigieren Sie die Ebenenhöhen oder die Exportreihenfolge, damit Geschosse von unten nach oben gelesen werden, und prüfen Sie Keller-/Dachebenen mit negativen Höhen.',
        archicad:
          'Korrigieren Sie in den Geschoss-Einstellungen die Höhe jedes Geschosses außer der Reihe, damit die Höhen mit dem Geschossindex steigen.',
        tekla:
          'Ordnen/nummerieren Sie die Ebenen so um, dass ihre Höhen aufsteigen; korrigieren Sie jede Ebene, deren Höhe der Position widerspricht.',
        allplan:
          'Ordnen Sie in der Bauwerksstruktur die Geschosse um oder korrigieren Sie ihre Höhen, damit die Höhen nach oben zunehmen.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Exportieren Sie in metrischem SI (Millimeter/Meter) — imperiale Längeneinheiten brechen die Interoperabilität mit den meisten IFC/BIM-Tools.',
      tools: {
        revit:
          'Revits interne Einheiten sind imperial, das IFC soll aber metrisch sein. Stellen Sie die Projekteinheiten auf metrisch (oder prüfen Sie, dass der IFC-Export SI/metrisch nutzt), damit die IFCSIUNIT in Metern ist.',
        archicad:
          'Stellen Sie die Arbeitseinheiten (und Berechnungseinheiten) des Projekts auf metrisch, damit das IFC-Schema SI-Längeneinheiten exportiert.',
        tekla:
          'Stellen Sie Umgebung/Rolle oder die Exporteinstellungen auf metrisch, damit der IFC-LENGTHUNIT SI ist (mm/m).',
        allplan:
          'Stellen Sie die Längeneinheiten in den Projektoptionen auf metrisch, damit der IFC-Export SI-Einheiten nutzt.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Ergänzen Sie Flächenmengen an IfcSpace — exportieren Sie BaseQuantities, damit jeder Raum NetFloorArea/GrossFloorArea trägt.',
      tools: {
        revit:
          'Räume exportieren als IfcSpace, aber ohne Mengen. Aktivieren Sie „Basismengen exportieren“ (Pset/QTO) in den IFC-Exportoptionen und stellen Sie sicher, dass Räume korrekt begrenzt/platziert sind, damit Flächen berechnet werden.',
        archicad:
          'Nutzen Sie Zonen für Räume und aktivieren Sie die Basismengen im IFC-Übersetzer, damit IfcSpace NetFloorArea/GrossFloorArea exportiert.',
        tekla:
          'Räume sind in Tekla begrenzt; falls erforderlich, definieren Sie sie und aktivieren den Mengenexport, oder erzeugen Sie sie im Architekturmodell.',
        allplan:
          'Erstellen Sie Räume und aktivieren Sie den IFC-Mengenexport, damit IfcSpace Flächenmengen trägt.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Verbinden Sie MEP-Segmente über Ports — getrennte Rohre/Kanäle exportieren ohne IfcDistributionPort-Beziehungen und brechen die Systemverfolgung.',
      tools: {
        revit:
          'Getrennte Kanäle/Rohre exportieren ohne Ports. Beheben Sie offene Anschlüsse im MEP-Modell (keine Lücken/losen Enden), halten Sie Segmente in verbundenen Systemen und aktivieren Sie den System-/Port-Export, damit IfcDistributionPort-Beziehungen geschrieben werden.',
        archicad:
          'Nutzen Sie den MEP Modeler, damit Trassen durchgehend verbunden bleiben; exportieren Sie MEP-Systeme, um Ports/Verbindungen einzuschließen.',
        tekla:
          'MEP ist nicht Teklas Domäne; modellieren Sie verbundenes MEP im dedizierten MEP-Werkzeug, damit Segmente Ports tragen, und föderieren Sie dann.',
        allplan:
          'Modellieren Sie MEP-Stränge durchgehend verbunden (keine offenen Enden), damit der IFC-Export Verteil-Ports zwischen Segmenten schreibt.',
      },
    },
  },
  pt: {
    // ── Nomenclatura e identidade ────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Atribua um Nome significativo ao elemento para que seja identificável em tabelas, na árvore do modelo e na coordenação posterior.',
      tools: {
        revit:
          'O Revit mapeia o Nome do Tipo de uma família para o IfcName na exportação. Abra as Propriedades de tipo do elemento e dê ao tipo um nome descritivo em vez do padrão (p. ex. renomeie "Basic Wall 1"). Para nomear ao nível da ocorrência, mapeie um parâmetro compartilhado para IfcName na tabela de mapeamento de exportação IFC.',
        archicad:
          'Selecione o elemento e abra o Gestor IFC (clique direito ▸ Gestor IFC) ou a paleta Classificação e Propriedades; defina aí IfcRoot.Name, ou configure o mapeamento nas definições de propriedades do Tradutor IFC antes de exportar.',
        tekla:
          'O campo Name da peça é mapeado para o IfcName. Abra as propriedades da peça, introduza um Name e confirme que a definição de exportação IFC mapeia esse atributo para IfcName.',
        allplan:
          'Atribua um atributo que o Allplan mapeie para IfcName através da paleta de Propriedades, ou defina o mapeamento de IfcName na configuração de exportação IFC.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Defina o LongName em espaços, pisos e no edifício — contém o nome legível da sala/piso usado em tabelas e no COBie.',
      tools: {
        revit:
          'Para espaços, defina o Nome de Ambiente/Área (o Revit mapeia Nome de Ambiente → IfcLongName e Número de Ambiente → IfcName). Para pisos, dê a cada Nível um Nome descritivo. Para o edifício, defina o nome nas opções de exportação IFC.',
        archicad:
          'Defina o Nome de Zona nos espaços (mapeia para IfcLongName) e nomeie os pisos via Desenho ▸ Configurações de piso. Defina o nome longo do edifício em Arquivo ▸ Info ▸ Info do projeto / o Tradutor IFC.',
        tekla:
          'Espaços e pisos raramente são modelados no Tekla; quando existirem, defina o Name/UDA mapeado para IfcLongName, ou defina os nomes de piso nas definições espaciais da exportação IFC.',
        allplan:
          'Defina o nome da sala (mapeia para IfcLongName), nomeie os pisos na estrutura do edifício e defina o nome longo do edifício na exportação IFC.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Torne únicos os nomes de elementos irmãos (ou apoie-se em tipo + número de ocorrência) para que sejam distinguíveis em tabelas e coordenação.',
      tools: {
        revit:
          'Nomes duplicados costumam vir de nomes de tipo ou marcas idênticos. Use o parâmetro de ocorrência Marca (único por elemento) ou renomeie os tipos, e resolva os avisos de Marca duplicada do Revit.',
        archicad:
          'Use o Gestor de ID (Documento ▸ Gestor de ID) para atribuir automaticamente IDs de elemento únicos para que os irmãos não partilhem um Nome.',
        tekla:
          'Execute a numeração (Desenhos e relatórios ▸ Numeração) para que cada peça obtenha uma marca de posição/peça única mapeada para Name.',
        allplan:
          'Atribua valores de atributo únicos (p. ex. número de componente) através da paleta de atributos para que os irmãos não partilhem um Nome.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Renomeie os elementos para seguir o padrão de nomenclatura do BEP do projeto (normalmente definido no EIR / requisitos de informação ISO 19650).',
      tools: {
        revit:
          'Padronize os nomes de tipo e o parâmetro mapeado para IfcName de acordo com o BEP. Use um parâmetro compartilhado ou um script Dynamo para renomeação em massa e mapeie-o para IfcName na exportação.',
        archicad:
          'Aplique o padrão através do Gestor de ID e alinhe a propriedade mapeada para IfcName (paleta Classificação e Propriedades) com o BEP.',
        tekla:
          'Configure a série de numeração e a nomeação de peças de acordo com o BEP e execute novamente a numeração.',
        allplan:
          'Use modelos de atributos / favoritos para impor a nomenclatura do BEP e mapeie esse atributo para IfcName na exportação.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Cada elemento deve ter um GlobalId único. Esta ferramenta pode corrigir duplicados automaticamente (clique em Aplicar correção); para evitar na origem, corrija o fluxo de exportação abaixo.',
      tools: {
        revit:
          'GUIDs duplicados costumam vir de copiar/colar elementos entre modelos ou arquivos vinculados. Evite duplicar elementos entre modelos exportados e exporte novamente a partir de uma cópia limpa. Para elementos agrupados ou espelhados que partilham um parâmetro IfcGUID, limpe esse parâmetro para que o Revit regenere um valor único.',
        archicad:
          'GUIDs duplicados surgem tipicamente ao copiar elementos entre projetos ou fundir módulos. Regenere IDs únicos (Desenho ▸ Gestor de ID de elemento) e evite copiar elementos entre arquivos sem regenerar os GlobalId.',
        tekla:
          'GUIDs duplicados vêm de objetos copiados entre modelos. Exporte novamente a partir do modelo de origem — o Tekla atribui um GUID único por objeto na criação.',
        allplan:
          'GUIDs duplicados vêm de copiar objetos entre documentos. Recrie ou exporte novamente os objetos afetados para que o Allplan regenere GlobalId únicos.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'O GlobalId deve ser uma cadeia IFC base-64 de 22 caracteres. Esta ferramenta pode corrigir o formato automaticamente; na origem, evite pós-processamento que reescreva GUIDs.',
      tools: {
        revit:
          'O Revit escreve IfcGUIDs conformes por padrão. Formatos inválidos costumam vir de scripts de terceiros ou de um parâmetro IfcGUID editado manualmente — limpe o parâmetro para que o Revit regenere um GUID válido de 22 caracteres na exportação.',
        archicad:
          'O ARCHICAD gera GlobalId conformes. Valores inválidos costumam vir de edições externas ou complementos; regenere os IDs ou exporte novamente sem o complemento problemático.',
        tekla:
          'O Tekla escreve GUIDs válidos nativamente; valores inválidos costumam vir de scripts de interoperabilidade — exporte novamente a partir do modelo nativo.',
        allplan:
          'O Allplan gera GlobalId válidos; se inválidos, recrie ou exporte novamente os objetos afetados.',
      },
    },
    // ── Estrutura e hierarquia ───────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Coloque o elemento dentro de um contentor espacial (piso ou espaço) para que apareça na árvore do modelo e nas ferramentas posteriores.',
      tools: {
        revit:
          'Os órfãos vêm de elementos não atribuídos a um Nível (grupos, geometria importada, elementos sem hospedeiro). Atribua o elemento a um Nível para que o Revit o exporte dentro de um IfcBuildingStorey.',
        archicad:
          'Verifique a definição de Piso de Origem do elemento — elementos sem piso de origem são exportados como órfãos. Atribua um.',
        tekla:
          'Atribua a peça à estrutura de fase/nível usada pela exportação IFC para que receba um contentor espacial; verifique as definições de estrutura espacial da exportação.',
        allplan:
          'Atribua o elemento a um nó de piso na paleta de estrutura do edifício para que não seja exportado órfão.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Mova o elemento para o contentor espacial correto — elementos físicos do edifício pertencem a um piso (ou espaço), não diretamente sob o Terreno ou o Projeto.',
      tools: {
        revit:
          'Reatribua o elemento a um Nível do edifício. Componentes de terreno e topografia podem ficar ao nível do terreno, mas elementos do edifício devem estar num Nível.',
        archicad:
          'Defina o Piso de Origem do elemento no piso correto; evite colocar elementos do edifício ao nível do terreno.',
        tekla:
          'Ajuste o mapeamento do contentor espacial na exportação IFC para que as peças fiquem no piso correto em vez do terreno.',
        allplan:
          'Mova o objeto para o nó de piso correto na estrutura do edifício.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Corrija a relação de agregação quebrada — quase sempre é um artefacto de exportação/interoperabilidade, por isso exporte novamente a partir da ferramenta de autoria.',
      tools: {
        revit:
          'Exporte novamente com um exportador IFC atualizado. Se persistir, audite o modelo (Gerir ▸ Limpar não utilizados) e procure grupos ou conjuntos corrompidos.',
        archicad:
          'Exporte novamente com o complemento IFC do ARCHICAD mais recente; execute uma verificação do modelo se a corrupção persistir.',
        tekla:
          'Exporte novamente a partir do Tekla — agregados quebrados indicam uma falha de interoperabilidade, não um erro de modelação.',
        allplan:
          'Exporte novamente a partir do Allplan com uma interface IFC atualizada.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Garanta que a estrutura espacial segue Projeto ▸ Terreno ▸ Edifício ▸ Piso. Corrija-a na configuração do projeto da ferramenta de autoria antes de exportar.',
      tools: {
        revit:
          'O Revit constrói esta hierarquia automaticamente a partir de Projeto ▸ Terreno ▸ Edifício ▸ Níveis. Uma hierarquia quebrada costuma significar Níveis em falta ou uma exportação personalizada — verifique que existem Níveis e use a atribuição de terreno/edifício IFC padrão.',
        archicad:
          'Verifique a hierarquia no Tradutor IFC e nas Configurações de piso: pisos sob o edifício, edifício sob o terreno.',
        tekla:
          'Configure a hierarquia espacial completa (projeto/terreno/edifício/piso) na caixa de diálogo de exportação IFC para que esteja completa e corretamente ordenada.',
        allplan:
          'Defina a estrutura completa do edifício (projeto/terreno/edifício/piso) na paleta de estrutura antes de exportar.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Remova a relação circular — um elemento não pode ser o seu próprio ancestral. É um artefacto de exportação/interoperabilidade; exporte novamente a partir de uma cópia limpa.',
      tools: {
        revit:
          'Exporte novamente com um exportador IFC atualizado a partir de uma cópia limpa; se persistir, audite e limpe o modelo.',
        archicad:
          'Exporte novamente com o complemento IFC mais recente; execute uma verificação do modelo para encontrar a relação problemática.',
        tekla:
          'Exporte novamente a partir do modelo nativo — o Tekla normalmente não cria ciclos de referência.',
        allplan:
          'Exporte novamente a partir do Allplan; recrie os objetos afetados se o ciclo persistir.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Coloque o elemento dentro de um piso em vez de diretamente sob o edifício.',
      tools: {
        revit:
          'Atribua o elemento a um Nível para que seja exportado sob um IfcBuildingStorey em vez do edifício.',
        archicad:
          'Defina o Piso de Origem do elemento para que não fique ao nível do edifício.',
        tekla:
          'Mapeie a peça para um piso nas definições espaciais da exportação IFC.',
        allplan:
          'Mova o objeto para um nó de piso na estrutura do edifício.',
      },
    },
    // ── Propriedades e tipos ─────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Associe o elemento a um tipo (IfcWallType, IfcDoorType, …) para que propriedades e quantidades de tipo se propaguem.',
      tools: {
        revit:
          'Os tipos de família do Revit são exportados como IfcTypeObject automaticamente. A falta de tipos costuma significar famílias no local ou modelos genéricos — converta-os em famílias carregáveis com tipos definidos e mantenha a exportação de tipos ativada nas opções IFC.',
        archicad:
          'Use favoritos / materiais de construção e mantenha a exportação de "Type Product" ativada no Tradutor IFC para que os tipos de elemento sejam escritos.',
        tekla:
          'Atribua um perfil e um material para que a peça seja exportada com um tipo; verifique que a exportação IFC escreve objetos de tipo.',
        allplan:
          'Use objetos de biblioteca / SmartParts com tipos definidos e ative a exportação de tipos na interface IFC.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Adicione ao elemento o(s) conjunto(s) de propriedades exigidos pelo BEP/EIR do projeto antes de exportar.',
      tools: {
        revit:
          'Adicione os parâmetros em falta e mapeie-os para o Pset exigido através de um arquivo User Defined PropertySets referenciado na configuração de exportação IFC.',
        archicad:
          'Defina o Pset exigido no Gestor de Propriedades, atribua-o às classificações relevantes e mapeie-o no Tradutor IFC.',
        tekla:
          'Adicione as propriedades como UDAs e mapeie-as para o Pset exigido nos conjuntos de propriedades adicionais da exportação IFC.',
        allplan:
          'Crie os atributos e mapeie-os para o Pset exigido na configuração de exportação IFC.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Preencha o valor de propriedade vazio — uma propriedade vazia é tratada como em falta pelas verificações posteriores.',
      tools: {
        revit:
          'Localize o parâmetro e introduza um valor (ou remova o parâmetro vazio). Uma tabela é a forma mais rápida de encontrar e preencher vazios em massa.',
        archicad:
          'Use o Gestor de Propriedades ou uma tabela interativa para encontrar e preencher os valores de propriedade vazios.',
        tekla:
          'Preencha os valores de UDA vazios através das ferramentas de consulta/relatório antes de exportar.',
        allplan:
          'Preencha os valores de atributo vazios através da paleta de atributos ou de uma lista antes de exportar.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Atribua um material ao elemento para que transporte dados de material (esperado a partir do LOD 200/300).',
      tools: {
        revit:
          'Atribua um material à estrutura do elemento (Editar tipo ▸ Estrutura, ou o parâmetro Material). O Revit exporta os materiais definidos como IfcMaterial / conjuntos de camadas.',
        archicad:
          'Atribua um Material de Construção (não apenas uma superfície) ao elemento; o ARCHICAD exporta Materiais de Construção como IfcMaterial.',
        tekla:
          'Defina o material da peça nas suas propriedades; o Tekla exporta-o como o material IFC associado.',
        allplan:
          'Atribua um atributo de material/formato ao elemento para que seja exportado com uma associação de material.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Exporte para um esquema IFC atual (IFC4 / IFC4.3) a menos que o destinatário exija explicitamente IFC2x3.',
      tools: {
        revit:
          'Na caixa de diálogo de exportação IFC, defina a Versão de Arquivo como IFC4 (p. ex. Reference View ou Design Transfer View) em vez de IFC2x3.',
        archicad:
          'No Tradutor IFC, escolha uma predefinição de exportação baseada em IFC4 em vez de IFC2x3.',
        tekla:
          'Na exportação IFC, selecione o tipo de exportação IFC4 em vez de IFC2x3.',
        allplan:
          'Selecione IFC4 (ou IFC4.3) como esquema de exportação nas definições da interface IFC.',
      },
    },
    // ── Conflitos (clash) ────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Resolva o conflito geométrico entre elementos na ferramenta de autoria — mova, apare ou una os elementos em conflito.',
      tools: {
        revit:
          'Execute Colaborar ▸ Verificação de interferências para localizar conflitos e depois mova/apare/una os elementos para resolver a sobreposição.',
        archicad:
          'Use Desenho ▸ Deteção de colisões para encontrar sobreposições e depois ajuste os elementos em conflito.',
        tekla:
          'Use Gerir ▸ Verificação de conflitos para encontrar e resolver peças sobrepostas.',
        allplan:
          'Use a verificação de colisões para localizar sobreposições e ajustar os elementos em conflito.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Resolva o conflito MEP-estrutura — redirecione o traçado MEP ou coordene uma penetração/manga com o modelo estrutural.',
      tools: {
        revit:
          'Execute a Verificação de interferências entre as categorias MEP e estruturais e depois redirecione as instalações ou adicione aberturas/mangas coordenadas.',
        archicad:
          'Use a Deteção de colisões entre elementos MEP e estruturais e depois redirecione ou adicione aberturas.',
        tekla:
          'Execute uma verificação de conflitos contra o modelo de referência MEP vinculado e adicione penetrações/aberturas onde necessário.',
        allplan:
          'Use a verificação de colisões entre MEP e estrutura e redirecione ou adicione aberturas.',
      },
    },
    // ── Cabeçalho do arquivo e metadados do projeto ──────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Todo IFC deve conter exatamente um IfcProject. A sua ausência indica uma exportação quebrada — exporte novamente o modelo completo.',
      tools: {
        revit:
          'O Revit escreve sempre um IfcProject. A sua ausência indica uma exportação corrompida ou parcial — exporte novamente o modelo completo em vez de uma seleção isolada.',
        archicad:
          'Exporte novamente o projeto; exporte o modelo, não um conjunto de elementos isolado que dispense a raiz do projeto.',
        tekla:
          'Exporte novamente o modelo completo para que a raiz IfcProject seja escrita.',
        allplan:
          'Exporte novamente a partir do projeto para que a entidade IfcProject seja incluída.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Adicione um edifício à estrutura espacial — defina um IfcBuilding na configuração do projeto da ferramenta de autoria.',
      tools: {
        revit:
          'O Revit cria o edifício automaticamente; a sua ausência costuma significar uma exportação personalizada só do terreno. Verifique que o projeto tem Níveis e use a atribuição de edifício padrão nas opções IFC.',
        archicad:
          'Garanta que existe um edifício na hierarquia do projeto / Tradutor IFC e que os pisos ficam sob ele.',
        tekla:
          'Defina o edifício nas definições de estrutura espacial da exportação IFC.',
        allplan:
          'Adicione um nó de edifício na paleta de estrutura do edifício.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Adicione pelo menos um piso (nível) sob o edifício.',
      tools: {
        revit:
          'Crie Níveis no projeto; o Revit exporta Níveis como IfcBuildingStorey. Um modelo sem Níveis não exporta pisos.',
        archicad:
          'Defina pisos via Desenho ▸ Configurações de piso para que o edifício tenha pisos.',
        tekla:
          'Defina níveis/pisos nas definições espaciais da exportação IFC.',
        allplan:
          'Adicione nós de piso sob o edifício na paleta de estrutura.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Preencha o piso vazio ou remova-o — pisos vazios poluem a árvore espacial e muitas vezes indicam elementos mal atribuídos.',
      tools: {
        revit:
          'Elimine os Níveis não utilizados, ou verifique que os elementos destinados a esse Nível lhe estão atribuídos (e não a um Nível vizinho).',
        archicad:
          'Remova o piso não utilizado ou reatribua o Piso de Origem dos elementos para que o piso não fique vazio.',
        tekla:
          'Remova o nível vazio da exportação ou reatribua-lhe peças.',
        allplan:
          'Elimine o nó de piso vazio ou reatribua-lhe objetos.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Dê a cada piso uma elevação definida — é necessária para posicionar os níveis verticalmente e gerar plantas.',
      tools: {
        revit:
          'Os Níveis transportam sempre uma elevação no Revit; um valor nulo costuma significar uma exportação personalizada. Verifique que os Níveis têm elevações numéricas e use a exportação de níveis IFC padrão.',
        archicad:
          'Defina a elevação de cada piso em Desenho ▸ Configurações de piso para que não seja nula.',
        tekla:
          'Garanta que cada nível tem uma elevação definida nas definições de nível/grelha antes de exportar.',
        allplan:
          'Defina a altura/elevação de cada piso na estrutura do edifício para que um valor seja exportado.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Defina a descrição do arquivo (normalmente o MVD / definição de vista) nas opções de exportação — faz parte dos metadados de cabeçalho STEP.',
      tools: {
        revit:
          'FILE_DESCRIPTION é definido a partir do MVD escolhido (p. ex. Reference View). Selecionar uma configuração de exportação adequada na caixa de diálogo IFC preenche-o.',
        archicad:
          'A seleção de MVD do Tradutor IFC preenche FILE_DESCRIPTION; escolha uma predefinição de exportação definida.',
        tekla:
          'O tipo de exportação / MVD define FILE_DESCRIPTION; escolha uma configuração de exportação IFC definida.',
        allplan:
          'Selecione uma predefinição de exportação IFC definida para que a descrição do arquivo / MVD seja escrita.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Preencha o autor e a organização na exportação ou na info do projeto — necessário para a rastreabilidade (ISO 19650).',
      tools: {
        revit:
          'Defina o autor na configuração de exportação IFC (Modificar configuração) ou em Gerir ▸ Informações do projeto; isto preenche o campo de autor de FILE_NAME no STEP.',
        archicad:
          'Defina autor e empresa em Arquivo ▸ Info ▸ Info do projeto e no Tradutor IFC para que sejam escritos no cabeçalho.',
        tekla:
          'Defina o autor/organização nas definições avançadas da exportação IFC.',
        allplan:
          'Defina autor/organização na info do projeto / definições de exportação IFC.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Defina o nome longo do projeto (o título descritivo do projeto) nas informações do projeto da ferramenta de autoria.',
      tools: {
        revit:
          'Defina Nome do Projeto / Nome de Emissão em Gerir ▸ Informações do projeto e mapeie-o para IfcProject.LongName na configuração de exportação IFC.',
        archicad:
          'Defina o nome/descrição do projeto em Arquivo ▸ Info ▸ Info do projeto; o Tradutor IFC mapeia-o para IfcProject.LongName.',
        tekla:
          'Defina o nome do projeto nas propriedades do projeto e mapeie-o para IfcProject.LongName na exportação.',
        allplan:
          'Defina o nome/descrição do projeto na info do projeto para que IfcProject.LongName seja preenchido.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Complete os metadados do projeto (nome longo, descrição, fase/tipo de projeto) exigidos pelos requisitos de informação da ISO 19650.',
      tools: {
        revit:
          'Preencha Nome do Projeto, Descrição e estado/fase em Gerir ▸ Informações do projeto e mapeie-os para os campos do IfcProject na configuração de exportação IFC.',
        archicad:
          'Complete a info do projeto em Arquivo ▸ Info ▸ Info do projeto e mapeie os campos no Tradutor IFC.',
        tekla:
          'Complete as propriedades do projeto e mapeie-as para os campos do IfcProject na exportação.',
        allplan:
          'Complete a info do projeto para que o IfcProject transporte LongName, Description e ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Adicione tanto o autor como a organização à exportação para que o entregável seja rastreável segundo a ISO 19650.',
      tools: {
        revit:
          'Defina autor e organização na configuração de exportação IFC / Informações do projeto para que ambos apareçam no cabeçalho STEP.',
        archicad:
          'Defina autor e empresa na Info do projeto e no Tradutor IFC.',
        tekla:
          'Defina autor e organização nas definições avançadas da exportação IFC.',
        allplan:
          'Defina autor e organização no projeto / definições de exportação IFC.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Nomeie o arquivo de exportação com o padrão ISO 19650: Projeto-Originador-Volume-Nível-Tipo-Função-Número.',
      tools: {
        revit:
          'O Revit obtém o nome do arquivo da caixa de diálogo Guardar da exportação — nomeie o arquivo segundo o padrão ISO 19650 ao exportar (ou renomeie-o depois).',
        archicad:
          'Defina o nome do arquivo segundo o padrão ISO 19650 na caixa de diálogo de exportação, ou renomeie o arquivo exportado.',
        tekla:
          'Nomeie o arquivo IFC de saída segundo o padrão ISO 19650 na caixa de diálogo de exportação.',
        allplan:
          'Nomeie o arquivo exportado segundo o padrão ISO 19650 na caixa de diálogo de exportação.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Adicione os conjuntos de propriedades exigidos no nível de LOD/LOIN declarado (de acordo com o plano de entrega de informação do projeto).',
      tools: {
        revit:
          'Mapeie os parâmetros exigidos pelo LOD para os seus Psets através de um arquivo User Defined PropertySets na exportação IFC e garanta que os elementos transportam realmente esses parâmetros.',
        archicad:
          'Defina os Psets do LOD no Gestor de Propriedades, atribua-os às classificações relevantes e mapeie-os no Tradutor IFC.',
        tekla:
          'Adicione as propriedades exigidas pelo LOD como UDAs e mapeie-as para os Psets na exportação.',
        allplan:
          'Crie os atributos do LOD e mapeie-os para os Psets exigidos na exportação IFC.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Ative a exportação de quantidades base para que os elementos transportem IfcElementQuantity (área/volume/comprimento) no LOD declarado.',
      tools: {
        revit:
          'Ative "Exportar quantidades base" nas opções de exportação IFC; o Revit escreve então IfcElementQuantity para os elementos.',
        archicad:
          'Ative a exportação de quantidades base nas definições do Tradutor IFC.',
        tekla:
          'Ative a exportação de quantidades / quantidades base na configuração de exportação IFC.',
        allplan:
          'Ative as quantidades base nas definições de exportação IFC.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Defina uma construção em camadas em paredes e lajes para que exportem um IfcMaterialLayerSetUsage no LOD 300+.',
      tools: {
        revit:
          'Defina as camadas de Estrutura do Tipo de parede/piso (Editar tipo ▸ Estrutura) com materiais; o Revit exporta estruturas compostas como IfcMaterialLayerSet.',
        archicad:
          'Use estruturas Compostas (não um único Material de Construção) em paredes/lajes para que as camadas sejam exportadas como um IfcMaterialLayerSet.',
        tekla:
          'As peças do Tekla são tipicamente de material único; para elementos em camadas defina as camadas/materiais para que o conjunto de camadas seja exportado, ou confirme se esta regra se aplica à sua disciplina.',
        allplan:
          'Use componentes multicamada para que o conjunto de camadas de material seja exportado.',
      },
    },
    // ── Classificação ────────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Anexe uma referência de classificação (Uniclass, OmniClass, etc.) para que o elemento transporte o seu código padrão como IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Use um complemento de classificação (p. ex. o gratuito Classification Manager for Revit) para atribuir um código Uniclass/OmniClass, ou mapeie um parâmetro compartilhado para IfcClassificationReference na configuração de exportação IFC. Sem mapeamento, o Revit não exporta classificação.',
        archicad:
          'Abra a paleta Classificação e Propriedades, escolha um sistema de classificação (integrado ou importado) e atribua ao elemento um item de classificação. O ARCHICAD exporta-os como IfcClassificationReference automaticamente.',
        tekla:
          'Atribua a classificação através de uma UDA ou do mapeamento de propriedades Tekla–IFC e depois mapeie esse atributo para IfcClassificationReference nos conjuntos de propriedades adicionais da exportação IFC.',
        allplan:
          'Atribua o código de classificação através dos atributos do objeto e garanta que a configuração de exportação IFC o mapeia para IfcClassificationReference.',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Atribua os elementos MEP a um sistema para que sejam exportados dentro de um IfcSystem — necessário para a coordenação baseada em sistemas.',
      tools: {
        revit:
          'Garanta que condutas/tubagens/equipamentos pertencem a um Sistema do Revit com nome; elementos não atribuídos são exportados sem IfcSystem. Use o Navegador de Sistemas para os localizar e atribuir.',
        archicad:
          'Atribua os elementos MEP a um sistema MEP no MEP Modeler para que sejam exportados dentro de um IfcSystem.',
        allplan:
          'Atribua os objetos MEP a um sistema/rede para que sejam exportados dentro de um IfcSystem.',
      },
    },
    // ── Geometria e saúde do arquivo ─────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Reduza os elementos IfcBuildingElementProxy mapeando-os para classes IFC adequadas — os proxies não transportam um tipo semântico.',
      tools: {
        revit:
          'Os proxies vêm de famílias no local, modelos genéricos ou categorias não mapeadas. Use a tabela de mapeamento de classes de exportação IFC para mapear essas categorias para tipos IFC reais em vez de IfcBuildingElementProxy e converta as famílias no local em famílias carregáveis.',
        archicad:
          'Atribua classificações / tipos IFC adequados aos objetos (especialmente Morphs e objetos personalizados) para que não sejam exportados como proxies.',
        tekla:
          'Mapeie as peças personalizadas ou proxy para a entidade IFC correta nas definições de exportação IFC.',
        allplan:
          'Atribua o tipo IFC correto aos objetos genéricos para que não sejam exportados como proxies.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Mantenha o modelo perto da origem interna e georreferencie-o corretamente, em vez de modelar em grandes coordenadas reais.',
      tools: {
        revit:
          'Não modele longe da origem interna do Revit. Use Coordenadas Partilhadas com um Ponto Topográfico / Ponto Base do Projeto e exporte com as coordenadas partilhadas atuais para que a geometria fique perto da origem e a georreferenciação seja preservada.',
        archicad:
          'Defina o Ponto Topográfico e a Origem do Projeto; mantenha o modelo perto da origem e use a georreferenciação IFC (IfcMapConversion) em vez de um grande deslocamento.',
        tekla:
          'Defina o ponto base/de trabalho e mantenha o modelo perto da origem; use o ponto base da exportação IFC para que as coordenadas não sejam enormes.',
        allplan:
          'Defina uma georreferenciação/ponto base do projeto e mantenha a geometria perto da origem em vez de em coordenadas reais.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Reduza o peso do arquivo: baixe a teselação/detalhe, evite texturas incorporadas e exporte apenas o necessário.',
      tools: {
        revit:
          'Baixe o nível de detalhe para a exportação, evite exportar CAD importado e famílias de muitos polígonos e separe disciplinas. O MVD Reference View produz geometria teselada mais leve.',
        archicad:
          'Reduza a resolução de curvas/segmentos, evite incorporar texturas, use uma predefinição de Tradutor IFC leve e exporte apenas os elementos necessários.',
        tekla:
          'Reduza o detalhe/representação da geometria de exportação e evite exportar modelos de referência desnecessariamente.',
        allplan:
          'Baixe a resolução da geometria e evite incorporar texturas na exportação IFC.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Revincule ou exclua IfcOpeningElement órfãos — toda abertura deve cortar um elemento anfitrião via IfcRelVoidsElement.',
      tools: {
        revit:
          'Aberturas órfãs vêm de anfitriões excluídos/editados ou de shafts exportados soltos. Exclua aberturas soltas e recrie o vazio sobre o anfitrião (parede/piso/telhado) para exportar a relação, e re-hospede portas/janelas se o corte se perdeu.',
        archicad:
          'As aberturas devem pertencer a uma parede/laje. Remova objetos de abertura soltos e use a Ferramenta de Abertura (ou porta/janela) ancorada ao anfitrião para o ArchiCAD exportar IfcRelVoidsElement.',
        tekla:
          'Recrie o corte/abertura como uma feature da peça anfitriã, em vez de um objeto solto, para que o vazio referencie um anfitrião na exportação.',
        allplan:
          'Coloque aberturas com as ferramentas de abertura de parede/laje para que pertençam a um anfitrião; exclua sólidos de abertura desvinculados.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Dê uma Elevation distinta a cada IfcBuildingStorey — pavimentos com a mesma cota quebram a geração de plantas e o filtro por pavimento.',
      tools: {
        revit:
          'Dois níveis compartilham a mesma cota. Na vista de Níveis dê uma cota única a cada Nível (ou exclua o duplicado) e exporte como pavimento apenas os níveis reais (desative “Pavimento”/exportação nos demais).',
        archicad:
          'Abra Configurações de Pavimento e defina uma elevação única por pavimento; mescle ou exclua pavimentos duplicados na mesma altura.',
        tekla:
          'Na lista de níveis/fases atribua uma cota única a cada nível usado na estrutura de pavimentos IFC e remova duplicados.',
        allplan:
          'Na estrutura do edifício defina alturas distintas por pavimento e remova pavimentos duplicados que resultem na mesma cota.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordene os pavimentos para que sua Elevation cresça de baixo para cima — cotas fora de ordem confundem ferramentas de corte/planta e revisores.',
      tools: {
        revit:
          'Um nível inferior tem cota maior (ou vice-versa). Corrija as cotas dos níveis ou a ordem de exportação para os pavimentos lerem de baixo para cima, e revise níveis de subsolo/telhado com cotas negativas.',
        archicad:
          'Em Configurações de Pavimento corrija a altura de qualquer pavimento fora de sequência para as cotas subirem com o índice do pavimento.',
        tekla:
          'Reordene/renumere os níveis para suas cotas subirem; corrija qualquer nível cuja altura contradiga sua posição.',
        allplan:
          'Na estrutura do edifício reordene os pavimentos ou corrija suas alturas para as cotas aumentarem para cima.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Exporte em métrico SI (milímetros/metros) — unidades imperiais quebram a interoperabilidade com a maioria das ferramentas IFC/BIM.',
      tools: {
        revit:
          'As unidades internas do Revit são imperiais, mas o IFC deve ser métrico. Defina as Unidades do projeto como métricas (ou confirme que a exportação IFC usa SI/métrico) para o IFCSIUNIT ficar em metros.',
        archicad:
          'Defina as Unidades de Trabalho (e de Cálculo) do projeto como métricas para o esquema IFC exportar unidades de comprimento SI.',
        tekla:
          'Mude o ambiente/papel ou as configurações de exportação para métrico para o LENGTHUNIT do IFC ser SI (mm/m).',
        allplan:
          'Defina as unidades de comprimento como métricas nas opções do projeto para a exportação IFC usar unidades SI.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Adicione quantidades de área aos IfcSpace — exporte BaseQuantities para cada espaço levar NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'Ambientes exportam como IfcSpace mas sem quantidades. Ative “Exportar quantidades base” (Pset/QTO) nas opções de exportação IFC e garanta que os Ambientes estejam bem delimitados/posicionados para as áreas serem calculadas.',
        archicad:
          'Use Zonas para espaços e ative as Quantidades Base no Tradutor IFC para IfcSpace exportar NetFloorArea/GrossFloorArea.',
        tekla:
          'Espaços são limitados no Tekla; se forem necessários, defina-os e ative a exportação de quantidades, ou gere-os no modelo de arquitetura.',
        allplan:
          'Crie Ambientes (espaços) e ative a exportação de quantidades IFC para IfcSpace levar quantidades de área.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Conecte os segmentos MEP por portas — tubos/dutos desconectados exportam sem relações IfcDistributionPort e quebram o rastreio de sistemas.',
      tools: {
        revit:
          'Dutos/tubos desconectados exportam sem portas. Corrija conectores abertos no modelo MEP (sem vãos/pontas soltas), mantenha os segmentos unidos em sistemas conectados e ative a exportação de sistemas/portas para escrever as relações IfcDistributionPort.',
        archicad:
          'Use o MEP Modeler para as rotas ficarem conectadas de ponta a ponta; exporte os sistemas MEP para incluir portas/conexões.',
        tekla:
          'MEP não é o domínio do Tekla; modele o MEP conectado na ferramenta MEP dedicada para os segmentos levarem portas, e depois federe.',
        allplan:
          'Modele os trajetos MEP conectados de ponta a ponta (sem pontas abertas) para a exportação IFC escrever as portas de distribuição entre segmentos.',
      },
    },
  },
  it: {
    // ── Denominazione e identità ─────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Assegna all’elemento un Nome significativo affinché sia identificabile negli abachi, nell’albero del modello e nel coordinamento a valle.',
      tools: {
        revit:
          'Revit mappa il Nome del Tipo di una famiglia sull’IfcName in esportazione. Apri le Proprietà del tipo dell’elemento e assegna al tipo un nome descrittivo invece del valore predefinito (es. rinomina "Basic Wall 1"). Per la denominazione a livello di istanza, mappa un parametro condiviso su IfcName nella tabella di mappatura dell’esportazione IFC.',
        archicad:
          'Seleziona l’elemento e apri il Gestore IFC (tasto destro ▸ Gestore IFC) o la palette Classificazione e Proprietà; imposta lì IfcRoot.Name, oppure configura la mappatura nelle impostazioni delle proprietà del Traduttore IFC prima di esportare.',
        tekla:
          'Il campo Name della parte viene mappato su IfcName. Apri le proprietà della parte, inserisci un Name e verifica che l’impostazione di esportazione IFC mappi quell’attributo su IfcName.',
        allplan:
          'Assegna un attributo che Allplan mappa su IfcName tramite la palette Proprietà, oppure imposta la mappatura di IfcName nella configurazione di esportazione IFC.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Imposta il LongName su spazi, piani ed edificio: contiene il nome leggibile del locale/livello usato negli abachi e in COBie.',
      tools: {
        revit:
          'Per gli spazi, imposta il Nome locale/area (Revit mappa Nome locale → IfcLongName e Numero locale → IfcName). Per i piani, assegna a ogni Livello un Nome descrittivo. Per l’edificio, imposta il nome nelle opzioni di esportazione IFC.',
        archicad:
          'Imposta il Nome zona per gli spazi (mappa su IfcLongName) e nomina i piani tramite Progettazione ▸ Impostazioni piano. Imposta il nome lungo dell’edificio in Archivio ▸ Info ▸ Info progetto / il Traduttore IFC.',
        tekla:
          'Spazi e piani raramente vengono modellati in Tekla; se presenti, imposta il Name/UDA mappato su IfcLongName, oppure imposta i nomi dei piani nelle impostazioni spaziali dell’esportazione IFC.',
        allplan:
          'Imposta il nome del locale (mappa su IfcLongName), nomina i piani nella struttura dell’edificio e imposta il nome lungo dell’edificio nell’esportazione IFC.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Rendi univoci i nomi degli elementi fratelli (o appoggiati su tipo + numero di istanza) affinché siano distinguibili negli abachi e nel coordinamento.',
      tools: {
        revit:
          'I nomi duplicati derivano spesso da nomi di tipo o sigle identici. Usa il parametro di istanza Sigla (univoco per elemento) o rinomina i tipi e risolvi gli avvisi di Sigla duplicata di Revit.',
        archicad:
          'Usa il Gestore ID (Documentazione ▸ Gestore ID) per assegnare automaticamente ID elemento univoci così che i fratelli non condividano un Nome.',
        tekla:
          'Esegui la numerazione (Disegni e report ▸ Numerazione) affinché ogni parte ottenga una sigla di posizione/parte univoca mappata su Name.',
        allplan:
          'Assegna valori di attributo univoci (es. numero di componente) tramite la palette attributi così che i fratelli non condividano un Nome.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Rinomina gli elementi seguendo lo schema di denominazione del BEP del progetto (di solito definito negli EIR / requisiti informativi ISO 19650).',
      tools: {
        revit:
          'Uniforma i nomi dei tipi e il parametro mappato su IfcName secondo il BEP. Usa un parametro condiviso o uno script Dynamo per la rinomina massiva, poi mappalo su IfcName in esportazione.',
        archicad:
          'Applica lo standard tramite il Gestore ID e allinea la proprietà mappata su IfcName (palette Classificazione e Proprietà) al BEP.',
        tekla:
          'Configura la serie di numerazione e la denominazione delle parti secondo il BEP, poi riesegui la numerazione.',
        allplan:
          'Usa modelli di attributi / preferiti per imporre la denominazione del BEP e mappa quell’attributo su IfcName in esportazione.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Ogni elemento deve avere un GlobalId univoco. Questo strumento può correggere automaticamente i duplicati (clicca Applica correzione); per evitarlo all’origine, correggi il flusso di esportazione indicato sotto.',
      tools: {
        revit:
          'I GUID duplicati derivano di solito dal copia/incolla di elementi tra modelli o file collegati. Evita di duplicare elementi tra modelli esportati e riesporta da una copia pulita. Per elementi raggruppati o specchiati che condividono un parametro IfcGUID, cancella quel parametro così che Revit rigeneri un valore univoco.',
        archicad:
          'I GUID duplicati nascono tipicamente copiando elementi tra progetti o unendo moduli. Rigenera ID univoci (Progettazione ▸ Gestore ID elemento) ed evita di copiare elementi tra file senza rigenerare i GlobalId.',
        tekla:
          'I GUID duplicati derivano da oggetti copiati tra modelli. Riesporta dal modello di origine — Tekla assegna un GUID univoco per oggetto alla creazione.',
        allplan:
          'I GUID duplicati derivano dal copiare oggetti tra documenti. Ricrea o riesporta gli oggetti interessati così che Allplan rigeneri GlobalId univoci.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'Il GlobalId deve essere una stringa IFC base-64 di 22 caratteri. Questo strumento può correggere automaticamente il formato; all’origine, evita post-elaborazioni che riscrivono i GUID.',
      tools: {
        revit:
          'Revit scrive IfcGUID conformi per impostazione predefinita. I formati non validi derivano di solito da script di terze parti o da un parametro IfcGUID modificato manualmente — cancella il parametro così che Revit rigeneri un GUID valido di 22 caratteri in esportazione.',
        archicad:
          'ARCHICAD genera GlobalId conformi. I valori non validi derivano di solito da modifiche esterne o componenti aggiuntivi; rigenera gli ID o riesporta senza il componente problematico.',
        tekla:
          'Tekla scrive GUID validi nativamente; i valori non validi derivano tipicamente da script di interoperabilità — riesporta dal modello nativo.',
        allplan:
          'Allplan genera GlobalId validi; se non validi, ricrea o riesporta gli oggetti interessati.',
      },
    },
    // ── Struttura e gerarchia ────────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Colloca l’elemento in un contenitore spaziale (piano o spazio) affinché compaia nell’albero del modello e negli strumenti a valle.',
      tools: {
        revit:
          'Gli orfani derivano da elementi non assegnati a un Livello (gruppi, geometria importata, elementi senza host). Assegna l’elemento a un Livello così che Revit lo esporti all’interno di un IfcBuildingStorey.',
        archicad:
          'Controlla l’impostazione Piano di residenza dell’elemento — gli elementi senza piano di residenza vengono esportati come orfani. Assegnane uno.',
        tekla:
          'Assegna la parte alla struttura di fase/livello usata dall’esportazione IFC così che riceva un contenitore spaziale; controlla le impostazioni della struttura spaziale dell’esportazione.',
        allplan:
          'Assegna l’elemento a un nodo di piano nella palette della struttura dell’edificio così che non venga esportato orfano.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Sposta l’elemento nel contenitore spaziale corretto — gli elementi fisici dell’edificio appartengono a un piano (o spazio), non direttamente sotto il Sito o il Progetto.',
      tools: {
        revit:
          'Riassegna l’elemento a un Livello dell’edificio. I componenti di sito e la topografia possono stare a livello di sito, ma gli elementi dell’edificio devono stare su un Livello.',
        archicad:
          'Imposta il Piano di residenza dell’elemento sul piano corretto; evita di collocare elementi dell’edificio a livello di sito.',
        tekla:
          'Regola la mappatura del contenitore spaziale nell’esportazione IFC così che le parti finiscano nel piano corretto invece che nel sito.',
        allplan:
          'Sposta l’oggetto al nodo di piano corretto nella struttura dell’edificio.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Correggi la relazione di aggregazione interrotta — è quasi sempre un artefatto di esportazione/interoperabilità, quindi riesporta dallo strumento di authoring.',
      tools: {
        revit:
          'Riesporta con un esportatore IFC aggiornato. Se persiste, controlla il modello (Gestisci ▸ Elimina inutilizzati) e cerca gruppi o assiemi corrotti.',
        archicad:
          'Riesporta con il componente aggiuntivo IFC di ARCHICAD più recente; esegui un controllo del modello se la corruzione persiste.',
        tekla:
          'Riesporta da Tekla — gli aggregati interrotti indicano un guasto di interoperabilità, non un errore di modellazione.',
        allplan:
          'Riesporta da Allplan con un’interfaccia IFC aggiornata.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Assicurati che la struttura spaziale segua Progetto ▸ Sito ▸ Edificio ▸ Piano. Correggila nella configurazione del progetto dello strumento di authoring prima di esportare.',
      tools: {
        revit:
          'Revit costruisce questa gerarchia automaticamente da Progetto ▸ Sito ▸ Edificio ▸ Livelli. Una gerarchia interrotta indica di solito Livelli mancanti o un’esportazione personalizzata — verifica che esistano Livelli e usa l’assegnazione sito/edificio IFC predefinita.',
        archicad:
          'Controlla la gerarchia nel Traduttore IFC e nelle Impostazioni piano: i piani sotto l’edificio, l’edificio sotto il sito.',
        tekla:
          'Configura la gerarchia spaziale completa (progetto/sito/edificio/piano) nella finestra di esportazione IFC così che sia completa e ordinata correttamente.',
        allplan:
          'Definisci la struttura completa dell’edificio (progetto/sito/edificio/piano) nella palette della struttura prima di esportare.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Rimuovi la relazione circolare — un elemento non può essere antenato di se stesso. È un artefatto di esportazione/interoperabilità; riesporta da una copia pulita.',
      tools: {
        revit:
          'Riesporta con un esportatore IFC aggiornato da una copia pulita; se persiste, controlla ed elimina gli inutilizzati nel modello.',
        archicad:
          'Riesporta con il componente aggiuntivo IFC più recente; esegui un controllo del modello per trovare la relazione problematica.',
        tekla:
          'Riesporta dal modello nativo — Tekla normalmente non crea cicli di riferimento.',
        allplan:
          'Riesporta da Allplan; ricrea gli oggetti interessati se il ciclo persiste.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Colloca l’elemento in un piano anziché direttamente sotto l’edificio.',
      tools: {
        revit:
          'Assegna l’elemento a un Livello così che venga esportato sotto un IfcBuildingStorey invece che sotto l’edificio.',
        archicad:
          'Imposta il Piano di residenza dell’elemento così che non stia a livello di edificio.',
        tekla:
          'Mappa la parte su un piano nelle impostazioni spaziali dell’esportazione IFC.',
        allplan:
          'Sposta l’oggetto a un nodo di piano nella struttura dell’edificio.',
      },
    },
    // ── Proprietà e tipi ─────────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Associa l’elemento a un tipo (IfcWallType, IfcDoorType, …) così che proprietà e quantità di tipo si propaghino.',
      tools: {
        revit:
          'I tipi di famiglia di Revit vengono esportati come IfcTypeObject automaticamente. La mancanza di tipi indica di solito famiglie locali o modelli generici — convertili in famiglie caricabili con tipi definiti e mantieni attiva l’esportazione dei tipi nelle opzioni IFC.',
        archicad:
          'Usa preferiti / materiali da costruzione e mantieni attiva l’esportazione di "Type Product" nel Traduttore IFC così che i tipi di elemento vengano scritti.',
        tekla:
          'Assegna un profilo e un materiale così che la parte venga esportata con un tipo; verifica che l’esportazione IFC scriva oggetti di tipo.',
        allplan:
          'Usa oggetti di libreria / SmartParts con tipi definiti e attiva l’esportazione dei tipi nell’interfaccia IFC.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Aggiungi all’elemento il/i set di proprietà richiesti dal BEP/EIR del progetto prima di esportare.',
      tools: {
        revit:
          'Aggiungi i parametri mancanti e mappali sul Pset richiesto tramite un file User Defined PropertySets referenziato nella configurazione di esportazione IFC.',
        archicad:
          'Definisci il Pset richiesto nel Gestore Proprietà, assegnalo alle classificazioni pertinenti e mappalo nel Traduttore IFC.',
        tekla:
          'Aggiungi le proprietà come UDA e mappale sul Pset richiesto nei set di proprietà aggiuntivi dell’esportazione IFC.',
        allplan:
          'Crea gli attributi e mappali sul Pset richiesto nella configurazione di esportazione IFC.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Compila il valore di proprietà vuoto — una proprietà vuota viene trattata come mancante dai controlli a valle.',
      tools: {
        revit:
          'Individua il parametro e inserisci un valore (o rimuovi il parametro vuoto). Un abaco è il modo più rapido per trovare e compilare i vuoti in massa.',
        archicad:
          'Usa il Gestore Proprietà o un abaco interattivo per trovare e popolare i valori di proprietà vuoti.',
        tekla:
          'Popola i valori UDA vuoti tramite gli strumenti di interrogazione/report prima di esportare.',
        allplan:
          'Compila i valori di attributo vuoti tramite la palette attributi o un elenco prima di esportare.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Assegna un materiale all’elemento così che trasporti dati di materiale (atteso a partire dal LOD 200/300).',
      tools: {
        revit:
          'Assegna un materiale alla struttura dell’elemento (Modifica tipo ▸ Struttura, o il parametro Materiale). Revit esporta i materiali definiti come IfcMaterial / set di strati.',
        archicad:
          'Assegna un Materiale da costruzione (non solo una superficie) all’elemento; ARCHICAD esporta i Materiali da costruzione come IfcMaterial.',
        tekla:
          'Imposta il materiale della parte nelle sue proprietà; Tekla lo esporta come materiale IFC associato.',
        allplan:
          'Assegna un attributo di materiale/formato all’elemento così che venga esportato con un’associazione di materiale.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Esporta verso uno schema IFC attuale (IFC4 / IFC4.3) a meno che il destinatario richieda esplicitamente IFC2x3.',
      tools: {
        revit:
          'Nella finestra di esportazione IFC, imposta la Versione file su IFC4 (es. Reference View o Design Transfer View) invece di IFC2x3.',
        archicad:
          'Nel Traduttore IFC, scegli un preset di esportazione basato su IFC4 invece di IFC2x3.',
        tekla:
          'Nell’esportazione IFC, seleziona il tipo di esportazione IFC4 invece di IFC2x3.',
        allplan:
          'Seleziona IFC4 (o IFC4.3) come schema di esportazione nelle impostazioni dell’interfaccia IFC.',
      },
    },
    // ── Interferenze (clash) ─────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Risolvi l’interferenza geometrica tra elementi nello strumento di authoring — sposta, taglia o unisci gli elementi in conflitto.',
      tools: {
        revit:
          'Esegui Collabora ▸ Verifica interferenze per localizzare le interferenze, poi sposta/taglia/unisci gli elementi per risolvere la sovrapposizione.',
        archicad:
          'Usa Progettazione ▸ Rilevamento collisioni per trovare le sovrapposizioni, poi regola gli elementi in conflitto.',
        tekla:
          'Usa Gestisci ▸ Verifica conflitti per trovare e risolvere le parti sovrapposte.',
        allplan:
          'Usa la verifica collisioni per localizzare le sovrapposizioni e regolare gli elementi in conflitto.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Risolvi l’interferenza MEP-struttura — ridireziona il tracciato MEP o coordina una penetrazione/manicotto con il modello strutturale.',
      tools: {
        revit:
          'Esegui la Verifica interferenze tra le categorie MEP e strutturali, poi ridireziona gli impianti o aggiungi aperture/manicotti coordinati.',
        archicad:
          'Usa il Rilevamento collisioni tra elementi MEP e strutturali, poi ridireziona o aggiungi aperture.',
        tekla:
          'Esegui una verifica conflitti rispetto al modello di riferimento MEP collegato e aggiungi penetrazioni/aperture dove necessario.',
        allplan:
          'Usa la verifica collisioni tra MEP e struttura e ridireziona o aggiungi aperture.',
      },
    },
    // ── Intestazione file e metadati di progetto ─────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Ogni IFC deve contenere esattamente un IfcProject. La sua assenza indica un’esportazione interrotta — riesporta il modello completo.',
      tools: {
        revit:
          'Revit scrive sempre un IfcProject. La sua assenza indica un’esportazione corrotta o parziale — riesporta il modello completo invece di una selezione isolata.',
        archicad:
          'Riesporta il progetto; esporta il modello, non un insieme di elementi isolato che esclude la radice del progetto.',
        tekla:
          'Riesporta il modello completo così che la radice IfcProject venga scritta.',
        allplan:
          'Riesporta dal progetto così che l’entità IfcProject sia inclusa.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Aggiungi un edificio alla struttura spaziale — definisci un IfcBuilding nella configurazione del progetto dello strumento di authoring.',
      tools: {
        revit:
          'Revit crea l’edificio automaticamente; la sua assenza indica di solito un’esportazione personalizzata solo del sito. Verifica che il progetto abbia Livelli e usa l’assegnazione edificio predefinita nelle opzioni IFC.',
        archicad:
          'Assicurati che esista un edificio nella gerarchia del progetto / Traduttore IFC e che i piani stiano sotto di esso.',
        tekla:
          'Definisci l’edificio nelle impostazioni della struttura spaziale dell’esportazione IFC.',
        allplan:
          'Aggiungi un nodo edificio nella palette della struttura dell’edificio.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Aggiungi almeno un piano (livello) sotto l’edificio.',
      tools: {
        revit:
          'Crea Livelli nel progetto; Revit esporta i Livelli come IfcBuildingStorey. Un modello senza Livelli non esporta piani.',
        archicad:
          'Definisci i piani tramite Progettazione ▸ Impostazioni piano così che l’edificio abbia piani.',
        tekla:
          'Definisci livelli/piani nelle impostazioni spaziali dell’esportazione IFC.',
        allplan:
          'Aggiungi nodi di piano sotto l’edificio nella palette della struttura.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Popola il piano vuoto o rimuovilo — i piani vuoti ingombrano l’albero spaziale e spesso segnalano elementi mal assegnati.',
      tools: {
        revit:
          'Elimina i Livelli inutilizzati, o controlla che gli elementi destinati a quel Livello siano assegnati ad esso (e non a un Livello vicino).',
        archicad:
          'Rimuovi il piano inutilizzato o riassegna il Piano di residenza degli elementi così che il piano non sia vuoto.',
        tekla:
          'Rimuovi il livello vuoto dall’esportazione o riassegnagli delle parti.',
        allplan:
          'Elimina il nodo di piano vuoto o riassegnagli degli oggetti.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Assegna a ogni piano una quota definita — è necessaria per posizionare i livelli verticalmente e generare le piante.',
      tools: {
        revit:
          'I Livelli portano sempre una quota in Revit; un valore nullo indica di solito un’esportazione personalizzata. Verifica che i Livelli abbiano quote numeriche e usa l’esportazione dei livelli IFC predefinita.',
        archicad:
          'Imposta la quota di ogni piano in Progettazione ▸ Impostazioni piano così che non sia nulla.',
        tekla:
          'Assicurati che ogni livello abbia una quota definita nelle impostazioni di livello/griglia prima di esportare.',
        allplan:
          'Definisci l’altezza/quota di ogni piano nella struttura dell’edificio così che venga esportato un valore.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Imposta la descrizione del file (di solito l’MVD / definizione di vista) nelle opzioni di esportazione — fa parte dei metadati di intestazione STEP.',
      tools: {
        revit:
          'FILE_DESCRIPTION è impostato dall’MVD scelto (es. Reference View). Selezionare una configurazione di esportazione adeguata nella finestra IFC lo popola.',
        archicad:
          'La selezione dell’MVD del Traduttore IFC popola FILE_DESCRIPTION; scegli un preset di esportazione definito.',
        tekla:
          'Il tipo di esportazione / MVD imposta FILE_DESCRIPTION; scegli una configurazione di esportazione IFC definita.',
        allplan:
          'Seleziona un preset di esportazione IFC definito così che la descrizione del file / MVD venga scritta.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Compila autore e organizzazione nell’esportazione o nelle info di progetto — necessario per la tracciabilità (ISO 19650).',
      tools: {
        revit:
          'Imposta l’autore nella configurazione di esportazione IFC (Modifica configurazione) o in Gestisci ▸ Informazioni progetto; questo popola il campo autore di FILE_NAME in STEP.',
        archicad:
          'Imposta autore e azienda in Archivio ▸ Info ▸ Info progetto e nel Traduttore IFC così che vengano scritti nell’intestazione.',
        tekla:
          'Imposta autore/organizzazione nelle impostazioni avanzate dell’esportazione IFC.',
        allplan:
          'Imposta autore/organizzazione nelle info di progetto / impostazioni di esportazione IFC.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Imposta il nome lungo del progetto (il titolo descrittivo del progetto) nelle informazioni di progetto dello strumento di authoring.',
      tools: {
        revit:
          'Imposta Nome progetto / Nome emissione in Gestisci ▸ Informazioni progetto e mappalo su IfcProject.LongName nella configurazione di esportazione IFC.',
        archicad:
          'Imposta nome/descrizione del progetto in Archivio ▸ Info ▸ Info progetto; il Traduttore IFC lo mappa su IfcProject.LongName.',
        tekla:
          'Imposta il nome del progetto nelle proprietà del progetto e mappalo su IfcProject.LongName nell’esportazione.',
        allplan:
          'Imposta nome/descrizione del progetto nelle info di progetto così che IfcProject.LongName venga popolato.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Completa i metadati del progetto (nome lungo, descrizione, fase/tipo di progetto) richiesti dai requisiti informativi ISO 19650.',
      tools: {
        revit:
          'Compila Nome progetto, Descrizione e stato/fase in Gestisci ▸ Informazioni progetto e mappali sui campi IfcProject nella configurazione di esportazione IFC.',
        archicad:
          'Completa le info di progetto in Archivio ▸ Info ▸ Info progetto e mappa i campi nel Traduttore IFC.',
        tekla:
          'Completa le proprietà del progetto e mappale sui campi IfcProject nell’esportazione.',
        allplan:
          'Completa le info di progetto così che IfcProject trasporti LongName, Description e ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Aggiungi sia l’autore sia l’organizzazione all’esportazione così che il deliverable sia tracciabile secondo la ISO 19650.',
      tools: {
        revit:
          'Imposta autore e organizzazione nella configurazione di esportazione IFC / Informazioni progetto così che entrambi compaiano nell’intestazione STEP.',
        archicad:
          'Imposta autore e azienda nelle Info progetto e nel Traduttore IFC.',
        tekla:
          'Imposta autore e organizzazione nelle impostazioni avanzate dell’esportazione IFC.',
        allplan:
          'Imposta autore e organizzazione nel progetto / impostazioni di esportazione IFC.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Nomina il file di esportazione con lo schema ISO 19650: Progetto-Originatore-Volume-Livello-Tipo-Ruolo-Numero.',
      tools: {
        revit:
          'Revit prende il nome file dalla finestra Salva dell’esportazione — nomina il file secondo lo schema ISO 19650 in esportazione (o rinominalo dopo).',
        archicad:
          'Imposta il nome file secondo lo schema ISO 19650 nella finestra di esportazione, o rinomina il file esportato.',
        tekla:
          'Nomina il file IFC di output secondo lo schema ISO 19650 nella finestra di esportazione.',
        allplan:
          'Nomina il file esportato secondo lo schema ISO 19650 nella finestra di esportazione.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Aggiungi i set di proprietà richiesti al livello di LOD/LOIN dichiarato (secondo il piano di consegna informativa del progetto).',
      tools: {
        revit:
          'Mappa i parametri richiesti dal LOD sui loro Pset tramite un file User Defined PropertySets nell’esportazione IFC e assicurati che gli elementi portino effettivamente quei parametri.',
        archicad:
          'Definisci i Pset del LOD nel Gestore Proprietà, assegnali alle classificazioni pertinenti e mappali nel Traduttore IFC.',
        tekla:
          'Aggiungi le proprietà richieste dal LOD come UDA e mappale sui Pset nell’esportazione.',
        allplan:
          'Crea gli attributi del LOD e mappali sui Pset richiesti nell’esportazione IFC.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Attiva l’esportazione delle quantità base così che gli elementi portino IfcElementQuantity (area/volume/lunghezza) al LOD dichiarato.',
      tools: {
        revit:
          'Attiva "Esporta quantità base" nelle opzioni di esportazione IFC; Revit scrive quindi IfcElementQuantity per gli elementi.',
        archicad:
          'Attiva l’esportazione delle quantità base nelle impostazioni del Traduttore IFC.',
        tekla:
          'Attiva l’esportazione delle quantità / quantità base nella configurazione di esportazione IFC.',
        allplan:
          'Attiva le quantità base nelle impostazioni di esportazione IFC.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Definisci una costruzione a strati su muri e solai così che esportino un IfcMaterialLayerSetUsage al LOD 300+.',
      tools: {
        revit:
          'Definisci gli strati di Struttura del Tipo di muro/pavimento (Modifica tipo ▸ Struttura) con materiali; Revit esporta le strutture composte come IfcMaterialLayerSet.',
        archicad:
          'Usa strutture Composte (non un singolo Materiale da costruzione) per muri/solai così che gli strati vengano esportati come IfcMaterialLayerSet.',
        tekla:
          'Le parti di Tekla sono tipicamente monomateriale; per elementi a strati definisci gli strati/materiali così che il set di strati venga esportato, o verifica se questa regola si applica alla tua disciplina.',
        allplan:
          'Usa componenti multistrato così che il set di strati di materiale venga esportato.',
      },
    },
    // ── Classificazione ──────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Allega un riferimento di classificazione (Uniclass, OmniClass, ecc.) così che l’elemento porti il suo codice standard come IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Usa un componente aggiuntivo di classificazione (es. il gratuito Classification Manager for Revit) per assegnare un codice Uniclass/OmniClass, o mappa un parametro condiviso su IfcClassificationReference nella configurazione di esportazione IFC. Senza mappatura Revit non esporta alcuna classificazione.',
        archicad:
          'Apri la palette Classificazione e Proprietà, scegli un sistema di classificazione (integrato o importato) e assegna all’elemento un elemento di classificazione. ARCHICAD li esporta come IfcClassificationReference automaticamente.',
        tekla:
          'Assegna la classificazione tramite una UDA o la mappatura proprietà Tekla–IFC, poi mappa quell’attributo su IfcClassificationReference nei set di proprietà aggiuntivi dell’esportazione IFC.',
        allplan:
          'Assegna il codice di classificazione tramite gli attributi dell’oggetto e assicurati che la configurazione di esportazione IFC lo mappi su IfcClassificationReference.',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Assegna gli elementi MEP a un sistema così che vengano esportati all’interno di un IfcSystem — necessario per il coordinamento basato sui sistemi.',
      tools: {
        revit:
          'Assicurati che canali/tubazioni/apparecchiature appartengano a un Sistema di Revit denominato; gli elementi non assegnati vengono esportati senza IfcSystem. Usa il Browser di sistema per individuarli e assegnarli.',
        archicad:
          'Assegna gli elementi MEP a un sistema MEP nel MEP Modeler così che vengano esportati all’interno di un IfcSystem.',
        allplan:
          'Assegna gli oggetti MEP a un sistema/rete così che vengano esportati all’interno di un IfcSystem.',
      },
    },
    // ── Geometria e salute del file ──────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Riduci gli elementi IfcBuildingElementProxy mappandoli su classi IFC adeguate — i proxy non portano alcun tipo semantico.',
      tools: {
        revit:
          'I proxy derivano da famiglie locali, modelli generici o categorie non mappate. Usa la tabella di mappatura delle classi di esportazione IFC per mappare quelle categorie su tipi IFC reali invece di IfcBuildingElementProxy e converti le famiglie locali in famiglie caricabili.',
        archicad:
          'Assegna classificazioni / tipi IFC adeguati agli oggetti (in particolare Morph e oggetti personalizzati) così che non vengano esportati come proxy.',
        tekla:
          'Mappa le parti personalizzate o proxy sull’entità IFC corretta nelle impostazioni di esportazione IFC.',
        allplan:
          'Assegna il tipo IFC corretto agli oggetti generici così che non vengano esportati come proxy.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Mantieni il modello vicino all’origine interna e georeferenzialo correttamente, invece di modellare a grandi coordinate reali.',
      tools: {
        revit:
          'Non modellare lontano dall’origine interna di Revit. Usa le Coordinate condivise con un Punto topografico / Punto base del progetto ed esporta con le coordinate condivise correnti così che la geometria resti vicina all’origine mentre la georeferenziazione è preservata.',
        archicad:
          'Imposta il Punto topografico e l’Origine del progetto; mantieni il modello vicino all’origine e usa la georeferenziazione IFC (IfcMapConversion) invece di un grande offset.',
        tekla:
          'Imposta il punto base/di lavoro e mantieni il modello vicino all’origine; usa il punto base dell’esportazione IFC così che le coordinate non siano enormi.',
        allplan:
          'Imposta una georeferenziazione/punto base del progetto e mantieni la geometria vicina all’origine invece che a coordinate reali.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Riduci il peso del file: abbassa la tassellazione/dettaglio, evita texture incorporate ed esporta solo il necessario.',
      tools: {
        revit:
          'Abbassa il livello di dettaglio per l’esportazione, evita di esportare CAD importato e famiglie ad alto numero di poligoni e separa le discipline. L’MVD Reference View produce geometria tassellata più leggera.',
        archicad:
          'Riduci la risoluzione di curve/segmenti, evita di incorporare texture, usa un preset di Traduttore IFC leggero ed esporta solo gli elementi necessari.',
        tekla:
          'Riduci il dettaglio/la rappresentazione della geometria di esportazione ed evita di esportare modelli di riferimento inutilmente.',
        allplan:
          'Abbassa la risoluzione della geometria ed evita di incorporare texture nell’esportazione IFC.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Ricollega o elimina gli IfcOpeningElement orfani — ogni apertura deve forare un elemento ospite tramite IfcRelVoidsElement.',
      tools: {
        revit:
          'Le aperture orfane derivano da ospiti eliminati/modificati o da vani esportati isolati. Elimina le aperture isolate e ricrea il vuoto sull’ospite (muro/solaio/tetto) per esportare la relazione, e ri-ospita porte/finestre se il taglio è andato perso.',
        archicad:
          'Le aperture devono appartenere a un muro/solaio. Rimuovi gli oggetti apertura isolati e usa lo strumento Apertura (o porta/finestra) ancorato all’ospite affinché ArchiCAD esporti IfcRelVoidsElement.',
        tekla:
          'Ricrea il taglio/apertura come feature della parte ospite invece di un oggetto isolato, così il vuoto fa riferimento a un ospite all’esportazione.',
        allplan:
          'Inserisci le aperture con gli strumenti di apertura muro/solaio così appartengono a un ospite; elimina i solidi di apertura scollegati.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Assegna una Elevation distinta a ogni IfcBuildingStorey — piani alla stessa quota rompono la generazione delle piante e il filtro per piano.',
      tools: {
        revit:
          'Due livelli condividono la stessa quota. Nella vista Livelli dai una quota univoca a ogni Livello (o elimina il duplicato) ed esporta come piano solo i livelli reali (disattiva “Piano edificio”/esportazione sugli altri).',
        archicad:
          'Apri Impostazioni Piano e imposta una quota univoca per piano; unisci o elimina i piani duplicati alla stessa altezza.',
        tekla:
          'Nella lista livelli/fasi assegna una quota univoca a ogni livello usato per la struttura dei piani IFC ed elimina i duplicati.',
        allplan:
          'Nella struttura dell’edificio imposta altezze distinte per piano ed elimina i piani duplicati che risultano alla stessa quota.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordina i piani in modo che la loro Elevation cresca dal basso verso l’alto — quote fuori ordine confondono strumenti di sezione/pianta e revisori.',
      tools: {
        revit:
          'Un livello inferiore ha una quota maggiore (o viceversa). Correggi le quote dei livelli o l’ordine di esportazione così i piani si leggono dal basso verso l’alto, e verifica i livelli interrati/copertura con quote negative.',
        archicad:
          'In Impostazioni Piano correggi l’altezza di ogni piano fuori sequenza così le quote salgono con l’indice di piano.',
        tekla:
          'Riordina/rinumera i livelli così le loro quote salgono; correggi ogni livello la cui altezza contraddice la posizione.',
        allplan:
          'Nella struttura dell’edificio riordina i piani o correggi le altezze così le quote aumentano verso l’alto.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Esporta in metrico SI (millimetri/metri) — le unità imperiali rompono l’interoperabilità con la maggior parte degli strumenti IFC/BIM.',
      tools: {
        revit:
          'Le unità interne di Revit sono imperiali, ma l’IFC deve essere metrico. Imposta le Unità di progetto su metrico (o verifica che l’esportazione IFC usi SI/metrico) così l’IFCSIUNIT è in metri.',
        archicad:
          'Imposta le Unità di lavoro (e di calcolo) del progetto su metrico così lo schema IFC esporta unità di lunghezza SI.',
        tekla:
          'Cambia ambiente/ruolo o le impostazioni di esportazione su metrico così il LENGTHUNIT dell’IFC è SI (mm/m).',
        allplan:
          'Imposta le unità di lunghezza su metrico nelle opzioni di progetto così l’esportazione IFC usa unità SI.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Aggiungi quantità di area agli IfcSpace — esporta le BaseQuantities così ogni spazio porta NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'I locali esportano come IfcSpace ma senza quantità. Attiva “Esporta quantità di base” (Pset/QTO) nelle opzioni di esportazione IFC e assicurati che i Locali siano ben delimitati/posizionati così le aree vengono calcolate.',
        archicad:
          'Usa le Zone per gli spazi e attiva le Quantità di base nel Traduttore IFC così IfcSpace esporta NetFloorArea/GrossFloorArea.',
        tekla:
          'Gli spazi sono limitati in Tekla; se servono, definiscili e attiva l’esportazione delle quantità, oppure generali nel modello di architettura.',
        allplan:
          'Crea Locali (spazi) e attiva l’esportazione delle quantità IFC così IfcSpace porta quantità di area.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Collega i segmenti MEP tramite porte — tubi/canali scollegati esportano senza relazioni IfcDistributionPort e rompono il tracciamento dei sistemi.',
      tools: {
        revit:
          'Canali/tubi scollegati esportano senza porte. Correggi i connettori aperti nel modello MEP (niente interruzioni/estremità libere), tieni i segmenti uniti in sistemi connessi e attiva l’esportazione di sistemi/porte così vengono scritte le relazioni IfcDistributionPort.',
        archicad:
          'Usa il MEP Modeler così i tracciati restano collegati da estremità a estremità; esporta i sistemi MEP per includere porte/connessioni.',
        tekla:
          'Il MEP non è il dominio di Tekla; modella il MEP connesso nello strumento MEP dedicato così i segmenti portano porte, poi federa.',
        allplan:
          'Modella i percorsi MEP collegati da estremità a estremità (niente estremità aperte) così l’esportazione IFC scrive le porte di distribuzione tra i segmenti.',
      },
    },
  },
  zh: {
    // ── 命名与标识 ────────────────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        '为构件赋予有意义的名称，使其在明细表、模型树和下游协调中可被识别。',
      tools: {
        revit:
          'Revit 导出时将族的类型名称映射到 IfcName。打开构件的类型属性，为该类型设置描述性名称而非默认值（例如重命名 “Basic Wall 1”）。如需按实例命名，在 IFC 导出映射表中将共享参数映射到 IfcName。',
        archicad:
          '选中构件并打开 IFC 管理器（右键 ▸ IFC 管理器）或“分类与属性”面板，在此设置 IfcRoot.Name；或在导出前于 IFC 转换器的属性设置中配置映射。',
        tekla:
          '零件的 Name 字段映射到 IfcName。打开零件属性，输入 Name，并确认 IFC 导出设置将该属性映射到 IfcName。',
        allplan:
          '通过“属性”面板分配一个 Allplan 映射到 IfcName 的属性，或在 IFC 导出配置中设置 IfcName 映射。',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        '为空间、楼层和建筑设置 LongName——它承载用于明细表和 COBie 的可读房间/楼层名称。',
      tools: {
        revit:
          '对于空间，设置房间/面积名称（Revit 将房间名称映射到 IfcLongName，房间编号映射到 IfcName）。对于楼层，为每个标高设置描述性名称。对于建筑，在 IFC 导出选项中设置名称。',
        archicad:
          '为空间设置区域名称（映射到 IfcLongName），并通过“设计 ▸ 楼层设置”命名楼层。在“文件 ▸ 信息 ▸ 项目信息”/IFC 转换器中设置建筑长名称。',
        tekla:
          'Tekla 中很少建模空间和楼层；若存在，设置映射到 IfcLongName 的 Name/UDA，或在 IFC 导出的空间设置中设置楼层名称。',
        allplan:
          '设置房间名称（映射到 IfcLongName），在建筑结构中命名楼层，并在 IFC 导出中设置建筑长名称。',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        '使同级构件名称唯一（或依靠类型 + 实例编号），以便在明细表和协调中可区分。',
      tools: {
        revit:
          '名称重复通常源于相同的类型名称或标记。使用实例“标记”参数（每个构件唯一）或重命名类型，并解决 Revit 的标记重复警告。',
        archicad:
          '使用 ID 管理器（文档 ▸ ID 管理器）自动分配唯一的构件 ID，使同级构件不共用名称。',
        tekla:
          '运行编号（图纸与报告 ▸ 编号），使每个零件获得映射到 Name 的唯一位置/零件标记。',
        allplan:
          '通过属性面板分配唯一的属性值（例如构件编号），使同级构件不共用名称。',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        '按项目 BEP 命名规则（通常在 EIR / ISO 19650 信息需求中定义）重命名构件。',
      tools: {
        revit:
          '按 BEP 统一类型名称及映射到 IfcName 的参数。使用共享参数或 Dynamo 脚本批量重命名，然后在导出时映射到 IfcName。',
        archicad:
          '通过 ID 管理器应用标准，并使映射到 IfcName 的属性（分类与属性面板）与 BEP 对齐。',
        tekla:
          '按 BEP 配置编号系列和零件命名，然后重新运行编号。',
        allplan:
          '使用属性模板/收藏夹强制执行 BEP 命名，并在导出时将该属性映射到 IfcName。',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        '每个构件必须有唯一的 GlobalId。本工具可自动修复重复项（点击“应用修复”）；要从源头避免，请修复下述导出流程。',
      tools: {
        revit:
          'GUID 重复通常源于在模型之间或链接文件之间复制/粘贴构件。避免在导出的模型之间复制构件，并从干净的副本重新导出。对于共用 IfcGUID 参数的组合或镜像构件，清除该参数使 Revit 重新生成唯一值。',
        archicad:
          'GUID 重复通常源于在项目之间复制构件或合并模块。重新生成唯一 ID（设计 ▸ 构件 ID 管理器），并避免在文件之间复制构件而不重新生成 GlobalId。',
        tekla:
          'GUID 重复源于跨模型复制的对象。从源模型重新导出——Tekla 在创建时为每个对象分配唯一 GUID。',
        allplan:
          'GUID 重复源于在文档之间复制对象。重新创建或重新导出受影响的对象，使 Allplan 重新生成唯一 GlobalId。',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'GlobalId 必须是 22 个字符的 IFC base-64 字符串。本工具可自动修复格式；从源头上，避免重写 GUID 的后处理。',
      tools: {
        revit:
          'Revit 默认写入合规的 IfcGUID。格式无效通常源于第三方脚本或手动编辑的 IfcGUID 参数——清除该参数，使 Revit 在导出时重新生成有效的 22 字符 GUID。',
        archicad:
          'ARCHICAD 生成合规的 GlobalId。无效值通常源于外部编辑或插件；重新生成 ID 或在不使用问题插件的情况下重新导出。',
        tekla:
          'Tekla 原生写入有效 GUID；无效值通常源于互操作脚本——从原生模型重新导出。',
        allplan:
          'Allplan 生成有效的 GlobalId；若无效，重新创建或重新导出受影响的对象。',
      },
    },
    // ── 结构与层级 ────────────────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        '将构件放入空间容器（楼层或空间）中，使其出现在模型树和下游工具中。',
      tools: {
        revit:
          '孤立构件源于未分配到标高的构件（组、导入几何、无主体构件）。将构件分配到标高，使 Revit 将其导出到 IfcBuildingStorey 内。',
        archicad:
          '检查构件的“归属楼层”设置——没有归属楼层的构件会作为孤立构件导出。为其分配一个。',
        tekla:
          '将零件分配到 IFC 导出所用的阶段/标高结构，使其获得空间容器；检查导出的空间结构设置。',
        allplan:
          '在建筑结构面板中将构件分配到楼层节点，使其不会被孤立导出。',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        '将构件移入正确的空间容器——物理建筑构件应属于楼层（或空间），而非直接位于场地或项目之下。',
      tools: {
        revit:
          '将构件重新分配到建筑标高。场地构件和地形可位于场地范围，但建筑构件必须位于某个标高上。',
        archicad:
          '将构件的“归属楼层”设置为正确的楼层；避免将建筑构件置于场地范围。',
        tekla:
          '调整 IFC 导出中的空间容器映射，使零件归入正确的楼层而非场地。',
        allplan:
          '在建筑结构中将对象移动到正确的楼层节点。',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        '修复损坏的聚合关系——这几乎总是导出/互操作产物，因此请从创作工具重新导出。',
      tools: {
        revit:
          '使用最新的 IFC 导出器重新导出。若仍存在，审核模型（管理 ▸ 清除未使用项）并检查损坏的组或装配。',
        archicad:
          '使用最新的 ARCHICAD IFC 插件重新导出；若损坏仍存在，运行模型检查。',
        tekla:
          '从 Tekla 重新导出——聚合损坏表示互操作故障，而非建模错误。',
        allplan:
          '使用最新的 IFC 接口从 Allplan 重新导出。',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        '确保空间结构遵循 项目 ▸ 场地 ▸ 建筑 ▸ 楼层。在导出前于创作工具的项目设置中修复。',
      tools: {
        revit:
          'Revit 会根据 项目 ▸ 场地 ▸ 建筑 ▸ 标高 自动构建该层级。层级损坏通常意味着缺少标高或使用了自定义导出——确认标高存在，并使用默认的 IFC 场地/建筑分配。',
        archicad:
          '在 IFC 转换器和楼层设置中检查层级：楼层位于建筑之下，建筑位于场地之下。',
        tekla:
          '在 IFC 导出对话框中配置完整的空间层级（项目/场地/建筑/楼层），使其完整且顺序正确。',
        allplan:
          '在导出前于结构面板中定义完整的建筑结构（项目/场地/建筑/楼层）。',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        '移除循环关系——构件不能是其自身的祖先。这是导出/互操作产物；请从干净的副本重新导出。',
      tools: {
        revit:
          '从干净的副本使用最新的 IFC 导出器重新导出；若仍存在，审核并清除模型。',
        archicad:
          '使用最新的 IFC 插件重新导出；运行模型检查以找出问题关系。',
        tekla:
          '从原生模型重新导出——Tekla 通常不会产生引用循环。',
        allplan:
          '从 Allplan 重新导出；若循环仍存在，重新创建受影响的对象。',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        '将构件放入楼层中，而非直接置于建筑之下。',
      tools: {
        revit:
          '将构件分配到标高，使其导出到 IfcBuildingStorey 之下而非建筑之下。',
        archicad:
          '设置构件的“归属楼层”，使其不位于建筑范围。',
        tekla:
          '在 IFC 导出空间设置中将零件映射到楼层。',
        allplan:
          '在建筑结构中将对象移动到楼层节点。',
      },
    },
    // ── 属性与类型 ────────────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        '将构件关联到类型（IfcWallType、IfcDoorType……），使类型属性和工程量得以传递。',
      tools: {
        revit:
          'Revit 族类型会自动导出为 IfcTypeObject。缺少类型通常意味着内建族或常规模型——将其转换为带定义类型的可载入族，并在 IFC 选项中保持启用类型导出。',
        archicad:
          '使用收藏夹/建筑材料，并在 IFC 转换器中保持启用 “Type Product” 导出，使构件类型被写入。',
        tekla:
          '分配截面和材料，使零件带类型导出；确认 IFC 导出写入类型对象。',
        allplan:
          '使用带定义类型的库对象/SmartParts，并在 IFC 接口中启用类型导出。',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        '在导出前为构件添加项目 BEP/EIR 所要求的属性集。',
      tools: {
        revit:
          '添加缺失的参数，并通过在 IFC 导出设置中引用的 User Defined PropertySets 文件将其映射到所需的 Pset。',
        archicad:
          '在属性管理器中定义所需的 Pset，将其分配给相关分类，并在 IFC 转换器中映射。',
        tekla:
          '将属性添加为 UDA，并在 IFC 导出的附加属性集中将其映射到所需的 Pset。',
        allplan:
          '创建属性并在 IFC 导出配置中将其映射到所需的 Pset。',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        '填写空的属性值——下游检查将空属性视为缺失。',
      tools: {
        revit:
          '找到该参数并输入值（或删除该空参数）。明细表是批量查找和填充空值的最快方式。',
        archicad:
          '使用属性管理器或交互式明细表查找并填充空的属性值。',
        tekla:
          '在导出前通过查询/报告工具填充空的 UDA 值。',
        allplan:
          '在导出前通过属性面板或列表填充空的属性值。',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        '为构件分配材料，使其承载材料数据（自 LOD 200/300 起要求）。',
      tools: {
        revit:
          '为构件的结构分配材料（编辑类型 ▸ 结构，或“材质”参数）。Revit 将已定义材料导出为 IfcMaterial / 层集。',
        archicad:
          '为构件分配“建筑材料”（而非仅表面）；ARCHICAD 将建筑材料导出为 IfcMaterial。',
        tekla:
          '在零件属性中设置零件材料；Tekla 将其导出为关联的 IFC 材料。',
        allplan:
          '为构件分配材料/格式属性，使其带材料关联导出。',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        '导出到当前的 IFC 架构（IFC4 / IFC4.3），除非接收方明确要求 IFC2x3。',
      tools: {
        revit:
          '在 IFC 导出对话框中，将文件版本设置为 IFC4（例如 Reference View 或 Design Transfer View）而非 IFC2x3。',
        archicad:
          '在 IFC 转换器中，选择基于 IFC4 的导出预设而非 IFC2x3。',
        tekla:
          '在 IFC 导出中，选择 IFC4 导出类型而非 IFC2x3。',
        allplan:
          '在 IFC 接口设置中选择 IFC4（或 IFC4.3）作为导出架构。',
      },
    },
    // ── 碰撞（Clash） ─────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        '在创作工具中解决构件之间的几何碰撞——移动、修剪或连接冲突构件。',
      tools: {
        revit:
          '运行“协作 ▸ 碰撞检查”以定位碰撞，然后移动/修剪/连接构件以解决重叠。',
        archicad:
          '使用“设计 ▸ 碰撞检测”查找重叠，然后调整冲突构件。',
        tekla:
          '使用“管理 ▸ 碰撞检查”查找并解决重叠零件。',
        allplan:
          '使用碰撞检查定位重叠并调整冲突构件。',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        '解决机电与结构的碰撞——重新布置机电走向，或与结构模型协调预留洞口/套管。',
      tools: {
        revit:
          '在机电与结构类别之间运行碰撞检查，然后重新布置管线或添加协调的洞口/套管。',
        archicad:
          '在机电与结构构件之间使用碰撞检测，然后重新布置或添加洞口。',
        tekla:
          '针对链接的机电参照模型运行碰撞检查，并在需要处添加贯穿/洞口。',
        allplan:
          '在机电与结构之间使用碰撞检查，并重新布置或添加洞口。',
      },
    },
    // ── 文件头与项目元数据 ────────────────────────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        '每个 IFC 必须且仅包含一个 IfcProject。缺失意味着导出损坏——请重新导出完整模型。',
      tools: {
        revit:
          'Revit 始终写入 IfcProject。缺失表示导出损坏或不完整——请重新导出完整模型，而非孤立选择。',
        archicad:
          '重新导出项目；导出模型，而非会丢弃项目根的孤立构件集。',
        tekla:
          '重新导出完整模型，使 IfcProject 根被写入。',
        allplan:
          '从项目重新导出，使 IfcProject 实体被包含。',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        '向空间结构添加建筑——在创作工具的项目设置中定义 IfcBuilding。',
      tools: {
        revit:
          'Revit 会自动创建建筑；缺失通常意味着仅场地的自定义导出。确认项目有标高，并在 IFC 选项中使用默认建筑分配。',
        archicad:
          '确保项目层级/IFC 转换器中存在建筑，且楼层位于其下。',
        tekla:
          '在 IFC 导出空间结构设置中定义建筑。',
        allplan:
          '在建筑结构面板中添加建筑节点。',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        '在建筑之下至少添加一个楼层（标高）。',
      tools: {
        revit:
          '在项目中创建标高；Revit 将标高导出为 IfcBuildingStorey。没有标高的模型不会导出楼层。',
        archicad:
          '通过“设计 ▸ 楼层设置”定义楼层，使建筑拥有楼层。',
        tekla:
          '在 IFC 导出空间设置中定义标高/楼层。',
        allplan:
          '在结构面板中于建筑之下添加楼层节点。',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        '填充空楼层或将其删除——空楼层会使空间树杂乱，且常常表示构件分配错误。',
      tools: {
        revit:
          '删除未使用的标高，或检查应属于该标高的构件是否分配到了它（而非相邻标高）。',
        archicad:
          '删除未使用的楼层，或重新分配构件的“归属楼层”，使该楼层不为空。',
        tekla:
          '从导出中移除空标高，或为其重新分配零件。',
        allplan:
          '删除空的楼层节点，或为其重新分配对象。',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        '为每个楼层赋予已定义的标高——这是垂直定位楼层和生成楼层平面所必需的。',
      tools: {
        revit:
          'Revit 中标高始终带有高程；空值通常意味着自定义导出。确认标高具有数值高程，并使用默认的 IFC 标高导出。',
        archicad:
          '在“设计 ▸ 楼层设置”中设置每个楼层的高程，使其不为空。',
        tekla:
          '在导出前于标高/轴网设置中确保每个标高都有已定义的高程。',
        allplan:
          '在建筑结构中定义每个楼层的高度/标高，使其导出一个数值。',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        '在导出选项中设置文件描述（通常是 MVD / 视图定义）——它是 STEP 头部元数据的一部分。',
      tools: {
        revit:
          'FILE_DESCRIPTION 由所选 MVD（例如 Reference View）设置。在 IFC 对话框中选择恰当的导出设置即可填充它。',
        archicad:
          'IFC 转换器的 MVD 选择会填充 FILE_DESCRIPTION；请选择已定义的导出预设。',
        tekla:
          '导出类型 / MVD 设置 FILE_DESCRIPTION；请选择已定义的 IFC 导出配置。',
        allplan:
          '选择已定义的 IFC 导出预设，使文件描述 / MVD 被写入。',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        '在导出或项目信息中填写作者和单位——可追溯性所需（ISO 19650）。',
      tools: {
        revit:
          '在 IFC 导出设置（修改设置）或“管理 ▸ 项目信息”中设置作者；这会填充 STEP FILE_NAME 的作者字段。',
        archicad:
          '在“文件 ▸ 信息 ▸ 项目信息”和 IFC 转换器中设置作者和公司，使其被写入头部。',
        tekla:
          '在 IFC 导出高级设置中设置作者/单位。',
        allplan:
          '在项目信息 / IFC 导出设置中设置作者/单位。',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        '在创作工具的项目信息中设置项目长名称（项目的描述性标题）。',
      tools: {
        revit:
          '在“管理 ▸ 项目信息”中设置项目名称/项目签发名称，并在 IFC 导出设置中将其映射到 IfcProject.LongName。',
        archicad:
          '在“文件 ▸ 信息 ▸ 项目信息”中设置项目名称/描述；IFC 转换器将其映射到 IfcProject.LongName。',
        tekla:
          '在项目属性中设置项目名称，并在导出时将其映射到 IfcProject.LongName。',
        allplan:
          '在项目信息中设置项目名称/描述，使 IfcProject.LongName 被填充。',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        '完善 ISO 19650 信息需求所要求的项目元数据（长名称、描述、项目阶段/类型）。',
      tools: {
        revit:
          '在“管理 ▸ 项目信息”中填写项目名称、描述和状态/阶段，并在 IFC 导出设置中将其映射到 IfcProject 字段。',
        archicad:
          '在“文件 ▸ 信息 ▸ 项目信息”中完善项目信息，并在 IFC 转换器中映射各字段。',
        tekla:
          '完善项目属性，并在导出时将其映射到 IfcProject 字段。',
        allplan:
          '完善项目信息，使 IfcProject 承载 LongName、Description 和 ObjectType。',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        '将作者和单位一并添加到导出中，使交付物按 ISO 19650 可追溯。',
      tools: {
        revit:
          '在 IFC 导出设置 / 项目信息中设置作者和单位，使二者都出现在 STEP 头部。',
        archicad:
          '在项目信息和 IFC 转换器中设置作者和公司。',
        tekla:
          '在 IFC 导出高级设置中设置作者和单位。',
        allplan:
          '在项目 / IFC 导出设置中设置作者和单位。',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        '使用 ISO 19650 模式命名导出文件：项目-发起方-卷-层-类型-角色-编号。',
      tools: {
        revit:
          'Revit 从导出的“保存”对话框获取文件名——导出时按 ISO 19650 模式命名文件（或之后重命名）。',
        archicad:
          '在导出对话框中按 ISO 19650 模式设置文件名，或重命名已导出的文件。',
        tekla:
          '在导出对话框中按 ISO 19650 模式命名 IFC 输出。',
        allplan:
          '在导出对话框中按 ISO 19650 模式命名已导出的文件。',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        '添加所声明 LOD/LOIN 等级所要求的属性集（依据项目的信息交付计划）。',
      tools: {
        revit:
          '通过 IFC 导出中的 User Defined PropertySets 文件将 LOD 所需参数映射到其 Pset，并确保构件确实承载这些参数。',
        archicad:
          '在属性管理器中定义 LOD 的 Pset，将其分配给相关分类，并在 IFC 转换器中映射。',
        tekla:
          '将 LOD 所需属性添加为 UDA，并在导出时将其映射到 Pset。',
        allplan:
          '创建 LOD 属性，并在 IFC 导出中将其映射到所需的 Pset。',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        '启用基础工程量导出，使构件在所声明的 LOD 下承载 IfcElementQuantity（面积/体积/长度）。',
      tools: {
        revit:
          '在 IFC 导出选项中启用“导出基础工程量”；Revit 随后会为构件写入 IfcElementQuantity。',
        archicad:
          '在 IFC 转换器设置中启用基础工程量导出。',
        tekla:
          '在 IFC 导出配置中启用工程量/基础工程量导出。',
        allplan:
          '在 IFC 导出设置中启用基础工程量。',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        '为墙和板定义分层构造，使其在 LOD 300+ 时导出 IfcMaterialLayerSetUsage。',
      tools: {
        revit:
          '为墙/楼板类型的“结构”层（编辑类型 ▸ 结构）定义材料；Revit 将复合构造导出为 IfcMaterialLayerSet。',
        archicad:
          '对墙/板使用复合结构（而非单一建筑材料），使各层导出为 IfcMaterialLayerSet。',
        tekla:
          'Tekla 零件通常为单一材料；对于分层构件，请定义各层/材料使层集导出，或确认本规则是否适用于你的专业。',
        allplan:
          '使用多层构件，使材料层集被导出。',
      },
    },
    // ── 分类 ──────────────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        '附加分类参照（Uniclass、OmniClass 等），使构件以 IfcRelAssociatesClassification 承载其标准代码。',
      tools: {
        revit:
          '使用分类插件（例如免费的 Classification Manager for Revit）分配 Uniclass/OmniClass 代码，或在 IFC 导出设置中将共享参数映射到 IfcClassificationReference。没有映射，Revit 不会导出分类。',
        archicad:
          '打开“分类与属性”面板，选择一个分类系统（内置或导入），并为构件分配一个分类项。ARCHICAD 会自动将其导出为 IfcClassificationReference。',
        tekla:
          '通过 UDA 或 Tekla–IFC 属性映射分配分类，然后在 IFC 导出的附加属性集中将该属性映射到 IfcClassificationReference。',
        allplan:
          '通过对象属性分配分类代码，并确保 IFC 导出配置将其映射到 IfcClassificationReference。',
      },
    },
    // ── 机电（MEP） ───────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        '将机电构件分配到系统，使其在 IfcSystem 内导出——基于系统的协调所必需。',
      tools: {
        revit:
          '确保风管/管道/设备属于已命名的 Revit 系统；未分配的构件导出时没有 IfcSystem。使用系统浏览器查找并分配它们。',
        archicad:
          '在 MEP Modeler 中将机电构件分配到机电系统，使其在 IfcSystem 内导出。',
        allplan:
          '将机电对象分配到系统/网络，使其在 IfcSystem 内导出。',
      },
    },
    // ── 几何与文件健康 ────────────────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        '通过将 IfcBuildingElementProxy 构件映射到恰当的 IFC 类来减少它们——代理不承载语义类型。',
      tools: {
        revit:
          '代理源于内建族、常规模型或未映射的类别。使用 IFC 导出类别映射表将这些类别映射到真实的 IFC 类型而非 IfcBuildingElementProxy，并将内建族转换为可载入族。',
        archicad:
          '为对象（尤其是变形体和自定义对象）分配恰当的分类/IFC 类型，使其不被导出为代理。',
        tekla:
          '在 IFC 导出设置中将自定义或代理零件映射到正确的 IFC 实体。',
        allplan:
          '为通用对象分配正确的 IFC 类型，使其不被导出为代理。',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        '使模型靠近内部原点并正确进行地理参照，而非在巨大的真实世界坐标处建模。',
      tools: {
        revit:
          '不要远离 Revit 的内部原点建模。使用带测量点/项目基点的共享坐标，并以当前共享坐标导出，使几何靠近原点同时保留地理参照。',
        archicad:
          '设置测量点和项目原点；使模型靠近原点，并使用 IFC 地理参照（IfcMapConversion）而非大偏移。',
        tekla:
          '设置基点/工作点并使模型靠近原点；使用 IFC 导出基点，使坐标不至于过大。',
        allplan:
          '设置项目地理参照/基点，并使几何靠近原点而非位于真实世界坐标。',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        '减小文件体量：降低镶嵌/细节、避免内嵌纹理，并仅导出所需内容。',
      tools: {
        revit:
          '降低导出的细节层次，避免导出已导入的 CAD 和高面数族，并按专业拆分。Reference View MVD 生成更轻的镶嵌几何。',
        archicad:
          '降低曲线/分段分辨率，避免内嵌纹理，使用精简的 IFC 转换器预设，并仅导出所需构件。',
        tekla:
          '降低导出几何的细节/表示，并避免不必要地导出参照模型。',
        allplan:
          '在 IFC 导出中降低几何分辨率并避免内嵌纹理。',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        '重新关联或删除孤立的 IfcOpeningElement —— 每个洞口都必须通过 IfcRelVoidsElement 在宿主构件上开洞。',
      tools: {
        revit:
          '孤立洞口通常源于被删除/修改的宿主或松散导出的竖井洞口。删除游离的洞口，并在其宿主（墙/楼板/屋顶）上重新开洞以导出该关系；若剪切丢失，请重新放置门/窗。',
        archicad:
          '洞口必须从属于墙或板。删除游离的洞口对象，使用锚定在宿主上的洞口工具（或门/窗），以便 ArchiCAD 导出 IfcRelVoidsElement。',
        tekla:
          '将剪切/洞口重建为其宿主零件的特征（feature），而非游离对象，使导出时空洞引用某个宿主。',
        allplan:
          '用墙/板的开洞工具放置洞口，使其从属于宿主；删除已脱离的洞口实体。',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        '为每个 IfcBuildingStorey 设置唯一的 Elevation —— 楼层标高重复会破坏平面生成与按楼层筛选。',
      tools: {
        revit:
          '两个标高共用同一高程。在标高视图中为每个标高设置唯一高程（或删除多余的重复项），并仅将真正的楼层导出为标高（在其他标高上关闭“建筑楼层”/导出）。',
        archicad:
          '打开楼层设置，为每个楼层设置唯一高程；合并或删除指向同一高度的重复楼层。',
        tekla:
          '在标高/阶段列表中，为用于 IFC 楼层结构的每个标高分配唯一高程，并删除重复项。',
        allplan:
          '在建筑结构中为每个楼层设置不同高度，并删除解析到同一高程的重复楼层。',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        '使楼层的 Elevation 自下而上递增排序 —— 标高乱序会让剖面/平面工具和审阅者困惑。',
      tools: {
        revit:
          '较低的标高反而高程更大（或相反）。修正标高高程或导出顺序，使楼层自下而上排列，并检查带负高程的地下室/屋顶标高。',
        archicad:
          '在楼层设置中，修正任何顺序错乱楼层的高度，使高程随楼层序号递增。',
        tekla:
          '重新排序/编号标高使其高程递增；修正任何高度与其位置矛盾的标高。',
        allplan:
          '在建筑结构中重新排序楼层或修正其高度，使高程向上递增。',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        '以公制 SI（毫米/米）导出 —— 英制长度单位会破坏与大多数 IFC/BIM 工具的互操作性。',
      tools: {
        revit:
          'Revit 内部单位为英制，但 IFC 应为公制。导出前将项目单位设为公制（或确认 IFC 导出使用 SI/公制），使文件的 IFCSIUNIT 以米为基准。',
        archicad:
          '将项目的工作单位（及计算单位）设为公制，使 IFC 模式导出 SI 长度单位。',
        tekla:
          '将环境/角色或导出设置切换为公制，使 IFC 的 LENGTHUNIT 为 SI（mm/m）。',
        allplan:
          '在项目选项中将长度单位设为公制，使 IFC 导出使用 SI 单位。',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        '为 IfcSpace 添加面积量 —— 导出 BaseQuantities，使每个空间携带 NetFloorArea/GrossFloorArea。',
      tools: {
        revit:
          '房间导出为 IfcSpace 但缺少量值。在 IFC 导出选项中启用“导出基础量”（Pset/QTO），并确保房间边界/放置正确以便计算面积。',
        archicad:
          '用区域（Zone）表示空间，并在 IFC 转换器中启用基础量，使 IfcSpace 导出 NetFloorArea/GrossFloorArea。',
        tekla:
          'Tekla 中空间功能有限；如确需，请定义空间并启用量值导出，或在建筑模型中生成。',
        allplan:
          '创建房间（空间）并启用 IFC 量值导出，使 IfcSpace 携带面积量。',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        '通过端口连接 MEP 段 —— 断开的管道/风管导出时缺少 IfcDistributionPort 关系，会破坏系统追踪。',
      tools: {
        revit:
          '断开的风管/管道导出时没有端口。修复 MEP 模型中的开放连接件（无间隙/松端），使各段连入相连的系统，并启用系统/端口导出，以写出 IfcDistributionPort 关系。',
        archicad:
          '使用 MEP Modeler 使路由端到端保持连接；导出 MEP 系统以包含端口/连接。',
        tekla:
          'MEP 不是 Tekla 的领域；请在专用 MEP 工具中建模连通的 MEP 使各段带端口，然后再联合（federate）。',
        allplan:
          '将 MEP 走线端到端连通建模（无开放端），使 IFC 导出在各段之间写出分配端口。',
      },
    },
  },
  ja: {
    // ── 名称と識別 ───────────────────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        '集計表・モデルツリー・後工程の調整で識別できるよう、要素に意味のある Name を付与します。',
      tools: {
        revit:
          'Revit はエクスポート時にファミリのタイプ名を IFC Name に割り当てます。要素のタイプ プロパティを開き、既定値（例：「Basic Wall 1」）の代わりに分かりやすいタイプ名を付けます。インスタンス単位で命名するには、IFC エクスポートのマッピング表で共有パラメータを IfcName に割り当てます。',
        archicad:
          '要素を選択し、IFC マネージャー（右クリック ▸ IFC マネージャー）または分類とプロパティ パレットを開いて IfcRoot.Name を設定するか、エクスポート前に IFC 変換設定のプロパティでマッピングを定義します。',
        tekla:
          '部材の Name フィールドが IFC Name に割り当てられます。部材プロパティを開いて Name を入力し、IFC エクスポート設定でその属性が IfcName に割り当てられていることを確認します。',
        allplan:
          'プロパティ パレットで Allplan が IfcName に割り当てる属性を設定するか、IFC エクスポート構成で IfcName のマッピングを設定します。',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        '空間・階・建物に LongName を設定します。集計表や COBie で使われる人間が読める部屋／レベル名を保持します。',
      tools: {
        revit:
          '空間には部屋／面積の名前を設定します（Revit は部屋名 → IfcLongName、部屋番号 → IfcName に割り当て）。階には各レベルに分かりやすい名前を付けます。建物名は IFC エクスポート オプションで設定します。',
        archicad:
          '空間にはゾーン名（IfcLongName に割り当て）を設定し、階は 設計 ▸ ストーリー設定 で命名します。建物のロング名は ファイル ▸ 情報 ▸ プロジェクト情報／IFC 変換設定 で設定します。',
        tekla:
          '空間や階を Tekla で作成することはまれです。存在する場合は IfcLongName に割り当てる Name／UDA を設定するか、IFC エクスポートの空間設定で階名を設定します。',
        allplan:
          '部屋名（IfcLongName に割り当て）を設定し、建物構造で階を命名し、IFC エクスポートで建物のロング名を設定します。',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        '兄弟要素の名前を一意にします（またはタイプ＋インスタンス番号に依拠）。集計表や調整で区別できるようにします。',
      tools: {
        revit:
          '重複名は通常、同一のタイプ名やマークが原因です。インスタンスのマーク パラメータ（要素ごとに一意）を使うかタイプ名を変更し、Revit のマーク重複警告を解消します。',
        archicad:
          'ID マネージャー（ドキュメント ▸ ID マネージャー）で一意の要素 ID を自動割り当てし、兄弟要素が同じ Name を共有しないようにします。',
        tekla:
          '採番（図面とレポート ▸ 採番）を実行し、各部材が Name に割り当てられる一意の位置／部材マークを得るようにします。',
        allplan:
          '属性パレットで一意の属性値（例：部材番号）を割り当て、兄弟要素が同じ Name を共有しないようにします。',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'プロジェクトの BEP 命名規則（通常は EIR／ISO 19650 の情報要件で定義）に従って要素名を変更します。',
      tools: {
        revit:
          'タイプ名と IfcName に割り当てるパラメータを BEP に合わせて統一します。一括変更には共有パラメータまたは Dynamo スクリプトを使い、エクスポート時に IfcName へマッピングします。',
        archicad:
          'ID マネージャーで規則を適用し、IfcName に割り当てるプロパティ（分類とプロパティ パレット）を BEP に揃えます。',
        tekla:
          '採番シリーズと部材名を BEP に合わせて構成し、採番を再実行します。',
        allplan:
          '属性テンプレート／お気に入りで BEP 命名を強制し、その属性をエクスポート時に IfcName へマッピングします。',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'すべての要素は一意の GlobalId を持つ必要があります。本ツールで重複を自動修正できます（修正を適用をクリック）。根本的に防ぐには下記のエクスポート手順を見直します。',
      tools: {
        revit:
          'GUID の重複は通常、モデル間やリンク ファイル間での要素のコピー＆ペーストが原因です。エクスポート対象モデル間で要素を複製せず、クリーンなコピーから再エクスポートします。IfcGUID パラメータを共有するグループ要素やミラー要素では、そのパラメータをクリアして Revit に一意の値を再生成させます。',
        archicad:
          'GUID の重複は通常、プロジェクト間でのコピーやモジュール結合で生じます。一意の ID を再生成し（設計 ▸ 要素 ID マネージャー）、GlobalId を再生成せずにファイル間で要素をコピーしないようにします。',
        tekla:
          'GUID の重複はモデル間でコピーされたオブジェクトが原因です。元のモデルから再エクスポートします。Tekla は作成時に各オブジェクトへ一意の GUID を割り当てます。',
        allplan:
          'GUID の重複はドキュメント間でのオブジェクトのコピーが原因です。該当オブジェクトを作り直すか再エクスポートし、Allplan に一意の GlobalId を再生成させます。',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'GlobalId は 22 文字の IFC base-64 文字列でなければなりません。本ツールで形式を自動修正できます。根本的には GUID を書き換える後処理を避けます。',
      tools: {
        revit:
          'Revit は既定で準拠した IfcGUID を書き出します。無効な形式は通常、サードパーティのスクリプトや手動編集された IfcGUID パラメータが原因です。パラメータをクリアして Revit に有効な 22 文字の GUID を再生成させます。',
        archicad:
          'ARCHICAD は準拠した GlobalId を生成します。無効な値は通常、外部編集やアドオンが原因です。ID を再生成するか、問題のアドオンを外して再エクスポートします。',
        tekla:
          'Tekla はネイティブに有効な GUID を書き出します。無効な値は通常インターオプ スクリプトが原因です。ネイティブ モデルから再エクスポートします。',
        allplan:
          'Allplan は有効な GlobalId を生成します。無効な場合は該当オブジェクトを作り直すか再エクスポートします。',
      },
    },
    // ── 構造と階層 ───────────────────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'モデルツリーや後工程ツールに表示されるよう、要素を空間コンテナ（階または空間）の中に配置します。',
      tools: {
        revit:
          '孤立要素はレベルに割り当てられていない要素（グループ、インポート ジオメトリ、非ホスト要素）から生じます。要素をレベルに割り当て、Revit が IfcBuildingStorey 内にエクスポートするようにします。',
        archicad:
          '要素のホーム ストーリー設定を確認します。ホーム ストーリーのない要素は孤立としてエクスポートされます。割り当ててください。',
        tekla:
          'IFC エクスポートで使用するフェーズ／レベル構造に部材を割り当て、空間コンテナを得るようにします。エクスポートの空間構造設定を確認します。',
        allplan:
          '建物構造パレットで要素を階ノードに割り当て、孤立してエクスポートされないようにします。',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        '要素を正しい空間コンテナに移動します。物理的な建築要素は敷地やプロジェクト直下ではなく階（または空間）に属します。',
      tools: {
        revit:
          '要素を建物のレベルに再割り当てします。敷地構成要素や地形は敷地スコープで問題ありませんが、建築要素はレベル上に置く必要があります。',
        archicad:
          '要素のホーム ストーリーを正しい階に設定します。建築要素を敷地スコープに置かないようにします。',
        tekla:
          'IFC エクスポートの空間コンテナ マッピングを調整し、部材が敷地ではなく正しい階に配置されるようにします。',
        allplan:
          'オブジェクトを建物構造内の正しい階ノードに移動します。',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        '壊れた集約関係を修正します。ほぼ常にエクスポート／インターオプの不具合なので、オーサリング ツールから再エクスポートします。',
      tools: {
        revit:
          '最新の IFC エクスポータで再エクスポートします。続く場合はモデルを監査（管理 ▸ 未使用の削除）し、破損したグループやアセンブリを確認します。',
        archicad:
          '最新の ARCHICAD IFC アドオンで再エクスポートします。破損が続く場合はモデル チェックを実行します。',
        tekla:
          'Tekla から再エクスポートします。集約の破損はモデリング エラーではなくインターオプの不具合を示します。',
        allplan:
          '最新の IFC インターフェイスで Allplan から再エクスポートします。',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        '空間構造が プロジェクト ▸ 敷地 ▸ 建物 ▸ 階 に従うようにします。エクスポート前にオーサリング ツールのプロジェクト設定で修正します。',
      tools: {
        revit:
          'Revit は プロジェクト ▸ 敷地 ▸ 建物 ▸ レベル からこの階層を自動構築します。階層の破損は通常、レベルの欠落かカスタム エクスポートが原因です。レベルの存在を確認し、既定の IFC 敷地／建物割り当てを使います。',
        archicad:
          'IFC 変換設定とストーリー設定で階層を確認します。階は建物の下、建物は敷地の下に置きます。',
        tekla:
          'IFC エクスポート ダイアログで完全な空間階層（プロジェクト／敷地／建物／階）を構成し、過不足なく正しい順序にします。',
        allplan:
          'エクスポート前に、構造パレットで完全な建物構造（プロジェクト／敷地／建物／階）を定義します。',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        '循環関係を取り除きます。要素は自身の祖先になれません。これはエクスポート／インターオプの不具合です。クリーンなコピーから再エクスポートします。',
      tools: {
        revit:
          'クリーンなコピーから最新の IFC エクスポータで再エクスポートします。続く場合はモデルを監査して削除します。',
        archicad:
          '最新の IFC アドオンで再エクスポートし、問題の関係を見つけるためにモデル チェックを実行します。',
        tekla:
          'ネイティブ モデルから再エクスポートします。Tekla は通常、参照の循環を作成しません。',
        allplan:
          'Allplan から再エクスポートします。循環が続く場合は該当オブジェクトを作り直します。',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        '要素を建物直下ではなく階の中に配置します。',
      tools: {
        revit:
          '要素をレベルに割り当て、建物ではなく IfcBuildingStorey の下にエクスポートされるようにします。',
        archicad:
          '要素のホーム ストーリーを設定し、建物スコープに置かれないようにします。',
        tekla:
          'IFC エクスポートの空間設定で部材を階にマッピングします。',
        allplan:
          'オブジェクトを建物構造内の階ノードに移動します。',
      },
    },
    // ── プロパティとタイプ ───────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'タイプ プロパティと数量が伝播するよう、要素をタイプ（IfcWallType、IfcDoorType など）に関連付けます。',
      tools: {
        revit:
          'Revit のファミリ タイプは自動的に IfcTypeObject としてエクスポートされます。タイプの欠落は通常、インプレース ファミリやジェネリック モデルが原因です。タイプを定義したロード可能ファミリに変換し、IFC オプションでタイプ エクスポートを有効にしておきます。',
        archicad:
          'お気に入り／建材を使い、IFC 変換設定で「タイプ プロダクト」エクスポートを有効にして要素タイプが書き出されるようにします。',
        tekla:
          'プロファイルと材料を割り当てて部材がタイプ付きでエクスポートされるようにし、IFC エクスポートがタイプ オブジェクトを書き出すことを確認します。',
        allplan:
          'タイプを定義したライブラリ オブジェクト／SmartParts を使い、IFC インターフェイスでタイプ エクスポートを有効にします。',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'エクスポート前に、プロジェクトの BEP／EIR で定義された必須プロパティ セットを要素に追加します。',
      tools: {
        revit:
          '不足しているパラメータを追加し、IFC エクスポート設定で参照される User Defined PropertySets ファイルを介して必須 Pset に割り当てます。',
        archicad:
          'プロパティ マネージャーで必須 Pset を定義し、関連する分類に割り当て、IFC 変換設定でマッピングします。',
        tekla:
          'プロパティを UDA として追加し、IFC エクスポートの追加プロパティ セットで必須 Pset に割り当てます。',
        allplan:
          '属性を作成し、IFC エクスポート構成で必須 Pset に割り当てます。',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        '空のプロパティ値を入力します。空のプロパティは後工程のチェックで欠落として扱われます。',
      tools: {
        revit:
          'パラメータを見つけて値を入力します（または空のパラメータを削除）。空欄を一括で見つけて埋めるには集計表が最速です。',
        archicad:
          'プロパティ マネージャーまたはインタラクティブ集計表を使って空のプロパティ値を見つけ、入力します。',
        tekla:
          'エクスポート前に、照会／レポート ツールで空の UDA 値を入力します。',
        allplan:
          'エクスポート前に、属性パレットまたはリストで空の属性値を入力します。',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        '材料データ（LOD 200／300 以降で期待される）を保持するよう、要素に材料を割り当てます。',
      tools: {
        revit:
          '要素の構造（タイプ編集 ▸ 構造、または材料パラメータ）に材料を割り当てます。Revit は定義された材料を IfcMaterial／レイヤー セットとしてエクスポートします。',
        archicad:
          '要素に（サーフェスだけでなく）建材を割り当てます。ARCHICAD は建材を IfcMaterial としてエクスポートします。',
        tekla:
          '部材プロパティで部材材料を設定します。Tekla はそれを関連付けられた IFC 材料としてエクスポートします。',
        allplan:
          '要素に材料／フォーマット属性を割り当て、材料の関連付け付きでエクスポートされるようにします。',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        '受領者が IFC2x3 を明示的に要求しない限り、現行の IFC スキーマ（IFC4／IFC4.3）にエクスポートします。',
      tools: {
        revit:
          'IFC エクスポート ダイアログで、ファイル バージョンを IFC2x3 ではなく IFC4（例：Reference View または Design Transfer View）に設定します。',
        archicad:
          'IFC 変換設定で、IFC2x3 ではなく IFC4 ベースのエクスポート プリセットを選択します。',
        tekla:
          'IFC エクスポートで、IFC2x3 ではなく IFC4 エクスポート タイプを選択します。',
        allplan:
          'IFC インターフェイス設定で、エクスポート スキーマとして IFC4（または IFC4.3）を選択します。',
      },
    },
    // ── 干渉 ─────────────────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'オーサリング ツールで要素間の幾何学的干渉を解消します。競合する要素を移動・トリム・結合します。',
      tools: {
        revit:
          '協同作業 ▸ 干渉チェック を実行して干渉箇所を特定し、要素を移動／トリム／結合して重なりを解消します。',
        archicad:
          '設計 ▸ 衝突検出 で重なりを見つけ、競合する要素を調整します。',
        tekla:
          '管理 ▸ 干渉チェック で重なる部材を見つけて解消します。',
        allplan:
          '衝突チェックで重なりを特定し、競合する要素を調整します。',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'MEP と構造の干渉を解消します。MEP の経路を変更するか、構造モデルと貫通／スリーブを調整します。',
      tools: {
        revit:
          'MEP と構造のカテゴリ間で干渉チェックを実行し、設備の経路を変更するか調整された開口／スリーブを追加します。',
        archicad:
          'MEP と構造要素の間で衝突検出を使い、経路変更または開口の追加を行います。',
        tekla:
          'リンクした MEP 参照モデルに対して干渉チェックを実行し、必要箇所に貫通／開口を追加します。',
        allplan:
          'MEP と構造の間で衝突チェックを使い、経路変更または開口の追加を行います。',
      },
    },
    // ── ファイルヘッダーとプロジェクト メタデータ ────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'すべての IFC は IfcProject をちょうど 1 つ含む必要があります。プロジェクトの欠落はエクスポートの破損を意味します。モデル全体を再エクスポートします。',
      tools: {
        revit:
          'Revit は常に IfcProject を書き出します。欠落は破損または部分エクスポートを示します。孤立した選択ではなくモデル全体を再エクスポートします。',
        archicad:
          'プロジェクトを再エクスポートします。プロジェクト ルートを落とす孤立した要素セットではなく、モデルをエクスポートします。',
        tekla:
          'IfcProject ルートが書き出されるよう、モデル全体を再エクスポートします。',
        allplan:
          'IfcProject エンティティが含まれるよう、プロジェクトから再エクスポートします。',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        '空間構造に建物を追加します。オーサリング ツールのプロジェクト設定で IfcBuilding を定義します。',
      tools: {
        revit:
          'Revit は建物を自動作成します。欠落は通常、敷地のみのカスタム エクスポートが原因です。プロジェクトにレベルがあることを確認し、IFC オプションで既定の建物割り当てを使います。',
        archicad:
          'プロジェクト階層／IFC 変換設定に建物が存在し、その下に階が置かれていることを確認します。',
        tekla:
          'IFC エクスポートの空間構造設定で建物を定義します。',
        allplan:
          '建物構造パレットに建物ノードを追加します。',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        '建物の下に少なくとも 1 つの階（レベル）を追加します。',
      tools: {
        revit:
          'プロジェクトにレベルを作成します。Revit はレベルを IfcBuildingStorey としてエクスポートします。レベルのないモデルは階を出力しません。',
        archicad:
          '設計 ▸ ストーリー設定 で階を定義し、建物に階を持たせます。',
        tekla:
          'IFC エクスポートの空間設定でレベル／階を定義します。',
        allplan:
          '構造パレットで建物の下に階ノードを追加します。',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        '空の階を埋めるか削除します。空の階は空間ツリーを乱雑にし、しばしば誤割り当ての要素を示します。',
      tools: {
        revit:
          '未使用のレベルを削除するか、その階向けの要素が（隣接レベルではなく）正しく割り当てられているか確認します。',
        archicad:
          '未使用のストーリーを削除するか、要素のホーム ストーリーを再割り当てして階が空にならないようにします。',
        tekla:
          'エクスポートから空のレベルを削除するか、部材を再割り当てします。',
        allplan:
          '空の階ノードを削除するか、オブジェクトを再割り当てします。',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'すべての階に標高を定義します。レベルを垂直に配置し平面図を生成するために必須です。',
      tools: {
        revit:
          'Revit ではレベルは常に標高を持ちます。null は通常カスタム エクスポートが原因です。レベルに数値の標高があることを確認し、既定の IFC レベル エクスポートを使います。',
        archicad:
          '各ストーリーの標高を 設計 ▸ ストーリー設定 で設定し、null にならないようにします。',
        tekla:
          'エクスポート前に、レベル／グリッド設定で各レベルに標高が定義されていることを確認します。',
        allplan:
          '建物構造で各階の高さ／標高を定義し、値が出力されるようにします。',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'エクスポート オプションでファイル記述（通常は MVD／ビュー定義）を設定します。STEP ヘッダー メタデータの一部です。',
      tools: {
        revit:
          'FILE_DESCRIPTION は選択した MVD（例：Reference View）から設定されます。IFC ダイアログで適切なエクスポート設定を選ぶと入力されます。',
        archicad:
          'IFC 変換設定の MVD 選択が FILE_DESCRIPTION を設定します。定義済みのエクスポート プリセットを選びます。',
        tekla:
          'エクスポート タイプ／MVD が FILE_DESCRIPTION を設定します。定義済みの IFC エクスポート構成を選びます。',
        allplan:
          '定義済みの IFC エクスポート プリセットを選び、ファイル記述／MVD が書き出されるようにします。',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'エクスポートまたはプロジェクト情報で作成者と組織を入力します。トレーサビリティ（ISO 19650）に必須です。',
      tools: {
        revit:
          'IFC エクスポート設定（設定の変更）または 管理 ▸ プロジェクト情報 で作成者を設定します。これが STEP の FILE_NAME 作成者フィールドを埋めます。',
        archicad:
          'ファイル ▸ 情報 ▸ プロジェクト情報 と IFC 変換設定で作成者と会社を設定し、ヘッダーに書き出されるようにします。',
        tekla:
          'IFC エクスポートの詳細設定で作成者／組織を設定します。',
        allplan:
          'プロジェクト情報／IFC エクスポート設定で作成者／組織を設定します。',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'オーサリング ツールのプロジェクト情報でプロジェクトのロング名（説明的なプロジェクト タイトル）を設定します。',
      tools: {
        revit:
          '管理 ▸ プロジェクト情報 でプロジェクト名／プロジェクト発行名を設定し、IFC エクスポート設定で IfcProject.LongName に割り当てます。',
        archicad:
          'ファイル ▸ 情報 ▸ プロジェクト情報 でプロジェクト名／説明を設定します。IFC 変換設定が IfcProject.LongName に割り当てます。',
        tekla:
          'プロジェクト プロパティでプロジェクト名を設定し、エクスポートで IfcProject.LongName に割り当てます。',
        allplan:
          'プロジェクト情報でプロジェクト名／説明を設定し、IfcProject.LongName が入力されるようにします。',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'ISO 19650 の情報要件で求められるプロジェクト メタデータ（ロング名、説明、プロジェクト フェーズ／タイプ）を完成させます。',
      tools: {
        revit:
          '管理 ▸ プロジェクト情報 でプロジェクト名・説明・ステータス／フェーズを入力し、IFC エクスポート設定で IfcProject の各フィールドに割り当てます。',
        archicad:
          'ファイル ▸ 情報 ▸ プロジェクト情報 でプロジェクト情報を完成させ、IFC 変換設定でフィールドを割り当てます。',
        tekla:
          'プロジェクト プロパティを完成させ、エクスポートで IfcProject の各フィールドに割り当てます。',
        allplan:
          'プロジェクト情報を完成させ、IfcProject が LongName・Description・ObjectType を保持するようにします。',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'ISO 19650 に従って成果物を追跡できるよう、エクスポートに作成者と組織の両方を追加します。',
      tools: {
        revit:
          'IFC エクスポート設定／プロジェクト情報で作成者と組織を設定し、両方が STEP ヘッダーに表示されるようにします。',
        archicad:
          'プロジェクト情報と IFC 変換設定で作成者と会社を設定します。',
        tekla:
          'IFC エクスポートの詳細設定で作成者と組織を設定します。',
        allplan:
          'プロジェクト／IFC エクスポート設定で作成者と組織を設定します。',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'ISO 19650 のパターン（プロジェクト-発信者-巻-レベル-タイプ-役割-番号）でエクスポート ファイルを命名します。',
      tools: {
        revit:
          'Revit はエクスポートの保存ダイアログからファイル名を取得します。エクスポート時に ISO 19650 パターンで命名します（または後でリネーム）。',
        archicad:
          'エクスポート ダイアログで ISO 19650 パターンに従ってファイル名を設定するか、出力後にリネームします。',
        tekla:
          'エクスポート ダイアログで IFC 出力を ISO 19650 パターンで命名します。',
        allplan:
          'エクスポート ダイアログで出力ファイルを ISO 19650 パターンで命名します。',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        '宣言された LOD／LOIN レベルで（プロジェクトの情報納品計画に従って）求められるプロパティ セットを追加します。',
      tools: {
        revit:
          'IFC エクスポートで User Defined PropertySets ファイルを介して LOD 必須パラメータを Pset に割り当て、要素が実際にそれらのパラメータを保持していることを確認します。',
        archicad:
          'プロパティ マネージャーで LOD の Pset を定義し、関連する分類に割り当て、IFC 変換設定でマッピングします。',
        tekla:
          'LOD 必須プロパティを UDA として追加し、エクスポートで Pset に割り当てます。',
        allplan:
          'LOD 属性を作成し、IFC エクスポートで必須 Pset に割り当てます。',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        '基本数量エクスポートを有効にし、要素が宣言された LOD で IfcElementQuantity（面積／体積／長さ）を保持するようにします。',
      tools: {
        revit:
          'IFC エクスポート オプションで「基本数量をエクスポート」を有効にします。Revit が要素の IfcElementQuantity を書き出します。',
        archicad:
          'IFC 変換設定で基本数量エクスポートを有効にします。',
        tekla:
          'IFC エクスポート構成で数量／基本数量エクスポートを有効にします。',
        allplan:
          'IFC エクスポート設定で基本数量を有効にします。',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        '壁とスラブに層構成を定義し、LOD 300 以降で IfcMaterialLayerSetUsage がエクスポートされるようにします。',
      tools: {
        revit:
          '壁／床のタイプの構造レイヤー（タイプ編集 ▸ 構造）を材料付きで定義します。Revit は複合構造を IfcMaterialLayerSet としてエクスポートします。',
        archicad:
          '壁／スラブに（単一の建材ではなく）複合構造を使い、層が IfcMaterialLayerSet としてエクスポートされるようにします。',
        tekla:
          'Tekla の部材は通常単一材料です。層構成の要素では層／材料を定義して層セットをエクスポートするか、本ルールが自分の分野に該当するか確認します。',
        allplan:
          '複数層の部材を使い、材料層セットがエクスポートされるようにします。',
      },
    },
    // ── 分類 ─────────────────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        '分類参照（Uniclass、OmniClass など）を付与し、要素が標準コードを IfcRelAssociatesClassification として保持するようにします。',
      tools: {
        revit:
          '分類アドイン（例：無料の Classification Manager for Revit）で Uniclass／OmniClass コードを割り当てるか、IFC エクスポート設定で共有パラメータを IfcClassificationReference に割り当てます。マッピングがないと Revit は分類を出力しません。',
        archicad:
          '分類とプロパティ パレットを開き、分類システム（組み込みまたはインポート）を選び、要素に分類項目を割り当てます。ARCHICAD はこれを IfcClassificationReference として自動エクスポートします。',
        tekla:
          'UDA または Tekla–IFC プロパティ マッピングで分類を割り当て、その属性を IFC エクスポートの追加プロパティ セットで IfcClassificationReference に割り当てます。',
        allplan:
          'オブジェクト属性で分類コードを割り当て、IFC エクスポート構成がそれを IfcClassificationReference に割り当てるようにします。',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'MEP 要素をシステムに割り当て、IfcSystem の中にエクスポートされるようにします。システム単位の調整に必要です。',
      tools: {
        revit:
          'ダクト／配管／機器が名前付きの Revit システムに属していることを確認します。未割り当ての要素は IfcSystem なしでエクスポートされます。システム ブラウザで見つけて割り当てます。',
        archicad:
          'MEP モデラーで MEP 要素を MEP システムに割り当て、IfcSystem 内にエクスポートされるようにします。',
        allplan:
          'MEP オブジェクトをシステム／ネットワークに割り当て、IfcSystem 内にエクスポートされるようにします。',
      },
    },
    // ── ジオメトリとファイル健全性 ───────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'IfcBuildingElementProxy 要素を適切な IFC クラスに割り当てて減らします。プロキシは意味的なタイプを持ちません。',
      tools: {
        revit:
          'プロキシはインプレース ファミリ、ジェネリック モデル、未マッピングのカテゴリから生じます。IFC エクスポートのクラス マッピング表でそれらのカテゴリを IfcBuildingElementProxy ではなく実際の IFC タイプに割り当て、インプレース ファミリをロード可能ファミリに変換します。',
        archicad:
          'オブジェクト（特にモーフやカスタム オブジェクト）に適切な分類／IFC タイプを割り当て、プロキシとしてエクスポートされないようにします。',
        tekla:
          'IFC エクスポート設定でカスタムまたはプロキシの部材を正しい IFC エンティティに割り当てます。',
        allplan:
          'ジェネリック オブジェクトに正しい IFC タイプを割り当て、プロキシとしてエクスポートされないようにします。',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        '大きな実世界座標でモデリングする代わりに、モデルを内部原点の近くに保ち、適切に座標参照します。',
      tools: {
        revit:
          'Revit の内部原点から遠くでモデリングしないでください。測量点／プロジェクト基準点を用いた共有座標を使い、現在の共有座標でエクスポートすることで、座標参照を保ちつつジオメトリを原点近くに保ちます。',
        archicad:
          '測量点とプロジェクト原点を設定します。モデルを原点近くに保ち、大きなオフセットではなく IFC 座標参照（IfcMapConversion）を使います。',
        tekla:
          '基準／作業点を設定してモデルを原点近くに保ち、座標が巨大にならないよう IFC エクスポートの基準点を使います。',
        allplan:
          'プロジェクトの座標参照／基準点を設定し、実世界座標ではなく原点近くにジオメトリを保ちます。',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'ファイル容量を削減します。テッセレーション／詳細度を下げ、埋め込みテクスチャを避け、必要なものだけをエクスポートします。',
      tools: {
        revit:
          'エクスポートの詳細度を下げ、インポートした CAD や非常に高ポリゴンのファミリのエクスポートを避け、分野ごとに分割します。Reference View MVD はより軽量なテッセレーション ジオメトリを生成します。',
        archicad:
          '曲線／セグメント解像度を下げ、テクスチャの埋め込みを避け、軽量な IFC 変換プリセットを使い、必要な要素だけをエクスポートします。',
        tekla:
          'エクスポート ジオメトリの詳細度／表現を下げ、参照モデルを不必要にエクスポートしないようにします。',
        allplan:
          'IFC エクスポートでジオメトリ解像度を下げ、テクスチャの埋め込みを避けます。',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        '孤立した IfcOpeningElement を再リンクまたは削除 —— すべての開口は IfcRelVoidsElement でホスト要素を貫通する必要があります。',
      tools: {
        revit:
          '孤立開口は削除/編集されたホストや、単独でエクスポートされたシャフト開口から生じます。浮いた開口を削除し、ホスト（壁/床/屋根）上に開口を作り直して関係をエクスポートし、カットが失われた場合はドア/窓を再ホストします。',
        archicad:
          '開口は壁/スラブに属している必要があります。独立した開口オブジェクトを削除し、ホストに固定した開口ツール（またはドア/窓）を使って ArchiCAD が IfcRelVoidsElement をエクスポートするようにします。',
        tekla:
          'カット/開口を独立オブジェクトではなくホストパーツのフィーチャーとして作り直し、エクスポート時にボイドがホストを参照するようにします。',
        allplan:
          '壁/スラブの開口ツールで開口を配置してホストに属させ、切り離された開口ソリッドを削除します。',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        '各 IfcBuildingStorey に一意の Elevation を設定 —— 同じ高さの階は平面生成と階フィルタを壊します。',
      tools: {
        revit:
          '2 つのレベルが同じ高さを共有しています。レベルビューで各レベルに一意の高さを設定（または重複を削除）し、本当の階だけをレベルとしてエクスポートします（他は「建物階」/エクスポートを無効化）。',
        archicad:
          '階設定を開き、階ごとに一意の高さを設定します。同じ高さに重なる階は統合または削除します。',
        tekla:
          'レベル/フェーズ一覧で、IFC 階構造に使う各レベルに一意の高さを割り当て、重複を削除します。',
        allplan:
          '建物構造で階ごとに異なる高さを設定し、同じ高さになる重複階を削除します。',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        '階を Elevation が下から上へ増えるように並べます —— 高さの順序が乱れると断面/平面ツールやレビュアーが混乱します。',
      tools: {
        revit:
          '下位レベルの方が高い（または逆）です。レベルの高さまたはエクスポート順を修正して階が下から上に読めるようにし、負の高さの地下/屋根レベルを確認します。',
        archicad:
          '階設定で、順序が乱れた階の高さを修正し、高さが階インデックスとともに上がるようにします。',
        tekla:
          'レベルを並べ替え/番号付けし直して高さが昇順になるようにし、位置と矛盾する高さのレベルを修正します。',
        allplan:
          '建物構造で階を並べ替えるか高さを修正し、高さが上方向に増えるようにします。',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'メートル法 SI（ミリメートル/メートル）でエクスポート —— ヤード・ポンド長さ単位は多くの IFC/BIM ツールとの相互運用性を壊します。',
      tools: {
        revit:
          'Revit の内部単位はヤード・ポンドですが、IFC はメートル法であるべきです。エクスポート前にプロジェクト単位をメートル法に設定（または IFC エクスポートが SI/メートル法を使うことを確認）し、IFCSIUNIT がメートル基準になるようにします。',
        archicad:
          'プロジェクトの作業単位（および計算単位）をメートル法に設定し、IFC スキーマが SI 長さ単位をエクスポートするようにします。',
        tekla:
          '環境/ロールまたはエクスポート設定をメートル法に切り替え、IFC の LENGTHUNIT を SI（mm/m）にします。',
        allplan:
          'プロジェクトオプションで長さ単位をメートル法に設定し、IFC エクスポートが SI 単位を使うようにします。',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'IfcSpace に面積数量を追加 —— BaseQuantities をエクスポートして各空間に NetFloorArea/GrossFloorArea を持たせます。',
      tools: {
        revit:
          '部屋は IfcSpace としてエクスポートされますが数量が欠落します。IFC エクスポートオプションで「基本数量をエクスポート」（Pset/QTO）を有効化し、面積が計算されるよう部屋が正しく境界設定/配置されていることを確認します。',
        archicad:
          '空間にはゾーンを使い、IFC トランスレータで基本数量を有効化して IfcSpace が NetFloorArea/GrossFloorArea をエクスポートするようにします。',
        tekla:
          'Tekla では空間は限定的です。必要なら定義して数量エクスポートを有効化するか、意匠モデルで生成します。',
        allplan:
          '部屋（空間）を作成し、IFC 数量エクスポートを有効化して IfcSpace に面積数量を持たせます。',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'MEP セグメントをポートで接続 —— 切断された配管/ダクトは IfcDistributionPort 関係なしにエクスポートされ、系統追跡を壊します。',
      tools: {
        revit:
          '切断されたダクト/配管はポートなしでエクスポートされます。MEP モデルの開いたコネクタ（隙間/遊端なし）を修正し、セグメントを接続された系統に保ち、系統/ポートのエクスポートを有効化して IfcDistributionPort 関係が書き出されるようにします。',
        archicad:
          'MEP Modeler を使ってルートが端から端まで接続された状態を保ち、ポート/接続を含めるよう MEP 系統をエクスポートします。',
        tekla:
          'MEP は Tekla の領域ではありません。専用の MEP ツールで接続された MEP をモデリングしてセグメントにポートを持たせ、その後フェデレートします。',
        allplan:
          'MEP の経路を端から端まで接続してモデリングし（開いた端なし）、IFC エクスポートがセグメント間に分配ポートを書き出すようにします。',
      },
    },
  },
  th: {
    // ── การตั้งชื่อและการระบุตัวตน ──────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'กำหนด Name ที่มีความหมายให้องค์ประกอบ เพื่อให้ระบุได้ในตารางสรุป โครงสร้างโมเดล และการประสานงานปลายทาง',
      tools: {
        revit:
          'Revit แมปชื่อ Type ของแฟมิลีไปยัง IFC Name ตอนส่งออก เปิด Type Properties ของออบเจ็กต์แล้วตั้งชื่อ Type ให้สื่อความหมายแทนค่าเริ่มต้น (เช่น เปลี่ยนชื่อ "Basic Wall 1") สำหรับการตั้งชื่อระดับ instance ให้แมปพารามิเตอร์ที่แชร์ไปยัง IfcName ในตารางแมปการส่งออก IFC',
        archicad:
          'เลือกองค์ประกอบแล้วเปิด IFC Manager (คลิกขวา ▸ IFC Manager) หรือพาเลต Classification & Properties เพื่อกำหนด IfcRoot.Name ที่นั่น หรือกำหนดการแมปในการตั้งค่าพร็อพเพอร์ตี้ของ IFC Translator ก่อนส่งออก',
        tekla:
          'ฟิลด์ Name ของชิ้นส่วนจะแมปไปยัง IFC Name เปิดพร็อพเพอร์ตี้ของชิ้นส่วน ป้อน Name แล้วยืนยันว่าการตั้งค่าส่งออก IFC แมปแอตทริบิวต์นั้นไปยัง IfcName',
        allplan:
          'กำหนดแอตทริบิวต์ที่ Allplan แมปไปยัง IfcName ผ่านพาเลต Properties หรือกำหนดการแมป IfcName ในการตั้งค่าส่งออก IFC',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'กำหนด LongName ให้กับพื้นที่ ชั้น และอาคาร เพราะมันเก็บชื่อห้อง/ชั้นที่อ่านได้ซึ่งใช้ในตารางสรุปและ COBie',
      tools: {
        revit:
          'สำหรับพื้นที่ ให้กำหนดชื่อห้อง/พื้นที่ (Revit แมปชื่อห้อง → IfcLongName และเลขห้อง → IfcName) สำหรับชั้น ให้ตั้งชื่อที่สื่อความหมายแต่ละ Level สำหรับอาคาร ให้กำหนดชื่อในตัวเลือกการส่งออก IFC',
        archicad:
          'กำหนดชื่อโซนให้พื้นที่ (แมปไปยัง IfcLongName) และตั้งชื่อชั้นผ่าน Design ▸ Story Settings กำหนดชื่อยาวของอาคารใน File ▸ Info ▸ Project Info / IFC Translator',
        tekla:
          'พื้นที่และชั้นมักไม่ถูกสร้างใน Tekla เมื่อมี ให้กำหนด Name/UDA ที่แมปไปยัง IfcLongName หรือกำหนดชื่อชั้นในการตั้งค่าเชิงพื้นที่ของการส่งออก IFC',
        allplan:
          'กำหนดชื่อห้อง (แมปไปยัง IfcLongName) ตั้งชื่อชั้นในโครงสร้างอาคาร และกำหนดชื่อยาวของอาคารในการส่งออก IFC',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'ทำให้ชื่อขององค์ประกอบพี่น้องไม่ซ้ำกัน (หรืออาศัย type + เลข instance) เพื่อให้แยกแยะได้ในตารางสรุปและการประสานงาน',
      tools: {
        revit:
          'ชื่อซ้ำมักมาจากชื่อ type หรือ mark ที่เหมือนกัน ใช้พารามิเตอร์ Mark ระดับ instance (ไม่ซ้ำต่อองค์ประกอบ) หรือเปลี่ยนชื่อ type และแก้คำเตือน Mark ซ้ำของ Revit',
        archicad:
          'ใช้ ID Manager (Document ▸ ID Manager) เพื่อกำหนด ID องค์ประกอบที่ไม่ซ้ำโดยอัตโนมัติ เพื่อให้องค์ประกอบพี่น้องไม่ใช้ Name ร่วมกัน',
        tekla:
          'รันการกำหนดหมายเลข (Drawings & reports ▸ Numbering) เพื่อให้แต่ละชิ้นส่วนได้ mark ตำแหน่ง/ชิ้นส่วนที่ไม่ซ้ำซึ่งแมปไปยัง Name',
        allplan:
          'กำหนดค่าแอตทริบิวต์ที่ไม่ซ้ำ (เช่น เลขชิ้นส่วน) ผ่านพาเลตแอตทริบิวต์ เพื่อให้องค์ประกอบพี่น้องไม่ใช้ Name ร่วมกัน',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'เปลี่ยนชื่อองค์ประกอบให้เป็นไปตามรูปแบบการตั้งชื่อ BEP ของโครงการ (มักกำหนดในข้อกำหนดข้อมูล EIR / ISO 19650)',
      tools: {
        revit:
          'ทำให้ชื่อ type และพารามิเตอร์ที่แมปไปยัง IfcName เป็นมาตรฐานตาม BEP ใช้พารามิเตอร์ที่แชร์หรือสคริปต์ Dynamo เพื่อเปลี่ยนชื่อจำนวนมาก แล้วแมปไปยัง IfcName ตอนส่งออก',
        archicad:
          'ใช้มาตรฐานผ่าน ID Manager และจัดพร็อพเพอร์ตี้ที่แมปไปยัง IfcName (พาเลต Classification & Properties) ให้สอดคล้องกับ BEP',
        tekla:
          'กำหนดชุดการกำหนดหมายเลขและการตั้งชื่อชิ้นส่วนให้ตรงกับ BEP แล้วรันการกำหนดหมายเลขใหม่',
        allplan:
          'ใช้เทมเพลตแอตทริบิวต์/รายการโปรดเพื่อบังคับการตั้งชื่อตาม BEP และแมปแอตทริบิวต์นั้นไปยัง IfcName ตอนส่งออก',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'ทุกองค์ประกอบต้องมี GlobalId ที่ไม่ซ้ำกัน เครื่องมือนี้แก้ค่าซ้ำอัตโนมัติได้ (คลิก Apply fix) เพื่อป้องกันที่ต้นทาง ให้แก้ขั้นตอนการส่งออกด้านล่าง',
      tools: {
        revit:
          'GUID ซ้ำมักมาจากการคัดลอก/วางองค์ประกอบระหว่างโมเดลหรือไฟล์ที่ลิงก์กัน หลีกเลี่ยงการทำซ้ำองค์ประกอบข้ามโมเดลที่ส่งออกและส่งออกใหม่จากสำเนาที่สะอาด สำหรับองค์ประกอบที่จัดกลุ่มหรือมิเรอร์ซึ่งใช้พารามิเตอร์ IfcGUID ร่วมกัน ให้ล้างพารามิเตอร์นั้นเพื่อให้ Revit สร้างค่าที่ไม่ซ้ำใหม่',
        archicad:
          'GUID ซ้ำมักเกิดจากการคัดลอกองค์ประกอบระหว่างโครงการหรือการรวมโมดูล สร้าง ID ที่ไม่ซ้ำใหม่ (Design ▸ Element ID Manager) และหลีกเลี่ยงการคัดลอกองค์ประกอบข้ามไฟล์โดยไม่สร้าง GlobalId ใหม่',
        tekla:
          'GUID ซ้ำมาจากออบเจ็กต์ที่คัดลอกข้ามโมเดล ส่งออกใหม่จากโมเดลต้นทาง Tekla กำหนด GUID ที่ไม่ซ้ำให้แต่ละออบเจ็กต์ตอนสร้าง',
        allplan:
          'GUID ซ้ำมาจากการคัดลอกออบเจ็กต์ระหว่างเอกสาร สร้างหรือส่งออกออบเจ็กต์ที่ได้รับผลกระทบใหม่เพื่อให้ Allplan สร้าง GlobalId ที่ไม่ซ้ำใหม่',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'GlobalId ต้องเป็นสตริง IFC base-64 ยาว 22 อักขระ เครื่องมือนี้แก้รูปแบบอัตโนมัติได้ ที่ต้นทางให้หลีกเลี่ยงการประมวลผลภายหลังที่เขียน GUID ทับ',
      tools: {
        revit:
          'Revit เขียน IfcGUID ที่ถูกต้องตามมาตรฐานโดยค่าเริ่มต้น รูปแบบไม่ถูกต้องมักมาจากสคริปต์ภายนอกหรือพารามิเตอร์ IfcGUID ที่แก้ด้วยมือ — ล้างพารามิเตอร์เพื่อให้ Revit สร้าง GUID 22 อักขระที่ถูกต้องใหม่ตอนส่งออก',
        archicad:
          'ARCHICAD สร้าง GlobalId ที่ถูกต้อง ค่าที่ไม่ถูกต้องมักมาจากการแก้ไขภายนอกหรือ add-on สร้าง ID ใหม่หรือส่งออกใหม่โดยไม่มี add-on ที่เป็นปัญหา',
        tekla:
          'Tekla เขียน GUID ที่ถูกต้องโดยกำเนิด ค่าที่ไม่ถูกต้องมักมาจากสคริปต์ interop — ส่งออกใหม่จากโมเดลต้นฉบับ',
        allplan:
          'Allplan สร้าง GlobalId ที่ถูกต้อง หากไม่ถูกต้องให้สร้างหรือส่งออกออบเจ็กต์ที่ได้รับผลกระทบใหม่',
      },
    },
    // ── โครงสร้างและลำดับชั้น ──────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'วางองค์ประกอบไว้ในคอนเทนเนอร์เชิงพื้นที่ (ชั้นหรือพื้นที่) เพื่อให้ปรากฏในโครงสร้างโมเดลและในเครื่องมือปลายทาง',
      tools: {
        revit:
          'องค์ประกอบกำพร้ามาจากองค์ประกอบที่ไม่ได้กำหนดให้ Level (กลุ่ม จีโอเมตรีนำเข้า องค์ประกอบไม่มีโฮสต์) กำหนดองค์ประกอบให้ Level เพื่อให้ Revit ส่งออกภายใน IfcBuildingStorey',
        archicad:
          'ตรวจการตั้งค่า Home Story ขององค์ประกอบ — องค์ประกอบที่ไม่มี home story จะส่งออกเป็นกำพร้า กำหนดให้ด้วย',
        tekla:
          'กำหนดชิ้นส่วนให้โครงสร้าง phase/level ที่ใช้ในการส่งออก IFC เพื่อให้ได้คอนเทนเนอร์เชิงพื้นที่ ตรวจการตั้งค่าโครงสร้างเชิงพื้นที่ของการส่งออก',
        allplan:
          'กำหนดองค์ประกอบให้โหนดชั้นในพาเลตโครงสร้างอาคาร เพื่อไม่ให้ส่งออกแบบกำพร้า',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'ย้ายองค์ประกอบไปยังคอนเทนเนอร์เชิงพื้นที่ที่ถูกต้อง — องค์ประกอบอาคารทางกายภาพอยู่ในชั้น (หรือพื้นที่) ไม่ใช่ใต้ Site หรือ Project โดยตรง',
      tools: {
        revit:
          'กำหนดองค์ประกอบใหม่ให้ Level ของอาคาร ส่วนประกอบไซต์และภูมิประเทศอยู่ในขอบเขตไซต์ได้ แต่องค์ประกอบอาคารต้องอยู่บน Level',
        archicad:
          'ตั้ง Home Story ขององค์ประกอบให้เป็นชั้นที่ถูกต้อง หลีกเลี่ยงการวางองค์ประกอบอาคารในขอบเขตไซต์',
        tekla:
          'ปรับการแมปคอนเทนเนอร์เชิงพื้นที่ในการส่งออก IFC เพื่อให้ชิ้นส่วนอยู่ในชั้นที่ถูกต้องแทนไซต์',
        allplan:
          'ย้ายออบเจ็กต์ไปยังโหนดชั้นที่ถูกต้องในโครงสร้างอาคาร',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'แก้ความสัมพันธ์การรวม (aggregation) ที่เสียหาย — มักเป็นสิ่งตกค้างจากการส่งออก/interop จึงให้ส่งออกใหม่จากเครื่องมือ',
      tools: {
        revit:
          'ส่งออกใหม่ด้วยตัวส่งออก IFC ที่อัปเดต หากยังคงอยู่ ให้ตรวจสอบโมเดล (Manage ▸ Purge Unused) และตรวจกลุ่มหรือ assembly ที่เสียหาย',
        archicad:
          'ส่งออกใหม่ด้วย add-on IFC ของ ARCHICAD รุ่นล่าสุด รันการตรวจโมเดลหากความเสียหายยังคงอยู่',
        tekla:
          'ส่งออกใหม่จาก Tekla — การรวมที่เสียหายบ่งชี้ความผิดพลาดของ interop ไม่ใช่ข้อผิดพลาดการสร้างโมเดล',
        allplan:
          'ส่งออกใหม่จาก Allplan ด้วยอินเทอร์เฟซ IFC ที่อัปเดต',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'ตรวจให้โครงสร้างเชิงพื้นที่เป็นไปตาม Project ▸ Site ▸ Building ▸ Storey แก้ในการตั้งค่าโครงการของเครื่องมือก่อนส่งออก',
      tools: {
        revit:
          'Revit สร้างลำดับชั้นนี้อัตโนมัติจาก Project ▸ Site ▸ Building ▸ Levels ลำดับชั้นที่เสียมักหมายถึง Level ขาดหายหรือการส่งออกแบบกำหนดเอง — ตรวจว่ามี Levels และใช้การกำหนดไซต์/อาคาร IFC ค่าเริ่มต้น',
        archicad:
          'ตรวจลำดับชั้นใน IFC Translator และ Story Settings: ชั้นอยู่ใต้อาคาร อาคารอยู่ใต้ไซต์',
        tekla:
          'กำหนดลำดับชั้นเชิงพื้นที่ทั้งหมด (project/site/building/storey) ในกล่องโต้ตอบส่งออก IFC ให้ครบและเรียงถูกต้อง',
        allplan:
          'กำหนดโครงสร้างอาคารทั้งหมด (project/site/building/storey) ในพาเลตโครงสร้างก่อนส่งออก',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'ลบความสัมพันธ์แบบวนซ้ำ — องค์ประกอบเป็นบรรพบุรุษของตัวเองไม่ได้ นี่เป็นสิ่งตกค้างจากการส่งออก/interop ให้ส่งออกใหม่จากสำเนาที่สะอาด',
      tools: {
        revit:
          'ส่งออกใหม่ด้วยตัวส่งออก IFC ที่อัปเดตจากสำเนาที่สะอาด หากยังคงอยู่ ให้ตรวจสอบและล้างโมเดล',
        archicad:
          'ส่งออกใหม่ด้วย add-on IFC ล่าสุด รันการตรวจโมเดลเพื่อหาความสัมพันธ์ที่เป็นปัญหา',
        tekla:
          'ส่งออกใหม่จากโมเดลต้นฉบับ — โดยปกติ Tekla ไม่สร้างวงจรการอ้างอิง',
        allplan:
          'ส่งออกใหม่จาก Allplan สร้างออบเจ็กต์ที่ได้รับผลกระทบใหม่หากวงจรยังคงอยู่',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'วางองค์ประกอบไว้ในชั้นแทนที่จะอยู่ใต้อาคารโดยตรง',
      tools: {
        revit:
          'กำหนดองค์ประกอบให้ Level เพื่อให้ส่งออกใต้ IfcBuildingStorey แทนอาคาร',
        archicad:
          'ตั้ง Home Story ขององค์ประกอบเพื่อไม่ให้วางในขอบเขตอาคาร',
        tekla:
          'แมปชิ้นส่วนไปยังชั้นในการตั้งค่าเชิงพื้นที่ของการส่งออก IFC',
        allplan:
          'ย้ายออบเจ็กต์ไปยังโหนดชั้นในโครงสร้างอาคาร',
      },
    },
    // ── พร็อพเพอร์ตี้และไทป์ ──────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'เชื่อมองค์ประกอบกับ type (IfcWallType, IfcDoorType, …) เพื่อให้พร็อพเพอร์ตี้และปริมาณของ type ถ่ายทอดไปด้วย',
      tools: {
        revit:
          'Type ของแฟมิลี Revit ส่งออกเป็น IfcTypeObject อัตโนมัติ การขาด type มักหมายถึง in-place family หรือ generic model — แปลงเป็น loadable family ที่มี type กำหนดไว้ และเปิดการส่งออก type ในตัวเลือก IFC',
        archicad:
          'ใช้รายการโปรด/วัสดุก่อสร้าง และเปิดการส่งออก "Type Product" ใน IFC Translator เพื่อให้เขียน type ขององค์ประกอบ',
        tekla:
          'กำหนดโปรไฟล์และวัสดุเพื่อให้ชิ้นส่วนส่งออกพร้อม type ตรวจว่าการส่งออก IFC เขียน type object',
        allplan:
          'ใช้ออบเจ็กต์ไลบรารี/SmartParts ที่มี type กำหนดไว้ และเปิดการส่งออก type ในอินเทอร์เฟซ IFC',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'เพิ่ม property set ที่จำเป็นซึ่งกำหนดโดย BEP/EIR ของโครงการให้องค์ประกอบก่อนส่งออก',
      tools: {
        revit:
          'เพิ่มพารามิเตอร์ที่ขาดและแมปไปยัง Pset ที่จำเป็นผ่านไฟล์ User Defined PropertySets ที่อ้างอิงในการตั้งค่าส่งออก IFC',
        archicad:
          'กำหนด Pset ที่จำเป็นใน Property Manager กำหนดให้กับการจัดประเภทที่เกี่ยวข้อง และแมปใน IFC Translator',
        tekla:
          'เพิ่มพร็อพเพอร์ตี้เป็น UDA และแมปไปยัง Pset ที่จำเป็นใน additional property sets ของการส่งออก IFC',
        allplan:
          'สร้างแอตทริบิวต์และแมปไปยัง Pset ที่จำเป็นในการตั้งค่าส่งออก IFC',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'กรอกค่าพร็อพเพอร์ตี้ที่ว่าง — พร็อพเพอร์ตี้ที่ว่างจะถูกถือว่าขาดหายโดยการตรวจปลายทาง',
      tools: {
        revit:
          'หาพารามิเตอร์แล้วป้อนค่า (หรือลบพารามิเตอร์ที่ว่าง) ตารางสรุปเป็นวิธีที่เร็วที่สุดในการหาและกรอกช่องว่างจำนวนมาก',
        archicad:
          'ใช้ Property Manager หรือตารางสรุปแบบโต้ตอบเพื่อหาและกรอกค่าพร็อพเพอร์ตี้ที่ว่าง',
        tekla:
          'กรอกค่า UDA ที่ว่างผ่านเครื่องมือ inquire/report ก่อนส่งออก',
        allplan:
          'กรอกค่าแอตทริบิวต์ที่ว่างผ่านพาเลตแอตทริบิวต์หรือรายการก่อนส่งออก',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'กำหนดวัสดุให้องค์ประกอบเพื่อให้มีข้อมูลวัสดุ (คาดหวังตั้งแต่ LOD 200/300 เป็นต้นไป)',
      tools: {
        revit:
          'กำหนดวัสดุให้โครงสร้างขององค์ประกอบ (Edit Type ▸ Structure หรือพารามิเตอร์ Material) Revit ส่งออกวัสดุที่กำหนดเป็น IfcMaterial / layer set',
        archicad:
          'กำหนดวัสดุก่อสร้าง (ไม่ใช่แค่พื้นผิว) ให้องค์ประกอบ ARCHICAD ส่งออกวัสดุก่อสร้างเป็น IfcMaterial',
        tekla:
          'ตั้งวัสดุของชิ้นส่วนในพร็อพเพอร์ตี้ Tekla ส่งออกเป็นวัสดุ IFC ที่เกี่ยวข้อง',
        allplan:
          'กำหนดแอตทริบิวต์วัสดุ/รูปแบบให้องค์ประกอบเพื่อให้ส่งออกพร้อมการเชื่อมโยงวัสดุ',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'ส่งออกไปยังสคีมา IFC ปัจจุบัน (IFC4 / IFC4.3) เว้นแต่ผู้รับกำหนดให้ใช้ IFC2x3 อย่างชัดเจน',
      tools: {
        revit:
          'ในกล่องโต้ตอบส่งออก IFC ตั้ง File Version เป็น IFC4 (เช่น Reference View หรือ Design Transfer View) แทน IFC2x3',
        archicad:
          'ใน IFC Translator เลือกพรีเซ็ตส่งออกที่อิง IFC4 แทน IFC2x3',
        tekla:
          'ในการส่งออก IFC เลือกประเภทส่งออก IFC4 แทน IFC2x3',
        allplan:
          'เลือก IFC4 (หรือ IFC4.3) เป็นสคีมาส่งออกในการตั้งค่าอินเทอร์เฟซ IFC',
      },
    },
    // ── การชนกัน (Clash) ──────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'แก้การชนกันทางเรขาคณิตระหว่างองค์ประกอบในเครื่องมือ — ย้าย ตัด หรือเชื่อมองค์ประกอบที่ขัดแย้งกัน',
      tools: {
        revit:
          'รัน Collaborate ▸ Interference Check เพื่อหาการชน แล้วย้าย/ตัด/เชื่อมองค์ประกอบเพื่อแก้การทับซ้อน',
        archicad:
          'ใช้ Design ▸ Collision Detection เพื่อหาการทับซ้อน แล้วปรับองค์ประกอบที่ขัดแย้ง',
        tekla:
          'ใช้ Manage ▸ Clash Check เพื่อหาและแก้ชิ้นส่วนที่ทับซ้อน',
        allplan:
          'ใช้การตรวจการชนเพื่อหาการทับซ้อน แล้วปรับองค์ประกอบที่ขัดแย้ง',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'แก้การชนระหว่าง MEP กับโครงสร้าง — เปลี่ยนเส้นทางเดิน MEP หรือประสานการเจาะ/ปลอกกับโมเดลโครงสร้าง',
      tools: {
        revit:
          'รัน Interference Check ระหว่างหมวด MEP และโครงสร้าง แล้วเปลี่ยนเส้นทางงานระบบหรือเพิ่มช่องเปิด/ปลอกที่ประสานกัน',
        archicad:
          'ใช้ Collision Detection ระหว่างองค์ประกอบ MEP และโครงสร้าง แล้วเปลี่ยนเส้นทางหรือเพิ่มช่องเปิด',
        tekla:
          'รันการตรวจการชนกับโมเดลอ้างอิง MEP ที่ลิงก์ และเพิ่มการเจาะ/ช่องเปิดตามจำเป็น',
        allplan:
          'ใช้การตรวจการชนระหว่าง MEP และโครงสร้าง แล้วเปลี่ยนเส้นทางหรือเพิ่มช่องเปิด',
      },
    },
    // ── ส่วนหัวไฟล์และเมตาดาทาโครงการ ──────────────────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'ทุกไฟล์ IFC ต้องมี IfcProject เพียงหนึ่งเดียว การขาด project หมายถึงการส่งออกที่เสียหาย — ส่งออกโมเดลทั้งหมดใหม่',
      tools: {
        revit:
          'Revit เขียน IfcProject เสมอ การขาดหายบ่งชี้การส่งออกที่เสียหายหรือบางส่วน — ส่งออกโมเดลทั้งหมดใหม่แทนการเลือกแยกส่วน',
        archicad:
          'ส่งออกโครงการใหม่ ส่งออกโมเดล ไม่ใช่ชุดองค์ประกอบแยกส่วนที่ทำให้ project root หายไป',
        tekla:
          'ส่งออกโมเดลทั้งหมดใหม่เพื่อให้เขียน IfcProject root',
        allplan:
          'ส่งออกใหม่จากโครงการเพื่อให้รวมเอนทิตี IfcProject',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'เพิ่มอาคารในโครงสร้างเชิงพื้นที่ — กำหนด IfcBuilding ในการตั้งค่าโครงการของเครื่องมือ',
      tools: {
        revit:
          'Revit สร้างอาคารอัตโนมัติ การขาดหายมักหมายถึงการส่งออกแบบกำหนดเองเฉพาะไซต์ ตรวจว่าโครงการมี Levels และใช้การกำหนดอาคารค่าเริ่มต้นในตัวเลือก IFC',
        archicad:
          'ตรวจให้มีอาคารในลำดับชั้นโครงการ/IFC Translator และมีชั้นอยู่ใต้อาคาร',
        tekla:
          'กำหนดอาคารในการตั้งค่าโครงสร้างเชิงพื้นที่ของการส่งออก IFC',
        allplan:
          'เพิ่มโหนดอาคารในพาเลตโครงสร้างอาคาร',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'เพิ่มอย่างน้อยหนึ่งชั้น (level) ใต้อาคาร',
      tools: {
        revit:
          'สร้าง Levels ในโครงการ Revit ส่งออก Levels เป็น IfcBuildingStorey โมเดลที่ไม่มี Levels จะไม่ส่งออกชั้นใดเลย',
        archicad:
          'กำหนดชั้นผ่าน Design ▸ Story Settings เพื่อให้อาคารมีชั้น',
        tekla:
          'กำหนด level/storey ในการตั้งค่าเชิงพื้นที่ของการส่งออก IFC',
        allplan:
          'เพิ่มโหนดชั้นใต้อาคารในพาเลตโครงสร้าง',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'เติมองค์ประกอบในชั้นที่ว่างหรือลบทิ้ง — ชั้นว่างทำให้โครงสร้างเชิงพื้นที่รกและมักบ่งชี้การกำหนดองค์ประกอบผิด',
      tools: {
        revit:
          'ลบ Levels ที่ไม่ใช้ หรือตรวจว่าองค์ประกอบที่ตั้งใจสำหรับ Level นั้นถูกกำหนดให้มัน (ไม่ใช่ Level ข้างเคียง)',
        archicad:
          'ลบชั้นที่ไม่ใช้ หรือกำหนด Home Story ขององค์ประกอบใหม่เพื่อไม่ให้ชั้นว่าง',
        tekla:
          'ลบ level ที่ว่างออกจากการส่งออกหรือกำหนดชิ้นส่วนให้มันใหม่',
        allplan:
          'ลบโหนดชั้นที่ว่างหรือกำหนดออบเจ็กต์ให้มันใหม่',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'กำหนดระดับความสูงให้ทุกชั้น — จำเป็นต่อการวางชั้นในแนวดิ่งและการสร้างผังพื้น',
      tools: {
        revit:
          'Levels ใน Revit มีระดับความสูงเสมอ ค่า null มักหมายถึงการส่งออกแบบกำหนดเอง ตรวจว่า Levels มีระดับความสูงเป็นตัวเลขและใช้การส่งออก level IFC ค่าเริ่มต้น',
        archicad:
          'ตั้งระดับความสูงของแต่ละชั้นใน Design ▸ Story Settings เพื่อไม่ให้เป็น null',
        tekla:
          'ตรวจให้แต่ละ level มีระดับความสูงกำหนดไว้ในการตั้งค่า level/grid ก่อนส่งออก',
        allplan:
          'กำหนดความสูง/ระดับของแต่ละชั้นในโครงสร้างอาคารเพื่อให้ส่งออกค่า',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'ตั้งคำอธิบายไฟล์ (มักเป็น MVD / view definition) ในตัวเลือกการส่งออก — เป็นส่วนหนึ่งของเมตาดาทาส่วนหัว STEP',
      tools: {
        revit:
          'FILE_DESCRIPTION ตั้งจาก MVD ที่เลือก (เช่น Reference View) การเลือกการตั้งค่าส่งออกที่เหมาะสมในกล่องโต้ตอบ IFC จะกรอกค่าให้',
        archicad:
          'การเลือก MVD ใน IFC Translator กรอก FILE_DESCRIPTION เลือกพรีเซ็ตส่งออกที่กำหนดไว้',
        tekla:
          'ประเภทส่งออก / MVD ตั้ง FILE_DESCRIPTION เลือกการตั้งค่าส่งออก IFC ที่กำหนดไว้',
        allplan:
          'เลือกพรีเซ็ตส่งออก IFC ที่กำหนดไว้เพื่อให้เขียนคำอธิบายไฟล์ / MVD',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'กรอกผู้สร้างและองค์กรในการส่งออกหรือข้อมูลโครงการ — จำเป็นต่อการตรวจสอบย้อนกลับ (ISO 19650)',
      tools: {
        revit:
          'ตั้งผู้สร้างในการตั้งค่าส่งออก IFC (Modify setup) หรือใน Manage ▸ Project Information ซึ่งจะกรอกฟิลด์ผู้สร้างใน FILE_NAME ของ STEP',
        archicad:
          'ตั้งผู้สร้างและบริษัทใน File ▸ Info ▸ Project Info และ IFC Translator เพื่อให้เขียนลงในส่วนหัว',
        tekla:
          'ตั้งผู้สร้าง/องค์กรในการตั้งค่าขั้นสูงของการส่งออก IFC',
        allplan:
          'ตั้งผู้สร้าง/องค์กรในข้อมูลโครงการ / การตั้งค่าส่งออก IFC',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'ตั้งชื่อยาวของโครงการ (ชื่อโครงการเชิงอธิบาย) ในข้อมูลโครงการของเครื่องมือ',
      tools: {
        revit:
          'ตั้ง Project Name / Project Issue Name ใน Manage ▸ Project Information และแมปไปยัง IfcProject.LongName ในการตั้งค่าส่งออก IFC',
        archicad:
          'ตั้งชื่อ/คำอธิบายโครงการใน File ▸ Info ▸ Project Info; IFC Translator แมปไปยัง IfcProject.LongName',
        tekla:
          'ตั้งชื่อโครงการในพร็อพเพอร์ตี้โครงการและแมปไปยัง IfcProject.LongName ในการส่งออก',
        allplan:
          'ตั้งชื่อ/คำอธิบายโครงการในข้อมูลโครงการเพื่อให้กรอก IfcProject.LongName',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'กรอกเมตาดาทาโครงการ (ชื่อยาว คำอธิบาย เฟส/ประเภทโครงการ) ที่ข้อกำหนดข้อมูล ISO 19650 ต้องการให้ครบ',
      tools: {
        revit:
          'กรอก Project Name, Description และสถานะ/เฟส ใน Manage ▸ Project Information และแมปไปยังฟิลด์ IfcProject ในการตั้งค่าส่งออก IFC',
        archicad:
          'กรอกข้อมูลโครงการใน File ▸ Info ▸ Project Info และแมปฟิลด์ใน IFC Translator',
        tekla:
          'กรอกพร็อพเพอร์ตี้โครงการให้ครบและแมปไปยังฟิลด์ IfcProject ในการส่งออก',
        allplan:
          'กรอกข้อมูลโครงการให้ครบเพื่อให้ IfcProject มี LongName, Description และ ObjectType',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'เพิ่มทั้งผู้สร้างและองค์กรในการส่งออกเพื่อให้ผลงานตรวจสอบย้อนกลับได้ตาม ISO 19650',
      tools: {
        revit:
          'ตั้งผู้สร้างและองค์กรในการตั้งค่าส่งออก IFC / Project Information เพื่อให้ทั้งสองปรากฏในส่วนหัว STEP',
        archicad:
          'ตั้งผู้สร้างและบริษัทใน Project Info และ IFC Translator',
        tekla:
          'ตั้งผู้สร้างและองค์กรในการตั้งค่าขั้นสูงของการส่งออก IFC',
        allplan:
          'ตั้งผู้สร้างและองค์กรในการตั้งค่าโครงการ / ส่งออก IFC',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'ตั้งชื่อไฟล์ส่งออกตามรูปแบบ ISO 19650: Project-Originator-Volume-Level-Type-Role-Number',
      tools: {
        revit:
          'Revit ใช้ชื่อไฟล์จากกล่องโต้ตอบ Save ของการส่งออก — ตั้งชื่อไฟล์ตามรูปแบบ ISO 19650 ตอนส่งออก (หรือเปลี่ยนชื่อภายหลัง)',
        archicad:
          'ตั้งชื่อไฟล์ตามรูปแบบ ISO 19650 ในกล่องโต้ตอบส่งออก หรือเปลี่ยนชื่อไฟล์ที่ส่งออกแล้ว',
        tekla:
          'ตั้งชื่อผลลัพธ์ IFC ตามรูปแบบ ISO 19650 ในกล่องโต้ตอบส่งออก',
        allplan:
          'ตั้งชื่อไฟล์ที่ส่งออกตามรูปแบบ ISO 19650 ในกล่องโต้ตอบส่งออก',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'เพิ่ม property set ที่จำเป็นตามระดับ LOD/LOIN ที่ประกาศ (ตามแผนส่งมอบข้อมูลของโครงการ)',
      tools: {
        revit:
          'แมปพารามิเตอร์ที่ LOD ต้องการไปยัง Pset ผ่านไฟล์ User Defined PropertySets ในการส่งออก IFC และตรวจว่าองค์ประกอบมีพารามิเตอร์เหล่านั้นจริง',
        archicad:
          'กำหนด Pset ของ LOD ใน Property Manager กำหนดให้การจัดประเภทที่เกี่ยวข้อง และแมปใน IFC Translator',
        tekla:
          'เพิ่มพร็อพเพอร์ตี้ที่ LOD ต้องการเป็น UDA และแมปไปยัง Pset ในการส่งออก',
        allplan:
          'สร้างแอตทริบิวต์ LOD และแมปไปยัง Pset ที่จำเป็นในการส่งออก IFC',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'เปิดการส่งออกปริมาณพื้นฐานเพื่อให้องค์ประกอบมี IfcElementQuantity (พื้นที่/ปริมาตร/ความยาว) ที่ LOD ที่ประกาศ',
      tools: {
        revit:
          'เปิด "Export base quantities" ในตัวเลือกส่งออก IFC จากนั้น Revit จะเขียน IfcElementQuantity ให้องค์ประกอบ',
        archicad:
          'เปิดการส่งออกปริมาณพื้นฐานในการตั้งค่าของ IFC Translator',
        tekla:
          'เปิดการส่งออกปริมาณ / ปริมาณพื้นฐานในการตั้งค่าส่งออก IFC',
        allplan:
          'เปิดปริมาณพื้นฐานในการตั้งค่าส่งออก IFC',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'กำหนดโครงสร้างแบบชั้นให้ผนังและพื้นเพื่อให้ส่งออก IfcMaterialLayerSetUsage ที่ LOD 300+',
      tools: {
        revit:
          'กำหนดชั้นโครงสร้างของ Type ผนัง/พื้น (Edit Type ▸ Structure) พร้อมวัสดุ Revit ส่งออกโครงสร้างประกอบเป็น IfcMaterialLayerSet',
        archicad:
          'ใช้โครงสร้าง Composite (ไม่ใช่วัสดุก่อสร้างเดียว) สำหรับผนัง/พื้นเพื่อให้ชั้นส่งออกเป็น IfcMaterialLayerSet',
        tekla:
          'ชิ้นส่วน Tekla มักเป็นวัสดุเดียว สำหรับองค์ประกอบแบบชั้นให้กำหนดชั้น/วัสดุเพื่อให้ layer set ส่งออก หรือตรวจว่ากฎนี้ใช้กับสาขาของคุณ',
        allplan:
          'ใช้ส่วนประกอบหลายชั้นเพื่อให้ส่งออก material layer set',
      },
    },
    // ── การจัดประเภท (Classification) ─────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'แนบการอ้างอิงการจัดประเภท (Uniclass, OmniClass ฯลฯ) เพื่อให้องค์ประกอบมีรหัสมาตรฐานเป็น IfcRelAssociatesClassification',
      tools: {
        revit:
          'ใช้ add-in การจัดประเภท (เช่น Classification Manager for Revit ที่ใช้ฟรี) เพื่อกำหนดรหัส Uniclass/OmniClass หรือแมปพารามิเตอร์ที่แชร์ไปยัง IfcClassificationReference ในการตั้งค่าส่งออก IFC หากไม่มีการแมป Revit จะไม่ส่งออกการจัดประเภท',
        archicad:
          'เปิดพาเลต Classification & Properties เลือกระบบการจัดประเภท (ในตัวหรือนำเข้า) และกำหนดรายการจัดประเภทให้องค์ประกอบ ARCHICAD ส่งออกเป็น IfcClassificationReference อัตโนมัติ',
        tekla:
          'กำหนดการจัดประเภทผ่าน UDA หรือการแมปพร็อพเพอร์ตี้ Tekla–IFC แล้วแมปแอตทริบิวต์นั้นไปยัง IfcClassificationReference ใน additional property sets ของการส่งออก IFC',
        allplan:
          'กำหนดรหัสการจัดประเภทผ่านแอตทริบิวต์ของออบเจ็กต์ และตรวจให้การตั้งค่าส่งออก IFC แมปไปยัง IfcClassificationReference',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'กำหนดองค์ประกอบ MEP ให้ระบบเพื่อให้ส่งออกภายใน IfcSystem — จำเป็นต่อการประสานงานตามระบบ',
      tools: {
        revit:
          'ตรวจว่าท่อลม/ท่อ/อุปกรณ์อยู่ในระบบ Revit ที่มีชื่อ องค์ประกอบที่ไม่ได้กำหนดจะส่งออกโดยไม่มี IfcSystem ใช้ System Browser เพื่อหาและกำหนด',
        archicad:
          'กำหนดองค์ประกอบ MEP ให้ระบบ MEP ใน MEP Modeler เพื่อให้ส่งออกภายใน IfcSystem',
        allplan:
          'กำหนดออบเจ็กต์ MEP ให้ระบบ/เครือข่ายเพื่อให้ส่งออกภายใน IfcSystem',
      },
    },
    // ── เรขาคณิตและความสมบูรณ์ของไฟล์ ─────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'ลดองค์ประกอบ IfcBuildingElementProxy โดยแมปไปยังคลาส IFC ที่เหมาะสม — proxy ไม่มี type เชิงความหมาย',
      tools: {
        revit:
          'Proxy มาจาก in-place family, generic model หรือหมวดที่ไม่ได้แมป ใช้ตารางแมปคลาสส่งออก IFC เพื่อแมปหมวดเหล่านั้นไปยัง type IFC จริงแทน IfcBuildingElementProxy และแปลง in-place family เป็น loadable family',
        archicad:
          'กำหนดการจัดประเภท/type IFC ที่เหมาะสมให้ออบเจ็กต์ (โดยเฉพาะ Morph และออบเจ็กต์กำหนดเอง) เพื่อไม่ให้ส่งออกเป็น proxy',
        tekla:
          'แมปชิ้นส่วนกำหนดเองหรือ proxy ไปยังเอนทิตี IFC ที่ถูกต้องในการตั้งค่าส่งออก IFC',
        allplan:
          'กำหนด type IFC ที่ถูกต้องให้ออบเจ็กต์ทั่วไปเพื่อไม่ให้ส่งออกเป็น proxy',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'รักษาโมเดลให้อยู่ใกล้จุดกำเนิดภายในและทำ georeference อย่างเหมาะสม แทนการสร้างโมเดลที่พิกัดโลกจริงขนาดใหญ่',
      tools: {
        revit:
          'อย่าสร้างโมเดลไกลจากจุดกำเนิดภายในของ Revit ใช้ Shared Coordinates กับ Survey Point / Project Base Point และส่งออกด้วย shared coordinates ปัจจุบันเพื่อให้จีโอเมตรีอยู่ใกล้จุดกำเนิดขณะที่รักษา georeferencing',
        archicad:
          'ตั้ง Survey Point และ Project Origin เก็บโมเดลใกล้จุดกำเนิดและใช้ georeferencing ของ IFC (IfcMapConversion) แทน offset ขนาดใหญ่',
        tekla:
          'ตั้งจุดฐาน/จุดทำงานและเก็บโมเดลใกล้จุดกำเนิด ใช้จุดฐานของการส่งออก IFC เพื่อไม่ให้พิกัดใหญ่เกินไป',
        allplan:
          'ตั้ง georeferencing/จุดฐานของโครงการและเก็บจีโอเมตรีใกล้จุดกำเนิดแทนพิกัดโลกจริง',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'ลดขนาดไฟล์: ลด tessellation/รายละเอียด หลีกเลี่ยงเท็กซ์เจอร์ฝังตัว และส่งออกเฉพาะที่จำเป็น',
      tools: {
        revit:
          'ลดระดับรายละเอียดสำหรับการส่งออก หลีกเลี่ยงการส่งออก CAD ที่นำเข้าและแฟมิลีโพลีสูงมาก และแยกตามสาขา Reference View MVD สร้างจีโอเมตรี tessellated ที่เบากว่า',
        archicad:
          'ลดความละเอียดเส้นโค้ง/เซกเมนต์ หลีกเลี่ยงการฝังเท็กซ์เจอร์ ใช้พรีเซ็ต IFC Translator ที่เบา และส่งออกเฉพาะองค์ประกอบที่จำเป็น',
        tekla:
          'ลดรายละเอียด/การแสดงผลของจีโอเมตรีส่งออก และหลีกเลี่ยงการส่งออกโมเดลอ้างอิงโดยไม่จำเป็น',
        allplan:
          'ลดความละเอียดจีโอเมตรีและหลีกเลี่ยงการฝังเท็กซ์เจอร์ในการส่งออก IFC',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'เชื่อมโยงใหม่หรือลบ IfcOpeningElement ที่กำพร้า —— ทุกช่องเปิดต้องเจาะผ่านองค์ประกอบโฮสต์ผ่าน IfcRelVoidsElement',
      tools: {
        revit:
          'ช่องเปิดกำพร้ามักเกิดจากโฮสต์ที่ถูกลบ/แก้ไข หรือช่องชาฟท์ที่ส่งออกลอย ๆ ลบช่องเปิดที่ลอยอยู่และสร้างช่องว่างบนโฮสต์ (ผนัง/พื้น/หลังคา) ใหม่เพื่อให้ส่งออกความสัมพันธ์ และวางประตู/หน้าต่างใหม่หากการตัดหายไป',
        archicad:
          'ช่องเปิดต้องสังกัดผนังหรือพื้น ลบออบเจกต์ช่องเปิดที่ลอยอยู่ และใช้เครื่องมือช่องเปิด (หรือประตู/หน้าต่าง) ที่ยึดกับโฮสต์ เพื่อให้ ArchiCAD ส่งออก IfcRelVoidsElement',
        tekla:
          'สร้างการตัด/ช่องเปิดใหม่เป็นฟีเจอร์ของชิ้นส่วนโฮสต์ แทนที่จะเป็นออบเจกต์ลอย เพื่อให้ช่องว่างอ้างอิงโฮสต์เมื่อส่งออก',
        allplan:
          'วางช่องเปิดด้วยเครื่องมือเจาะผนัง/พื้น เพื่อให้สังกัดโฮสต์ และลบโซลิดช่องเปิดที่หลุดออก',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'กำหนด Elevation ที่ไม่ซ้ำให้แต่ละ IfcBuildingStorey —— ชั้นที่ระดับเดียวกันทำให้การสร้างผังและการกรองตามชั้นเสีย',
      tools: {
        revit:
          'สองระดับใช้ค่าระดับเดียวกัน ในมุมมอง Levels กำหนดระดับที่ไม่ซ้ำให้แต่ละ Level (หรือลบรายการซ้ำ) และส่งออกเป็นชั้นเฉพาะระดับที่เป็นชั้นจริง (ปิด “Building Story”/การส่งออกในระดับอื่น)',
        archicad:
          'เปิด Story Settings และตั้งระดับที่ไม่ซ้ำต่อชั้น รวมหรือลบชั้นซ้ำที่อยู่ระดับเดียวกัน',
        tekla:
          'ในรายการ level/phase กำหนดระดับที่ไม่ซ้ำให้แต่ละ level ที่ใช้กับโครงสร้างชั้น IFC และลบรายการซ้ำ',
        allplan:
          'ในโครงสร้างอาคาร ตั้งความสูงที่ต่างกันต่อชั้น และลบชั้นซ้ำที่ลงเอยที่ระดับเดียวกัน',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'จัดลำดับชั้นให้ Elevation เพิ่มจากล่างขึ้นบน —— ระดับที่สลับลำดับทำให้เครื่องมือตัด/ผังและผู้ตรวจสับสน',
      tools: {
        revit:
          'ระดับล่างกลับมีค่าระดับสูงกว่า (หรือกลับกัน) แก้ไขค่าระดับหรือกำหนดลำดับการส่งออกให้ชั้นอ่านจากล่างขึ้นบน และตรวจระดับชั้นใต้ดิน/หลังคาที่มีค่าระดับติดลบ',
        archicad:
          'ใน Story Settings แก้ความสูงของชั้นที่ผิดลำดับ เพื่อให้ค่าระดับเพิ่มตามดัชนีชั้น',
        tekla:
          'จัดลำดับ/หมายเลข level ใหม่ให้ค่าระดับเพิ่มขึ้น และแก้ไข level ที่ความสูงขัดกับตำแหน่ง',
        allplan:
          'ในโครงสร้างอาคาร จัดลำดับชั้นใหม่หรือแก้ความสูง เพื่อให้ค่าระดับเพิ่มขึ้นด้านบน',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'ส่งออกเป็นเมตริก SI (มิลลิเมตร/เมตร) —— หน่วยความยาวอิมพีเรียลทำให้ทำงานร่วมกับเครื่องมือ IFC/BIM ส่วนใหญ่ไม่ได้',
      tools: {
        revit:
          'หน่วยภายในของ Revit เป็นอิมพีเรียล แต่ IFC ควรเป็นเมตริก ตั้ง Project Units เป็นเมตริก (หรือยืนยันว่าการส่งออก IFC ใช้ SI/เมตริก) ก่อนส่งออก เพื่อให้ IFCSIUNIT อิงเมตร',
        archicad:
          'ตั้ง Working Units (และหน่วยคำนวณ) ของโปรเจกต์เป็นเมตริก เพื่อให้สคีมา IFC ส่งออกหน่วยความยาว SI',
        tekla:
          'สลับ environment/role หรือการตั้งค่าส่งออกเป็นเมตริก เพื่อให้ LENGTHUNIT ของ IFC เป็น SI (mm/m)',
        allplan:
          'ตั้งหน่วยความยาวเป็นเมตริกในตัวเลือกโปรเจกต์ เพื่อให้การส่งออก IFC ใช้หน่วย SI',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'เพิ่มปริมาณพื้นที่ให้ IfcSpace —— ส่งออก BaseQuantities เพื่อให้แต่ละสเปซมี NetFloorArea/GrossFloorArea',
      tools: {
        revit:
          'ห้องส่งออกเป็น IfcSpace แต่ขาดปริมาณ เปิด “Export base quantities” (Pset/QTO) ในตัวเลือกส่งออก IFC และตรวจให้ห้องมีขอบเขต/ตำแหน่งถูกต้องเพื่อให้คำนวณพื้นที่ได้',
        archicad:
          'ใช้ Zone แทนสเปซ และเปิด Base Quantities ใน IFC Translator เพื่อให้ IfcSpace ส่งออก NetFloorArea/GrossFloorArea',
        tekla:
          'สเปซใน Tekla มีจำกัด หากจำเป็นให้กำหนดและเปิดการส่งออกปริมาณ หรือสร้างในโมเดลสถาปัตยกรรม',
        allplan:
          'สร้างห้อง (สเปซ) และเปิดการส่งออกปริมาณ IFC เพื่อให้ IfcSpace มีปริมาณพื้นที่',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'เชื่อมเซกเมนต์ MEP ผ่านพอร์ต —— ท่อ/ดักต์ที่ขาดการเชื่อมจะส่งออกโดยไม่มีความสัมพันธ์ IfcDistributionPort และทำให้การไล่ระบบเสีย',
      tools: {
        revit:
          'ดักต์/ท่อที่ขาดการเชื่อมจะส่งออกโดยไม่มีพอร์ต แก้ตัวเชื่อมที่เปิดอยู่ในโมเดล MEP (ไม่มีช่องว่าง/ปลายลอย) ให้เซกเมนต์ต่อกันเป็นระบบที่เชื่อมถึงกัน และเปิดการส่งออกระบบ/พอร์ต เพื่อเขียนความสัมพันธ์ IfcDistributionPort',
        archicad:
          'ใช้ MEP Modeler เพื่อให้เส้นทางเชื่อมต่อกันตลอดปลายถึงปลาย และส่งออกระบบ MEP เพื่อรวมพอร์ต/การเชื่อม',
        tekla:
          'MEP ไม่ใช่ขอบเขตของ Tekla ให้สร้างโมเดล MEP ที่เชื่อมต่อในเครื่องมือ MEP เฉพาะ เพื่อให้เซกเมนต์มีพอร์ต แล้วจึงรวมโมเดล',
        allplan:
          'สร้างเส้นทาง MEP ที่เชื่อมต่อกันตลอดปลายถึงปลาย (ไม่มีปลายเปิด) เพื่อให้การส่งออก IFC เขียนพอร์ตการกระจายระหว่างเซกเมนต์',
      },
    },
  },
  ca: {
    // ── Nomenclatura i identitat ─────────────────────────────────────
    RULE_EMPTY_NAME: {
      summary:
        'Assigna un Nom significatiu a l’element perquè sigui identificable a les taules de planificació, l’arbre del model i la coordinació posterior.',
      tools: {
        revit:
          'Revit assigna el Nom de Tipus de la família a l’IfcName en exportar. Obre les Propietats de tipus de l’element i dona-li al tipus un nom descriptiu en lloc del valor per defecte (p. ex. canvia "Basic Wall 1"). Per anomenar a nivell d’instància, assigna un paràmetre compartit a IfcName a la taula de mapatge d’exportació IFC.',
        archicad:
          'Selecciona l’element i obre el Gestor IFC (clic dret ▸ Gestor IFC) o la paleta de Classificació i Propietats; defineix-hi IfcRoot.Name, o configura el mapatge a la configuració de propietats del Traductor IFC abans d’exportar.',
        tekla:
          'El camp Name de la peça s’assigna a l’IfcName. Obre les propietats de la peça, introdueix un Name i confirma que la configuració d’exportació IFC assigna aquest atribut a IfcName.',
        allplan:
          'Assigna un atribut que Allplan mapegi a IfcName mitjançant la paleta de Propietats, o defineix el mapatge d’IfcName a la configuració d’exportació IFC.',
      },
    },
    RULE_EMPTY_LONGNAME: {
      summary:
        'Defineix el LongName en espais, plantes i l’edifici: conté el nom llegible de la sala/nivell que s’usa a les taules i a COBie.',
      tools: {
        revit:
          'Per a espais, defineix el Nom d’Habitació/Àrea (Revit assigna Nom d’Habitació → IfcLongName i Número d’Habitació → IfcName). Per a plantes, dona a cada Nivell un Nom descriptiu. Per a l’edifici, defineix el nom a les opcions d’exportació IFC.',
        archicad:
          'Defineix el Nom de Zona als espais (s’assigna a IfcLongName) i anomena les plantes a Disseny ▸ Configuració de plantes. Defineix el nom llarg de l’edifici a Arxiu ▸ Info ▸ Info del projecte / el Traductor IFC.',
        tekla:
          'Els espais i plantes rarament es modelen a Tekla; quan existeixin, defineix el Name/UDA assignat a IfcLongName, o defineix els noms de planta a la configuració espacial de l’exportació IFC.',
        allplan:
          'Defineix el nom de la sala (s’assigna a IfcLongName), anomena les plantes a l’estructura de l’edifici i defineix el nom llarg de l’edifici a l’exportació IFC.',
      },
    },
    RULE_DUPLICATE_NAME: {
      summary:
        'Fes que els noms d’elements germans siguin únics (o recolza’t en tipus + número d’instància) perquè es distingeixin a taules i coordinació.',
      tools: {
        revit:
          'Els noms duplicats solen venir de noms de tipus o marques idèntics. Usa el paràmetre d’instància Marca (únic per element) o canvia el nom dels tipus, i resol els avisos de Marca duplicada de Revit.',
        archicad:
          'Usa el Gestor d’ID (Document ▸ Gestor d’ID) per assignar automàticament ID d’element únics i que els germans no comparteixin Nom.',
        tekla:
          'Executa la numeració (Dibuixos i informes ▸ Numeració) perquè cada peça obtingui una marca de posició/peça única assignada al Name.',
        allplan:
          'Assigna valors d’atribut únics (p. ex. número de component) mitjançant la paleta d’atributs perquè els germans no comparteixin Nom.',
      },
    },
    RULE_NAMING_CONVENTION: {
      summary:
        'Canvia el nom dels elements perquè segueixin el patró de nomenclatura del BEP del projecte (normalment definit als requisits d’informació EIR / ISO 19650).',
      tools: {
        revit:
          'Estandarditza els noms de tipus i el paràmetre assignat a IfcName segons el BEP. Usa un paràmetre compartit o un script de Dynamo per al canvi de nom massiu, i assigna’l a IfcName en exportar.',
        archicad:
          'Aplica l’estàndard mitjançant el Gestor d’ID i alinea la propietat assignada a IfcName (paleta de Classificació i Propietats) amb el BEP.',
        tekla:
          'Configura la sèrie de numeració i la nomenclatura de peces perquè coincideixin amb el BEP, i torna a executar la numeració.',
        allplan:
          'Usa plantilles d’atributs/preferits per imposar la nomenclatura del BEP i assigna aquest atribut a IfcName en exportar.',
      },
    },
    RULE_DUPLICATE_GUID: {
      summary:
        'Cada element ha de tenir un GlobalId únic. Aquesta eina pot corregir automàticament els duplicats (fes clic a Aplicar correcció); per evitar-ho a l’origen, corregeix el flux d’exportació següent.',
      tools: {
        revit:
          'Els GUID duplicats solen venir de copiar/enganxar elements entre models o entre arxius enllaçats. Evita duplicar elements entre models exportats i torna a exportar des d’una còpia neta. Per a elements agrupats o reflectits que comparteixen un paràmetre IfcGUID, esborra aquest paràmetre perquè Revit en regeneri un valor únic.',
        archicad:
          'Els GUID duplicats solen sorgir de copiar elements entre projectes o fusionar mòduls. Regenera ID únics (Disseny ▸ Gestor d’ID d’element) i evita copiar elements entre arxius sense regenerar els GlobalIds.',
        tekla:
          'Els GUID duplicats venen d’objectes copiats entre models. Torna a exportar des del model d’origen — Tekla assigna un GUID únic per objecte en crear-lo.',
        allplan:
          'Els GUID duplicats venen de copiar objectes entre documents. Recrea o torna a exportar els objectes afectats perquè Allplan regeneri GlobalIds únics.',
      },
    },
    RULE_INVALID_GUID_FORMAT: {
      summary:
        'El GlobalId ha de ser una cadena IFC base-64 de 22 caràcters. Aquesta eina pot corregir-ne el format automàticament; a l’origen, evita el postprocessament que reescriu els GUID.',
      tools: {
        revit:
          'Revit escriu IfcGUID conformes per defecte. Els formats invàlids solen venir d’scripts de tercers o d’un paràmetre IfcGUID editat manualment — esborra el paràmetre perquè Revit regeneri un GUID vàlid de 22 caràcters en exportar.',
        archicad:
          'ARCHICAD genera GlobalIds conformes. Els valors invàlids solen venir d’edicions externes o complements; regenera els ID o torna a exportar sense el complement problemàtic.',
        tekla:
          'Tekla escriu GUID vàlids de manera nativa; els valors invàlids solen venir d’scripts d’interoperabilitat — torna a exportar des del model natiu.',
        allplan:
          'Allplan genera GlobalIds vàlids; si són invàlids, recrea o torna a exportar els objectes afectats.',
      },
    },
    // ── Estructura i jerarquia ───────────────────────────────────────
    RULE_ORPHAN_ELEMENT: {
      summary:
        'Col·loca l’element dins d’un contenidor espacial (planta o espai) perquè aparegui a l’arbre del model i a les eines posteriors.',
      tools: {
        revit:
          'Els orfes venen d’elements no assignats a un Nivell (grups, geometria importada, elements sense amfitrió). Assigna l’element a un Nivell perquè Revit l’exporti dins d’un IfcBuildingStorey.',
        archicad:
          'Comprova la configuració de Planta d’origen de l’element — els elements sense planta d’origen s’exporten com a orfes. Assigna-n’hi una.',
        tekla:
          'Assigna la peça a l’estructura de fase/nivell que usa l’exportació IFC perquè rebi un contenidor espacial; comprova la configuració d’estructura espacial de l’exportació.',
        allplan:
          'Assigna l’element a un node de planta a la paleta d’estructura de l’edifici perquè no s’exporti orfe.',
      },
    },
    RULE_WRONG_CONTAINER: {
      summary:
        'Mou l’element al contenidor espacial correcte — els elements d’edificació físics pertanyen a una planta (o espai), no directament sota el Lloc o el Projecte.',
      tools: {
        revit:
          'Reassigna l’element a un Nivell d’edifici. Els components del lloc i la topografia poden estar a l’abast del lloc, però els elements d’edificació han d’estar en un Nivell.',
        archicad:
          'Defineix la Planta d’origen de l’element a la planta correcta; evita col·locar elements d’edificació a l’abast del lloc.',
        tekla:
          'Ajusta el mapatge del contenidor espacial a l’exportació IFC perquè les peces vagin a la planta correcta en lloc del lloc.',
        allplan:
          'Mou l’objecte al node de planta correcte a l’estructura de l’edifici.',
      },
    },
    RULE_BROKEN_AGGREGATE: {
      summary:
        'Corregeix la relació d’agregació trencada — gairebé sempre és un artefacte d’exportació/interoperabilitat, així que torna a exportar des de l’eina.',
      tools: {
        revit:
          'Torna a exportar amb un exportador IFC actualitzat. Si persisteix, audita el model (Gestionar ▸ Purgar no utilitzats) i comprova grups o conjunts corruptes.',
        archicad:
          'Torna a exportar amb el complement IFC d’ARCHICAD més recent; executa una comprovació del model si la corrupció persisteix.',
        tekla:
          'Torna a exportar des de Tekla — les agregacions trencades indiquen una falla d’interoperabilitat, no un error de modelatge.',
        allplan:
          'Torna a exportar des d’Allplan amb una interfície IFC actualitzada.',
      },
    },
    RULE_SPATIAL_HIERARCHY: {
      summary:
        'Assegura’t que l’estructura espacial segueixi Projecte ▸ Lloc ▸ Edifici ▸ Planta. Corregeix-ho a la configuració del projecte de l’eina abans d’exportar.',
      tools: {
        revit:
          'Revit construeix aquesta jerarquia automàticament des de Projecte ▸ Lloc ▸ Edifici ▸ Nivells. Una jerarquia trencada sol indicar Nivells absents o una exportació personalitzada — verifica que existeixin Nivells i usa l’assignació de lloc/edifici IFC per defecte.',
        archicad:
          'Comprova la jerarquia al Traductor IFC i a la Configuració de plantes: les plantes sota l’edifici, l’edifici sota el lloc.',
        tekla:
          'Configura la jerarquia espacial completa (projecte/lloc/edifici/planta) al diàleg d’exportació IFC perquè sigui completa i ordenada correctament.',
        allplan:
          'Defineix l’estructura completa de l’edifici (projecte/lloc/edifici/planta) a la paleta d’estructura abans d’exportar.',
      },
    },
    RULE_CIRCULAR_REFERENCE: {
      summary:
        'Elimina la relació circular — un element no pot ser el seu propi avantpassat. És un artefacte d’exportació/interoperabilitat; torna a exportar des d’una còpia neta.',
      tools: {
        revit:
          'Torna a exportar amb un exportador IFC actualitzat des d’una còpia neta; si persisteix, audita i purga el model.',
        archicad:
          'Torna a exportar amb el complement IFC més recent; executa una comprovació del model per trobar la relació problemàtica.',
        tekla:
          'Torna a exportar des del model natiu — Tekla normalment no crea cicles de referència.',
        allplan:
          'Torna a exportar des d’Allplan; recrea els objectes afectats si el cicle persisteix.',
      },
    },
    RULE_ELEMENT_IN_BUILDING: {
      summary:
        'Col·loca l’element dins d’una planta en lloc de directament sota l’edifici.',
      tools: {
        revit:
          'Assigna l’element a un Nivell perquè s’exporti sota un IfcBuildingStorey en lloc de l’edifici.',
        archicad:
          'Defineix la Planta d’origen de l’element perquè no es col·loqui a l’abast de l’edifici.',
        tekla:
          'Mapeja la peça a una planta a la configuració espacial de l’exportació IFC.',
        allplan:
          'Mou l’objecte a un node de planta a l’estructura de l’edifici.',
      },
    },
    // ── Propietats i tipus ───────────────────────────────────────────
    RULE_MISSING_TYPE: {
      summary:
        'Associa l’element amb un tipus (IfcWallType, IfcDoorType, …) perquè les propietats i quantitats de tipus es propaguin.',
      tools: {
        revit:
          'Els tipus de família de Revit s’exporten com a IfcTypeObjects automàticament. Els tipus absents solen indicar famílies in situ o models genèrics — converteix-los en famílies carregables amb tipus definits, i mantén activada l’exportació de tipus a les opcions IFC.',
        archicad:
          'Usa preferits/materials de construcció i mantén activada l’exportació "Type Product" al Traductor IFC perquè s’escriguin els tipus d’element.',
        tekla:
          'Assigna un perfil i un material perquè la peça s’exporti amb un tipus; verifica que l’exportació IFC escrigui objectes de tipus.',
        allplan:
          'Usa objectes de biblioteca/SmartParts amb tipus definits i activa l’exportació de tipus a la interfície IFC.',
      },
    },
    RULE_MISSING_PROPERTY_SET: {
      summary:
        'Afegeix el/s conjunt/s de propietats requerit/s definit/s pel BEP/EIR del projecte a l’element abans d’exportar.',
      tools: {
        revit:
          'Afegeix els paràmetres absents i assigna’ls al Pset requerit mitjançant un arxiu User Defined PropertySets referenciat a la configuració d’exportació IFC.',
        archicad:
          'Defineix el Pset requerit al Gestor de Propietats, assigna’l a les classificacions rellevants i mapeja’l al Traductor IFC.',
        tekla:
          'Afegeix les propietats com a UDA i assigna-les al Pset requerit als conjunts de propietats addicionals de l’exportació IFC.',
        allplan:
          'Crea els atributs i assigna’ls al Pset requerit a la configuració d’exportació IFC.',
      },
    },
    RULE_EMPTY_PROPERTY_VALUE: {
      summary:
        'Omple el valor de propietat buit — una propietat buida es tracta com a absent per les comprovacions posteriors.',
      tools: {
        revit:
          'Troba el paràmetre i introdueix-hi un valor (o elimina el paràmetre buit). Una taula de planificació és la manera més ràpida de trobar i omplir buits de manera massiva.',
        archicad:
          'Usa el Gestor de Propietats o una taula interactiva per trobar i omplir valors de propietat buits.',
        tekla:
          'Omple els valors UDA buits mitjançant les eines d’interrogació/informe abans d’exportar.',
        allplan:
          'Omple els valors d’atribut buits mitjançant la paleta d’atributs o una llista abans d’exportar.',
      },
    },
    RULE_MISSING_MATERIAL: {
      summary:
        'Assigna un material a l’element perquè porti dades de material (esperades a partir de LOD 200/300).',
      tools: {
        revit:
          'Assigna un material a l’estructura de l’element (Editar tipus ▸ Estructura, o el paràmetre Material). Revit exporta els materials definits com a IfcMaterial / conjunts de capes.',
        archicad:
          'Assigna un Material de construcció (no només una superfície) a l’element; ARCHICAD exporta els Materials de construcció com a IfcMaterial.',
        tekla:
          'Defineix el material de la peça a les propietats de la peça; Tekla l’exporta com el material IFC associat.',
        allplan:
          'Assigna un atribut de material/format a l’element perquè s’exporti amb una associació de material.',
      },
    },
    RULE_INVALID_IFC_VERSION: {
      summary:
        'Exporta a un esquema IFC actual (IFC4 / IFC4.3) tret que el destinatari requereixi explícitament IFC2x3.',
      tools: {
        revit:
          'Al diàleg d’exportació IFC, defineix la Versió d’arxiu a IFC4 (p. ex. Reference View o Design Transfer View) en lloc d’IFC2x3.',
        archicad:
          'Al Traductor IFC, tria una configuració d’exportació basada en IFC4 en lloc d’IFC2x3.',
        tekla:
          'A l’exportació IFC, selecciona el tipus d’exportació IFC4 en lloc d’IFC2x3.',
        allplan:
          'Selecciona IFC4 (o IFC4.3) com a esquema d’exportació a la configuració de la interfície IFC.',
      },
    },
    // ── Col·lisions ──────────────────────────────────────────────────
    RULE_ELEMENT_CLASH: {
      summary:
        'Resol la col·lisió geomètrica entre elements a l’eina — mou, retalla o uneix els elements en conflicte.',
      tools: {
        revit:
          'Executa Col·laborar ▸ Comprovació d’interferències per localitzar col·lisions, després mou/retalla/uneix els elements per resoldre la superposició.',
        archicad:
          'Usa Disseny ▸ Detecció de col·lisions per trobar superposicions, després ajusta els elements en conflicte.',
        tekla:
          'Usa Gestionar ▸ Comprovació de col·lisions per trobar i resoldre peces superposades.',
        allplan:
          'Usa la comprovació de col·lisions per localitzar superposicions i ajusta els elements en conflicte.',
      },
    },
    RULE_CLASH_MEP_STRUCTURAL: {
      summary:
        'Resol la col·lisió MEP-estructura — redirigeix el traçat MEP o coordina una penetració/maniguet amb el model estructural.',
      tools: {
        revit:
          'Executa la Comprovació d’interferències entre les categories MEP i estructural, després redirigeix les instal·lacions o afegeix obertures/maniguets coordinats.',
        archicad:
          'Usa la Detecció de col·lisions entre elements MEP i estructurals, després redirigeix o afegeix obertures.',
        tekla:
          'Executa una comprovació de col·lisions contra el model de referència MEP enllaçat i afegeix penetracions/obertures on calgui.',
        allplan:
          'Usa la comprovació de col·lisions entre MEP i estructura i redirigeix o afegeix obertures.',
      },
    },
    // ── Capçalera d’arxiu i metadades del projecte ───────────────────
    RULE_MISSING_PROJECT: {
      summary:
        'Tot IFC ha de contenir exactament un IfcProject. Un projecte absent significa una exportació trencada — torna a exportar el model complet.',
      tools: {
        revit:
          'Revit sempre escriu un IfcProject. Un d’absent indica una exportació corrupta o parcial — torna a exportar el model complet en lloc d’una selecció aïllada.',
        archicad:
          'Torna a exportar el projecte; exporta el model, no un conjunt aïllat d’elements que ometi l’arrel del projecte.',
        tekla:
          'Torna a exportar el model complet perquè s’escrigui l’arrel IfcProject.',
        allplan:
          'Torna a exportar des del projecte perquè s’inclogui l’entitat IfcProject.',
      },
    },
    RULE_MISSING_BUILDING: {
      summary:
        'Afegeix un edifici a l’estructura espacial — defineix un IfcBuilding a la configuració del projecte de l’eina.',
      tools: {
        revit:
          'Revit crea l’edifici automàticament; un d’absent sol indicar una exportació personalitzada només del lloc. Verifica que el projecte tingui Nivells i usa l’assignació d’edifici per defecte a les opcions IFC.',
        archicad:
          'Assegura’t que existeixi un edifici a la jerarquia del projecte / Traductor IFC i que les plantes hi quedin a sota.',
        tekla:
          'Defineix l’edifici a la configuració d’estructura espacial de l’exportació IFC.',
        allplan:
          'Afegeix un node d’edifici a la paleta d’estructura de l’edifici.',
      },
    },
    RULE_MISSING_STOREY: {
      summary:
        'Afegeix almenys una planta (nivell) sota l’edifici.',
      tools: {
        revit:
          'Crea Nivells al projecte; Revit exporta els Nivells com a IfcBuildingStoreys. Un model sense Nivells no exporta cap planta.',
        archicad:
          'Defineix plantes mitjançant Disseny ▸ Configuració de plantes perquè l’edifici tingui plantes.',
        tekla:
          'Defineix nivells/plantes a la configuració espacial de l’exportació IFC.',
        allplan:
          'Afegeix nodes de planta sota l’edifici a la paleta d’estructura.',
      },
    },
    RULE_EMPTY_STOREY: {
      summary:
        'Omple la planta buida o elimina-la — les plantes buides embruten l’arbre espacial i sovint indiquen elements mal assignats.',
      tools: {
        revit:
          'Elimina els Nivells no utilitzats, o comprova que els elements destinats a aquell Nivell hi estiguin assignats (no a un Nivell veí).',
        archicad:
          'Elimina la planta no utilitzada o reassigna la Planta d’origen dels elements perquè la planta no quedi buida.',
        tekla:
          'Elimina el nivell buit de l’exportació o reassigna-hi peces.',
        allplan:
          'Elimina el node de planta buit o reassigna-hi objectes.',
      },
    },
    RULE_STOREY_ELEVATION_MISSING: {
      summary:
        'Dona a cada planta una cota definida — és necessària per col·locar els nivells verticalment i generar plànols de planta.',
      tools: {
        revit:
          'Els Nivells sempre porten una cota a Revit; un valor nul sol indicar una exportació personalitzada. Verifica que els Nivells tinguin cotes numèriques i usa l’exportació de nivells IFC per defecte.',
        archicad:
          'Defineix la cota de cada planta a Disseny ▸ Configuració de plantes perquè no sigui nul·la.',
        tekla:
          'Assegura’t que cada nivell tingui una cota definida a la configuració de nivells/graella abans d’exportar.',
        allplan:
          'Defineix l’alçada/cota de cada planta a l’estructura de l’edifici perquè exporti un valor.',
      },
    },
    RULE_FILE_DESCRIPTION_MISSING: {
      summary:
        'Defineix la descripció de l’arxiu (normalment el MVD / definició de vista) a les opcions d’exportació — forma part de les metadades de la capçalera STEP.',
      tools: {
        revit:
          'FILE_DESCRIPTION es defineix a partir del MVD triat (p. ex. Reference View). Seleccionar una configuració d’exportació adequada al diàleg IFC l’omple.',
        archicad:
          'La selecció de MVD del Traductor IFC omple FILE_DESCRIPTION; tria una configuració d’exportació definida.',
        tekla:
          'El tipus d’exportació / MVD defineix FILE_DESCRIPTION; tria una configuració d’exportació IFC definida.',
        allplan:
          'Selecciona una configuració d’exportació IFC definida perquè s’escrigui la descripció de l’arxiu / MVD.',
      },
    },
    RULE_FILE_AUTHOR_MISSING: {
      summary:
        'Omple l’autor i l’organització a l’exportació o la informació del projecte — requerit per a la traçabilitat (ISO 19650).',
      tools: {
        revit:
          'Defineix l’autor a la configuració d’exportació IFC (Modificar configuració) o a Gestionar ▸ Informació del projecte; això omple el camp d’autor de FILE_NAME de STEP.',
        archicad:
          'Defineix l’autor i l’empresa a Arxiu ▸ Info ▸ Info del projecte i al Traductor IFC perquè s’escriguin a la capçalera.',
        tekla:
          'Defineix l’autor/organització a la configuració avançada de l’exportació IFC.',
        allplan:
          'Defineix l’autor/organització a la informació del projecte / configuració d’exportació IFC.',
      },
    },
    RULE_PROJECT_LONGNAME_MISSING: {
      summary:
        'Defineix el nom llarg del projecte (el títol descriptiu del projecte) a la informació del projecte de l’eina.',
      tools: {
        revit:
          'Defineix Nom del projecte / Nom d’emissió del projecte a Gestionar ▸ Informació del projecte i assigna’l a IfcProject.LongName a la configuració d’exportació IFC.',
        archicad:
          'Defineix el nom/descripció del projecte a Arxiu ▸ Info ▸ Info del projecte; el Traductor IFC l’assigna a IfcProject.LongName.',
        tekla:
          'Defineix el nom del projecte a les propietats del projecte i assigna’l a IfcProject.LongName a l’exportació.',
        allplan:
          'Defineix el nom/descripció del projecte a la informació del projecte perquè s’ompli IfcProject.LongName.',
      },
    },
    // ── ISO 19650 ────────────────────────────────────────────────────
    RULE_ISO19650_PROJECT_INFO: {
      summary:
        'Completa les metadades del projecte (nom llarg, descripció, fase/tipus de projecte) requerides pels requisits d’informació d’ISO 19650.',
      tools: {
        revit:
          'Omple Nom del projecte, Descripció i estat/fase a Gestionar ▸ Informació del projecte i assigna’ls als camps d’IfcProject a la configuració d’exportació IFC.',
        archicad:
          'Completa la informació del projecte a Arxiu ▸ Info ▸ Info del projecte i assigna els camps al Traductor IFC.',
        tekla:
          'Completa les propietats del projecte i assigna-les als camps d’IfcProject a l’exportació.',
        allplan:
          'Completa la informació del projecte perquè IfcProject porti LongName, Description i ObjectType.',
      },
    },
    RULE_ISO19650_AUTHOR_INFO: {
      summary:
        'Afegeix tant l’autor com l’organització a l’exportació perquè el lliurable sigui traçable segons ISO 19650.',
      tools: {
        revit:
          'Defineix l’autor i l’organització a la configuració d’exportació IFC / Informació del projecte perquè tots dos apareguin a la capçalera STEP.',
        archicad:
          'Defineix l’autor i l’empresa a la Info del projecte i al Traductor IFC.',
        tekla:
          'Defineix l’autor i l’organització a la configuració avançada de l’exportació IFC.',
        allplan:
          'Defineix l’autor i l’organització a la configuració del projecte / exportació IFC.',
      },
    },
    RULE_ISO19650_FILENAME: {
      summary:
        'Anomena l’arxiu d’exportació usant el patró d’ISO 19650: Projecte-Originador-Volum-Nivell-Tipus-Rol-Número.',
      tools: {
        revit:
          'Revit pren el nom d’arxiu del diàleg Desa de l’exportació — anomena l’arxiu segons el patró d’ISO 19650 en exportar (o canvia’n el nom després).',
        archicad:
          'Defineix el nom d’arxiu segons el patró d’ISO 19650 al diàleg d’exportació, o canvia el nom de l’arxiu exportat.',
        tekla:
          'Anomena la sortida IFC segons el patró d’ISO 19650 al diàleg d’exportació.',
        allplan:
          'Anomena l’arxiu exportat segons el patró d’ISO 19650 al diàleg d’exportació.',
      },
    },
    // ── LOD / LOIN ───────────────────────────────────────────────────
    RULE_LOD_PSET_MISSING: {
      summary:
        'Afegeix els conjunts de propietats requerits al nivell LOD/LOIN declarat (segons el pla de lliurament d’informació del projecte).',
      tools: {
        revit:
          'Assigna els paràmetres requerits pel LOD als seus Psets mitjançant un arxiu User Defined PropertySets a l’exportació IFC, i assegura’t que els elements portin realment aquests paràmetres.',
        archicad:
          'Defineix els Psets de LOD al Gestor de Propietats, assigna’ls a les classificacions rellevants i mapeja’ls al Traductor IFC.',
        tekla:
          'Afegeix les propietats requerides pel LOD com a UDA i assigna-les als Psets a l’exportació.',
        allplan:
          'Crea els atributs de LOD i assigna’ls als Psets requerits a l’exportació IFC.',
      },
    },
    RULE_LOD_QUANTITY_MISSING: {
      summary:
        'Activa l’exportació de quantitats base perquè els elements portin IfcElementQuantity (àrea/volum/longitud) al LOD declarat.',
      tools: {
        revit:
          'Activa "Exportar quantitats base" a les opcions d’exportació IFC; Revit aleshores escriu IfcElementQuantity per als elements.',
        archicad:
          'Activa l’exportació de quantitats base a la configuració del Traductor IFC.',
        tekla:
          'Activa l’exportació de quantitats / quantitats base a la configuració d’exportació IFC.',
        allplan:
          'Activa les quantitats base a la configuració d’exportació IFC.',
      },
    },
    RULE_LOD_MATERIAL_LAYER_MISSING: {
      summary:
        'Defineix construcció en capes a parets i lloses perquè exportin un IfcMaterialLayerSetUsage a LOD 300+.',
      tools: {
        revit:
          'Defineix les capes d’Estructura del Tipus de paret/sòl (Editar tipus ▸ Estructura) amb materials; Revit exporta les estructures compostes com a IfcMaterialLayerSet.',
        archicad:
          'Usa estructures Compostes (no un únic Material de construcció) per a parets/lloses perquè les capes exportin com a IfcMaterialLayerSet.',
        tekla:
          'Les peces de Tekla solen ser d’un sol material; per a elements en capes defineix les capes/materials perquè el conjunt de capes exporti, o confirma que aquesta regla s’aplica a la teva disciplina.',
        allplan:
          'Usa components multicapa perquè s’exporti el conjunt de capes de material.',
      },
    },
    // ── Classificació ────────────────────────────────────────────────
    RULE_MISSING_CLASSIFICATION: {
      summary:
        'Adjunta una referència de classificació (Uniclass, OmniClass, etc.) perquè l’element porti el seu codi estàndard com a IfcRelAssociatesClassification.',
      tools: {
        revit:
          'Usa un complement de classificació (p. ex. el gratuït Classification Manager for Revit) per assignar un codi Uniclass/OmniClass, o assigna un paràmetre compartit a IfcClassificationReference a la configuració d’exportació IFC. Sense un mapatge, Revit no exporta cap classificació.',
        archicad:
          'Obre la paleta de Classificació i Propietats, tria un sistema de classificació (integrat o importat) i assigna a l’element un element de classificació. ARCHICAD els exporta com a IfcClassificationReference automàticament.',
        tekla:
          'Assigna la classificació mitjançant un UDA o el mapatge de propietats Tekla–IFC, després assigna aquest atribut a IfcClassificationReference als conjunts de propietats addicionals de l’exportació IFC.',
        allplan:
          'Assigna el codi de classificació mitjançant els atributs de l’objecte i assegura’t que la configuració d’exportació IFC l’assigni a IfcClassificationReference.',
      },
    },
    // ── MEP ──────────────────────────────────────────────────────────
    RULE_MEP_SYSTEM_MISSING: {
      summary:
        'Assigna els elements MEP a un sistema perquè s’exportin dins d’un IfcSystem — necessari per a la coordinació basada en sistemes.',
      tools: {
        revit:
          'Assegura’t que conductes/canonades/equips pertanyin a un Sistema de Revit amb nom; els elements no assignats s’exporten sense IfcSystem. Usa el Navegador de sistemes per trobar-los i assignar-los.',
        archicad:
          'Assigna els elements MEP a un sistema MEP al MEP Modeler perquè s’exportin dins d’un IfcSystem.',
        allplan:
          'Assigna els objectes MEP a un sistema/xarxa perquè s’exportin dins d’un IfcSystem.',
      },
    },
    // ── Geometria i salut de l’arxiu ─────────────────────────────────
    RULE_PROXY_OVERUSE: {
      summary:
        'Redueix els elements IfcBuildingElementProxy assignant-los a classes IFC adequades — els proxies no porten cap tipus semàntic.',
      tools: {
        revit:
          'Els proxies venen de famílies in situ, models genèrics o categories no mapejades. Usa la taula de mapatge de classes d’exportació IFC per assignar aquestes categories a tipus IFC reals en lloc d’IfcBuildingElementProxy, i converteix les famílies in situ en famílies carregables.',
        archicad:
          'Assigna classificacions / tipus IFC adequats als objectes (especialment Morphs i objectes personalitzats) perquè no s’exportin com a proxies.',
        tekla:
          'Mapeja les peces personalitzades o proxy a l’entitat IFC correcta a la configuració d’exportació IFC.',
        allplan:
          'Assigna el tipus IFC correcte als objectes genèrics perquè no s’exportin com a proxies.',
      },
    },
    RULE_COORDINATE_OFFSET: {
      summary:
        'Mantén el model a prop de l’origen intern i georeferencia’l correctament, en lloc de modelar en coordenades reals grans.',
      tools: {
        revit:
          'No modelis lluny de l’origen intern de Revit. Usa Coordenades compartides amb un Punt topogràfic / Punt base del projecte i exporta amb les coordenades compartides actuals perquè la geometria es mantingui a prop de l’origen mentre es preserva la georeferenciació.',
        archicad:
          'Defineix el Punt topogràfic i l’Origen del projecte; mantén el model a prop de l’origen i usa la georeferenciació IFC (IfcMapConversion) en lloc d’un desplaçament gran.',
        tekla:
          'Defineix el punt base/de treball i mantén el model a prop de l’origen; usa el punt base de l’exportació IFC perquè les coordenades no siguin enormes.',
        allplan:
          'Defineix una georeferenciació/punt base del projecte i mantén la geometria a prop de l’origen en lloc de coordenades reals.',
      },
    },
    RULE_FILE_SIZE_ANOMALY: {
      summary:
        'Redueix el pes de l’arxiu: baixa la tessel·lació/detall, evita textures incrustades i exporta només el necessari.',
      tools: {
        revit:
          'Baixa el nivell de detall per a l’exportació, evita exportar CAD importat i famílies de molts polígons, i separa disciplines. El MVD Reference View produeix geometria tessel·lada més lleugera.',
        archicad:
          'Redueix la resolució de corbes/segments, evita incrustar textures, usa una configuració lleugera del Traductor IFC i exporta només els elements necessaris.',
        tekla:
          'Redueix el detall/representació de la geometria d’exportació i evita exportar models de referència innecessàriament.',
        allplan:
          'Baixa la resolució de la geometria i evita incrustar textures a l’exportació IFC.',
      },
    },
    RULE_OPENING_WITHOUT_HOST: {
      summary:
        'Revincula o elimina els IfcOpeningElement orfes — tot buit ha de tallar un element amfitrió mitjançant IfcRelVoidsElement.',
      tools: {
        revit:
          'Els buits orfes solen venir d’amfitrions esborrats/editats o de buits de shaft solts. Esborra els buits solts i recrea el buidat sobre el seu amfitrió (mur/sostre/coberta) perquè s’exporti la relació, i torna a allotjar portes/finestres si s’ha perdut el tall.',
        archicad:
          'Els buits han de pertànyer a un mur o sostre. Elimina els objectes de buit solts i fes servir l’eina de Buit (o porta/finestra) ancorada a l’amfitrió perquè ArchiCAD exporti IfcRelVoidsElement.',
        tekla:
          'Recrea el tall/buit com una operació (feature) de la seva part amfitriona en lloc d’un objecte solt, perquè el buidat referenciï un amfitrió en exportar.',
        allplan:
          'Col·loca els buits amb les eines de buit de mur/sostre perquè pertanyin a un amfitrió; elimina els sòlids de buit desvinculats.',
      },
    },
    RULE_STOREY_ELEVATION_DUPLICATE: {
      summary:
        'Assigna una Elevation distinta a cada IfcBuildingStorey — les plantes amb la mateixa cota trenquen la generació de plànols i el filtratge per planta.',
      tools: {
        revit:
          'Dos nivells comparteixen la mateixa cota. A la vista de Nivells dona una cota única a cada Nivell (o esborra el duplicat) i exporta com a planta només els nivells reals (desactiva “Planta d’edifici”/exportació als altres).',
        archicad:
          'Obre Configuració de Planta i fixa una elevació única per planta; fusiona o elimina les plantes duplicades a la mateixa alçada.',
        tekla:
          'A la llista de nivells/fases assigna una cota única a cada nivell usat per a l’estructura de plantes IFC i elimina els duplicats.',
        allplan:
          'A l’estructura de l’edifici defineix alçades distintes per planta i elimina les plantes duplicades que resolen a la mateixa cota.',
      },
    },
    RULE_STOREY_ELEVATION_ORDER: {
      summary:
        'Ordena les plantes perquè la seva Elevation creixi de baix a dalt — les cotes desordenades confonen les eines de secció/plànol i els revisors.',
      tools: {
        revit:
          'Un nivell inferior té una cota més alta (o a l’inrevés). Corregeix les cotes dels nivells o l’ordre d’exportació perquè les plantes vagin de baix a dalt, i revisa els nivells de soterrani/coberta amb cotes negatives.',
        archicad:
          'A Configuració de Planta corregeix l’alçada de qualsevol planta fora de seqüència perquè les cotes pugin amb l’índex de planta.',
        tekla:
          'Reordena/renumera els nivells perquè les seves cotes pugin; corregeix qualsevol nivell l’alçada del qual contradigui la seva posició.',
        allplan:
          'A l’estructura de l’edifici reordena les plantes o corregeix-ne les alçades perquè les cotes augmentin cap amunt.',
      },
    },
    RULE_UNIT_CONSISTENCY: {
      summary:
        'Exporta en mètric SI (mil·límetres/metres) — les unitats imperials trenquen la interoperabilitat amb la majoria d’eines IFC/BIM.',
      tools: {
        revit:
          'Les unitats internes de Revit són imperials, però l’IFC ha de ser mètric. Posa les Unitats de projecte en mètric (o confirma que l’exportació IFC usa SI/mètric) perquè l’IFCSIUNIT sigui en metres.',
        archicad:
          'Configura les Unitats de Treball (i de Càlcul) del projecte en mètric perquè l’esquema IFC exporti unitats de longitud SI.',
        tekla:
          'Canvia l’entorn/rol o els ajustos d’exportació a mètric perquè el LENGTHUNIT de l’IFC sigui SI (mm/m).',
        allplan:
          'Configura les unitats de longitud en mètric a les opcions del projecte perquè l’exportació IFC usi unitats SI.',
      },
    },
    RULE_SPACE_AREA_MISSING: {
      summary:
        'Afegeix quantitats d’àrea als IfcSpace — exporta BaseQuantities perquè cada espai porti NetFloorArea/GrossFloorArea.',
      tools: {
        revit:
          'Les habitacions s’exporten com a IfcSpace però sense quantitats. Activa “Exporta quantitats base” (Pset/QTO) a les opcions d’exportació IFC i assegura’t que les Habitacions estiguin ben delimitades/col·locades perquè es calculin les àrees.',
        archicad:
          'Fes servir Zones per als espais i activa les Quantitats Base al Traductor IFC perquè IfcSpace exporti NetFloorArea/GrossFloorArea.',
        tekla:
          'Els espais són limitats a Tekla; si calen, defineix-los i activa l’exportació de quantitats, o genera’ls al model d’arquitectura.',
        allplan:
          'Crea Habitacions (espais) i activa l’exportació de quantitats IFC perquè IfcSpace porti quantitats d’àrea.',
      },
    },
    RULE_CONNECTED_MEP: {
      summary:
        'Connecta els segments MEP mitjançant ports — canonades/conductes desconnectats s’exporten sense relacions IfcDistributionPort i trenquen el traçat de sistemes.',
      tools: {
        revit:
          'Els conductes/canonades desconnectats s’exporten sense ports. Corregeix els connectors oberts al model MEP (sense buits ni extrems solts), mantén els segments units en sistemes connectats i activa l’exportació de sistemes/ports perquè s’escriguin les relacions IfcDistributionPort.',
        archicad:
          'Fes servir el MEP Modeler perquè les rutes quedin connectades d’extrem a extrem; exporta els sistemes MEP per incloure ports/connexions.',
        tekla:
          'El MEP no és el domini de Tekla; modela el MEP connectat a l’eina MEP corresponent perquè els segments portin ports, i després fedèra-ho.',
        allplan:
          'Modela els traçats MEP connectats d’extrem a extrem (sense extrems oberts) perquè l’exportació IFC escrigui els ports de distribució entre segments.',
      },
    },
  },
}

/**
 * Returns the remediation guidance for a rule ID in the given locale.
 * Falls back to EN, then undefined when no guidance has been authored.
 */
export function getRuleRemediation(
  ruleId: string,
  locale = 'en',
): RuleRemediation | undefined {
  const lang = locale.split('-')[0] // 'en-US' → 'en'
  return RULE_REMEDIATION[lang]?.[ruleId] ?? RULE_REMEDIATION['en']?.[ruleId]
}
