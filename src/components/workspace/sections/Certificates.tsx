import type { SectionProps } from '../registry'
import { Head, Quiet, Empty, DataList, scoreColor } from '../ui'import { useTx } from '../i18n'


export default function Certificates({ data }: SectionProps) {
  const tx = useTx()
  return (
    <>
      <Head title={tx("Certificates")} sub={tx("Anyone with the link can check the file fingerprint and the result. The model itself is never published.")} />
      {data.certificates.length === 0 ? (
        <Empty title={tx("No certificates issued")} body={tx("A certificate proves that a specific file passed specific checks on a specific date. Your client verifies it with one link — no account needed.")} />
      ) : (
        <DataList tour="cert-list"
          rows={data.certificates}
          rowKey={(c) => c.id}
          primaryHeader={tx("Certificate")}
          rowClassName={(c) => (c.revoked ? 'text-[var(--text-faint)]' : '')}
          primary={(c) => <><p className="font-medium break-all">{c.file}</p><p className="text-[11.5px] text-[var(--text-faint)]">{c.id} · {c.issuedAt} · {c.project}</p></>}
          columns={[
            { key: 'profile', header: tx("Profile"), wide: true, cell: (c) => c.profile },
            { key: 'score', header: tx("Score"), cell: (c) => <span className="tabular-nums font-semibold" style={{ color: c.revoked ? undefined : scoreColor(c.score) }}>{c.score}</span> },
            { key: 'hash', header: tx("SHA-256"), hideOnPhone: true, desktopOnly: true, cell: (c) => <span className="font-mono text-[12px]">{c.hash}</span> },
            { key: 'status', header: tx("Status"), cell: (c) => (c.revoked ? tx('Revoked') : tx('Valid')) },
          ]}
          actions={(c) => (c.revoked ? null : <><Quiet>{tx("Copy link")}</Quiet><Quiet>{tx("Badge")}</Quiet><Quiet>{tx("Revoke")}</Quiet></>)}
        />
      )}
    </>
  )
}
