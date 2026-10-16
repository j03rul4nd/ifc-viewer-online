import type { BlogPost } from './blog-posts'

// The "next step" of measuring (src/lib/measure: takeoff.ts, checks.ts): a
// quantity takeoff of a selection from the IFC's own Qto, requirements with
// pass/fail on a measurement, and volumes from a traced area. Written for the
// people who need a number they can sign: estimators, accessibility reviewers,
// MEP engineers and site managers. Every behaviour described is the app's.

const base = {
  date: '2026-10-16',
  dateModified: '2026-10-16',
  author: 'IFC Viewer Team',
  category: 'Tools & comparisons',
  categorySlug: 'tools',
}

const DEMO = {
  type: 'tool-demo' as const,
  demo: 'measure' as const,
  poster: 'blog/images/measure-snap-targets-vertex-edge-face.png',
  posterAlt: 'Measuring an IFC model with vertex and edge snapping in IFC Viewer Online',
  launchLabel: 'Start measuring',
  actionLabel: 'Measure again',
}

export const MEASURE_POSTS_EN: BlogPost[] = [
  // ── Quantity takeoff ───────────────────────────────────────────────────────
  {
    ...base,
    slug: 'ifc-quantity-takeoff-online',
    title: 'Quantity Takeoff from an IFC Model, in the Browser: Net, Gross and the Elements That Have No Quantities',
    seoTitle: 'IFC Quantity Takeoff Online: Net vs Gross, CSV Export',
    seoDescription: 'Take off quantities from an IFC in the browser: select elements, group by class, type or storey, net before gross, see which elements lack Qto, export to CSV.',
    excerpt: 'An IFC usually carries its own quantities — NetSideArea, GrossVolume, Length — but adding them up naively counts every wall twice and hides the elements that have none. How to take off a selection so the total is one you can price, and how to tell when it is not.',
    readTimeMin: 9,
    keywords: ['IFC quantity takeoff', 'quantity takeoff online', 'BIM quantity takeoff free', 'IFC Qto', 'IfcElementQuantity', 'BIM 5D takeoff', 'IFC to CSV quantities', 'net vs gross area IFC'],
    faqs: [
      { q: 'Can I do a quantity takeoff from an IFC without Revit, Navisworks or a cost-estimating package?', a: 'Yes, for the quantities the IFC already carries. Select the elements in IFC Viewer Online, open Measure and run the takeoff: it sums the IfcElementQuantity values (the Qto_ sets) per class, type or storey and exports a CSV. Nothing is uploaded; the model is read in your browser.' },
      { q: 'Why do my IFC area totals come out twice as large as expected?', a: 'Because a wall typically carries NetSideArea and GrossSideArea, and often several other areas too. Summing every Area quantity counts the same wall more than once. A correct takeoff takes one value per element per kind, net before gross, and says which one it used.' },
      { q: 'What if some elements have no quantities?', a: 'Then they are not in the sum, and the total is partial. The takeoff shows coverage per column (for example 28 of 40 walls have a volume) and how many elements carry no quantities at all, so a partial total never passes for a complete one. The fix is to export the IFC with base quantities switched on.' },
      { q: 'Does a browser takeoff replace a quantity surveyor?', a: 'No. It is a fast, checkable count of what the model says. Measurement rules (NRM, CESMM, local standards), deductions, waste factors and pricing are still a professional job; the takeoff gives that job a clean starting table.' },
    ],
    references: [
      { id: 'ifc-qto', title: 'IfcElementQuantity and the base quantity sets (Qto_)', source: 'buildingSMART International · IFC 4.3 documentation', url: 'https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcElementQuantity.htm', note: 'Where the quantities in an IFC live and what the standard sets are called.' },
      { id: 'nrm', title: 'NRM 2: Detailed measurement for building works', source: 'RICS', url: 'https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/nrm', note: 'An example of the measurement rules a priced bill follows, and a model quantity does not.' },
    ],
    content: [
      { type: 'p', text: 'Somebody asks "how many square metres of partition are on level 2?" and the model is right there. Most IFC exports already carry the answer: every wall, slab and beam can hold an IfcElementQuantity with its lengths, areas, volumes and weights, written by the authoring tool at export. The problem is not getting a number. It is getting a number that is neither double-counted nor silently incomplete.' },
      { type: 'takeaways', items: [
        'Select what you want to count — by click, by box, by type or by storey — and run the takeoff from the Measure panel.',
        'One value per element per kind, net before gross: NetSideArea beats GrossSideArea, NetVolume beats GrossVolume. The column tells you which was used.',
        'Coverage is part of the answer. "28/40" next to a volume means twelve elements are missing from the total.',
        'Group by IFC class, by type or by storey, then copy the table into a spreadsheet or download it as CSV.',
        'The quantities are the model\'s. If they are wrong, the takeoff is faithfully wrong — validate the model first.',
      ] },
      { ...DEMO, title: 'Try it: take off a real model', description: 'Opens a sample IFC with the Measure panel. Select a few elements (or a whole storey from the tree) and press "Take off" in the panel.', hint: 'Switch the grouping between class, type and storey; the CSV follows the grouping.' },

      { type: 'h2', text: 'Where the quantities in an IFC come from' },
      { type: 'p', text: ['Quantities are not computed by the viewer from the triangles. They are written into the file by the authoring tool, as property-set-like objects called IfcElementQuantity, usually named after the standard base quantity sets: Qto_WallBaseQuantities, Qto_SlabBaseQuantities, Qto_BeamBaseQuantities and so on ', { cite: 'ifc-qto' }, '. Revit, Archicad, Tekla and Allplan all export them, but usually only when an export option such as "Export base quantities" is ticked.'] },
      { type: 'p', text: 'That has two consequences. The numbers follow the authoring tool\'s own rules — openings deducted or not, layers joined or not — which is usually what you want. And a model exported without that option has no quantities at all, however good its geometry looks.' },
      { type: 'table', headers: ['Element', 'Typical quantities', 'Which one the takeoff uses'], rows: [
        ['Wall', 'Length, Height, Width, NetSideArea, GrossSideArea, NetVolume, GrossVolume', 'Length; NetSideArea; NetVolume'],
        ['Slab', 'Width, Perimeter, NetArea, GrossArea, NetVolume, GrossVolume', 'Perimeter; NetArea; NetVolume'],
        ['Beam / column', 'Length, CrossSectionArea, OuterSurfaceArea, NetVolume, NetWeight', 'Length; OuterSurfaceArea; NetVolume; NetWeight'],
        ['Duct / pipe segment', 'Length, OuterSurfaceArea, GrossWeight', 'Length; OuterSurfaceArea; GrossWeight'],
        ['Door / window', 'Width, Height, Area', 'Area (and the count)'],
      ] },

      { type: 'h2', text: 'The double-counting trap' },
      { type: 'p', text: 'A wall with NetSideArea 10 m² and GrossSideArea 12 m² is one wall with 10 m² of finish, not 22 m². Yet "sum every quantity of type Area" — what a quick script or a generic property export does — gives 22. On a floor of partitions the total is roughly doubled, and the error is invisible because each individual number is right.' },
      { type: 'p', text: 'The rule the takeoff follows is simple and stated in the table: each element contributes one value per kind (count, length, area, volume, weight), taken from a priority list that puts net before gross. Hover a total to see which quantity names it came from; when an estimator prices gross, the CSV says so per row.' },
      { type: 'callout', variant: 'tip', text: 'Units are not mixed either. If one element reports its volume in m³ and another in a different unit, the cell says "mixed units" instead of adding them — that model needs fixing before its numbers go anywhere.' },

      { type: 'h2', text: 'Coverage: the number next to the number' },
      { type: 'p', text: 'The most expensive takeoff error is not a wrong value. It is a missing one. Twelve walls exported from a linked model without base quantities simply do not appear in a sum, and nothing about the total looks suspicious.' },
      { type: 'p', text: 'So every total carries its coverage. A small asterisk marks a column where not every element in the group had the quantity, the tooltip says "28 of 40 elements have it", and a line under the table counts the elements that carry no quantities at all. The CSV exports coverage as its own column, so the person who receives the file sees it too.' },
      { type: 'ul', items: [
        'Coverage 40/40 — the total is the model\'s full answer for that group.',
        'Coverage below the count — some elements have the quantity, some do not. Usually a mixed export (two tools, two settings).',
        'No quantities at all — re-export with base quantities on, or measure those elements by hand with the area and distance tools.',
      ] },

      { type: 'h2', text: 'Grouping: class, type or storey' },
      { type: 'p', text: 'The same selection reads differently depending on the question. By IFC class answers "how much wall, slab and beam?"; by type answers "how many metres of W-200 versus W-100?", which is what a bill of quantities is priced on; by storey answers "what is on level 2?", which is how a site sequences work. Switch the grouping and the table and the CSV follow.' },
      { type: 'p', text: ['Selecting the right elements is half the job. Pick by type or storey from the model tree, or by class from a search. When the classes themselves are wrong — walls exported as IfcBuildingElementProxy — the grouping exposes it immediately; ', { text: 'common IFC model errors', to: 'common-ifc-model-errors' }, ' explains why that happens and how to fix it in the export.'] },

      { type: 'h2', text: 'From the table to the estimate' },
      { type: 'ol', items: [
        'Validate first. A model with wrong units or proxies everywhere gives a precise-looking, wrong table.',
        'Select the scope — a storey, a type, a package — and run the takeoff.',
        'Check coverage. Anything below full gets a decision: re-export, measure by hand, or note the exclusion.',
        'Copy (it pastes as columns in Excel or Sheets) or download the CSV. In locales that write decimals with a comma, the CSV uses a semicolon so the numbers open as numbers.',
        'Apply your measurement rules, waste and prices in the estimating tool. The model quantity is the start of the bill, not the bill.',
      ] },
      { type: 'callout', variant: 'info', text: ['A takeoff from the model is only as good as the model. Before you send totals to anybody, ', { text: 'validate the IFC', to: 'how-to-validate-ifc-file' }, ' — units, classes and missing quantities are the first things that check catches.'] },
    ],
  },

  // ── Requirements: clearances with pass/fail ────────────────────────────────
  {
    ...base,
    slug: 'check-clearances-ifc-model',
    title: 'Check Clearances in an IFC Model: Corridors, Doors, Headroom and Ramps, with Pass or Fail',
    seoTitle: 'Check Clearances in an IFC Model: Pass/Fail Measurements',
    seoDescription: 'Measure corridor widths, door openings, headroom and ramp slopes on an IFC in the browser and mark each pass or fail against a requirement. Export the checks.',
    excerpt: 'A design review rarely asks "how wide is this corridor?". It asks "is it at least 1.20 m?". Attaching the requirement to the measurement — and seeing pass or fail on the label, in the screenshot and in the export — turns a dimension into a check somebody can act on.',
    readTimeMin: 8,
    keywords: ['check clearances IFC', 'accessibility check BIM', 'corridor width check', 'headroom clearance BIM', 'ramp slope check', 'IFC design review measurement', 'BIM compliance check free', 'door clear width IFC'],
    faqs: [
      { q: 'How do I check a minimum corridor width on an IFC model?', a: 'Measure the clear width with the distance tool in perpendicular mode (square to the wall face), then add a requirement of at least the required width — or click the "Corridor ≥ 1.20" preset. The label in the 3D view gets a green tick or a red cross, and the panel says by how much it fails.' },
      { q: 'Which requirements can a measurement carry?', a: 'At least, at most or between, on the measured value, on the height difference (ΔZ), on the slope in percent, or on the volume of an extruded area. Presets cover the common ones: corridor 1.20 m, door 0.80 m, headroom 2.10 m, ramp at most 8 %, wheelchair turning 1.50 m and square angles.' },
      { q: 'Are the presets the legal values for my country?', a: 'No. They are common reference values, not your code. Accessibility and building regulations differ by country, building type and edition; edit the number to the one your regulation, client brief or EIR sets, and cite that source in the note.' },
      { q: 'Can I send the failed checks to the team?', a: 'Yes. The pass/fail marks are painted into screenshots and BCF snapshots, and the CSV export has requirement and check columns, so a failed clearance can become a BCF issue with the evidence already in the image.' },
    ],
    content: [
      { type: 'p', text: 'The dimension is rarely the point. A reviewer measuring a corridor wants to know whether it meets the brief; a site manager measuring headroom under a duct wants to know whether a person or a pallet truck gets through. Writing "1.14 m" in a comment leaves the comparison to whoever reads it — and they may not know the requirement.' },
      { type: 'p', text: 'So the measurement carries its requirement. You state "at least 1.20 m" once, the label in the model shows a tick or a cross, the panel says "fails by 6 cm", and the export has a column that says Fail. That is what a check looks like when it leaves your screen.' },
      { type: 'takeaways', items: [
        'Measure clear widths square to the face: distance tool, perpendicular mode.',
        'Add a requirement — at least, at most or between — or click a preset: corridor, door, headroom, ramp, turning circle, right angle.',
        'Check the right quantity: the value, the height (ΔZ), the slope in percent or a volume.',
        'Pass or fail shows on the 3D label (with ✓ or ✗, not only colour), in screenshots, in BCF snapshots and in the CSV.',
        'Presets are reference values, not your code. Set the number your regulation or brief requires and note the source.',
      ] },
      { ...DEMO, title: 'Try it: measure a clearance and check it', description: 'Opens a sample IFC with the distance tool armed. Measure between two walls, select the measurement and click a preset such as "Corridor ≥ 1.20".', hint: 'Switch the distance tool to "perpendicular" to measure square to a wall.' },

      { type: 'h2', text: 'Measure the clear dimension, not a diagonal' },
      { type: 'p', text: 'A clearance measured corner to corner across a corridor is always a little longer than the corridor is wide — and always in the direction that makes a failing corridor look compliant. Use the perpendicular mode: click the face of one wall, then the other wall, and the distance is taken square to the first face. For a door, measure between the frames (or the leaf and the stop), not between the wall openings.' },
      { type: 'p', text: ['If the space you need is inside the building, cut it open first. A section box around one corridor, or a plan cut at working height on the storey, makes the walls you need clickable — and the picker respects the cut, so you do not measure the façade by accident. ', { text: 'How to measure an IFC model online', to: 'measure-ifc-model-online' }, ' covers snapping and sections in detail.'] },

      { type: 'h2', text: 'Add the requirement' },
      { type: 'p', text: 'Select the measurement in the panel. Under its breakdown there is a Requirement row with presets for the checks people repeat, and a "+ Requirement" button for anything else.' },
      { type: 'table', headers: ['Preset', 'Rule', 'What it checks'], rows: [
        ['Corridor', '≥ 1.20 m', 'The measured distance'],
        ['Door', '≥ 0.80 m', 'The measured distance (clear opening)'],
        ['Headroom', '≥ 2.10 m', 'The height difference ΔZ of a vertical measurement'],
        ['Ramp', '≤ 8 %', 'The slope between the two points, in percent'],
        ['Turning', '≥ 1.50 m', 'A turning circle diameter'],
        ['Square 90°', '89.5° – 90.5°', 'An angle measurement'],
      ] },
      { type: 'callout', variant: 'warning', text: 'These are common reference values, not your regulation. Minimum corridor widths, door clearances and maximum ramp gradients vary by country, building use and code edition — and a ramp limit usually depends on its length too. Type the value your code, client brief or EIR sets, and use the note field to cite the clause.' },
      { type: 'p', text: 'Values are typed in the unit you display (metres, centimetres, millimetres or feet) and stored in metres, so switching units later does not change the requirement. A tiny tolerance absorbs rounding: a corridor shown as 1.20 m does not fail a 1.20 m minimum because it is 1.1999 underneath.' },

      { type: 'h2', text: 'Height and slope: checking the right number' },
      { type: 'p', text: 'A measurement has more than one number. A distance from floor to the underside of a duct has a length and a vertical component; a distance along a ramp has a length, a rise and a slope. The requirement chooses which one it checks: the value itself, the height (ΔZ), or the slope in percent. For headroom, measure from floor to obstruction and check the height, so a slightly slanted click does not inflate it. For a ramp, click the bottom and the top of the run and check the slope.' },

      { type: 'h2', text: 'Reading pass and fail' },
      { type: 'ul', items: [
        'In the 3D view the label gets a green or red rim and a ✓ or ✗ after the value — readable without colour vision.',
        'In the list, a badge next to the value; the selected item says "Meets the requirement" or "Fails by 6 cm".',
        'At the bottom of the panel, a count: "Requirements met 7 / 9".',
        'If a requirement does not apply to the measurement — a slope on an angle — it says so instead of passing silently.',
      ] },

      { type: 'h2', text: 'Sending the result' },
      { type: 'p', text: ['Checks are only useful once somebody else sees them. The pass/fail marks are painted into screenshots and into the snapshot of a BCF topic, so an issue about a narrow corridor carries the evidence in its image. The CSV adds Requirement, Check and Note columns next to the values, ready for a review log. For the issue round-trip, see ', { text: 'BCF 2.1 vs 3.0', to: 'bcf-2-1-vs-3-0-viewpoints' }, '.'] },
      { type: 'callout', variant: 'info', text: 'A manual check is a sample, not a proof. It is the right tool for a design review, a site query or an accessibility walk-through of the critical routes. For rules that must hold on every element — every door, every stair — write them as IDS requirements and validate the whole model.' },
    ],
  },

  // ── Volumes from areas ─────────────────────────────────────────────────────
  {
    ...base,
    slug: 'volume-from-ifc-model-concrete-excavation',
    title: 'Volumes from an IFC Model: Concrete, Screed, Excavation and Room Air Volume',
    seoTitle: 'Volumes from an IFC Model: Concrete, Excavation, Rooms',
    seoDescription: 'Get volumes from an IFC in the browser: trace or pick an area, give it a thickness or depth, and read m³ — for slabs, screeds, excavations and room air changes.',
    excerpt: 'Many volume questions on a project are one area times one height: the screed on a floor, the dig under a pit, the air in a room for an air-change rate. When the model has no quantity for it — or the thing is not modelled at all — tracing the area and giving it a height gets the number in seconds.',
    readTimeMin: 7,
    keywords: ['IFC volume calculation', 'concrete volume from BIM', 'excavation volume calculation', 'room volume air changes', 'screed volume calculation', 'BIM volume online', 'area times height volume', 'IFC measure volume'],
    faqs: [
      { q: 'How do I get the volume of a slab from an IFC?', a: 'If the slab carries base quantities, select it and run the takeoff: NetVolume is summed per element. If it does not, pick its top face with the area tool (face mode), give the area its thickness as a height, and the volume is shown on the label and in the export.' },
      { q: 'How do I calculate a room\'s air volume for an air-change rate?', a: 'Pick the floor face of the room (or trace its outline), then set the clear floor-to-ceiling height as the area\'s height. The volume in m³ multiplied by the air changes per hour gives the airflow in m³/h.' },
      { q: 'Is area × height accurate for an excavation?', a: 'For a vertical-sided pit or trench on flat ground, yes. For battered sides, sloping ground or a stepped formation, it is an approximation: split the dig into parts of roughly constant depth, or use a terrain model and a dedicated earthworks tool for the final quantity.' },
    ],
    content: [
      { type: 'p', text: 'A surprising number of volume questions on a project have the same shape: an area times a height. How much screed for this floor at 60 mm? How much spoil from a lift pit 1.4 m deep? How many cubic metres of air in this meeting room, to size its ventilation? None of them needs a solid model; they need an honest area and a height somebody chose.' },
      { type: 'takeaways', items: [
        'Get the area: pick a face in one click, or trace the outline point by point.',
        'Select the area and type a height — a thickness, a depth, a clear height. The volume appears on the label, in the list and in the export.',
        'Several extruded areas add up into a total volume at the bottom of the panel.',
        'When the element is modelled and carries quantities, the takeoff\'s NetVolume is the better number; area × height is for what is not modelled, or not modelled that way.',
        'A volume can carry a requirement too — "at most 2 m³ per pour" — with pass or fail.',
      ] },
      { ...DEMO, title: 'Try it: turn an area into a volume', description: 'Opens a sample IFC with the Measure panel. Switch to Area, pick a floor face, select the result and type a height under "Height → volume".', hint: 'Face mode measures one face in a single click; points mode traces any outline.' },

      { type: 'h2', text: 'When to measure a volume by hand' },
      { type: 'p', text: ['If the thing is modelled as an element with base quantities — a slab, a footing, a beam — select it and take off its NetVolume; it is exact and already accounts for openings. ', { text: 'Quantity takeoff from an IFC model', to: 'ifc-quantity-takeoff-online' }, ' explains how. Area × height is for everything else:'] },
      { type: 'ul', items: [
        'Layers that are not modelled: screeds, toppings, insulation boards, a gravel bed.',
        'Spaces, when the model has no IfcSpace or its spaces have no volume: room air volume, a plant room, a fire compartment.',
        'Temporary works and earthworks: a pit, a trench, a blinding layer, a backfill.',
        'Checks of a model\'s own numbers: does a 250 mm slab of 120 m² really hold 30 m³?',
      ] },

      { type: 'h2', text: 'Step by step' },
      { type: 'ol', items: [
        'Open Measure (M) and choose Area. Face mode measures a whole planar face in one click — the top of a slab, the floor of a room. Points mode traces any outline, closing on the first point.',
        'Select the area in the list. Under its breakdown, type the height in "Height → volume", in the unit you display.',
        'Read the volume on the label in the model and in the list. Rename the item ("Screed L2 — 60 mm") so the export is self-explanatory.',
        'Repeat for each part. With two or more extruded areas the panel shows the total volume.',
        'Copy or export the CSV: it has a Volume column next to the area and perimeter.',
      ] },
      { type: 'callout', variant: 'tip', text: 'A depth typed as negative — digging down — still gives a positive volume. Use the note field to say which way it goes ("excavation below formation").' },

      { type: 'h2', text: 'Three worked examples' },
      { type: 'table', headers: ['Question', 'Area', 'Height', 'Volume'], rows: [
        ['Screed on a 118 m² floor at 60 mm', '118 m² (floor face)', '0.06 m', '7.08 m³'],
        ['Lift pit 2.4 × 2.6 m, 1.4 m deep', '6.24 m² (traced)', '1.4 m', '8.74 m³'],
        ['Meeting room for 6 air changes per hour', '32 m² (floor face)', '2.7 m clear', '86.4 m³ → 518 m³/h'],
      ] },
      { type: 'p', text: 'The last line is the reason MEP engineers ask for room volumes: airflow is volume times air changes per hour. Use the clear height (floor to ceiling), not the storey height, or the airflow is oversized by the depth of the ceiling void.' },

      { type: 'h2', text: 'Where area × height stops being honest' },
      { type: 'ul', items: [
        'Sloping ground or a sloping formation — the depth is not one number. Split the area into parts of similar depth.',
        'Battered excavation sides — the top is larger than the bottom. Average the two areas (a prismoid) or use an earthworks tool.',
        'Non-planar outlines — if the traced points are not on one plane, the panel says the area is projected; the volume inherits that.',
        'Concrete orders — add waste, over-break and the volume of reinforcement as your practice does. The model gives the net figure.',
      ] },
      { type: 'callout', variant: 'info', text: ['A requirement works on volumes too: select the extruded area, choose "Volume" as the checked value and set "at most 8 m³" for a single pour, for example. The pass or fail travels with the measurement, as described in ', { text: 'checking clearances with pass or fail', to: 'check-clearances-ifc-model' }, '.'] },
    ],
  },
]
