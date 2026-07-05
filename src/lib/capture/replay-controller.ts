// ─── Replay capture controller (module singleton) ──────────────────────────────
// Only ONE CaptureToolbar instance owns the live replay buffer (D-23). Other
// surfaces (the TourPlayer's "Export for LinkedIn" shortcut, D-26) need to
// trigger a capture WITHOUT mounting a second buffer — the owning instance
// registers its capture function here. A plain module ref (not Zustand): a
// function is not serialisable state, and there is exactly one owner at a time.

export interface ReplayController {
  /** Grab the last `n` seconds from the live buffer. Null when nothing records. */
  capture: ((n: number) => Promise<Blob>) | null
}

export const replayController: ReplayController = { capture: null }
