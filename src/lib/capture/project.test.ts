import { describe, expect, it } from 'vitest'
import {
  addSource, beatTimes, clipIndexAt, createClip, createProject, framingRect, layoutClips,
  moveClip, projectDuration, removeClip, sampleProject, setAllTransitions, snapCutsToBeats,
  splitAt, trimClipEdge, updateClip, type EditProject, type MediaSource,
} from './project'

const src = (id: string, durationSec = 10): MediaSource => ({ id, kind: 'capture', label: id, durationSec, width: 1920, height: 1080 })

/** Three 10 s sources, one clip each, in order. */
function three(): EditProject {
  let p = createProject()
  p = addSource(p, src('a'))
  p = addSource(p, src('b'))
  p = addSource(p, src('c'))
  return p
}

describe('layout', () => {
  it('butts clips end to end on cuts', () => {
    const p = three()
    expect(layoutClips(p).map((x) => [x.start, x.end])).toEqual([[0, 10], [10, 20], [20, 30]])
    expect(projectDuration(p)).toBe(30)
  })

  it('overlapping transitions pull the next clip in and shorten the project', () => {
    const p = setAllTransitions(three(), 'crossfade', 1)
    expect(layoutClips(p).map((x) => x.start)).toEqual([0, 9, 18])
    expect(projectDuration(p)).toBe(28)
  })

  it('dips do not overlap: duration is unchanged', () => {
    expect(projectDuration(setAllTransitions(three(), 'dipBlack', 1))).toBe(30)
  })

  it('never lets a transition exceed half of either neighbour', () => {
    let p = createProject()
    p = addSource(p, src('a', 1))
    p = addSource(p, src('b', 10))
    p = setAllTransitions(p, 'crossfade', 1.5)
    expect(layoutClips(p)[1].transitionSec).toBe(0.5)
  })

  it('speed changes the time a clip occupies', () => {
    const p = three()
    const fast = updateClip(p, p.clips[0].id, { speed: 2 })
    expect(projectDuration(fast)).toBe(25)
    const slow = updateClip(p, p.clips[0].id, { speed: 0.5 })
    expect(projectDuration(slow)).toBe(40)
  })
})

describe('sampling', () => {
  it('maps project time to source time through in-point and speed', () => {
    let p = three()
    p = updateClip(p, p.clips[1].id, { inSec: 2, speed: 2 })
    const s = sampleProject(p, 11) // 1 s into clip b
    expect(s.primary?.clip.sourceId).toBe('b')
    expect(s.primary?.sourceTime).toBe(4)
  })

  it('shows both clips, with progress, during a crossfade', () => {
    const p = setAllTransitions(three(), 'crossfade', 1)
    const s = sampleProject(p, 9.5)
    expect(s.outgoing?.clip.sourceId).toBe('a')
    expect(s.primary?.clip.sourceId).toBe('b')
    expect(s.transition).toBe('crossfade')
    expect(s.transitionProgress).toBeCloseTo(0.5)
  })

  it('a dip is full colour exactly on the join and clear either side of it', () => {
    const p = setAllTransitions(three(), 'dipWhite', 1)
    expect(sampleProject(p, 10).cover).toEqual({ amount: 1, color: '#ffffff' })
    expect(sampleProject(p, 9.5).cover.amount).toBeCloseTo(0)
    expect(sampleProject(p, 12).cover.amount).toBe(0)
  })

  it('applies intro and outro fades', () => {
    const p = { ...three(), intro: { type: 'black' as const, sec: 1 }, outro: { type: 'white' as const, sec: 1 } }
    expect(sampleProject(p, 0).cover).toEqual({ amount: 1, color: '#000000' })
    expect(sampleProject(p, 29.5).cover.color).toBe('#ffffff')
  })
})

describe('editing', () => {
  it('splits the clip under the playhead into two contiguous halves', () => {
    const p = splitAt(three(), 14)
    expect(p.clips).toHaveLength(4)
    expect([p.clips[1].inSec, p.clips[1].outSec, p.clips[2].inSec, p.clips[2].outSec]).toEqual([0, 4, 4, 10])
    expect(projectDuration(p)).toBe(30)
  })

  it('refuses a split that would leave a sliver', () => {
    expect(splitAt(three(), 10.1).clips).toHaveLength(3)
  })

  it('ripple-deletes and reorders', () => {
    const p = three()
    const del = removeClip(p, p.clips[1].id)
    expect(del.clips.map((c) => c.sourceId)).toEqual(['a', 'c'])
    expect(projectDuration(del)).toBe(20)
    expect(moveClip(p, p.clips[2].id, 0).clips.map((c) => c.sourceId)).toEqual(['c', 'a', 'b'])
  })

  it('trims an edge through the clip speed, and never past the source', () => {
    let p = three()
    p = updateClip(p, p.clips[0].id, { speed: 2 })
    p = trimClipEdge(p, p.clips[0].id, 'end', -1) // 1 output second = 2 source seconds
    expect(p.clips[0].outSec).toBe(8)
    p = trimClipEdge(p, p.clips[0].id, 'end', 100)
    expect(p.clips[0].outSec).toBe(10)
  })

  it('finds the clip under the playhead', () => {
    expect(clipIndexAt(three(), 25)).toBe(2)
    expect(clipIndexAt(three(), 99)).toBe(-1)
  })
})

describe('framing', () => {
  it('a 9:16 crop of a 16:9 source is full height, centred', () => {
    const r = framingRect({ cx: 0.5, cy: 0.5, zoom: 1 }, 1920, 1080, 9 / 16)
    expect(r.sh).toBe(1080)
    expect(r.sw).toBeCloseTo(607.5)
    expect(r.sx).toBeCloseTo((1920 - 607.5) / 2)
  })

  it('a pan to the edge slides back inside the source', () => {
    const r = framingRect({ cx: 1, cy: 0.5, zoom: 1 }, 1920, 1080, 9 / 16)
    expect(r.sx + r.sw).toBeCloseTo(1920)
  })
})

describe('rhythm', () => {
  it('lists beats and bar downbeats', () => {
    const r = { beatSec: 0.5, beatsPerBar: 4, offsetSec: 0 }
    expect(beatTimes(r, 2)).toEqual([0, 0.5, 1, 1.5, 2])
    expect(beatTimes(r, 4, 4)).toEqual([0, 2, 4])
  })

  it('moves every cut onto a beat', () => {
    let p = createProject()
    p = addSource(p, src('a', 3.3))
    p = addSource(p, src('b', 3.3))
    p = addSource(p, src('c', 3.3))
    const snapped = snapCutsToBeats(p, { beatSec: 0.625, beatsPerBar: 4, offsetSec: 0 })
    for (const placed of layoutClips(snapped).slice(0, -1)) {
      const beats = placed.end / 0.625
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6)
    }
  })

  it('lands an overlapping transition on the beat, not the clip end', () => {
    let p = createProject()
    p = addSource(p, src('a', 3.3))
    p = addSource(p, src('b', 3.3))
    p = setAllTransitions(p, 'crossfade', 0.4)
    const [, b] = layoutClips(snapCutsToBeats(p, { beatSec: 0.5, beatsPerBar: 4, offsetSec: 0 }))
    expect((b.start / 0.5) % 1).toBeCloseTo(0)
  })
})

it('createClip mutes screen captures and keeps imported audio', () => {
  expect(createClip(src('a')).volume).toBe(0)
  expect(createClip({ ...src('v'), kind: 'import' }).volume).toBe(1)
})
