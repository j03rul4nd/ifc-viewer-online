// ─── Sound capture — get a TikTok sound into the editor, free ─────────────────
// A TikTok link has no audio we may download. But the user can PLAY it, and
// the browser can listen:
//
//   • tab      — getDisplayMedia on the tab where the sound is playing. Chrome
//                (desktop) hands us the tab's audio digitally: clean enough to
//                embed, and the beat and drop are detected automatically.
//   • mic      — the phone plays it, the microphone listens. Room sound is not
//                something to publish, so this is used for TIMING only.
//
// Recording starts before the user presses play, so leading silence is
// trimmed: second 0 of the result is second 0 of the sound.

export type CaptureSource = 'tab' | 'mic'

export function canCapture(source: CaptureSource): boolean {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  if (!md || typeof MediaRecorder === 'undefined') return false
  return source === 'tab' ? typeof md.getDisplayMedia === 'function' : typeof md.getUserMedia === 'function'
}

export interface Recording {
  stop: () => void
  /** Resolves with the recorded audio when stopped (or after `maxSec`). */
  done: Promise<Blob>
}

export async function startCapture(source: CaptureSource, maxSec = 45): Promise<Recording> {
  const md = navigator.mediaDevices
  const stream = source === 'tab'
    // Chrome requires video to share a tab; we drop the video track at once.
    ? await md.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints, preferCurrentTab: false, selfBrowserSurface: 'exclude', systemAudio: 'include' } as DisplayMediaStreamOptions)
    : await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  stream.getVideoTracks().forEach((t) => t.stop())
  const audio = stream.getAudioTracks()
  if (audio.length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('NO_AUDIO') // shared a window/screen without "share tab audio"
  }
  const rec = new MediaRecorder(new MediaStream(audio))
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => { audio.forEach((t) => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) }
    rec.onerror = () => { audio.forEach((t) => t.stop()); reject(new Error('RECORDING_FAILED')) }
  })
  // The user ending the share from the browser bar also ends the recording.
  audio[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop() })
  rec.start(250)
  const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop() }, maxSec * 1000)
  return { stop: () => { clearTimeout(timer); if (rec.state !== 'inactive') rec.stop() }, done }
}

/**
 * First sample where the sound really starts: the first 20 ms window whose RMS
 * clears a threshold relative to the loudest window. Backs off 10 ms so the
 * attack of the first note is kept.
 */
export function soundStart(samples: Float32Array, sampleRate: number): number {
  const win = Math.max(1, Math.round(sampleRate * 0.02))
  let peak = 0
  const rms: number[] = []
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0
    for (let j = i; j < i + win; j++) s += samples[j] * samples[j]
    const r = Math.sqrt(s / win)
    rms.push(r)
    if (r > peak) peak = r
  }
  if (peak === 0) return 0
  const threshold = Math.max(0.005, peak * 0.08)
  const first = rms.findIndex((r) => r >= threshold)
  return first <= 0 ? 0 : Math.max(0, first * win - Math.round(sampleRate * 0.01))
}

/** A copy of `buffer` from sample `from` on. */
export function sliceBuffer(buffer: AudioBuffer, from: number): AudioBuffer {
  if (from <= 0) return buffer
  const length = Math.max(1, buffer.length - from)
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate })
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(from), c)
  return out
}
