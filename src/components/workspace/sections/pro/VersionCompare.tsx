// "What changed" between two deliveries of a project (Pro, dark). Four numbers
// first, then the rules that moved, then the elements by IFC type with a
// GlobalId to find them. Sample data; the real diff is lib/compare (memory
// project_version_compare).

import { Panel, Primary, Quiet, Banner, Dialog, DataList, Empty, scoreColor, fmtInt } from '../../ui'
import { SAMPLE_DIFF, type VersionDiffSample } from './pro-sample'
import { useP } from './pro-i18n'

export function diffTotals(d: VersionDiffSample) {
  const sum = (k: 'added' | 'removed' | 'modified') => d.elements.filter((e) => e.kind === k).reduce((n, e) => n + e.count, 0)
  return {
    score: d.scoreTo - d.scoreFrom,
    newIssues: d.rules.reduce((n, r) => n + Math.max(0, r.after - r.before), 0),
    fixedIssues: d.rules.reduce((n, r) => n + Math.max(0, r.before - r.after), 0),
    added: sum('added'), removed: sum('removed'), modified: sum('modified'),
  }
}


/** Elements changed per IFC type, for the stacked bars. */
export function byType(d: VersionDiffSample) {
  const m = new Map<string, { added: number; removed: number; modified: number }>()
  for (const e of d.elements) {
    const v = m.get(e.ifcType) ?? { added: 0, removed: 0, modified: 0 }
    v[e.kind] += e.count
    m.set(e.ifcType, v)
  }
  return [...m].map(([type, v]) => ({ type, ...v, total: v.added + v.removed + v.modified })).sort((a, b) => b.total - a.total)
}

const KIND_COLOR = { added: 'var(--ok)', removed: 'var(--danger)', modified: 'var(--warn)' } as const

function ScoreBars({ d }: { d: VersionDiffSample }) {
  const p = useP()
  return (
    <div className="grid gap-2" role="img" aria-label={p('Score {{from}} → {{to}}', { from: d.scoreFrom, to: d.scoreTo })}>
      {[[d.from, d.scoreFrom], [d.to, d.scoreTo]].map(([label, v]) => (
        <div key={String(label)} className="flex items-center gap-3">
          <span className="w-8 text-[12px] text-[var(--text-dim)]">{label}</span>
          <div className="flex-1 h-3 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v}%`, background: scoreColor(Number(v)) }} /></div>
          <span className="w-8 text-right text-[13px] font-semibold tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  )
}

function TypeBars({ d }: { d: VersionDiffSample }) {
  const p = useP()
  const rows = byType(d)
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2 text-[11.5px] text-[var(--text-dim)]">
        {(['added', 'removed', 'modified'] as const).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: KIND_COLOR[k] }} />{p(k === 'added' ? 'Added' : k === 'removed' ? 'Removed' : 'Modified')}</span>)}
      </div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.type} className="grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-2">
            <span className="font-mono text-[11.5px] truncate">{r.type}</span>
            <div className="flex h-3 rounded-[3px] overflow-hidden" style={{ width: `${(r.total / max) * 100}%`, minWidth: 6 }}>
              {(['added', 'removed', 'modified'] as const).map((k) => r[k] > 0 && <span key={k} style={{ flex: r[k], background: KIND_COLOR[k] }} />)}
            </div>
            <span className="text-right text-[12px] tabular-nums text-[var(--text-dim)]">{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VersionCompare({ from, to, single, onClose, onShare }: { from: string; to: string; single?: boolean; onClose: () => void; onShare: () => void }) {
  const p = useP()
  const d = { ...SAMPLE_DIFF, from, to }
  const t = diffTotals(d)
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0')
  return (
    <Dialog size="lg" title={p('What changed: {{from}} → {{to}}', { from, to })} onClose={onClose}
      footer={single ? <Quiet onClick={onClose}>{p('Close')}</Quiet> : <><Quiet onClick={onClose}>{p('Close')}</Quiet><Primary onClick={onShare}>{p('Send summary to client')}</Primary></>}>
      {single ? (
        <Empty title={p('Only one delivery so far')} body={p('Upload the second version and you will see here what changed: score, issues and elements.')} />
      ) : (
        <div data-pro="version-compare">
          {d.profileChanged && <Banner tone="warn" title={p('{{from}} was checked with another profile', { from })}>{p('Both versions were rescored with the current profile so the scores compare.')}</Banner>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Panel className="p-3"><p className="text-[11.5px] text-[var(--text-dim)]">{p('Score')}</p><p className="text-[20px] font-semibold tabular-nums"><span style={{ color: scoreColor(d.scoreTo) }}>{d.scoreTo}</span> <span className="text-[13px] font-normal" style={{ color: t.score < 0 ? 'var(--danger)' : 'var(--text-dim)' }}>{sign(t.score)}</span></p></Panel>
            <Panel className="p-3"><p className="text-[11.5px] text-[var(--text-dim)]">{p('New issues')}</p><p className="text-[20px] font-semibold tabular-nums">+{fmtInt(t.newIssues)}</p></Panel>
            <Panel className="p-3"><p className="text-[11.5px] text-[var(--text-dim)]">{p('Fixed issues')}</p><p className="text-[20px] font-semibold tabular-nums">−{fmtInt(t.fixedIssues)}</p></Panel>
            <Panel className="p-3"><p className="text-[11.5px] text-[var(--text-dim)]">{p('Elements')}</p><p className="text-[15px] font-semibold tabular-nums mt-1">+{t.added} · −{t.removed} · ~{t.modified}</p></Panel>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mb-5">
            <Panel className="p-4"><p className="text-[12px] text-[var(--text-dim)] mb-3">{p('Health Score before and after')}</p><ScoreBars d={d} /></Panel>
            <Panel className="p-4"><p className="text-[12px] text-[var(--text-dim)] mb-3">{p('Changed elements by type')}</p><TypeBars d={d} /></Panel>
          </div>

          <h3 className="text-[13px] font-medium text-[var(--text-dim)] mb-2">{p('By rule')}</h3>
          <DataList rows={d.rules} rowKey={(r) => r.rule} primaryHeader={p('Rule')}
            primary={(r) => <span className="font-medium">{p(r.rule)}</span>}
            columns={[
              { key: 'before', header: from, cell: (r) => <span className="tabular-nums text-[var(--text-dim)]">{fmtInt(r.before)}</span> },
              { key: 'after', header: to, cell: (r) => <span className="tabular-nums">{fmtInt(r.after)}</span> },
              { key: 'delta', header: p('Change'), cell: (r) => { const n = r.after - r.before; return <span className="tabular-nums" style={n > 0 ? { color: 'var(--danger)' } : { color: 'var(--text-dim)' }}>{sign(n)}</span> } },
            ]} />

          <h3 className="text-[13px] font-medium text-[var(--text-dim)] mt-5 mb-2">{p('Elements')}</h3>
          <DataList rows={d.elements} rowKey={(e) => e.kind + e.ifcType} primaryHeader={p('Change')}
            primary={(e) => <span className="font-medium">{p(e.kind === 'added' ? 'Added' : e.kind === 'removed' ? 'Removed' : 'Modified')} · <span className="font-mono text-[12px]">{e.ifcType}</span></span>}
            columns={[
              { key: 'count', header: p('Count'), cell: (e) => <span className="tabular-nums">{fmtInt(e.count)}</span> },
              { key: 'example', header: p('Example'), wide: true, cell: (e) => <span className="text-[var(--text-dim)] [overflow-wrap:anywhere]">{e.example.name}{e.example.detail && <> · {e.example.detail}</>}<span className="block font-mono text-[11px] text-[var(--text-faint)]">{e.example.globalId}</span></span> },
            ]} />
          <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">{p('Elements are matched by GlobalId. Preview: sample data.')}</p>
        </div>
      )}
    </Dialog>
  )
}
