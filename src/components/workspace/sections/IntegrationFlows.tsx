// The working half of Integrations: watched folders in the company's own
// storage, the webhook delivery log, chat notices, Power BI export and the API.
// Sample data in the shapes of lib/connectors (built dark, doc 32): the CSV
// download runs in the browser on these rows, nothing is sent anywhere.
import { useState } from 'react'
import type { WatchedFolder, DeliveryRecord, ValidationRow } from '../../../lib/connectors'
import { toCsv, slackBody } from '../../../lib/connectors'
import { Panel, SectionLabel, DataList, Quiet, Dot, CopyField } from '../ui'
import { useTx, wsLocale } from '../i18n'

const FOLDERS: (WatchedFolder & { validated: number; lastResult: string })[] = [
  { connector: 'sharepoint', folderId: 'b!sample|F1', folderName: 'HCA / 02 Shared / Models', seen: [], state: 'watching', lastPollAt: '2026-11-12T09:58:00Z', failures: 0, validated: 14, lastResult: 'HCA_ARQ_v6.ifc · 88' },
  { connector: 'gdrive', folderId: 'sample-folder', folderName: 'Suppliers / MEP deliveries', seen: [], state: 'paused', lastPollAt: '2026-11-12T07:40:00Z', failures: 3, lastError: 'GET /changes → 503', validated: 5, lastResult: 'HCA_MEP_v5.ifc · 71' },
]

const DELIVERIES: DeliveryRecord[] = [
  { id: 'evt_3', endpoint: 'https://hooks.example.com/ifc', event: 'validation.completed', state: 'delivered', attempts: [{ at: '2026-11-12T09:58:10Z', status: 204, durationMs: 182 }] },
  { id: 'evt_2', endpoint: 'https://hooks.example.com/ifc', event: 'delivery.rejected', state: 'delivered', attempts: [{ at: '2026-11-12T08:01:00Z', status: 503, durationMs: 2010 }, { at: '2026-11-12T08:01:30Z', status: 200, durationMs: 240 }] },
  { id: 'evt_1', endpoint: 'https://n8n.example.com/webhook/bim', event: 'score.dropped', state: 'failed', attempts: [{ at: '2026-11-11T17:20:00Z', status: 410, durationMs: 95 }] },
]

const ROWS: ValidationRow[] = [
  { project: 'Hospital Fase 2', model: 'HCA_ARQ_v6.ifc', version: 'c6', checkedAt: '2026-11-12T09:58:00Z', score: 88, passed: true, errors: 0, warnings: 4, issuesOpen: 1, profile: 'house-v3' },
  { project: 'Hospital Fase 2', model: 'HCA_MEP_v5.ifc', version: 'c5', checkedAt: '2026-11-12T07:39:00Z', score: 71, passed: false, errors: 6, warnings: 9, issuesOpen: 5, profile: 'house-v3' },
  { project: 'Hospital Fase 2', model: 'HCA_EST_v4.ifc', version: 'c4', checkedAt: '2026-11-11T16:12:00Z', score: 93, passed: true, errors: 0, warnings: 1, issuesOpen: 0, profile: 'house-v3' },
]

const time = (iso?: string) => (iso ? new Date(iso).toLocaleString(wsLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function IntegrationFlows() {
  const tx = useTx()
  const [preview, setPreview] = useState(false)
  const stateLabel: Record<string, [string, string]> = {
    watching: [tx('Watching'), 'var(--ok)'],
    paused: [tx('Paused after 3 failed checks'), 'var(--warn)'],
    error: [tx('Error'), 'var(--danger)'],
    disconnected: [tx('Sign in again'), 'var(--danger)'],
    connected: [tx('Connected'), 'var(--text-faint)'],
  }
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(ROWS)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'validations.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }
  const notice = slackBody({ title: 'HCA_MEP_v5.ifc', text: tx('Delivery rejected: score 71, below 80'), url: 'https://www.ifcvieweronline.eu/?model=sample', linkLabel: tx('Open the view'), tone: 'fail' })

  return (
    <div data-testid="integration-flows">
      <SectionLabel>{tx('Watched folders')}</SectionLabel>
      <p className="text-[12.5px] text-[var(--text-dim)] mb-3 max-w-[70ch]">{tx('Each new IFC in the folder is validated and the report is saved next to it, in your storage. Nothing else to install.')}</p>
      <DataList rows={FOLDERS} rowKey={(f) => f.folderId} primaryHeader={tx('Folder')}
        primary={(f) => (
          <span className="flex flex-col">
            <span className="text-[13px]">{f.folderName}</span>
            <span className="text-[11.5px] text-[var(--text-faint)]">{f.connector === 'sharepoint' ? 'SharePoint / OneDrive' : 'Google Drive'}</span>
          </span>
        )}
        columns={[
          { key: 'state', header: tx('Status'), cell: (f) => <span className="inline-flex items-center gap-1.5 text-[12px]"><Dot color={stateLabel[f.state][1]} />{stateLabel[f.state][0]}</span> },
          { key: 'last', header: tx('Last result'), cell: (f) => <span className="text-[12px] text-[var(--text-dim)]">{f.lastResult}</span> },
          { key: 'n', header: tx('Validated'), cell: (f) => <span className="text-[12px] tabular-nums">{f.validated}</span> },
          { key: 'poll', header: tx('Last check'), wide: true, cell: (f) => <span className="text-[12px] text-[var(--text-faint)]">{time(f.lastPollAt)}{f.lastError ? ` · ${f.lastError}` : ''}</span> },
        ]} />

      <div className="h-6" />
      <SectionLabel>{tx('Webhook deliveries')}</SectionLabel>
      <DataList rows={DELIVERIES} rowKey={(d) => d.id} primaryHeader={tx('Event')}
        primary={(d) => <code className="text-[12px]">{d.event}</code>}
        columns={[
          { key: 'st', header: tx('Result'), cell: (d) => <span className="inline-flex items-center gap-1.5 text-[12px]"><Dot color={d.state === 'delivered' ? 'var(--ok)' : 'var(--danger)'} />{d.attempts.map((a) => a.status ?? '—').join(' → ')}</span> },
          { key: 'n', header: tx('Attempts'), cell: (d) => <span className="text-[12px] tabular-nums">{d.attempts.length}</span> },
          { key: 'at', header: tx('Sent'), wide: true, cell: (d) => <span className="text-[12px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{time(d.attempts[0].at)} · {d.endpoint}</span> },
        ]} />

      <div className="grid gap-3 lg:grid-cols-3 mt-8">
        <Panel className="p-4">
          <p className="text-[13.5px] font-medium">{tx('Teams and Slack')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{tx('Paste an incoming webhook URL created in your own channel. Notices carry a link to the exact view.')}</p>
          <Quiet className="mt-3" onClick={() => setPreview((v) => !v)}>{tx('Preview the message')}</Quiet>
          {preview && <pre className="mt-3 text-[11px] leading-snug overflow-auto max-h-48 bg-[var(--surface-2)] rounded-[8px] p-2">{JSON.stringify(notice, null, 2)}</pre>}
        </Panel>
        <Panel className="p-4">
          <p className="text-[13.5px] font-medium">{tx('Power BI and Excel')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{tx('Stable columns: score, errors and open issues per model and version. In Power BI use Get data → OData feed.')}</p>
          <Quiet className="mt-3" onClick={downloadCsv}>{tx('Download CSV')}</Quiet>
          <div className="mt-3"><CopyField label={tx('OData feed')} value="https://api.example.test/odata/Validations" /></div>
        </Panel>
        <Panel className="p-4">
          <p className="text-[13.5px] font-medium">{tx('Validation API')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{tx('Validate from your own pipeline: OpenAPI spec with curl, JavaScript and Python examples, and a ready GitHub Action.')}</p>
          <div className="mt-3"><CopyField label="curl" value={'curl -X POST "$IFCVO_API_URL/v1/validations" -H "Authorization: Bearer $IFCVO_API_KEY" -F "file=@Model.ifc"'} /></div>
        </Panel>
      </div>
    </div>
  )
}
