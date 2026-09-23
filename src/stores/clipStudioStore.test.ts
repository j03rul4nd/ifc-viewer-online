import { beforeEach, describe, expect, it } from 'vitest'
import { useClipStudioStore } from './clipStudioStore'
import { addSource, createProject, trimClipEdge, type MediaSource } from '../lib/capture/project'

const src = (id: string): MediaSource => ({ id, kind: 'capture', label: id, durationSec: 10, width: 1920, height: 1080 })

beforeEach(() => {
  useClipStudioStore.setState({ project: createProject(), past: [], future: [], gestureBase: null, playhead: 0, selection: null })
})

describe('clip studio history', () => {
  it('undoes and redoes edits', () => {
    const s = useClipStudioStore.getState()
    s.edit((p) => addSource(p, src('a')))
    s.edit((p) => addSource(p, src('b')))
    expect(useClipStudioStore.getState().project.clips).toHaveLength(2)
    useClipStudioStore.getState().undo()
    expect(useClipStudioStore.getState().project.clips).toHaveLength(1)
    useClipStudioStore.getState().redo()
    expect(useClipStudioStore.getState().project.clips).toHaveLength(2)
  })

  it('collapses a whole drag into one undo step', () => {
    const s = useClipStudioStore.getState()
    s.edit((p) => addSource(p, src('a')))
    const id = useClipStudioStore.getState().project.clips[0].id
    s.beginGesture()
    for (let i = 0; i < 20; i++) useClipStudioStore.getState().edit((p) => trimClipEdge(p, id, 'end', -0.1))
    useClipStudioStore.getState().endGesture()
    expect(useClipStudioStore.getState().project.clips[0].outSec).toBeCloseTo(8)
    useClipStudioStore.getState().undo()
    expect(useClipStudioStore.getState().project.clips[0].outSec).toBe(10)
  })

  it('a new edit clears the redo stack', () => {
    const s = useClipStudioStore.getState()
    s.edit((p) => addSource(p, src('a')))
    useClipStudioStore.getState().undo()
    useClipStudioStore.getState().edit((p) => addSource(p, src('b')))
    expect(useClipStudioStore.getState().future).toHaveLength(0)
  })

  it('keeps the playhead inside a project that got shorter', () => {
    const s = useClipStudioStore.getState()
    s.edit((p) => addSource(p, src('a')))
    s.setPlayhead(9)
    const id = useClipStudioStore.getState().project.clips[0].id
    useClipStudioStore.getState().edit((p) => trimClipEdge(p, id, 'end', -5))
    expect(useClipStudioStore.getState().playhead).toBe(5)
  })
})
