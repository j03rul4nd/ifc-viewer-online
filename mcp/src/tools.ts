// ─── tools.ts ─────────────────────────────────────────────────────────────────
// The MCP tools. Everything runs on the user's machine or in their browser:
// validation and IDS read the file locally, the viewer links open the free
// browser app, and nothing is sent to a server of ours.

import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { DEFAULT_RULES, RULE_METADATA, getRuleLabel, getRuleDescription } from '../../src/types'
import type { RulesConfig } from '../../src/types'
import { parseDxf, decodeDxf, dwgVersion } from '../../src/lib/drawing/dxf-parse'
import { ngsiUrl, ngsiHeaders, ngsiEntities, ngsiRecord, type NgsiConfig } from '../../src/lib/twin/ngsi'
import { validateIfc, checkIds } from './engine'
import {
  SITE, viewerUrl, embedHtml, fixGuideUrl, SKETCH_URL, TWIN_SCENES, TWIN_BUILDER_URL, portSearch,
} from './links'

const MAX_BYTES = 512 * 1024 * 1024

/** A local path or an http(s) URL → bytes. */
export async function readSource(source: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`Could not download ${source}: HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) throw new Error('The file is larger than 512 MB.')
    return buf
  }
  return new Uint8Array(await readFile(source.replace(/^file:\/\//i, '')))
}

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] })

const source = z.string().min(1).describe('Path to a local file (absolute, or relative to where the server runs) or a public http(s) URL.')
const models = z.array(z.string().url()).min(1).describe('Public http(s) URLs of IFC files. Several URLs load together as one federated scene. Local paths do not work here: the browser has to download the file.')
const lang = z.string().optional().describe('Interface language: en, es, ca, fr, de, it, pt, ja, zh or th.')

export function registerTools(server: McpServer): void {
  // ── Validation, Health Score, IDS ───────────────────────────────────────────

  server.registerTool('validate_ifc', {
    title: 'Validate an IFC file and get its Health Score',
    description:
      'Check an IFC (BIM) model against the IFC Viewer Online rule set — schema, spatial structure, names, GlobalIds, ISO 19650, classification, MEP and more — and return its Health Score (0–100, higher is better), issue counts, the rules that cost the most points and the first issues with links to fix guides. Runs locally on this machine; the file is not uploaded anywhere. Use it when the user asks whether a model is OK, what is wrong with it, or how good it is.',
    inputSchema: {
      source,
      maxIssues: z.number().int().min(0).max(500).default(30).describe('How many issues to list (the counts always cover all of them).'),
      rules: z.array(z.string()).optional().describe('Run only these rule ids (see list_validation_rules). Default: the viewer\'s default rules.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ source: src, maxIssues, rules }) => {
    try {
      const bytes = await readSource(src)
      let config: RulesConfig = DEFAULT_RULES
      if (rules?.length) {
        config = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, rules.includes(k)])) as RulesConfig
      }
      const { healthScore, result, scoreBreakdown } = await validateIfc(bytes, config)
      return text({
        healthScore,
        verdict: healthScore >= 90 ? 'good' : healthScore >= 70 ? 'needs work' : 'poor',
        stats: result.stats,
        unreadableEntities: result.unreadableEntities ?? 0,
        durationMs: result.durationMs,
        costliestRules: scoreBreakdown.slice(0, 8).map((c) => ({ ...c, penalty: Math.round(c.penalty * 10) / 10, label: getRuleLabel(c.ruleId), fixGuide: fixGuideUrl(c.ruleId) })),
        issues: result.issues.slice(0, maxIssues).map((i) => ({ ruleId: i.ruleId, severity: i.severity, message: i.message, element: i.ifcClass ? `${i.ifcClass} #${i.expressId}${i.elementName ? ` "${i.elementName}"` : ''}` : undefined, globalId: i.globalId ?? undefined })),
        moreIssues: Math.max(0, result.issues.length - maxIssues),
        openInViewer: /^https?:\/\//i.test(src) ? viewerUrl({ models: [src] }) : `${SITE}/ (drop the file on the page to see these issues in 3D)`,
      })
    } catch (e) { return fail(e) }
  })

  server.registerTool('list_validation_rules', {
    title: 'List the IFC validation rules',
    description: 'List every rule validate_ifc can run: its id, category, severity and whether it is on by default. Use it to pick rules for validate_ifc or to explain what a rule checks.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => text(Object.entries(RULE_METADATA).map(([id, m]) => ({ id, label: getRuleLabel(id), category: m.category, description: getRuleDescription(id), severity: m.defaultSeverity, standard: m.standard, default: (DEFAULT_RULES as Record<string, boolean>)[id] === true }))))

  server.registerTool('check_ids', {
    title: 'Check an IFC file against IDS requirements',
    description:
      'Check an IFC model against an IDS file (buildingSMART Information Delivery Specification 1.0) and return, per specification, pass/fail, how many elements applied, passed and failed, and the first failures with the element and the reason. Runs locally; nothing is uploaded. Use it when the user has an .ids file, or exchange requirements to verify a delivery against.',
    inputSchema: {
      ifc: source.describe('The IFC model: local path or public http(s) URL.'),
      ids: z.string().min(1).describe('The IDS: local path, public URL, or the IDS XML text itself.'),
      maxFailures: z.number().int().min(0).max(200).default(10).describe('Failures to list per specification.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ ifc, ids, maxFailures }) => {
    try {
      const xml = ids.trimStart().startsWith('<') ? ids : new TextDecoder().decode(await readSource(ids))
      const { doc, result } = await checkIds(await readSource(ifc), xml)
      return text({
        title: doc.title ?? result.title,
        modelSchema: result.modelSchema,
        score: result.score,
        totalSpecs: result.totalSpecs, passedSpecs: result.passedSpecs, failedSpecs: result.failedSpecs, notApplicable: result.naSpecs,
        specifications: result.specs.map((s) => ({
          name: s.name, status: s.status, applicable: s.applicableCount, passed: s.passedCount, failed: s.failedCount,
          unsupported: s.unsupported.length ? s.unsupported : undefined,
          failures: s.failures.slice(0, maxFailures),
        })),
      })
    } catch (e) { return fail(e) }
  })

  // ── 3D viewer and embed ─────────────────────────────────────────────────────

  server.registerTool('open_in_3d_viewer', {
    title: 'Open IFC models in the 3D viewer',
    description:
      'Build a link that opens one or more public IFC files in the free IFC Viewer Online 3D viewer (runs in the browser: orbit, section, measure, properties, validation with Health Score badge). Optional: drop them on the city map, isolate a class, pick a camera view, open a floor plan in the drawings pane, add point clouds. Also returns an <iframe> to embed the same view in a web page, wiki or dashboard. Use it whenever the user wants to see, show, share or embed a model in 3D. Give the link to the user to click; this tool does not open a window by itself.',
    inputSchema: {
      models,
      view: z.enum(['iso', 'top', 'front', 'back', 'left', 'right', 'bottom']).optional().describe('Camera view once the models load.'),
      map: z.boolean().optional().describe('Place the models on the 3D city map at their own georeference.'),
      isolate: z.string().optional().describe('Show only this IFC class, e.g. IfcWall, IfcDoor, IfcSpace.'),
      ui: z.enum(['full', 'minimal', 'kiosk', 'client', 'article']).optional().describe('Interface preset: full (all panels), minimal, kiosk (no chrome), client (read-only for clients), article (for embedding in pages).'),
      validate: z.boolean().optional().describe('Run validation after loading (default true).'),
      scans: z.array(z.string().url()).optional().describe('Public point-cloud URLs (LAS/LAZ/E57/PLY…) to load with the models.'),
      lang,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => {
    try {
      return text({ viewerUrl: viewerUrl(a), embedHtml: embedHtml(a), note: 'The viewer downloads the files itself, so their host must allow cross-origin requests (CORS). Without a public URL, the user can open ' + SITE + ' and drop the file on the page.' })
    } catch (e) { return fail(e) }
  })

  // ── Technical drawings ──────────────────────────────────────────────────────

  server.registerTool('open_drawings', {
    title: 'Open technical drawings next to a model',
    description:
      'Build a link that opens IFC models with the drawings pane beside the 3D view and a floor plan already cut from the model. In that pane the user can also drop DXF or PDF drawings, place them over the model, calibrate the scale, compare plan against model, add dimensions and text, and export to DXF, SVG or PDF. Use it when the user wants a 2D plan, to check a drawing against the model, or to mark up a sheet.',
    inputSchema: { models, lang },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => {
    try {
      return text({ viewerUrl: viewerUrl({ ...a, drawingsPlan: true }), howTo: 'Open the link: the left pane shows a plan cut through the model. Drop a .dxf or .pdf on it to place an existing drawing; use Calibrate and Align to fit it; Export saves DXF, SVG or PDF.' })
    } catch (e) { return fail(e) }
  })

  server.registerTool('read_dxf', {
    title: 'Summarise a DXF drawing',
    description:
      'Read a DXF drawing (ASCII, R12 to current) and summarise it: DXF version, units, layers with how many entities each, entity types, drawing extents and the text found on it (room names, labels, title block). Runs locally. Use it to tell what a drawing contains before placing it next to a model with open_drawings. DWG is detected but not read: ask the user to save it as DXF.',
    inputSchema: { source, maxTexts: z.number().int().min(0).max(1000).default(50).describe('How many text strings to return.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ source: src, maxTexts }) => {
    try {
      const bytes = await readSource(src)
      const dwg = dwgVersion(bytes)
      if (dwg) return fail(new Error(`This is a DWG file (${dwg}). Save it as DXF from the CAD program, or open it in ${SITE}/ to view it.`))
      return text(summariseDxf(decodeDxf(bytes), maxTexts))
    } catch (e) { return fail(e) }
  })

  // ── 3D sketch ───────────────────────────────────────────────────────────────

  server.registerTool('open_3d_sketch', {
    title: 'Open the 3D sketch studio',
    description:
      'Link to the 3D sketch studio: draw strokes in 3D space with a pen, finger or mouse — over a blank canvas or around a model — on a phone, tablet, foldable or desktop, and export to SVG, PSD, ORA or Blender. Free, in the browser, no account. Use it when the user wants to sketch an idea, mark up a design in 3D or make a concept drawing.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => text({ url: SKETCH_URL, foldable: `${SKETCH_URL}?split=1`, note: 'Sketches stay in the browser that made them. ?split=1 opens the two-pane layout for foldables and dual-screen phones.' }))

  // ── Digital twins ───────────────────────────────────────────────────────────

  server.registerTool('list_digital_twins', {
    title: 'List live digital twin scenes',
    description:
      'List the ready-made city digital twins (Barcelona, Helsinki, Tokyo): georeferenced IFC models on terrain and the OpenStreetMap city, painted with live open data (bikes, EV chargers, traffic, air quality, trains). Each has a link and an embed link. Also returns the link to the twin builder, where the user builds their own twin (AGV warehouse, import tracking) from a CSV or live feed. Use it when the user asks for a digital twin demo or wants to start one.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => text({ scenes: TWIN_SCENES, twinBuilder: TWIN_BUILDER_URL, sceneFormat: 'A scene is one JSON (models, data layers, live device bindings, map, camera). Host your own and open it with ' + SITE + '/?scene=<url>.' }))

  server.registerTool('read_fiware_entities', {
    title: 'Read entities from a FIWARE context broker',
    description:
      'Read entities from a FIWARE context broker (Orion, Orion-LD, Scorpio, Stellio) over NGSI-LD or NGSIv2 and return them as flat records (id, type, each attribute value with its unit, lat/lon, observedAt) — the same shape the viewer\'s twin panel binds to IFC elements. The request goes from this machine straight to the broker. Use it to see what live data a broker offers before linking it to a model.',
    inputSchema: {
      broker: z.string().url().describe('Broker root, e.g. https://orion.example.com:1026'),
      api: z.enum(['ld', 'v2']).default('ld').describe('ld = NGSI-LD, v2 = NGSIv2.'),
      type: z.string().default('').describe('Entity type, e.g. AirQualityObserved, ParkingSpot. NGSI-LD needs one.'),
      tenant: z.string().default('').describe('NGSILD-Tenant / Fiware-Service, if the broker uses one.'),
      servicePath: z.string().default('').describe('Fiware-ServicePath (NGSIv2 only).'),
      context: z.string().default('').describe('JSON-LD @context URL (NGSI-LD), for short attribute names.'),
      limit: z.number().int().min(1).max(1000).default(20).describe('How many entities to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ limit, ...c }) => {
    try {
      const cfg = c as NgsiConfig
      const url = ngsiUrl(cfg)
      const res = await fetch(url, { headers: { Accept: 'application/json', ...ngsiHeaders(cfg) } })
      if (!res.ok) throw new Error(`The broker answered HTTP ${res.status} for ${url}`)
      const entities = ngsiEntities(await res.json())
      if (!entities) throw new Error('The answer is not a list of NGSI entities.')
      return text({ url, count: entities.length, entities: entities.slice(0, limit).map(ngsiRecord) })
    } catch (e) { return fail(e) }
  })

  server.registerTool('search_port_library', {
    title: 'Search the Port de Barcelona IFC library',
    description:
      'Search the Port de Barcelona BIM object library (cranes, bollards, fenders, signs, buildings… IFC, CC BY 4.0) by words and category. Each hit has its IFC download URL and a link that opens it in the 3D viewer. Use it when the user needs port or maritime infrastructure objects for a model or twin.',
    inputSchema: {
      query: z.string().default('').describe('Words to look for in the object name, e.g. "grua", "bolardo", "crane". Empty lists everything.'),
      category: z.string().optional().describe('Only this category (the answer lists them).'),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, category, limit }) => text({ ...portSearch(query, category, limit), license: 'CC BY 4.0 — Port de Barcelona' }))
}

/** What a DXF holds, in a form an assistant can talk about. */
export function summariseDxf(dxfText: string, maxTexts = 50) {
  const r = parseDxf(dxfText)
  const perLayer = new Map<string, number>()
  const kinds: Record<string, number> = {}
  const texts: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (p: { x: number; y: number }) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  for (const e of r.entities) {
    perLayer.set(e.layer, (perLayer.get(e.layer) ?? 0) + 1)
    kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
    if (e.kind === 'line') { grow(e.a); grow(e.b) }
    else if (e.kind === 'polyline' || e.kind === 'fill') e.points.forEach(grow)
    else if (e.kind === 'circle' || e.kind === 'arc') { grow({ x: e.c.x - e.r, y: e.c.y - e.r }); grow({ x: e.c.x + e.r, y: e.c.y + e.r }) }
    else if (e.kind === 'text') { grow(e.at); if (texts.length < maxTexts && e.text.trim()) texts.push(e.text.trim()) }
    else grow(e.at)
  }
  const m = r.metresPerUnit
  return {
    version: r.version,
    metresPerUnit: m,
    entities: r.entities.length,
    byKind: kinds,
    layers: r.layers.map((l) => ({ name: l.name, color: l.color, visible: l.visible, entities: perLayer.get(l.name) ?? 0 })),
    extents: Number.isFinite(minX) ? { minX, minY, maxX, maxY, widthM: m ? (maxX - minX) * m : undefined, heightM: m ? (maxY - minY) * m : undefined } : null,
    texts,
    skipped: r.skipped,
  }
}
