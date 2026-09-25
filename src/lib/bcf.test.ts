// ─── bcf.test.ts ────────────────────────────────────────────────────────────
// Guards the version-aware .bcfzip writer: BCF 2.1 (default) vs BCF 3.0, which
// differ in the version file and in where Comments/Viewpoints nest in markup.
// Asserts on the text entries directly (buildBcfTextEntries) — no unzip needed.
//
// And the viewpoint frame: the app holds viewpoints in scene axes (y up), a
// .bcfv is in IFC world axes (Z up). Every other BCF tool reads the file, so
// the numbers IN THE XML are what is checked, not just a round trip — a round
// trip through a writer and a parser that both forget to convert passes too.

import { describe, it, expect } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { buildBcfTextEntries, exportBcfZip } from './bcf'
import {
  clippingPlanesFromCuts, cutsFromClippingPlanes, sceneUpFor, viewpointFromBcf, viewpointToBcf,
} from './bcf-viewpoint'
import { parseBcfParserMsg } from './worker-schemas'
import { bytesToBase64, parseBcfZip, parseViewpoint } from '../workers/bcf-parser.worker'
import type { BcfTopic, BcfViewpoint, Vec3Like } from '../types'

function sampleTopic(): BcfTopic {
  return {
    guid:           '3a1b2c3d-0000-0000-0000-000000000001',
    title:          'Wall missing fire rating',
    description:    'IfcWall has no FireRating',
    status:         'Open',
    topicType:      'Error',
    priority:       'High',
    creationDate:   '2026-06-07T10:00:00.000Z',
    creationAuthor: 'tester',
    labels:         ['fire', 'mep'],
    viewpoints: [{
      guid:            'aaaaaaaa-0000-0000-0000-000000000002',
      cameraPosition:  { x: 1, y: 2, z: 3 },
      cameraDirection: { x: 0, y: 0, z: -1 },
      cameraUp:        { x: 0, y: 1, z: 0 },
      fieldOfView:     60,
      componentGuids:  ['1Abc$DefGHI0jklMNOpqrs'],
    }],
    comments: [{
      guid:   'cccccccc-0000-0000-0000-000000000003',
      date:   '2026-06-07T10:05:00.000Z',
      author: 'reviewer',
      text:   'Please fix before handover',
    }],
    source: 'imported',
  }
}

const GUID = sampleTopic().guid

describe('buildBcfTextEntries', () => {
  it('writes BCF 2.1 by default — Comment/Viewpoints are siblings of Topic', () => {
    const e      = buildBcfTextEntries([sampleTopic()])
    const ver    = e['bcf.version']
    const markup = e[`${GUID}/markup.bcf`]
    const vp     = e[`${GUID}/viewpoint_0.bcfv`]

    expect(ver).toContain('VersionId="2.1"')
    expect(ver).toContain('<DetailedVersion>2.1</DetailedVersion>')

    // 2.1 uses the (oddly named) <Viewpoints Guid> element per viewpoint, and
    // does NOT wrap comments in a <Comments> container or use <ViewPoint>.
    expect(markup).toContain('<Viewpoints Guid=')
    expect(markup).not.toContain('<Comments>')
    expect(markup).not.toContain('<ViewPoint ')

    // 2.1 PerspectiveCamera omits AspectRatio (kept as-is for byte stability).
    expect(vp).not.toContain('<AspectRatio>')
  })

  it('writes BCF 3.0 — Comments + ViewPoint nested inside Topic, no DetailedVersion', () => {
    const e      = buildBcfTextEntries([sampleTopic()], '3.0')
    const ver    = e['bcf.version']
    const markup = e[`${GUID}/markup.bcf`]
    const vp     = e[`${GUID}/viewpoint_0.bcfv`]

    expect(ver).toContain('VersionId="3.0"')
    expect(ver).not.toContain('DetailedVersion')

    // 3.0 wraps comments and uses <ViewPoint> (capital P) inside <Viewpoints>.
    expect(markup).toContain('<Comments>')
    expect(markup).toContain('<ViewPoint Guid=')

    // Both blocks must be nested INSIDE <Topic> (i.e. before </Topic>).
    expect(markup.indexOf('<Comments>')).toBeGreaterThan(-1)
    expect(markup.indexOf('<Comments>')).toBeLessThan(markup.indexOf('</Topic>'))
    expect(markup.indexOf('<Viewpoints>')).toBeLessThan(markup.indexOf('</Topic>'))

    // 3.0 camera requires AspectRatio.
    expect(vp).toContain('<AspectRatio>')
  })

  it('markup never references a snapshot file when the viewpoint has none', () => {
    for (const version of ['2.1', '3.0'] as const) {
      const markup = buildBcfTextEntries([sampleTopic()], version)[`${GUID}/markup.bcf`]
      expect(markup).not.toContain('<Snapshot>')
    }
  })
})

// ── Viewpoint frame ─────────────────────────────────────────────────────────

/** The <X><Y><Z> of the first `tag` in `xml` (at or after `from`), as numbers. */
function xyzOf(xml: string, tag: string, from = 0): Vec3Like {
  const block = xml.slice(from).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? ''
  const n = (axis: string) => Number(block.match(new RegExp(`<${axis}>([^<]*)</${axis}>`))?.[1])
  return { x: n('X'), y: n('Y'), z: n('Z') }
}

function topicWith(vp: BcfViewpoint): BcfTopic {
  return { ...sampleTopic(), viewpoints: [vp] }
}

const bcfv = (vp: BcfViewpoint, version: '2.1' | '3.0' = '2.1'): string =>
  buildBcfTextEntries([topicWith(vp)], version)[`${GUID}/viewpoint_0.bcfv`]

/** A .bcfv as another tool writes it: IFC world axes, Z up. */
function foreignBcfv(parts: { pos: string; dir: string; up: string; planes?: string }): string {
  const v = (s: string) => {
    const [x, y, z] = s.split(' ')
    return `<X>${x}</X><Y>${y}</Y><Z>${z}</Z>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="bbbbbbbb-0000-0000-0000-000000000009">
  <PerspectiveCamera>
    <CameraViewPoint>${v(parts.pos)}</CameraViewPoint>
    <CameraDirection>${v(parts.dir)}</CameraDirection>
    <CameraUpVector>${v(parts.up)}</CameraUpVector>
    <FieldOfView>60</FieldOfView>
  </PerspectiveCamera>${parts.planes ?? ''}
</VisualizationInfo>`
}

describe('BCF viewpoint frame (scene y-up ↔ IFC Z-up)', () => {
  it('a camera looking straight down: IFC (0,0,−1) is scene (0,−1,0), and back', () => {
    const scene = viewpointFromBcf({ guid: 'g', cameraDirection: { x: 0, y: 0, z: -1 } })
    expect(scene.cameraDirection).toEqual({ x: 0, y: -1, z: 0 })
    expect(viewpointToBcf(scene).cameraDirection).toEqual({ x: 0, y: 0, z: -1 })

    // Same thing through the real parser, from a file another tool wrote: a
    // plan view from 30 m up, north to the top of the screen.
    const parsed = parseViewpoint(foreignBcfv({ pos: '10 20 30', dir: '0 0 -1', up: '0 1 0' }), 'g')
    expect(parsed.cameraDirection).toEqual({ x: 0, y: -1, z: 0 })
    expect(parsed.cameraPosition).toEqual({ x: 10, y: 30, z: -20 })
    expect(parsed.cameraUp).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('writes the camera in IFC axes — position, direction and up', () => {
    const xml = bcfv({
      guid: 'g',
      cameraPosition:  { x: 1, y: 2, z: 3 },   // 2 m up, 3 m south
      cameraDirection: { x: 0, y: 0, z: -1 },  // looking north, level
      cameraUp:        { x: 0, y: 1, z: 0 },
    })
    expect(xyzOf(xml, 'CameraViewPoint')).toEqual({ x: 1, y: -3, z: 2 })
    expect(xyzOf(xml, 'CameraDirection')).toEqual({ x: 0, y: 1, z: 0 })
    expect(xyzOf(xml, 'CameraUpVector')).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('still writes a camera for a viewpoint captured without an up vector', () => {
    // Before the up was recorded the writer returned '' for these, and the
    // markup pointed at a .bcfv that was never written.
    const down = bcfv({ guid: 'g', cameraPosition: { x: 0, y: 30, z: 0 }, cameraDirection: { x: 0, y: -1, z: 0 } })
    expect(down).toContain('<PerspectiveCamera>')
    expect(xyzOf(down, 'CameraUpVector')).toEqual({ x: 0, y: 1, z: 0 })  // north up, as on a plan

    const level = bcfv({ guid: 'g', cameraPosition: { x: 0, y: 2, z: 0 }, cameraDirection: { x: 1, y: 0, z: 0 } })
    expect(xyzOf(level, 'CameraUpVector')).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('derives an up at right angles to the view', () => {
    const d = { x: 0.6, y: -0.8, z: 0 }
    const up = sceneUpFor(d)
    expect(up.x * d.x + up.y * d.y + up.z * d.z).toBeCloseTo(0, 12)
    expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 12)
    expect(up.y).toBeGreaterThan(0)
  })

  it('write → parse gives the scene viewpoint back, in 2.1 and 3.0', () => {
    const vp: BcfViewpoint = {
      guid:            'aaaaaaaa-0000-0000-0000-000000000002',
      cameraPosition:  { x: 12.5, y: 7.25, z: -3 },
      cameraDirection: { x: 0.6, y: -0.8, z: 0 },
      cameraUp:        { x: 0.8, y: 0.6, z: 0 },
      fieldOfView:     45,
      clippingPlanes:  [{ location: { x: 4, y: 3, z: -5 }, direction: { x: 0, y: 1, z: 0 } }],
    }
    for (const version of ['2.1', '3.0'] as const) {
      const back = parseViewpoint(bcfv(vp, version), vp.guid)
      expect(back.cameraPosition).toEqual(vp.cameraPosition)
      expect(back.cameraDirection).toEqual(vp.cameraDirection)
      expect(back.cameraUp).toEqual(vp.cameraUp)
      expect(back.clippingPlanes).toEqual(vp.clippingPlanes)
    }
  })
})

describe('BCF clipping planes', () => {
  // A plan cut at 3 m that keeps what is below: the three.js normal points
  // DOWN (the kept side), so BCF's Direction points UP (the side cut away).
  const planCut = { point: { x: 4, y: 3, z: -5 }, normal: { x: 0, y: -1, z: 0 } }

  it('Direction is the cut-away side: −(kept normal)', () => {
    const [plane] = clippingPlanesFromCuts([planCut])
    expect(plane).toEqual({ location: { x: 4, y: 3, z: -5 }, direction: { x: 0, y: 1, z: 0 } })
    expect(cutsFromClippingPlanes([plane])).toEqual([planCut])
  })

  it('writes <ClippingPlanes> after the camera, in IFC axes, in 2.1 and 3.0', () => {
    for (const version of ['2.1', '3.0'] as const) {
      const xml = bcfv({
        guid: 'g',
        cameraPosition:  { x: 0, y: 30, z: 0 },
        cameraDirection: { x: 0, y: -1, z: 0 },
        clippingPlanes:  clippingPlanesFromCuts([planCut]),
      }, version)
      const at = xml.indexOf('<ClippingPlanes>')
      expect(at).toBeGreaterThan(xml.indexOf('</PerspectiveCamera>'))
      expect(at).toBeLessThan(xml.indexOf('</VisualizationInfo>'))
      expect(xml.match(/<ClippingPlane>/g)).toHaveLength(1)
      // 4 m east, 5 m north, 3 m up — and the cut-away side is up.
      expect(xyzOf(xml, 'Location', at)).toEqual({ x: 4, y: 5, z: 3 })
      expect(xyzOf(xml, 'Direction', at)).toEqual({ x: 0, y: 0, z: 1 })
    }
  })

  it('writes no <ClippingPlanes> element when nothing is cut', () => {
    const xml = bcfv({ guid: 'g', cameraPosition: { x: 0, y: 2, z: 0 }, cameraDirection: { x: 1, y: 0, z: 0 }, clippingPlanes: [] })
    expect(xml).toContain('<PerspectiveCamera>')
    expect(xml).not.toContain('ClippingPlane')
  })

  it('reads a plane from another tool as a cut that keeps the right side', () => {
    const xml = foreignBcfv({
      pos: '0 0 30', dir: '0 0 -1', up: '0 1 0',
      planes: `
  <ClippingPlanes>
    <ClippingPlane>
      <Location><X>0</X><Y>0</Y><Z>3</Z></Location>
      <Direction><X>0</X><Y>0</Y><Z>1</Z></Direction>
    </ClippingPlane>
  </ClippingPlanes>`,
    })
    const [cut] = cutsFromClippingPlanes(parseViewpoint(xml, 'g').clippingPlanes ?? [])
    expect(cut).toEqual({ point: { x: 0, y: 3, z: 0 }, normal: { x: 0, y: -1, z: 0 } })
    // Kept = positive signed distance. The ground floor stays, the roof goes.
    const side = (p: Vec3Like) =>
      cut.normal.x * (p.x - cut.point.x) + cut.normal.y * (p.y - cut.point.y) + cut.normal.z * (p.z - cut.point.z)
    expect(side({ x: 0, y: 1, z: 0 })).toBeGreaterThan(0)
    expect(side({ x: 0, y: 6, z: 0 })).toBeLessThan(0)
  })

  it('reads a file with no <ClippingPlanes> as "no cuts", not "unknown"', () => {
    const parsed = parseViewpoint(foreignBcfv({ pos: '0 0 30', dir: '0 0 -1', up: '0 1 0' }), 'g')
    expect(parsed.clippingPlanes).toEqual([])
  })

  it('survives the worker message schema (zod drops keys it does not know)', () => {
    const planes = clippingPlanesFromCuts([planCut])
    const parsed = parseBcfParserMsg({
      type: 'done', id: 'x', version: '2.1',
      topics: [{ ...sampleTopic(), viewpoints: [{ guid: 'g', clippingPlanes: planes }] }],
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.type === 'done') {
      expect(parsed.data.topics[0].viewpoints[0].clippingPlanes).toEqual(planes)
    }
  })
})

describe('BCF snapshot import', () => {
  it('encodes a snapshot of realistic size (one fromCharCode spread overflowed the stack)', () => {
    const png = new Uint8Array(1_000_000)
    for (let i = 0; i < png.length; i++) png[i] = (i * 31) & 0xff
    const b64 = bytesToBase64(png)
    expect(b64.length).toBe(Math.ceil(png.length / 3) * 4)
    // Base64 maps each 3 bytes to 4 characters, so any 3-aligned slice can be
    // checked on its own: the start, across the first chunk boundary, the end.
    const slice = (from: number, to: number) => btoa(String.fromCharCode(...png.subarray(from, to)))
    expect(b64.slice(0, 4000)).toBe(slice(0, 3000))
    expect(b64.slice(43_688, 43_696)).toBe(slice(32_766, 32_772))
    expect(b64.slice((996_000 / 3) * 4)).toBe(slice(996_000, png.length))
    expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('iVBORw==')
  })
})

// ── Import: .bcfzip → topics ────────────────────────────────────────────────

/** A 1×1 PNG, as a captured snapshot arrives from the viewer. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const asBuffer = (bytes: Uint8Array): ArrayBuffer => new Uint8Array(bytes).buffer

/** A .bcfzip of hand-written entries, as another tool would ship it. */
function zipOf(entries: Record<string, string>): ArrayBuffer {
  return asBuffer(zipSync(Object.fromEntries(Object.entries(entries).map(([path, xml]) => [path, strToU8(xml)]))))
}

/** Two viewpoints: the first with a snapshot and a selection, the second bare. */
function topicToImport(): BcfTopic {
  return {
    ...sampleTopic(),
    viewpoints: [
      {
        guid:            'aaaaaaaa-0000-0000-0000-000000000002',
        cameraPosition:  { x: 12.5, y: 7.25, z: -3 },
        cameraDirection: { x: 0.6, y: -0.8, z: 0 },
        cameraUp:        { x: 0.8, y: 0.6, z: 0 },
        fieldOfView:     60,
        componentGuids:  ['1Abc$DefGHI0jklMNOpqrs', '2O2Fr$t4X7Zf8NOew3FLOH'],
        snapshotBase64:  PNG,
      },
      {
        guid:            'dddddddd-0000-0000-0000-000000000004',
        cameraPosition:  { x: 0, y: 30, z: 0 },
        cameraDirection: { x: 0, y: -1, z: 0 },
        cameraUp:        { x: 0, y: 0, z: -1 },
      },
    ],
  }
}

describe('BCF import (parseBcfZip)', () => {
  it('reads back snapshot, selection and viewpoint Guid from its own 2.1 and 3.0 export', () => {
    for (const version of ['2.1', '3.0'] as const) {
      const sent = topicToImport()
      const { topics, version: read } = parseBcfZip(asBuffer(exportBcfZip([sent], version)))
      expect(read).toBe(version)
      expect(topics).toHaveLength(1)

      const [first, second] = topics[0].viewpoints
      expect(topics[0].viewpoints).toHaveLength(2)

      expect(first.guid).toBe(sent.viewpoints[0].guid)
      expect(first.snapshotBase64).toBe(PNG)
      expect(first.componentGuids).toEqual(sent.viewpoints[0].componentGuids)
      expect(first.cameraPosition).toEqual(sent.viewpoints[0].cameraPosition)
      expect(first.cameraDirection).toEqual(sent.viewpoints[0].cameraDirection)

      // The snapshot stays with its own viewpoint.
      expect(second.guid).toBe(sent.viewpoints[1].guid)
      expect(second.snapshotBase64).toBeUndefined()
      expect(second.componentGuids).toBeUndefined()
      expect(second.cameraPosition).toEqual(sent.viewpoints[1].cameraPosition)
    }
  })

  it('3.0: takes the viewpoint Guid from the markup <ViewPoint>, the one comments point at', () => {
    const topic = 'eeeeeeee-0000-0000-0000-000000000005'
    const { topics } = parseBcfZip(zipOf({
      'bcf.version': '<?xml version="1.0" encoding="UTF-8"?><Version VersionId="3.0" />',
      [`${topic}/markup.bcf`]: `<?xml version="1.0" encoding="UTF-8"?>
<Markup>
  <Topic Guid="${topic}" TopicType="Issue" TopicStatus="Open">
    <Title>Duct through beam</Title>
    <CreationDate>2026-09-25T10:00:00Z</CreationDate>
    <Comments>
      <Comment Guid="cccccccc-0000-0000-0000-000000000006">
        <Date>2026-09-25T10:05:00Z</Date>
        <Author>coordinator</Author>
        <Comment>See view</Comment>
        <Viewpoint Guid="11111111-0000-0000-0000-000000000007" />
      </Comment>
    </Comments>
    <Viewpoints>
      <ViewPoint Guid="11111111-0000-0000-0000-000000000007">
        <Viewpoint>Viewpoint_A.bcfv</Viewpoint>
        <Snapshot>Snapshot_A.jpg</Snapshot>
        <Index>0</Index>
      </ViewPoint>
    </Viewpoints>
  </Topic>
</Markup>`,
      // Its file carries no Guid of its own, so only the markup can name it.
      [`${topic}/Viewpoint_A.bcfv`]: foreignBcfv({ pos: '10 20 30', dir: '0 0 -1', up: '0 1 0' })
        .replace(' Guid="bbbbbbbb-0000-0000-0000-000000000009"', ''),
      [`${topic}/Snapshot_A.jpg`]: 'jpeg bytes',
    }))

    const [vp] = topics[0].viewpoints
    expect(topics[0].viewpoints).toHaveLength(1)
    expect(vp.guid).toBe('11111111-0000-0000-0000-000000000007')
    expect(vp.snapshotBase64).toBe(`data:image/jpeg;base64,${btoa('jpeg bytes')}`)
    expect(vp.cameraPosition).toEqual({ x: 10, y: 30, z: -20 })
  })

  it('still reads every .bcfv when the markup lists no viewpoint', () => {
    const topic = 'ffffffff-0000-0000-0000-000000000008'
    const { topics } = parseBcfZip(zipOf({
      [`${topic}/markup.bcf`]: `<Markup><Topic Guid="${topic}"><Title>Bare</Title></Topic></Markup>`,
      [`${topic}/viewpoint.bcfv`]: foreignBcfv({ pos: '0 0 30', dir: '0 0 -1', up: '0 1 0' }),
    }))
    expect(topics[0].viewpoints.map((vp) => vp.guid)).toEqual(['bbbbbbbb-0000-0000-0000-000000000009'])
  })
})

describe('BCF import: comments', () => {
  /** Two comments, one on a viewpoint and one not, in text the export has to escape. */
  function topicWithComments(): BcfTopic {
    const topic = topicToImport()
    return {
      ...topic,
      title:          'Duct & beam <clash>',
      description:    'Level 2 "east" core: 5 < 10 & 10 > 5',
      topicType:      'Clash & coordination',
      creationAuthor: 'R&D <coordination>',
      labels:         ['fire & smoke', '<mep>'],
      comments: [
        {
          guid:          'cccccccc-0000-0000-0000-000000000003',
          date:          '2026-06-07T10:05:00.000Z',
          author:        'reviewer & co',
          text:          'Pipe < beam soffit & insulation "missing"',
          viewpointGuid: topic.viewpoints[1].guid,
        },
        {
          guid:   'cccccccc-0000-0000-0000-000000000010',
          date:   '2026-06-08T09:00:00.000Z',
          author: 'modeller <MEP>',
          text:   'Rerouted: clearance 50 mm > 25 mm & <ok>',
        },
      ],
    }
  }

  it('reads each comment whole, with its viewpoint, from its own 2.1 and 3.0 export', () => {
    for (const version of ['2.1', '3.0'] as const) {
      const sent = topicWithComments()
      const [topic] = parseBcfZip(asBuffer(exportBcfZip([sent], version))).topics

      // Text, author, date, Guid and viewpoint Guid of each, in order. The
      // inner <Comment> used to end the outer one: text took the <Date> and
      // <Author> with it, and the <Viewpoint> after it was never read.
      expect(topic.comments, version).toEqual(sent.comments)
      expect(topic.comments[1].viewpointGuid, version).toBeUndefined()
      expect(topic.viewpoints.map((vp) => vp.guid), version).toContain(topic.comments[0].viewpointGuid)
    }
  })

  it('decodes the entities the export escapes in title, description, author and labels', () => {
    for (const version of ['2.1', '3.0'] as const) {
      const sent = topicWithComments()
      const [topic] = parseBcfZip(asBuffer(exportBcfZip([sent], version))).topics
      expect(topic.title, version).toBe(sent.title)
      expect(topic.description, version).toBe(sent.description)
      expect(topic.topicType, version).toBe(sent.topicType)
      expect(topic.creationAuthor, version).toBe(sent.creationAuthor)
      expect(topic.labels, version).toEqual(sent.labels)
    }
  })

  it('decodes &apos; and character references another tool writes, once', () => {
    const topic = 'eeeeeeee-0000-0000-0000-000000000011'
    const { topics } = parseBcfZip(zipOf({
      [`${topic}/markup.bcf`]: `<?xml version="1.0" encoding="UTF-8"?>
<Markup>
  <Topic Guid="${topic}"><Title>Bare</Title></Topic>
  <Comment Guid="cccccccc-0000-0000-0000-000000000012">
    <Date>2026-09-25T10:05:00Z</Date>
    <Author>O&apos;Neil</Author>
    <Comment>Gap &#8804; 5&#160;cm&#xD;&#xA;written as &amp;lt;</Comment>
  </Comment>
</Markup>`,
    }))
    expect(topics[0].comments).toEqual([{
      guid:   'cccccccc-0000-0000-0000-000000000012',
      date:   '2026-09-25T10:05:00Z',
      author: "O'Neil",
      text:   'Gap ≤ 5 cm\r\nwritten as &lt;',
    }])
  })
})

describe('BCF import: selected components', () => {
  /** A .bcfv selection as Solibri or BIMcollab write it. */
  const solibriBcfv = `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="bbbbbbbb-0000-0000-0000-000000000009">
  <Components>
    <ViewSetupHints SpacesVisible="false" SpaceBoundariesVisible="false" OpeningsVisible="false" />
    <Selection>
      <Component IfcGuid="2O2Fr$t4X7Zf8NOew3FLOH"/>
      <Component IfcGuid="0K7w7JN4X3$9mQNZm2mLUx" />
      <Component IfcGuid="1hOSvn6df7F8_7GcBWlRGQ">
        <OriginatingSystem>Solibri</OriginatingSystem>
        <AuthoringToolId>4711</AuthoringToolId>
      </Component>
    </Selection>
    <Visibility DefaultVisibility="true">
      <Exceptions>
        <Component IfcGuid="3cUkl32yn9qRSPvBJVyWYp"/>
      </Exceptions>
    </Visibility>
    <Coloring>
      <Color Color="FFFF0000">
        <Component IfcGuid="0uB1pNZB5ExBw1m$rOoGSg"/>
      </Color>
    </Coloring>
  </Components>
  <PerspectiveCamera>
    <CameraViewPoint><X>0</X><Y>0</Y><Z>30</Z></CameraViewPoint>
    <CameraDirection><X>0</X><Y>0</Y><Z>-1</Z></CameraDirection>
    <CameraUpVector><X>0</X><Y>1</Y><Z>0</Z></CameraUpVector>
    <FieldOfView>60</FieldOfView>
  </PerspectiveCamera>
</VisualizationInfo>`

  it('reads self-closing and paired <Component>s, only those under <Selection>', () => {
    expect(parseViewpoint(solibriBcfv, 'g').componentGuids).toEqual([
      '2O2Fr$t4X7Zf8NOew3FLOH',
      '0K7w7JN4X3$9mQNZm2mLUx',
      '1hOSvn6df7F8_7GcBWlRGQ',
    ])
  })

  it('leaves componentGuids unset when nothing is selected', () => {
    const hidden = solibriBcfv.replace(/<Selection>[\s\S]*?<\/Selection>/, '<Selection />')
    expect(parseViewpoint(hidden, 'g').componentGuids).toBeUndefined()
  })
})
