// ─── alert-notify ─────────────────────────────────────────────────────────────
// How an alert reaches someone who is not looking at the tab: a system
// notification (only with the browser's permission, only while the tab is
// hidden — a visible tab already shows the toast and the rings), an optional
// two-tone chime, and a "(3)" count in the tab title until they come back.
//
// Per device, like the legend: localStorage, never sent anywhere.

const KEY = 'ifc-alert-notify:v1'

export interface NotifySettings {
  /** System notification while the tab is in the background. */
  system: boolean
  /** A short chime on every new alert. */
  sound: boolean
}

let settings: NotifySettings = read()
const listeners = new Set<() => void>()

function read(): NotifySettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<NotifySettings>
    return { system: v.system === true, sound: v.sound === true }
  } catch { return { system: false, sound: false } }
}

export function getNotifySettings(): NotifySettings { return settings }

export function setNotifySettings(patch: Partial<NotifySettings>): void {
  settings = { ...settings, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* private mode */ }
  for (const l of listeners) l()
}

export function onNotifySettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function systemPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Ask the browser (must run from a click). Turns the setting on when granted. */
export async function enableSystemNotifications(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  setNotifySettings({ system: p === 'granted' })
  for (const l of listeners) l()
  return p
}

// ── Tab title count ────────────────────────────────────────────────────────────

let unseen = 0
let baseTitle: string | null = null
const TITLE_RE = /^\(\d+\) /

function paintTitle(): void {
  if (typeof document === 'undefined') return
  const clean = document.title.replace(TITLE_RE, '')
  if (baseTitle === null || clean !== baseTitle) baseTitle = clean
  document.title = unseen > 0 ? `(${unseen}) ${baseTitle}` : baseTitle
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && unseen > 0) { unseen = 0; paintTitle() }
  })
}

// ── Chime ──────────────────────────────────────────────────────────────────────

let audio: AudioContext | null = null
function chime(): void {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime
    for (const [i, f] of [880, 660].entries()) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16)
      o.connect(g).connect(audio.destination)
      o.start(t0 + i * 0.18)
      o.stop(t0 + i * 0.18 + 0.17)
    }
  } catch { /* no audio: the toast still shows */ }
}

/**
 * Deliver one new alert beyond the toast. `tag` collapses repeats of the same
 * rule into one system notification instead of a pile.
 */
export function notifyAlert(a: { title: string; body: string; tag: string; onClick?: () => void }): void {
  if (settings.sound) chime()
  if (typeof document === 'undefined' || !document.hidden) return
  unseen++
  paintTitle()
  if (!settings.system || systemPermission() !== 'granted') return
  try {
    const n = new Notification(a.title, { body: a.body, tag: a.tag })
    n.onclick = () => { window.focus(); a.onClick?.(); n.close() }
  } catch { /* some browsers only allow it from a service worker */ }
}

/** Test hook. */
export function _unseenCount(): number { return unseen }
