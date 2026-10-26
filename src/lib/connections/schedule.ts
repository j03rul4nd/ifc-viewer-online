// ─── Schedules ────────────────────────────────────────────────────────────────
// Pull connections run on a schedule. Most people pick a preset ("every 5
// minutes"); people who know cron can type one. Either way the UI shows the
// schedule back in plain words and the next runs, so a typo in a cron line is
// caught before it saves. Five-field cron, UTC-agnostic (evaluated in the
// account's time zone). Pure.

export type Schedule =
  | { kind: 'interval'; seconds: number }
  | { kind: 'daily'; time: string } // HH:MM
  | { kind: 'cron'; expr: string }

export const INTERVAL_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 15, label: 'Every 15 seconds' },
  { seconds: 30, label: 'Every 30 seconds' },
  { seconds: 60, label: 'Every minute' },
  { seconds: 300, label: 'Every 5 minutes' },
  { seconds: 900, label: 'Every 15 minutes' },
  { seconds: 3600, label: 'Every hour' },
  { seconds: 21600, label: 'Every 6 hours' },
]

interface CronField { values: Set<number>; any: boolean }

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
const NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week']

function parseField(src: string, [lo, hi]: [number, number], name: string): CronField {
  const values = new Set<number>()
  for (const part of src.split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/)
    if (!m) throw new Error(`“${part}” is not valid for the ${name}`)
    let [a, b] = m[1] === '*' ? [lo, hi] : m[1].split('-').map(Number) as [number, number?]
    if (b === undefined) b = m[2] ? hi : a
    const step = m[2] ? Number(m[2]) : 1
    if (a < lo || b > hi || a > b || step < 1) throw new Error(`The ${name} must be between ${lo} and ${hi}`)
    for (let v = a; v <= b; v += step) values.add(v)
  }
  return { values, any: src === '*' }
}

export function parseCron(expr: string): CronField[] {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('A cron line has 5 parts: minute hour day month weekday')
  return parts.map((p, i) => parseField(p, RANGES[i], NAMES[i]))
}

export function validateSchedule(s: Schedule, minIntervalS = 0): string | null {
  if (s.kind === 'interval') return s.seconds < minIntervalS ? `This source allows every ${minIntervalS} s at most often` : null
  if (s.kind === 'daily') return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? null : 'Use a 24-hour time like 06:30'
  try { parseCron(s.expr) } catch (e) { return (e as Error).message }
  return null
}

/** Next run times after `from` (minute resolution, max one year ahead). */
export function nextRuns(s: Schedule, from: Date, count = 3): Date[] {
  const out: Date[] = []
  if (s.kind === 'interval') {
    for (let i = 1; i <= count; i++) out.push(new Date(from.getTime() + i * s.seconds * 1000))
    return out
  }
  const fields = s.kind === 'daily'
    ? parseCron(`${Number(s.time.slice(3))} ${Number(s.time.slice(0, 2))} * * *`)
    : parseCron(s.expr)
  const [mi, h, dom, mo, dow] = fields
  const t = new Date(from)
  t.setSeconds(0, 0)
  for (let i = 0; i < 527040 && out.length < count; i++) {
    t.setMinutes(t.getMinutes() + 1)
    const dayOk = dom.any || dow.any
      ? dom.values.has(t.getDate()) && dow.values.has(t.getDay())
      : dom.values.has(t.getDate()) || dow.values.has(t.getDay()) // cron's OR rule
    if (mi.values.has(t.getMinutes()) && h.values.has(t.getHours()) && mo.values.has(t.getMonth() + 1) && dayOk) out.push(new Date(t))
  }
  return out
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

/** The schedule in plain words; falls back to the next runs for odd cron lines. */
export function describeSchedule(s: Schedule): string {
  if (s.kind === 'interval') {
    const p = INTERVAL_PRESETS.find((x) => x.seconds === s.seconds)
    if (p) return p.label
    return s.seconds % 60 === 0 ? `Every ${s.seconds / 60} minutes` : `Every ${s.seconds} seconds`
  }
  if (s.kind === 'daily') return `Every day at ${s.time}`
  const parts = s.expr.trim().split(/\s+/)
  if (parts.length !== 5) return s.expr
  const [mi, h, dom, mo, dow] = parts
  const step = mi.match(/^\*\/(\d+)$/)
  if (step && h === '*' && dom === '*' && mo === '*' && dow === '*') return `Every ${step[1]} minutes`
  if (/^\d+$/.test(mi) && h === '*' && dom === '*' && mo === '*' && dow === '*') return `Every hour at minute ${mi}`
  if (/^\d+$/.test(mi) && /^\d+$/.test(h) && dom === '*' && mo === '*') {
    const time = `${pad(Number(h))}:${pad(Number(mi))}`
    if (dow === '*') return `Every day at ${time}`
    if (dow === '1-5') return `Weekdays at ${time}`
    if (/^\d$/.test(dow)) return `Every ${DAYS[Number(dow)]} at ${time}`
  }
  return `Custom: ${s.expr}`
}
