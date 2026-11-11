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
