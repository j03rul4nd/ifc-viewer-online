// ─── bcf.test.ts ────────────────────────────────────────────────────────────
// Guards the version-aware .bcfzip writer: BCF 2.1 (default) vs BCF 3.0, which
// differ in the version file and in where Comments/Viewpoints nest in markup.
// Asserts on the text entries directly (buildBcfTextEntries) — no unzip needed.

import { describe, it, expect } from 'vitest'
import { buildBcfTextEntries } from './bcf'
import type { BcfTopic } from '../types'

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
