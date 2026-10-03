// ─── share-file ──────────────────────────────────────────────────────────────
// Hand a file the user just made (a screenshot, a CSV, a clip) to the device
// the way that device expects.
//
// On a phone a download is the wrong verb. iOS Safari drops it into the Files
// app — or opens a PNG in a new tab — and the user then has to go and find it,
// when what they wanted was to put it in Photos, WhatsApp, Mail or AirDrop.
// The Web Share API opens exactly that sheet. On desktop a download is what
// people expect, so this only shares on touch-first devices.
//
// Two Safari rules shape the code:
//   • share() needs transient user activation. After seconds of work (encoding
//     a video) that activation has expired and share() rejects with
//     NotAllowedError — we fall back to the download rather than lose the file.
//   • Cancelling the sheet rejects with AbortError. That is the user's answer,
//     not a failure: do not download behind their back.

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded'

/** Touch-first device (a phone or tablet), where the share sheet is the norm. */
export function prefersShareSheet(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** Whether this browser can share this file at all. */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** Save a blob through an <a download>. */
export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Share on phones and tablets, download everywhere else (and whenever sharing
 * is not possible). Never throws.
 */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  opts: { title?: string; text?: string } = {},
): Promise<ShareOutcome> {
  if (prefersShareSheet()) {
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: opts.title, text: opts.text })
        return 'shared'
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
        // NotAllowedError (activation expired) or anything else: keep the file.
      }
    }
  }
  downloadFile(blob, fileName)
  return 'downloaded'
}
