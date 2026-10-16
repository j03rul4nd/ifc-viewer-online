// Team-only: runs the browser auto-fix on the loaded model and hands back a
// clean IFC with a plain list of what changed. This is the real engine behind
// the paid "Auto-fix" feature (docs-planning/11, weeks 3–5) — gated by the
// pricing preview until the paid workspace launches.

import { useState } from 'react'
import { modelRegistry } from '../../lib/model-registry'
import { downloadBlob } from '../../lib/diffStore'
import { runAutoFix, type AutoFixResult } from '../../lib/autofix/run'
import { compareRuns, type FixComparison } from '../../lib/autofix/compare'
import { runStandaloneValidation } from '../../lib/certify/deep-verify'

type Compare = { status: 'running' } | { status: 'done'; c: FixComparison } | { status: 'failed' }
type State = { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; result: AutoFixResult; ms: number; compare: Compare } | { phase: 'error'; message: string }

const RULE_LABEL = (id: string) => id.replace(/^RULE_/, '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const CLASS_LABEL = (c: string) => `Ifc${c.charAt(3)}${c.slice(4).toLowerCase()}`

export default function AutoFixPreview({ modelId }: { modelId?: string }) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const entry = modelId ? modelRegistry.get(modelId) : undefined

  async function run() {
    const buffer = modelId ? modelRegistry.getBuffer(modelId) : null
    if (!buffer) { setState({ phase: 'error', message: 'The original IFC is not in memory (loaded from cache). Reopen the .ifc file to fix it.' }); return }
    setState({ phase: 'running' })
    const t = performance.now()
    try {
      const result = await runAutoFix(buffer)
      const ms = Math.round(performance.now() - t)
      if (result.report.changes.length === 0) { setState({ phase: 'done', result, ms, compare: { status: 'failed' } }); return }
      setState({ phase: 'done', result, ms, compare: { status: 'running' } })
      // Same engine and default profile on both files → an honest before/after.
      try {
        const [before, after] = await Promise.all([
          runStandaloneValidation(buffer),
          runStandaloneValidation(result.bytes.buffer.slice(0) as ArrayBuffer),
        ])
        setState({ phase: 'done', result, ms, compare: { status: 'done', c: compareRuns(before, after) } })
      } catch {
        setState({ phase: 'done', result, ms, compare: { status: 'failed' } })
      }
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function download(result: AutoFixResult) {
    const stem = (entry?.fileName ?? 'model.ifc').replace(/\.ifc$/i, '')
    void downloadBlob(new Blob([result.bytes.buffer as ArrayBuffer], { type: 'application/x-step' }), `${stem}-fixed.ifc`)
  }

  if (state.phase === 'idle') {
    return (
      <button onClick={run} disabled={!modelId} className="mt-2 h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] border border-[var(--border)] hover:bg-[var(--surface)] disabled:opacity-50">
        Run auto-fix now (team preview)
      </button>
    )
  }
  if (state.phase === 'running') return <p className="mt-2 text-[11px] text-[var(--text-dim)]" role="status">Fixing the model in your browser…</p>
  if (state.phase === 'error') return <p className="mt-2 text-[11px] text-[var(--danger)]" role="alert">{state.message}</p>

  const { report } = state.result
  const skipped = Object.entries(report.missingType.skippedClasses)
  const nothing = report.changes.length === 0
  return (
    <div className="mt-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11px]" role="status">
      <p className="font-medium text-[var(--text)]">
        {nothing ? 'Nothing to fix for these rules.' : `${report.missingType.elementsLinked} elements typed · ${report.duplicateName.renamed} names made unique`}
        <span className="text-[var(--text-faint)] font-normal"> · {report.schema} · {state.ms} ms</span>
      </p>
      {!nothing && state.compare.status === 'running' && <p className="mt-1.5 text-[var(--text-dim)]">Re-checking the fixed file…</p>}
      {!nothing && state.compare.status === 'done' && (() => {
        const c = state.compare.c
        const up = c.scoreAfter - c.scoreBefore
        return (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-[18px] font-semibold tabular-nums text-[var(--text)]">
              {c.scoreBefore} <span className="text-[var(--text-faint)] font-normal">→</span> {c.scoreAfter}
              <span className="ml-1.5 text-[12px] font-medium" style={{ color: up > 0 ? 'var(--ok)' : 'var(--text-dim)' }}>{up > 0 ? `+${up}` : up}</span>
            </p>
            <p className="text-[var(--text-dim)] tabular-nums">{c.issuesBefore} → {c.issuesAfter} issues</p>
            <ul className="w-full text-[var(--text-dim)] tabular-nums">
              {c.rules.slice(0, 4).map((d) => <li key={d.ruleId}>{RULE_LABEL(d.ruleId)}: {d.before} → {d.after}</li>)}
            </ul>
          </div>
        )
      })()}
      {!nothing && (
        <ul className="mt-1.5 space-y-0.5 text-[var(--text-dim)] max-h-[120px] overflow-y-auto">
          {report.changes.map((c, i) => <li key={i}>· {c}</li>)}
        </ul>
      )}
      {skipped.length > 0 && (
        <p className="mt-1.5 text-[var(--text-faint)]">
          Left as is: {skipped.map(([cls, n]) => `${n} ${CLASS_LABEL(cls)}`).join(', ')} — their type entity needs data we can't infer in this schema.
        </p>
      )}
      {!nothing && (
        <button onClick={() => download(state.result)} className="mt-2 h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] bg-[var(--accent)] text-white hover:brightness-110">
          Download fixed IFC
        </button>
      )}
      <p className="mt-1.5 text-[var(--text-faint)]">Scores use the default rule profile on both files. Your original file is unchanged.</p>
    </div>
  )
}
