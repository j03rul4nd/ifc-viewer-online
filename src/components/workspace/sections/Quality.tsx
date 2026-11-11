import { useEffect, useState } from 'react'
import type { SectionProps } from '../registry'
import { paidApi, type ApiVersion } from '../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../hooks/usePaidQuery'
import { Head, SettingGroup, SettingRow, Toggle, inputClass, DataList, Primary, Quiet, Dot, scoreColor } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_API_AUDIT, SAMPLE_STANDARD, SAMPLE_VERSIONS } from '../api-samples'
import { useTx } from '../i18n'

const STATES: Record<ApiVersion['state'], [string, string]> = {
  wip: ['Work in progress', 'var(--text-faint)'], shared: ['Shared', 'var(--warn)'],
  published: ['Published', 'var(--ok)'], archived: ['Archived', 'var(--text-faint)'],
}
const REASONS: Record<string, string> = {
  not_validated: 'Not validated on the server yet',
  below_min_score: 'Score below the house minimum',
  failed_specs: 'IDS specifications fail',
  needs_review: 'Needs a reviewer approval',
  rejected_by_reviewer: 'A reviewer rejected it',
}

/** T1 quality gate · T2 house standard · T5 ISO 19650 states · T8 audit log. */
export default function Quality(_: SectionProps) {
  const tx = useTx()
  const versions = usePaidQuery(() => paidApi.versions(), SAMPLE_VERSIONS)
  const standard = usePaidQuery(() => paidApi.standard(), SAMPLE_STANDARD)
  const audit = usePaidQuery(() => paidApi.audit(), SAMPLE_API_AUDIT)
  const live = versions.source === 'live'
  const [std, setStd] = useState(standard.data.standard)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)
  useEffect(() => setStd(standard.data.standard), [standard.data])

  const refresh = () => { versions.reload(); audit.reload() }
  async function saveStandard() {
    const r = await paidApi.saveStandard(std)
    setMsg(r.ok ? { tone: 'ok', text: tx('House standard saved.') } : { tone: 'danger', text: r.error.message ?? r.error.code })
    if (r.ok) { standard.reload(); audit.reload() }
  }
  async function act(v: ApiVersion, kind: 'approve' | 'publish' | 'share') {
    const r = kind === 'approve' ? await paidApi.review(v.id, 'approve') : await paidApi.moveVersion(v.id, kind === 'publish' ? 'published' : 'shared')
    if (r.ok) setMsg({ tone: 'ok', text: kind === 'approve' ? tx('Approved.') : kind === 'publish' ? tx('Published.') : tx('Shared.') })
    else if (r.error.code === 'gate_blocked') setMsg({ tone: 'danger', text: `${tx('Blocked by the quality gate')}: ${(r.error.reasons ?? []).map((x) => tx(REASONS[x] ?? x)).join(' · ')}` })
    else setMsg({ tone: 'danger', text: r.error.message ?? r.error.code })
    refresh()
  }

  return (
    <>
      <Head title={tx('Quality gate')} sub={tx('Every upload is validated with your house standard. Nothing is published below the minimum score without a reviewer.')} />
      <SoonBanner section="quality" source={versions.source} error={versions.error} />
      {msg && <p role="status" className="text-[12.5px] mb-3" style={{ color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--danger)' }}>{msg.text}</p>}

      <h2 className="text-[13px] font-semibold mb-2">{tx('Model versions')}</h2>
      <DataList rows={versions.data.versions} rowKey={(v) => v.id} primaryHeader={tx('Version')}
        primary={(v) => <><p className="font-medium">{v.container} · R{v.revision}</p><p className="text-[11.5px] text-[var(--text-faint)]">{v.file_name} · {v.uploaded_by ?? '—'}</p></>}
        columns={[
          { key: 'state', header: tx('State'), cell: (v) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={STATES[v.state][1]} />{tx(STATES[v.state][0])} · {v.suitability}</span> },
          { key: 'score', header: tx('Score'), align: 'right', cell: (v) => v.score === null ? <span className="text-[12px] text-[var(--text-faint)]">—</span> : <span className="tabular-nums font-medium" style={{ color: scoreColor(v.score) }}>{v.score}</span> },
        ]}
        actions={(v) => !live ? null : v.state === 'shared'
          ? <span className="flex gap-1.5"><Quiet onClick={() => void act(v, 'approve')}>{tx('Approve')}</Quiet><Primary onClick={() => void act(v, 'publish')}>{tx('Publish')}</Primary></span>
          : v.state === 'wip' ? <Quiet onClick={() => void act(v, 'share')}>{tx('Share')}</Quiet> : null}
      />

      <div className="mt-6">
        <SettingGroup title={tx('Publishing rules')}>
          <SettingRow title={tx('Minimum Health Score to publish')} detail={tx('Uploads below it stay in Shared until they improve.')}>
            <input type="number" min={0} max={100} value={std.min_score} onChange={(e) => setStd({ ...std, min_score: Number(e.target.value) })} className={`${inputClass} w-[80px] tabular-nums`} aria-label={tx('Minimum Health Score to publish')} />
          </SettingRow>
          <SettingRow title={tx('A reviewer must approve')} detail={tx('Reviewers are free seats.')}>
            <Toggle checked={std.require_review} onChange={(v) => setStd({ ...std, require_review: v })} label={tx('A reviewer must approve')} />
          </SettingRow>
          <SettingRow title={tx('Open an issue for each failed rule')} detail={tx('Assigned to whoever uploaded the file.')}>
            <Toggle checked={std.auto_issues} onChange={(v) => setStd({ ...std, auto_issues: v })} label={tx('Open an issue for each failed rule')} />
          </SettingRow>
          {live && <SettingRow title={tx('Save the house standard')}><Primary onClick={() => void saveStandard()}>{tx('Save')}</Primary></SettingRow>}
        </SettingGroup>
      </div>

      <h2 className="text-[13px] font-semibold mb-2">{tx('Audit log')}</h2>
      <DataList rows={audit.data.events} rowKey={(a) => a.at + a.type + (a.actor_id ?? '')} primaryHeader={tx('Event')}
        primary={(a) => <p>{typeof a.details.text === 'string' ? a.details.text : `${a.type.replace(/_/g, ' ')}${a.to ? ` → ${a.to}` : ''}`}</p>}
        columns={[
          { key: 'who', header: tx('Who'), cell: (a) => <span className="text-[12.5px]">{a.actor_id ?? tx('System')}</span> },
          { key: 'at', header: tx('When'), cell: (a) => <span className="text-[12px] tabular-nums text-[var(--text-dim)]">{a.at.slice(0, 16).replace('T', ' ')}</span> },
        ]} />
    </>
  )
}
