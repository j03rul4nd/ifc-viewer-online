// ─── Demo flow: supplier delivery → client update ─────────────────────────────
// A guided walk through the existing workspace screens for sales calls and
// video (doc 29). It only navigates: every screen keeps its own logic and
// sample data. Opened with `?demo=reception-flow`; the step survives the
// screens' own navigations in sessionStorage.

export const DEMO_ID = 'reception-flow'
const KEY = 'ifc:demo'

export interface DemoStep {
  id: string
  /** Workspace path the step opens (section and optional sub-tab). */
  path: string
  title: string
  /** One or two sentences on screen; the call script in doc 29 says more. */
  guide: string
  /** What to point at. */
  look: string
  /** Shows the clash summary inside the guide (clashes live in the viewer). */
  clashes?: boolean
}

export const STEPS: DemoStep[] = [
  { id: 'drop', path: 'reception/inbox', title: 'A supplier delivers a model',
    guide: 'The MEP subcontractor drops its IFC in the project inbox. No account, no email attachments.',
    look: 'The new delivery at the top of the inbox.' },
  { id: 'naming', path: 'reception/inbox', title: 'Name and requirements checked on arrival',
    guide: 'The file name is checked against ISO 19650 and the model against your requirements before anyone opens it.',
    look: 'The naming result and the proposed verdict with its reasons.' },
  { id: 'rules', path: 'rules/advanced', title: 'Your rules, at this project phase',
    guide: 'Geometry and relation rules run at the current phase: door clearance, headroom, doors hosted in walls.',
    look: 'The failing elements and the fix next to each one.' },
  { id: 'clashes', path: 'rules/advanced', title: 'Clashes between disciplines', clashes: true,
    guide: 'Clash detection runs on the federated models in the browser. The trend shows the team closing them week by week.',
    look: 'Open clashes going down, resolved going up.' },
  { id: 'issues', path: 'issues', title: 'Failures become assigned issues',
    guide: 'Every failure becomes an issue with its fix, a camera position, an owner and a due date. Guests are free.',
    look: 'Who owns what, and what is overdue.' },
  { id: 'resolve', path: 'issues/closed', title: 'The team resolves them',
    guide: 'Closed issues keep their history. Re-checking the next version closes the ones that pass.',
    look: 'Closed on time this month.' },
  { id: 'mail', path: 'mail', title: 'The client gets the progress update',
    guide: 'The weekly update is filled from the project: Health Score with its trend, accepted models, clashes resolved. Someone approves it before it goes.',
    look: 'The email preview, on desktop and phone.' },
  { id: 'value', path: 'value', title: 'What it saves',
    guide: 'Hours saved on measured counts. The amounts on this screen are estimates with their assumptions shown.',
    look: 'Hours per month and the assumptions behind them.' },
]

export const isDemo = (search: string) => new URLSearchParams(search).get('demo') === DEMO_ID

export const clampStep = (n: number) => Math.max(0, Math.min(STEPS.length - 1, Number.isFinite(n) ? Math.trunc(n) : 0))

/** URL of a step: the section path plus the demo flag, so a reload or a shared link lands on the same step. */
export function stepUrl(base: string, n: number): string {
  const s = STEPS[clampStep(n)]
  return `${base.replace(/\/$/, '')}/workspace/${s.path}?demo=${DEMO_ID}&step=${clampStep(n) + 1}`
}

/** Reads the step from the URL (1-based) or from the tab's storage; null when the demo is not on. */
export function readDemo(search: string, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): number | null {
  const q = new URLSearchParams(search)
  if (q.get('demo') === 'off') { try { store?.removeItem(KEY) } catch { /* blocked */ } return null }
  if (q.get('demo') === DEMO_ID) {
    const n = clampStep(Number(q.get('step') ?? 1) - 1)
    try { store?.setItem(KEY, String(n)) } catch { /* blocked */ }
    return n
  }
  try { const v = store?.getItem(KEY); return v === null || v === undefined ? null : clampStep(Number(v)) } catch { return null }
}

export function saveStep(n: number, store: Pick<Storage, 'setItem'> | null) { try { store?.setItem(KEY, String(clampStep(n))) } catch { /* blocked */ } }
export function endDemo(store: Pick<Storage, 'removeItem'> | null) { try { store?.removeItem(KEY) } catch { /* blocked */ } }

// ── Savings shown at the end: an estimate, with its assumptions ───────────────

export interface Assumptions {
  deliveriesPerMonth: number
  /** Minutes a coordinator spends opening and checking one delivery by hand. */
  minutesPerCheck: number
  clashMeetingsPerMonth: number
  /** Minutes to prepare one clash meeting report by hand. */
  minutesPerMeeting: number
  clientUpdatesPerMonth: number
  minutesPerUpdate: number
  eurPerHour: number
}

export const DEFAULTS: Assumptions = {
  deliveriesPerMonth: 40, minutesPerCheck: 25, clashMeetingsPerMonth: 4, minutesPerMeeting: 90,
  clientUpdatesPerMonth: 8, minutesPerUpdate: 45, eurPerHour: 45,
}

/** Estimate: the share of each task the flow removes is an assumption too (checks 80 %, reports 70 %, updates 80 %). */
export function estimate(a: Assumptions = DEFAULTS) {
  const min = a.deliveriesPerMonth * a.minutesPerCheck * 0.8 + a.clashMeetingsPerMonth * a.minutesPerMeeting * 0.7 + a.clientUpdatesPerMonth * a.minutesPerUpdate * 0.8
  const hours = Math.round(min / 60)
  return { hours, eur: hours * a.eurPerHour }
}
