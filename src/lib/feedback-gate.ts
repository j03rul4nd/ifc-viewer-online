// ─── Feedback gate ────────────────────────────────────────────────────────────
// Decides WHERE the app may ask for feedback and WHEN it may ask unprompted.
//
// Where: only the top-level, full viewer. Never inside someone else's page (SDK
// and ?embed=1 iframes, the WordPress plugin, the Shopify app, the blog's live
// examples), never while the user presents to a client, plays a tour or works
// in a studio. The always-visible "Suggest" button follows the same rule.
//
// When (unprompted cards only): after real use — a validated model plus one
// more meaningful action, or a few minutes with it — once per session at most,
// with cooldowns: 30 days after an answer, and a growing pause after each
// dismissal (7, 14, 28… capped at 90 days), so saying "no" is respected.
//
// Usage signals live in sessionStorage only. They are never sent anywhere; they
// pick the moment and which options to show first.

import { REQUEST_FEATURES, type FeatureRequestDraft, type RequestFeature } from './feature-requests'

// ── Where ──────────────────────────────────────────────────────────────────────

export interface FeedbackSurface {
  route: string
  /** Inside any iframe (other sites, or our own blog examples). */
  embedded: boolean
  /** ?embed=1 / SDK chrome, even when opened top-level. */
  embedParam: boolean
  clientMode: boolean
  tourPlaying: boolean
  studioOpen: boolean
  quiet: boolean
}

export function feedbackAllowed(s: FeedbackSurface): boolean {
  return s.route === 'viewer' && !s.embedded && !s.embedParam && !s.clientMode && !s.tourPlaying && !s.studioOpen && !s.quiet
}

// ── Usage signals (session only) ───────────────────────────────────────────────

export type UsageSignal =
  | 'validated' | 'multi_model' | 'ids' | 'exported' | 'shared' | 'bcf' | 'large_file' | 'map' | 'measured'

const SIGNALS_KEY = 'ifc.feedback.signals'

export function noteFeedbackSignal(signal: UsageSignal): void {
  try {
    const set = new Set(readSignals())
    if (set.has(signal)) return
    set.add(signal)
    sessionStorage.setItem(SIGNALS_KEY, JSON.stringify([...set]))
  } catch { /* storage blocked: we just ask less precisely */ }
}

export function readSignals(): UsageSignal[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(SIGNALS_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as UsageSignal[]) : []
  } catch {
    return []
  }
}

/** Real use: a validated model plus one more meaningful action. */
export function isEngaged(signals: readonly UsageSignal[]): boolean {
  return signals.includes('validated') && signals.some((s) => s !== 'validated')
}

/** Which roadmap items fit what this person just did, best first. */
const SIGNAL_FEATURES: Record<UsageSignal, RequestFeature[]> = {
  large_file: ['big_files'],
  multi_model: ['versions', 'bcf_team'],
  ids: ['auto_check', 'managed_requirements'],
  exported: ['client_link', 'bcf_team'],
  shared: ['client_link'],
  bcf: ['bcf_team'],
  map: ['client_link'],
  measured: ['batch_tools'],
  validated: ['auto_check'],
}
const DEFAULT_ORDER: RequestFeature[] = ['client_link', 'versions', 'bcf_team', 'auto_check', 'big_files', 'cloud_drives', 'batch_tools', 'reception_inbox', 'managed_requirements', 'iso_naming']

export function suggestedFeatures(signals: readonly UsageSignal[], count = 3): RequestFeature[] {
  const score = new Map<RequestFeature, number>()
  signals.forEach((s) => (SIGNAL_FEATURES[s] ?? []).forEach((f, i) => score.set(f, (score.get(f) ?? 0) + (i === 0 ? 2 : 1))))
  return [...DEFAULT_ORDER]
    .sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b))
    .slice(0, count)
}

// ── When (unprompted asks only) ────────────────────────────────────────────────

const BUDGET_KEY = 'ifc.feedback.budget'
const SESSION_KEY = 'ifc.feedback.askedThisSession'
const DAY = 86_400_000
export const AFTER_ANSWER_MS = 30 * DAY
const DISMISS_BASE_MS = 7 * DAY
const DISMISS_MAX_MS = 90 * DAY

interface Budget { answeredAt?: number; dismissedAt?: number; dismissals?: number }

function readBudget(): Budget {
  try { return JSON.parse(localStorage.getItem(BUDGET_KEY) ?? '{}') as Budget } catch { return {} }
}
function writeBudget(b: Budget): void {
  try { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)) } catch { /* see askDue */ }
}

export function dismissPause(dismissals: number): number {
  return Math.min(DISMISS_MAX_MS, DISMISS_BASE_MS * 2 ** Math.max(0, dismissals - 1))
}

/** May we ask unprompted now? False without storage: we could not keep our word. */
export function askDue(now = Date.now()): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false
    localStorage.getItem(BUDGET_KEY) // throws when storage is blocked
  } catch {
    return false
  }
  const b = readBudget()
  if (b.answeredAt !== undefined && now - b.answeredAt < AFTER_ANSWER_MS) return false
  if (b.dismissedAt !== undefined && now - b.dismissedAt < dismissPause(b.dismissals ?? 1)) return false
  return true
}

/** An unprompted ask is on screen: no other one this session. */
export function noteAsked(): void {
  try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
}

export function noteAnswered(now = Date.now()): void {
  noteAsked()
  writeBudget({ answeredAt: now, dismissals: 0 })
}

export function noteDismissed(now = Date.now()): void {
  const b = readBudget()
  writeBudget({ ...b, dismissedAt: now, dismissals: (b.dismissals ?? 0) + 1 })
}

// ── A choice made before signing in ────────────────────────────────────────────
// Anonymous users can pick and write first; we keep the draft (this tab only)
// across the sign-in redirect and reopen the form with it, ready to send.

const DRAFT_KEY = 'ifc.feedback.pendingDraft'

/** Everything they answered, minus what the session adds (lang, plan). */
export type PendingDraft = Omit<FeatureRequestDraft, 'lang' | 'plan'>

export function savePendingDraft(d: PendingDraft): void {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

export function takePendingDraft(): PendingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(DRAFT_KEY)
    const d = JSON.parse(raw) as PendingDraft
    return d && REQUEST_FEATURES.includes(d.feature) ? d : null
  } catch {
    return null
  }
}

export function hasPendingDraft(): boolean {
  try { return sessionStorage.getItem(DRAFT_KEY) !== null } catch { return false }
}

// ── Closing the loop ───────────────────────────────────────────────────────────
// Remember what the user last saw of their own requests; anything that moved
// since (status or reply) is news worth one toast.

const SEEN_KEY = 'ifc.feedback.seen'
const CHECKED_KEY = 'ifc.feedback.checkedAt'
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000

export interface SeenRequest { id: string; status: string; reply: string }

export function readSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}

const fingerprint = (r: SeenRequest) => `${r.status}|${r.reply}`

/** Requests whose status or reply changed since last seen. First sight is not news. */
export function changedSince<T extends SeenRequest>(seen: Record<string, string>, requests: readonly T[]): T[] {
  return requests.filter((r) => r.id in seen && seen[r.id] !== fingerprint(r))
}

/** `onlyNew`: add requests not seen before, keep what was seen of the rest
 *  (so a change they have not looked at yet is still news). */
export function markSeen(requests: readonly SeenRequest[], { onlyNew = false } = {}): void {
  try {
    const next: Record<string, string> = onlyNew ? readSeen() : {}
    requests.forEach((r) => { if (!onlyNew || !(r.id in next)) next[r.id] = fingerprint(r) })
    localStorage.setItem(SEEN_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

// What we already toasted about (same fingerprints). Kept apart from "seen" so
// opening the list still counts as reading, while an ignored toast stays told.
const NOTIFIED_KEY = 'ifc.feedback.notified'

export function readNotified(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}

export function noteNotified(requests: readonly SeenRequest[]): void {
  try {
    const next = readNotified()
    requests.forEach((r) => { next[r.id] = fingerprint(r) })
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

/** Throttle the "anything new?" check (and skip users who never asked). */
export function updatesCheckDue(now = Date.now()): boolean {
  try {
    if (!localStorage.getItem(SEEN_KEY)) return false
    return now - Number(localStorage.getItem(CHECKED_KEY) ?? 0) >= CHECK_EVERY_MS
  } catch {
    return false
  }
}

export function noteUpdatesChecked(now = Date.now()): void {
  try { localStorage.setItem(CHECKED_KEY, String(now)) } catch { /* ignore */ }
}
