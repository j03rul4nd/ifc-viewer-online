// ─── Daily site report (parte diario de obra) ────────────────────────────────
// One report per day: weather (typed by hand, no network), crews per trade with
// headcount and hours, work done, materials received, incidents and visits,
// photos. What the app already knows about the day is summarised, not retyped:
// progress records dated that day and snags opened / resolved that day.
// Pure data, no browser APIs.

import { csvCell } from '../steel/export'
import { localDayOf } from './local-date'
import type { ProgressRecord, ProgressStatus } from './progress'
import type { Snag } from './snags'

export const WEATHER_SKIES = ['sunny', 'cloudy', 'rain', 'storm', 'wind', 'snow', 'fog'] as const
export type WeatherSky = typeof WEATHER_SKIES[number]

export interface Weather {
  sky?: WeatherSky
  /** °C, typed by the site manager. */
  tempMin?: number
  tempMax?: number
  /** Work stopped (part of) the day because of the weather. */
  stoppage?: boolean
}

export interface Crew {
  id: string
  trade: string
  company: string
  headcount: number
  /** Hours per person. */
  hours: number
}

export interface DailyReport {
  /** The date itself (YYYY-MM-DD): one report per day and project. */
  id: string
  date: string
  weather: Weather
  crews: Crew[]
  work: string
  materials: string
  incidents: string
  visits: string
  photoIds: string[]
  createdAt: string
  updatedAt: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s))

export { localDate } from './local-date'

export function createDailyReport(date: string, now: Date = new Date()): DailyReport {
  if (!isIsoDate(date)) throw new Error(`Invalid date ${date}`)
  const at = now.toISOString()
  return { id: date, date, weather: {}, crews: [], work: '', materials: '', incidents: '', visits: '', photoIds: [], createdAt: at, updatedAt: at }
}

export type DailyPatch = Partial<Pick<DailyReport, 'weather' | 'crews' | 'work' | 'materials' | 'incidents' | 'visits' | 'photoIds'>>

export function updateDailyReport(r: DailyReport, patch: DailyPatch, now: Date = new Date()): DailyReport {
  return { ...r, ...patch, id: r.id, date: r.date, createdAt: r.createdAt, updatedAt: now.toISOString() }
}

let counter = 0
export function newCrewId(): string {
  counter = (counter + 1) % 1e6
  return `crew-${Date.now().toString(36)}-${counter.toString(36)}`
}

const num = (v: unknown, min = 0, max = 1e6): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0
}

export function makeCrew(p: Partial<Crew> = {}): Crew {
  return {
    id: p.id || newCrewId(), trade: (p.trade ?? '').trim(), company: (p.company ?? '').trim(),
    headcount: Math.round(num(p.headcount, 0, 10000)), hours: num(p.hours ?? 8, 0, 24),
  }
}

export interface CrewTotals { crews: number; people: number; hours: number }

/** Person-hours = headcount × hours per crew. */
export function crewTotals(crews: readonly Crew[]): CrewTotals {
  let people = 0
  let hours = 0
  for (const c of crews) { people += c.headcount; hours += c.headcount * c.hours }
  return { crews: crews.length, people, hours: Math.round(hours * 100) / 100 }
}

/** Repeats yesterday's crews (the usual case on site), with fresh ids. */
export function copyCrews(from: readonly Crew[]): Crew[] {
  return from.map((c) => makeCrew({ ...c, id: undefined }))
}

// ── What the app already knows about the day ─────────────────────────────────

export interface ProgressDay { total: number; byStatus: Record<ProgressStatus, number> }

/** Progress records whose last update is dated `date`. */
export function progressOfDay(records: readonly ProgressRecord[], date: string): ProgressDay {
  const out: ProgressDay = { total: 0, byStatus: { not_started: 0, in_progress: 0, done: 0 } }
  for (const r of records) {
    if (r.date !== date) continue
    out.total++
    out.byStatus[r.status]++
  }
  return out
}

export interface SnagDay { opened: Snag[]; resolved: Snag[] }


/** Snags created on `date`, and snags moved to resolved/closed on `date`. */
export function snagsOfDay(snags: readonly Snag[], date: string): SnagDay {
  const opened: Snag[] = []
  const resolved: Snag[] = []
  for (const s of snags) {
    if (localDayOf(s.createdAt) === date) opened.push(s)
    if (s.history.some((h) => (h.to === 'resolved' || h.to === 'closed') && localDayOf(h.at) === date)) resolved.push(s)
  }
  return { opened, resolved }
}

// ── Range, CSV, sanitising ───────────────────────────────────────────────────

/** Reports between two dates inclusive, oldest first. */
export function reportsInRange(reports: readonly DailyReport[], from: string, to: string): DailyReport[] {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return reports.filter((r) => r.date >= a && r.date <= b).sort((x, y) => x.date.localeCompare(y.date))
}

export interface DailyCsvLabels {
  date: string; sky: string; tempMin: string; tempMax: string; stoppage: string; crews: string; people: string; personHours: string
  work: string; materials: string; incidents: string; visits: string; progress: string; snagsOpened: string; snagsResolved: string; photos: string
  yes: string; skies: Record<WeatherSky, string>
}

export interface DailyContext { progress?: readonly ProgressRecord[]; snags?: readonly Snag[] }

const crewText = (c: Crew) => `${c.trade || '-'}${c.company ? ` (${c.company})` : ''}: ${c.headcount} x ${c.hours} h`

/** One row per day; crews flattened into one cell ("Trade (Company): n x h"). */
export function dailyReportsCsv(reports: readonly DailyReport[], labels: DailyCsvLabels, ctx: DailyContext = {}): string {
  const head = [labels.date, labels.sky, labels.tempMin, labels.tempMax, labels.stoppage, labels.crews, labels.people, labels.personHours,
    labels.work, labels.materials, labels.incidents, labels.visits, labels.progress, labels.snagsOpened, labels.snagsResolved, labels.photos]
  const lines = [head.map(csvCell).join(',')]
  for (const r of reports) {
    const tot = crewTotals(r.crews)
    const p = progressOfDay(ctx.progress ?? [], r.date)
    const s = snagsOfDay(ctx.snags ?? [], r.date)
    lines.push([
      r.date, r.weather.sky ? labels.skies[r.weather.sky] : '', r.weather.tempMin ?? '', r.weather.tempMax ?? '', r.weather.stoppage ? labels.yes : '',
      r.crews.map(crewText).join('; '), tot.people, tot.hours, r.work, r.materials, r.incidents, r.visits,
      p.total, s.opened.length, s.resolved.length, r.photoIds.length,
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-80, Math.min(70, v)) : undefined)

export function sanitizeDailyReport(raw: unknown): DailyReport | null {
  const r = raw as Partial<DailyReport> | null
  if (!r || typeof r !== 'object' || !isIsoDate(r.date)) return null
  const w = (r.weather ?? {}) as Weather
  const tempMin = optNum(w.tempMin)
  const tempMax = optNum(w.tempMax)
  return {
    id: r.date, date: r.date,
    weather: {
      ...((WEATHER_SKIES as readonly string[]).includes(w.sky as string) ? { sky: w.sky } : {}),
      ...(tempMin !== undefined ? { tempMin } : {}),
      ...(tempMax !== undefined ? { tempMax } : {}),
      ...(w.stoppage === true ? { stoppage: true } : {}),
    },
    crews: Array.isArray(r.crews) ? r.crews.filter((c) => c && typeof c === 'object').map((c) => makeCrew(c as Partial<Crew>)) : [],
    work: str(r.work), materials: str(r.materials), incidents: str(r.incidents), visits: str(r.visits),
    photoIds: Array.isArray(r.photoIds) ? r.photoIds.filter((p): p is string => typeof p === 'string') : [],
    createdAt: str(r.createdAt), updatedAt: str(r.updatedAt),
  }
}
