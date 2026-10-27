import type { SectionProps } from '../registry'
import { Head, Quiet, Empty, DataList, scoreColor } from '../ui'

export default function Certificates({ data }: SectionProps) {
  return (
    <>
      <Head title="Certificates" sub="Anyone with the link can check the file fingerprint and the result. The model itself is never published." />
      {data.certificates.length === 0 ? (
        <Empty title="No certificates issued" body="A certificate proves that a specific file passed specific checks on a specific date. Your client verifies it with one link — no account needed." />
      ) : (
        <DataList
          rows={data.certificates}
          rowKey={(c) => c.id}
          primaryHeader="Certificate"
          rowClassName={(c) => (c.revoked ? 'text-[var(--text-faint)]' : '')}
          primary={(c) => <><p className="font-medium break-all">{c.file}</p><p className="text-[11.5px] text-[var(--text-faint)]">{c.id} · {c.issuedAt} · {c.project}</p></>}
          columns={[
            { key: 'profile', header: 'Profile', wide: true, cell: (c) => c.profile },
            { key: 'score', header: 'Score', cell: (c) => <span className="tabular-nums font-semibold" style={{ color: c.revoked ? undefined : scoreColor(c.score) }}>{c.score}</span> },
            { key: 'hash', header: 'SHA-256', hideOnPhone: true, desktopOnly: true, cell: (c) => <span className="font-mono text-[12px]">{c.hash}</span> },
            { key: 'status', header: 'Status', cell: (c) => (c.revoked ? 'Revoked' : 'Valid') },
          ]}
          actions={(c) => (c.revoked ? null : <><Quiet>Copy link</Quiet><Quiet>Badge</Quiet><Quiet>Revoke</Quiet></>)}
        />
      )}
    </>
  )
}
