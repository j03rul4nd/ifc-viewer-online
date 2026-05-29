// ─── SharedReportView ─────────────────────────────────────────────────────────
// Displays a validation report encoded in the URL hash fragment.
// Route: #report=<base64-encoded-JSON>
//
// Zero server. Zero upload. The IFC never leaves the sender's browser —
// only the Health Score and condensed issue list are shared via the URL.

import React, { useMemo } from 'react'
import { getRuleRemediation } from '../types'

// ── Payload types (must mirror ValidationPanel handleShareReport) ─────────────

interface SharedIssue {
  r: string   // ruleId
  s: string   // severity initial: 'e' | 'w' | 'i'
  n: string   // elementName
  c: string   // ifcClass
  m: string   // message
}

export interface SharedReportPayload {
  v: number
  score: number
  file: string
  e: number
  w: number
  i: number
  ms: number
  ts: string
  issues: SharedIssue[]
}

// ── Decoder ───────────────────────────────────────────────────────────────────

/** Coerce an untrusted value to a finite, non-negative integer (fallback 0). */
function toCount(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? Math.round(val) : 0
}

/** Coerce an untrusted issue object to a well-formed SharedIssue. */
function toIssue(raw: unknown): SharedIssue {
  const o = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const s = str(o.s)
  return {
    r: str(o.r),
    s: s === 'e' || s === 'w' || s === 'i' ? s : 'i',
    n: str(o.n),
    c: str(o.c),
    m: str(o.m),
  }
}

/**
 * Decode + normalise a report payload from a URL hash.
 *
 * The hash is fully attacker-controlled (anyone can craft a #report=… link), so
 * every field is coerced to a safe value and `issues` is forced to a clean array.
 * A payload that merely *parses* is not trusted: without normalisation a missing
 * `issues` array would pass the old `v`/`score` check and then crash the renderer
 * (`for … of payload.issues`) — defeating the null-fallback this returns for junk.
 */
export function decodeReportHash(hash: string): SharedReportPayload | null {
  try {
    const match = hash.match(/[#&]?report=([A-Za-z0-9+/=]+)/)
    if (!match?.[1]) return null
    const json = decodeURIComponent(escape(atob(match[1])))
    const data = JSON.parse(json) as Record<string, unknown>
    if (typeof data.v !== 'number' || typeof data.score !== 'number') return null
    return {
      v:     data.v,
      score: Math.max(0, Math.min(100, Math.round(data.score))),
      file:  typeof data.file === 'string' && data.file ? data.file : 'model.ifc',
      e:     toCount(data.e),
      w:     toCount(data.w),
      i:     toCount(data.i),
      ms:    toCount(data.ms),
      ts:    typeof data.ts === 'string' ? data.ts : '',
      issues: Array.isArray(data.issues) ? data.issues.map(toIssue) : [],
    }
  } catch {
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  return score >= 80 ? 'var(--ok)' : score >= 50 ? '#F5A623' : 'var(--danger)'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Poor'
  return 'Critical'
}

function severityColor(s: string): string {
  if (s === 'e') return 'var(--danger)'
  if (s === 'w') return '#F5A623'
  return '#5E9ED6'
}

function severityLabel(s: string): string {
  if (s === 'e') return 'error'
  if (s === 'w') return 'warning'
  return 'info'
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  payload: SharedReportPayload
  onOpenViewer: () => void
}

export default function SharedReportView({ payload, onOpenViewer }: Props) {
  const color = scoreColor(payload.score)
  const label = scoreLabel(payload.score)

  const date = useMemo(() => {
    const d = new Date(payload.ts)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
  }, [payload.ts])

  const grouped = useMemo(() => {
    const map = new Map<string, SharedIssue[]>()
    for (const iss of payload.issues) {
      const g = map.get(iss.r) ?? []
      g.push(iss)
      map.set(iss.r, g)
    }
    // Sort groups by severity of first issue: errors first
    return [...map.entries()].sort(([, a], [, b]) => {
      const o = { e: 0, w: 1, i: 2 }
      return (o[a[0]?.s as keyof typeof o] ?? 2) - (o[b[0]?.s as keyof typeof o] ?? 2)
    })
  }, [payload.issues])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-10"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* ── Header ── */}
      <div className="w-full max-w-2xl">
        {/* Wordmark */}
        <div className="flex items-center gap-2 mb-8">
          <span className="text-[13px] font-semibold tracking-tight text-[var(--text-dim)]">
            IFC Viewer Online
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-faint)] font-mono">
            Shared Report
          </span>
        </div>

        {/* ── Score hero ── */}
        <div
          className="rounded-2xl border p-6 mb-4 flex items-center gap-6"
          style={{ borderColor: `${color}44`, background: `${color}0a` }}
        >
          {/* Ring */}
          <div className="shrink-0 flex flex-col items-center">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke={`${color}22`} strokeWidth="8" />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - payload.score / 100)}`}
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.4,0,.2,1)' }}
              />
              <text
                x="40" y="44"
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
                fontFamily="monospace"
                fill={color}
              >
                {payload.score}
              </text>
            </svg>
            <span className="text-[11px] font-semibold mt-1" style={{ color }}>{label}</span>
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <p
              className="text-[15px] font-semibold truncate mb-1"
              title={payload.file}
            >
              {payload.file}
            </p>
            <div className="flex flex-wrap gap-3 text-[12px] text-[var(--text-dim)] font-mono">
              {payload.e > 0 && (
                <span style={{ color: 'var(--danger)' }}>{payload.e} error{payload.e !== 1 ? 's' : ''}</span>
              )}
              {payload.w > 0 && (
                <span style={{ color: '#F5A623' }}>{payload.w} warning{payload.w !== 1 ? 's' : ''}</span>
              )}
              {payload.i > 0 && (
                <span style={{ color: '#5E9ED6' }}>{payload.i} info</span>
              )}
              {payload.e === 0 && payload.w === 0 && payload.i === 0 && (
                <span style={{ color: 'var(--ok)' }}>No issues found</span>
              )}
            </div>
            <div className="flex gap-3 mt-1.5 text-[10px] text-[var(--text-faint)] font-mono">
              <span>{fmt(payload.ms)}</span>
              {date && <span>{date}</span>}
            </div>
          </div>
        </div>

        {/* ── Issue list ── */}
        {grouped.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden mb-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="px-3 py-2 border-b text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              Issues · {payload.issues.length} shown
              {payload.e + payload.w + payload.i > payload.issues.length && (
                <span className="ml-1 normal-case font-normal">
                  (top {payload.issues.length} of {payload.e + payload.w + payload.i})
                </span>
              )}
            </div>

            {grouped.map(([ruleId, issueGroup]) => {
              const sev = issueGroup[0]?.s ?? 'i'
              const col = severityColor(sev)
              // Crawlable "how to fix" prose, looked up locally by ruleId (not
              // carried in the URL). English summary — the report view is
              // English-first for SEO. Tool-specific steps stay in the app.
              const fix = getRuleRemediation(ruleId, 'en')?.summary
              return (
                <div key={ruleId}>
                  {/* Group header */}
                  <div
                    className="flex items-center justify-between px-3 py-1.5 border-b"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: col }}
                      />
                      <span
                        className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: `${col}18`, color: col, border: `1px solid ${col}30` }}
                      >
                        {ruleId.replace('RULE_', '')}
                      </span>
                      <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wide">
                        {severityLabel(sev)}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">
                      {issueGroup.length}
                    </span>
                  </div>

                  {/* How to fix — crawlable remediation prose */}
                  {fix && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 border-b"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-faint)] shrink-0 mt-0.5">
                        <path d="M6 2.5a4 4 0 014 5.5c-.4.8-1 1.3-1 2.2V11H5v-.8c0-.9-.6-1.4-1-2.2a4 4 0 012-5.5z" />
                        <path d="M5.5 13h3M6 14.5h2" />
                      </svg>
                      <p className="text-[11px] text-[var(--text-dim)] leading-relaxed">
                        <span className="font-semibold text-[var(--text-faint)] uppercase tracking-wide text-[9px] mr-1.5">
                          How to fix
                        </span>
                        {fix}
                      </p>
                    </div>
                  )}

                  {/* Issue rows (collapsed beyond 5) */}
                  {issueGroup.slice(0, 5).map((iss, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 px-3 py-2 border-b"
                      style={{ borderLeft: `3px solid ${col}`, paddingLeft: 10, borderColor: 'var(--border)' }}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-medium text-[var(--text)] truncate">
                            {iss.n}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">
                            {iss.c}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-dim)] leading-snug">{iss.m}</p>
                      </div>
                    </div>
                  ))}
                  {issueGroup.length > 5 && (
                    <div
                      className="px-3 py-1.5 text-[10px] text-[var(--text-faint)] border-b"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      +{issueGroup.length - 5} more in this group
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {payload.issues.length === 0 && payload.e + payload.w + payload.i === 0 && (
          <div
            className="rounded-xl border px-6 py-8 flex flex-col items-center gap-2 text-center mb-6"
            style={{ borderColor: 'var(--ok)44', background: 'var(--ok)08' }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="var(--ok)" strokeWidth="1.5" opacity="0.5" />
              <path d="M10 16l4 4 8-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--ok)' }}>
              No issues found
            </p>
            <p className="text-[11px] text-[var(--text-faint)]">
              This model passed all validation rules.
            </p>
          </div>
        )}

        {/* ── CTA ── */}
        <div
          className="rounded-xl border px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--text)] mb-0.5">
              Validate your own IFC model
            </p>
            <p className="text-[11px] text-[var(--text-dim)]">
              Free · No upload · No account · 38 validation rules · Works in any browser
            </p>
          </div>
          <button
            onClick={onOpenViewer}
            className="shrink-0 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={{
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            Open IFC Viewer
          </button>
        </div>

        {/* Privacy proof point */}
        <p className="text-center text-[10px] text-[var(--text-faint)] mt-4">
          The IFC file never left the sender&apos;s browser. Only this Health Score was shared.
        </p>
      </div>
    </div>
  )
}
