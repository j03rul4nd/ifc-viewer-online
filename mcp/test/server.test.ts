// @vitest-environment node
// The MCP server end to end over an in-memory transport: the tools an AI client
// sees, real validation and IDS on files from the repo, and the links it builds.
// Skipped when mcp/ has not had its own `npm install`.

import { existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// The workers point web-ifc at the app's served WASM; in Node the package finds its own.
// Mocked by path: the workers import the app's copy (root node_modules), not mcp's.
vi.mock('../../node_modules/web-ifc/web-ifc-api-node.js', async (orig) => {
  const m = await orig<typeof import('web-ifc')>()
  class IfcAPI extends m.IfcAPI { SetWasmPath(): void { /* Node default */ } }
  return { ...m, IfcAPI }
})

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const installed = existsSync(here('../node_modules/@modelcontextprotocol/sdk/package.json'))

interface Client { callTool(a: unknown): Promise<unknown>; listTools(): Promise<{ tools: Array<{ name: string; description?: string; annotations?: { readOnlyHint?: boolean } }> }>; close(): Promise<void> }
let client: Client

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(name: string, args: Record<string, unknown> = {}): Promise<{ isError?: boolean; data: any }> {
  const r = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: Array<{ text: string }> }
  const raw = r.content[0].text
  let data: unknown = raw
  try { data = JSON.parse(raw) } catch { /* an error message */ }
  return { isError: r.isError, data }
}

describe.skipIf(!installed)('ifc-viewer-mcp', () => {
  beforeAll(async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const sdkClient = await import('@modelcontextprotocol/sdk/client/index.js')
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { registerTools } = await import('../src/tools')
    const server = new McpServer({ name: 'ifc-viewer-mcp', version: 'test' })
    registerTools(server)
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const c = new sdkClient.Client({ name: 'test', version: '1' })
    await c.connect(b)
    client = c as unknown as Client
  })
  afterAll(async () => { await client?.close() })

  it('lists every tool with a description an assistant can act on', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_ids', 'list_digital_twins', 'list_validation_rules', 'open_3d_sketch', 'open_drawings',
      'open_in_3d_viewer', 'read_dxf', 'read_fiware_entities', 'search_port_library', 'validate_ifc',
    ])
    for (const t of tools) {
      expect(t.description!.length, t.name).toBeGreaterThan(120)
      expect(t.description, t.name).toMatch(/Use it /)
      expect(t.annotations?.readOnlyHint, t.name).toBe(true)
    }
  })

  it('validates an IFC on disk and scores it', async () => {
    const { isError, data } = await call('validate_ifc', { source: here('../../public/Ifc2x3_Duplex_Architecture.ifc'), maxIssues: 2 })
    expect(isError).toBeFalsy()
    expect(data.healthScore).toBeGreaterThanOrEqual(0)
    expect(data.healthScore).toBeLessThanOrEqual(100)
    expect(data.stats.total).toBeGreaterThan(0)
    expect(data.issues).toHaveLength(2)
    expect(data.moreIssues).toBe(data.stats.total - 2)
    expect(data.costliestRules[0].fixGuide).toMatch(/^https:\/\/www\.ifcvieweronline\.eu\/fix\//)
    // English labels, not the metadata's mixed-language defaults.
    expect(data.costliestRules.map((c: { label: string }) => c.label).join(' ')).not.toMatch(/Sin |Nombre/)
  }, 60_000)

  it('runs only the rules it is given', async () => {
    const { data } = await call('validate_ifc', { source: here('../../public/Ifc2x3_Duplex_Architecture.ifc'), rules: ['RULE_EMPTY_NAME'] })
    expect(Object.keys(data.stats.byRule).every((r) => r === 'RULE_EMPTY_NAME')).toBe(true)
  }, 60_000)

  it('checks an IFC against an IDS (buildingSMART test case)', async () => {
    const dir = '../../src/lib/ids/ids-fixtures/ids/'
    const { isError, data } = await call('check_ids', {
      ifc: here(dir + 'fail-a_specification_passes_only_if_all_requirements_pass_1_2.ifc'),
      ids: here(dir + 'fail-a_specification_passes_only_if_all_requirements_pass_1_2.ids'),
    })
    expect(isError).toBeFalsy()
    expect(data.failedSpecs).toBe(1)
    expect(data.specifications[0].status).toBe('fail')
  }, 60_000)

  it('reports a missing file as a tool error, not a crash', async () => {
    const { isError, data } = await call('validate_ifc', { source: here('./nope.ifc') })
    expect(isError).toBe(true)
    expect(data).toMatch(/ENOENT|no such file/i)
  })

  it('builds a viewer link and an embed for public models only', async () => {
    const { data } = await call('open_in_3d_viewer', { models: ['https://example.com/a.ifc', 'https://example.com/b.ifc'], view: 'top', map: true, isolate: 'IfcWall' })
    const url = new URL(data.viewerUrl)
    expect(url.origin).toBe('https://www.ifcvieweronline.eu')
    expect(url.searchParams.getAll('model')).toEqual(['https://example.com/a.ifc', 'https://example.com/b.ifc'])
    expect(url.searchParams.get('view')).toBe('top')
    expect(url.searchParams.get('map')).toBe('1')
    expect(url.searchParams.get('isolate')).toBe('IfcWall')
    expect(data.embedHtml).toMatch(/^<iframe src="https:\/\/www\.ifcvieweronline\.eu\/\?model=.*ui=article/)
    const local = await call('open_in_3d_viewer', { models: ['C:/models/a.ifc'] })
    expect(local.isError).toBe(true)
  })

  it('opens drawings with a plan cut', async () => {
    const { data } = await call('open_drawings', { models: ['https://example.com/a.ifc'] })
    expect(new URL(data.viewerUrl).searchParams.get('drawings')).toBe('plan')
  })

  it('summarises a DXF drawing', async () => {
    const dxf = [
      '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'WALLS', '10', '0', '20', '0', '11', '10', '21', '0',
      '0', 'LINE', '8', 'WALLS', '10', '10', '20', '0', '11', '10', '21', '5',
      '0', 'TEXT', '8', 'ROOMS', '10', '2', '20', '2', '40', '0.3', '1', 'Kitchen',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n')
    const file = join(mkdtempSync(join(tmpdir(), 'dxf-')), 'plan.dxf')
    writeFileSync(file, dxf)
    const { isError, data } = await call('read_dxf', { source: file })
    expect(isError).toBeFalsy()
    expect(data.metresPerUnit).toBe(1)
    expect(data.byKind).toMatchObject({ line: 2, text: 1 })
    expect(data.layers.find((l: { name: string }) => l.name === 'WALLS').entities).toBe(2)
    expect(data.texts).toEqual(['Kitchen'])
    expect(data.extents).toMatchObject({ minX: 0, maxX: 10, widthM: 10 })
  })

  it('lists the twins, the sketch studio and the twin builder', async () => {
    const twins = await call('list_digital_twins')
    expect(twins.data.scenes.map((s: { id: string }) => s.id)).toContain('barcelona-placa-catalunya')
    for (const s of twins.data.scenes) {
      // Each scene link points at a scene file that ships with the viewer.
      expect(existsSync(here(`../../public/scenes/${s.id}.scene.json`)), s.id).toBe(true)
      expect(new URL(s.url).searchParams.get('scene')).toBe(`https://www.ifcvieweronline.eu/scenes/${s.id}.scene.json`)
    }
    expect(twins.data.twinBuilder).toBe('https://www.ifcvieweronline.eu/twin-builder/')
    expect((await call('open_3d_sketch')).data.url).toBe('https://www.ifcvieweronline.eu/sketch/')
  })

  it('searches the Port de Barcelona library', async () => {
    const { data } = await call('search_port_library', { query: 'grua', limit: 3 })
    expect(data.total).toBeGreaterThan(0)
    expect(data.results.length).toBeLessThanOrEqual(3)
    const hosted = data.results.find((r: { ifcUrl?: string }) => r.ifcUrl)
    expect(hosted.ifcUrl).toMatch(/^https:\/\/www\.ifcvieweronline\.eu\/models\/port-bcn\//)
    expect(new URL(hosted.viewerUrl).searchParams.get('model')).toBe(hosted.ifcUrl)
    expect(data.license).toMatch(/CC BY 4\.0/)
  })

  it('reads FIWARE entities into flat records', async () => {
    const body = [{ id: 'urn:ngsi-ld:AirQualityObserved:1', type: 'AirQualityObserved', NO2: { type: 'Property', value: 41, unitCode: 'GQ', observedAt: '2026-11-01T10:00:00Z' }, location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [2.17, 41.39] } } }]
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const { isError, data } = await call('read_fiware_entities', { broker: 'https://broker.example.com:1026', type: 'AirQualityObserved' })
    expect(isError).toBeFalsy()
    expect(fetchMock.mock.calls[0][0]).toBe('https://broker.example.com:1026/ngsi-ld/v1/entities?limit=1000&type=AirQualityObserved')
    expect(data.entities[0]).toMatchObject({ id: body[0].id, NO2: 41, NO2_unit: 'GQ', lat: 41.39, lon: 2.17 })
    fetchMock.mockRestore()
  })
})
