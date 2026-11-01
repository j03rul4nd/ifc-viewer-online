import { useState } from 'react'
import type { SectionProps } from '../registry'
import { Head, Primary, Quiet, Panel, SectionLabel, DataList, Dialog, Field, inputClass, fmtInt, type Column } from '../ui'
import { useTx } from '../i18n'

type Role = 'editor' | 'reviewer' | 'guest'
interface Member { id: string; name: string; email: string; role: Role; lastActive: string | null }

const SEATS = 5
const SAMPLE: Member[] = [
  { id: 'lm', name: 'Laura Mas', email: 'laura@estudionorte.example', role: 'editor', lastActive: '2026-10-16' },
  { id: 'jp', name: 'Jordi Puig', email: 'jordi@estudionorte.example', role: 'editor', lastActive: '2026-10-15' },
  { id: 'as', name: 'Ana Soler', email: 'ana@estudionorte.example', role: 'editor', lastActive: null },
  { id: 'rv', name: 'Marc Vidal', email: 'marc@cliente.example', role: 'reviewer', lastActive: '2026-10-12' },
  { id: 'gt', name: 'Eva Torres', email: 'eva@contrata.example', role: 'guest', lastActive: '2026-10-02' },
]

/** Team plan screen. Pro accounts never reach it: the shell shows LockedSection instead. */
export default function Team({ data }: SectionProps) {
  const tx = useTx()
  const [members, setMembers] = useState(SAMPLE)
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const ROLE: Record<Role, string> = { editor: tx('Editor'), reviewer: tx('Reviewer'), guest: tx('Guest') }
  const used = members.filter((m) => m.role === 'editor').length
  const full = role === 'editor' && used >= SEATS

  const columns: Column<Member>[] = [
    { key: 'role', header: tx('Role'), cell: (m) => ROLE[m.role] },
    { key: 'active', header: tx('Last active'), cell: (m) => m.lastActive ?? <span className="text-[var(--text-faint)]">{tx('Invite sent')}</span>, className: 'tabular-nums' },
  ]
  const invite = () => {
    setMembers([...members, { id: email, name: email.split('@')[0], email, role, lastActive: null }])
    setInviting(false); setEmail('')
  }

  return (
    <>
      <Head title={tx('Team')} sub={data.account.org} action={<Primary onClick={() => setInviting(true)}>{tx('Invite a colleague')}</Primary>} />

      <Panel className="p-4 sm:p-5 mb-8 grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
        <div>
          <p className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] leading-none">{fmtInt(used)}<span className="text-[15px] font-normal text-[var(--text-dim)]"> / {SEATS}</span></p>
          <p className="mt-1.5 text-[13px] text-[var(--text-dim)]">{tx('Editor seats')}</p>
        </div>
        <p className="text-[13px] text-[var(--text-dim)] sm:self-center max-w-[560px]">{tx('Editors work on projects and spend shared credits. Reviewers comment and guests see one project; both are free.')}</p>
      </Panel>

      <SectionLabel>{tx('Members')}</SectionLabel>
      <DataList rows={members} rowKey={(m) => m.id} primaryHeader={tx('Name')} columns={columns}
        primary={(m) => <><p className="font-medium">{m.name}</p><p className="text-[12px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{m.email}</p></>}
        actions={(m) => (m.id === 'lm' ? null : <Quiet onClick={() => setMembers(members.filter((x) => x.id !== m.id))}>{tx('Remove')}</Quiet>)} />

      {inviting && (
        <Dialog title={tx('Invite a colleague')} onClose={() => setInviting(false)}
          footer={<><Quiet onClick={() => setInviting(false)}>{tx('Cancel')}</Quiet><Primary disabled={!/.+@.+\..+/.test(email) || full} onClick={invite}>{tx('Send invite')}</Primary></>}>
          <div className="grid gap-4">
            <Field label={tx('Email')}><input type="email" autoComplete="off" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={tx('Role')} hint={full ? tx('All editor seats are in use. Add a seat in Credits & billing, or invite a reviewer.') : undefined}>
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
              </select>
            </Field>
          </div>
        </Dialog>
      )}
    </>
  )
}
