// ─── itops-impact ─────────────────────────────────────────────────────────────
// What the office-IT twin (device-sim `simulateItOps`) is worth, in the terms a
// managed-service provider sells it in: which incidents are open right now,
// how long each would take to notice without the twin, and what that delay
// costs. Pure functions of the simulated state, so the demo board and the tests
// read the same numbers.
//
// The money is an estimate and says so: a 25-person office at a loaded €50 an
// hour, and how a fault is usually found without monitoring (someone calls,
// someone drives over). The yearly figure uses a typical count of incidents,
// not the demo's, which compresses a month of faults into minutes.

export type IncidentKind = 'overheat' | 'apDown' | 'backup' | 'badge' | 'cctv'

export interface Incident {
  kind: IncidentKind
  /** Device id in the simulated feed (and of its twin binding). */
  deviceId: string
  /** The reading that raised it, ready to show: "29.6 °C", "AP 4", "3". */
  value: string
}

export const OFFICE_STAFF = 25
export const HOURLY_COST_EUR = 50
/** The twin's own delay: one polling interval of the simulated source. */
export const DETECT_S = 10

/** Without the twin: how long until someone notices, and what that costs. */
export const WITHOUT: Record<IncidentKind, { noticeMin: number; costEur: number }> = {
  // Found when the servers throttle or shut down: the whole office stops ~2 h.
  overheat: { noticeMin: 120, costEur: OFFICE_STAFF * 2 * HOURLY_COST_EUR },
  // One room (6 people) offline ~1 h until a call, then a site visit (€120).
  apDown: { noticeMin: 60, costEur: 6 * 1 * HOURLY_COST_EUR + 120 },
  // Found on the day a restore is needed: a day of work redone by two people.
  backup: { noticeMin: 24 * 60, costEur: 2 * 8 * HOURLY_COST_EUR },
  // A security risk rather than a bill: counted, not priced.
  badge: { noticeMin: 24 * 60, costEur: 0 },
  cctv: { noticeMin: 8 * 60, costEur: 0 },
}

/** Incidents a year in one such office, for the yearly estimate. */
export const PER_YEAR: Partial<Record<IncidentKind, number>> = { overheat: 2, apDown: 12, backup: 3 }

export function yearlySavingEur(sites = 1): number {
  let per = 0
  for (const [k, n] of Object.entries(PER_YEAR) as Array<[IncidentKind, number]>) per += n * WITHOUT[k].costEur
  return per * Math.max(1, Math.round(sites))
}

interface Device { id?: unknown; kind?: unknown; [k: string]: unknown }

/** The open incidents in one `simulateItOps` snapshot, most costly first. */
export function openIncidents(snapshot: unknown): Incident[] {
  const devices = (snapshot as { devices?: Device[] } | null)?.devices
  if (!Array.isArray(devices)) return []
  const out: Incident[] = []
  for (const d of devices) {
    const id = String(d.id ?? '')
    if (d.kind === 'server-room' && typeof d.temp_c === 'number' && d.temp_c > 27) out.push({ kind: 'overheat', deviceId: id, value: `${d.temp_c.toFixed(1)} °C` })
    else if (d.kind === 'wifi-ap' && d.online === false) out.push({ kind: 'apDown', deviceId: id, value: id.replace(/^ap-/, '') })
    else if (d.kind === 'backup' && d.status === 'failed') out.push({ kind: 'backup', deviceId: id, value: '' })
    else if (d.kind === 'access' && d.state === 'suspicious') out.push({ kind: 'badge', deviceId: id, value: String(d.failed_last_5min ?? '') })
    else if (d.kind === 'camera' && d.online === false) out.push({ kind: 'cctv', deviceId: id, value: '' })
  }
  return out.sort((a, b) => WITHOUT[b.kind].costEur - WITHOUT[a.kind].costEur)
}

/** Stable key of an incident while it stays open. */
export const incidentKey = (i: Incident): string => `${i.kind}:${i.deviceId}`

export interface Tally { caught: number; minutesAvoided: number; eurAvoided: number }

export const EMPTY_TALLY: Tally = { caught: 0, minutesAvoided: 0, eurAvoided: 0 }

/** Add the incidents that opened since the last snapshot (keys not in `prevKeys`). */
export function addOnsets(t: Tally, open: Incident[], prevKeys: ReadonlySet<string>): Tally {
  let { caught, minutesAvoided, eurAvoided } = t
  for (const i of open) {
    if (prevKeys.has(incidentKey(i))) continue
    caught++
    minutesAvoided += WITHOUT[i.kind].noticeMin
    eurAvoided += WITHOUT[i.kind].costEur
  }
  return { caught, minutesAvoided, eurAvoided }
}

/** Demo clock for the cost meter: one real second plays one minute. */
export const DEMO_SPEED = 60

/**
 * What an open incident has cost so far had nobody noticed it, `elapsedS`
 * real seconds after it opened (played at DEMO_SPEED), capped at its full cost.
 */
export function costSoFar(kind: IncidentKind, elapsedS: number): number {
  const w = WITHOUT[kind]
  if (!w.costEur) return 0
  const min = Math.max(0, elapsedS) * DEMO_SPEED / 60
  return Math.min(w.costEur, Math.round(w.costEur * min / w.noticeMin))
}
