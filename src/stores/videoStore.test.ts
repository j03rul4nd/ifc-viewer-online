import { describe, it, expect, beforeEach } from 'vitest'
import { useVideoStore } from './videoStore'

const a = new File(['a'], 'a.mp4')
const b = new File(['b'], 'b.mp4')

beforeEach(() => {
  useVideoStore.getState().clearVideos()
  useVideoStore.getState().setPanelOpen(false)
})

describe('videoStore pending queue', () => {
  it('queues files without opening the panel', () => {
    useVideoStore.getState().enqueueFiles([a, b])
    expect(useVideoStore.getState().pendingFiles).toHaveLength(2)
    expect(useVideoStore.getState().panelOpen).toBe(false)
  })

  it('hands the queue over once', () => {
    useVideoStore.getState().enqueueFiles([a, b])
    expect(useVideoStore.getState().takePendingFiles()).toEqual([a, b])
    expect(useVideoStore.getState().takePendingFiles()).toEqual([])
  })

  it('appends and is emptied by clearVideos', () => {
    useVideoStore.getState().enqueueFiles([a])
    useVideoStore.getState().enqueueFiles([b])
    expect(useVideoStore.getState().pendingFiles).toEqual([a, b])
    useVideoStore.getState().clearVideos()
    expect(useVideoStore.getState().pendingFiles).toEqual([])
  })
})
