// ─── Sharing ──────────────────────────────────────────────────────────────────
// No web API posts to Instagram Stories or attaches an image to a LinkedIn post.
// What exists is the system share sheet (Web Share with files), which on a phone
// lists both apps with the image attached. Without it the image is saved and the
// studio says so; LinkedIn then gets its share page. Never claims to have posted.

export type ShareTarget = 'instagram-story' | 'linkedin'

export const SHARE_SIZE: Record<ShareTarget, { width: number; height: number }> = {
  'instagram-story': { width: 1080, height: 1920 },
  linkedin: { width: 1200, height: 1200 },
}

/** Fit a drawing into the card, leaving margins and room for the system's own chrome. */
export function fitIntoCard(boxW: number, boxH: number, cardW: number, cardH: number): { scale: number; x: number; y: number } {
  const scale = Math.min((cardW * 0.88) / boxW, (cardH * 0.7) / boxH)
  return { scale, x: (cardW - boxW * scale) / 2, y: (cardH - boxH * scale) / 2 }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'saved'

interface ShareEnv {
  canShare?: (data: { files: File[] }) => boolean
  share?: (data: { files: File[]; title?: string }) => Promise<void>
}

export async function shareImage(file: File, save: (file: File) => void, env: ShareEnv = navigator as unknown as ShareEnv): Promise<ShareOutcome> {
  if (env.share && env.canShare?.({ files: [file] })) {
    try {
      await env.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  save(file)
  return 'saved'
}

export const LINKEDIN_SHARE_URL = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://www.ifcvieweronline.eu/sketch')}`
