import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { clampVideoPlacement } from '../lib/video/video-placement'
import {
  DEFAULT_VIDEO_PLACEMENT,
  type VideoEntry,
  type VideoPlacement,
  type VideoSurfaceMode,
} from '../lib/video/video-types'

interface VideoStore {
  videos: VideoEntry[]
  activeVideoId: string | null
  panelOpen: boolean
  setPanelOpen(open: boolean): void
  addVideo(entry: VideoEntry): void
  updateVideo(id: string, patch: Partial<VideoEntry>): void
  removeVideo(id: string): void
  setActiveVideo(id: string | null): void
  setVisible(id: string, visible: boolean): void
  setMode(id: string, mode: VideoSurfaceMode): void
  setPlacement(id: string, patch: Partial<VideoPlacement>): void
  clearVideos(): void
  /** Files dropped or picked elsewhere (drop routing, Add data hub) that the panel loads. Session-only. */
  pendingFiles: File[]
  /** Append to the queue. Deliberately does NOT open the panel: VideoPanel is mounted while closed and drains it. */
  enqueueFiles(files: File[]): void
  /** Return and clear the queue atomically. */
  takePendingFiles(): File[]
}

export const useVideoStore = create<VideoStore>()(
  devtools(
    (set) => ({
      videos: [],
      activeVideoId: null,
      panelOpen: false,
      setPanelOpen: (panelOpen) => set({ panelOpen }, false, 'setPanelOpen'),
      addVideo: (entry) => set((state) => ({
        videos: [...state.videos.filter((item) => item.id !== entry.id), entry],
        activeVideoId: entry.id,
      }), false, 'addVideo'),
      updateVideo: (id, patch) => set((state) => ({
        videos: state.videos.map((item) => item.id === id ? { ...item, ...patch } : item),
      }), false, 'updateVideo'),
      removeVideo: (id) => set((state) => {
        const videos = state.videos.filter((item) => item.id !== id)
        return {
          videos,
          activeVideoId: state.activeVideoId === id ? (videos[videos.length - 1]?.id ?? null) : state.activeVideoId,
        }
      }, false, 'removeVideo'),
      setActiveVideo: (activeVideoId) => set({ activeVideoId }, false, 'setActiveVideo'),
      setVisible: (id, visible) => set((state) => ({
        videos: state.videos.map((item) => item.id === id ? { ...item, visible } : item),
      }), false, 'setVisible'),
      setMode: (id, mode) => set((state) => ({
        videos: state.videos.map((item) => item.id === id ? { ...item, mode } : item),
      }), false, 'setMode'),
      setPlacement: (id, patch) => set((state) => ({
        videos: state.videos.map((item) => item.id === id
          ? { ...item, placement: clampVideoPlacement({ ...item.placement, ...patch }) }
          : item),
      }), false, 'setPlacement'),
      clearVideos: () => set({ videos: [], activeVideoId: null, pendingFiles: [] }, false, 'clearVideos'),
      pendingFiles: [],
      enqueueFiles: (files) =>
        set((s) => ({ pendingFiles: [...s.pendingFiles, ...files] }), false, 'enqueueFiles'),
      takePendingFiles: () => {
        let taken: File[] = []
        set((s) => { taken = s.pendingFiles; return { pendingFiles: [] } }, false, 'takePendingFiles')
        return taken
      },
    }),
    { name: 'VideoStore' },
  ),
)

export function pendingVideo(input: {
  id: string
  fileName: string
  fileSize: number
  sourceKey: string
  sourceKind: VideoEntry['sourceKind']
  mode?: VideoSurfaceMode
  placement?: VideoPlacement
}): VideoEntry {
  return {
    ...input,
    status: 'loading',
    errorKey: null,
    visible: true,
    mode: input.mode ?? 'screen',
    placement: clampVideoPlacement(input.placement ?? { ...DEFAULT_VIDEO_PLACEMENT }),
    aspectRatio: 16 / 9,
    duration: 0,
    playing: false,
    loop: true,
    muted: true,
    volume: 0.7,
    loadedAt: Date.now(),
  }
}
