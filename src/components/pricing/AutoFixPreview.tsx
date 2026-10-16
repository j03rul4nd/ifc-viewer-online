// Team-only: runs the browser auto-fix on the loaded model and hands back a
// clean IFC with a plain list of what changed. This is the real engine behind
// the paid "Auto-fix" feature (docs-planning/11, weeks 3–5) — gated by the
// pricing preview until the paid workspace launches.

import { useState } from 'react'
import { modelRegistry } from '../../lib/model-registry'
import { downloadBlob } from '../../lib/diffStore'
import { runAutoFix, type AutoFixResult } from '../../lib/autofix/run'

type State = { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; result: AutoFixResult; ms: number } | { phase: 'error'; message: string }

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
      setState({ phase: 'done', result, ms: Math.round(performance.now() - t) })
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
      <p className="mt-1.5 text-[var(--text-faint)]">Open the downloaded file to see its new Health Score. Your original file is unchanged.</p>
    </div>
  )
}
