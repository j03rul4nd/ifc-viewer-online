import { useEffect, useState } from 'react'
import { paidApi, type ApiRole } from '../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../hooks/usePaidQuery'
import { SoonBanner } from '../Soon'
import type { SectionProps } from '../registry'
import { Head, Primary, Quiet, Panel, SectionLabel, DataList, Dialog, Field, Tabs, inputClass, fmtInt, type Column } from '../ui'
import { ACTIONS, DEFAULTS, GRANTABLE, PAID_ROLES, ROLES, toggled, useAccess, type Action, type Role } from '../roles'
import { useTx } from '../i18n'

interface Member { id: string; name: string; email: string; role: Role; lastActive: string | null; projects: string[] | null }

const SEATS = 5
const SAMPLE: Member[] = [
  { id: 'lm', name: 'Laura Mas', email: 'laura@estudionorte.example', role: 'owner', lastActive: '2026-10-16', projects: null },
  { id: 'jp', name: 'Jordi Puig', email: 'jordi@estudionorte.example', role: 'admin', lastActive: '2026-10-15', projects: null },
  { id: 'as', name: 'Ana Soler', email: 'ana@estudionorte.example', role: 'editor', lastActive: null, projects: null },
  { id: 'rv', name: 'Marc Vidal', email: 'marc@cliente.example', role: 'reviewer', lastActive: '2026-10-12', projects: null },
  { id: 'dg', name: 'Núria Ferrer', email: 'nuria@estudionorte.example', role: 'viewer', lastActive: '2026-10-01', projects: null },
  { id: 'gt', name: 'Eva Torres', email: 'eva@contrata.example', role: 'guest', lastActive: '2026-10-02', projects: null },
]

const EDITABLE = ROLES.filter((r) => r !== 'owner')
const SHOWN: Action[] = ACTIONS.filter((a) => a !== 'read')

/** Team plan screen. Who is here, what each role may do, and which projects each person sees. */
export default function Team({ data }: SectionProps) {
  const tx = useTx()
  const { policies, setPolicies } = useAccess()
  const [members, setMembers] = useState(SAMPLE)
  const [tab, setTab] = useState<'people' | 'roles'>('people')
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [scoping, setScoping] = useState<Member | null>(null)
  const ROLE: Record<Role, string> = { owner: tx('Owner'), admin: tx('Admin'), editor: tx('Editor'), reviewer: tx('Reviewer'), viewer: tx('Viewer'), guest: tx('Guest') }
  const ACTION: Record<Action, string> = {
    read: tx('See projects'), comment: tx('Comment'), 'issue.create': tx('Raise issues'), 'issue.edit': tx('Assign and close issues'), 'version.upload': tx('Upload versions'), 'version.move': tx('Share versions'),
    'version.publish': tx('Publish versions'), 'version.review': tx('Approve versions'), 'standard.edit': tx('Change the house standard'), 'audit.read': tx('Read the audit log'), 'reception.manage': tx('Manage suppliers and deliveries'),
    'automations.manage': tx('Build automations'), 'value.read': tx('See the value report'), 'webhooks.manage': tx('Connect integrations'), 'middleware.manage': tx('Run data containers'), 'members.manage': tx('Manage people and roles'), billing: tx('Handle billing'),
  }
  const q = usePaidQuery(() => paidApi.members(), { members: [], seats: { paid: SEATS, used: 0 } })
  const roles = usePaidQuery(() => paidApi.policies(), { roles: [] })
  const versions = usePaidQuery(() => paidApi.versions(), { versions: [] })
  const live = q.source === 'live'
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (live) setMembers(q.data.members.map((m) => ({ id: m.user_id, name: m.user_id, email: '', role: m.role, lastActive: m.since.slice(0, 10), projects: null }))) }, [live, q.data])
  useEffect(() => {
    if (roles.source !== 'live') return
    setPolicies({ ...policies, ...Object.fromEntries(roles.data.roles.map((r) => [r.role, r.can as Action[]])) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.source, roles.data])
  const report = (r: { ok: boolean; error?: { code: string; message?: string } }) => setErr(r.ok ? null : r.error?.code === 'no_seat' ? tx('All paid seats are in use. Add a seat in Credits & billing, or invite a reviewer.') : r.error?.message ?? r.error?.code ?? null)
  const changeRole = (m: Member, to: Role) => {
    setMembers(members.map((x) => (x.id === m.id ? { ...x, role: to } : x)))
    if (live) void paidApi.setRole(m.id, to as ApiRole).then((r) => { report(r); q.reload() })
  }
  const flip = (r: Role, a: Action) => {
    const next = toggled(policies, r, a)
    setPolicies(next)
    if (live) void paidApi.setPolicy(r as ApiRole, [...next[r]]).then((x) => { report(x); roles.reload() })
  }
  const paid = (r: Role) => PAID_ROLES.includes(r)
  const seats = live ? q.data.seats.paid : SEATS
  const used = members.filter((m) => paid(m.role)).length
  const full = paid(role) && used >= seats
  const canTake = (m: Member, r: Role) => m.role === r || !paid(r) || paid(m.role) || used < seats
  const others = (m: Member) => m.role !== 'owner' || members.some((x) => x.id !== m.id && x.role === 'owner')

  const columns: Column<Member>[] = [
    { key: 'role', header: tx('Role'), cell: (m) => (!others(m) ? ROLE.owner : (
      <select aria-label={tx('Role of {{name}}', { name: m.name })} className={`${inputClass} !h-[32px] w-auto`} value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
        {ROLES.map((r) => <option key={r} value={r} disabled={!canTake(m, r)}>{ROLE[r]}</option>)}
      </select>
    )) },
    { key: 'projects', header: tx('Projects'), cell: (m) => (m.role === 'owner' || m.role === 'admin' ? <span className="text-[12.5px] text-[var(--text-dim)]">{tx('All')}</span>
      : <button className="text-[12.5px] text-[var(--accent)] hover:underline text-left" onClick={() => setScoping(m)}>{m.projects ? tx('{{n}} projects', { n: m.projects.length }) : tx('All')}</button>) },
    { key: 'active', header: tx('Last active'), hideOnPhone: true, cell: (m) => m.lastActive ?? <span className="text-[var(--text-faint)]">{tx('Invite sent')}</span>, className: 'tabular-nums' },
  ]
  const invite = () => {
    setMembers([...members, { id: email, name: email.split('@')[0], email, role, lastActive: null, projects: null }])
    setInviting(false); setEmail('')
  }

  return (
    <>
      <Head title={tx('Team')} sub={data.account.org} action={live ? undefined : <Primary onClick={() => setInviting(true)}>{tx('Invite a colleague')}</Primary>} />
      {live && <SoonBanner section="team" source={q.source} error={q.error} />}
      {err && <p role="alert" className="mb-3 text-[12.5px] text-[var(--danger)]">{err}</p>}

      <Panel className="p-4 sm:p-5 mb-6 grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
        <div>
          <p className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] leading-none">{fmtInt(used)}<span className="text-[15px] font-normal text-[var(--text-dim)]"> / {seats}</span></p>
          <p className="mt-1.5 text-[13px] text-[var(--text-dim)]">{tx('Paid seats')}</p>
        </div>
        <p className="text-[13px] text-[var(--text-dim)] sm:self-center max-w-[560px]">{tx('Owner, admins and editors use a seat. Reviewers, viewers and guests are free, so whoever checks the work or reads the numbers never needs a licence.')}</p>
      </Panel>

      <div className="mb-4"><Tabs tabs={[{ id: 'people' as const, label: tx('People') }, { id: 'roles' as const, label: tx('What each role can do') }]} value={tab} onChange={setTab} label={tx('Team')} /></div>

      {tab === 'people' ? (
        <>
          <SectionLabel>{tx('Members')}</SectionLabel>
          <DataList rows={members} rowKey={(m) => m.id} primaryHeader={tx('Name')} columns={columns}
            primary={(m) => <><p className="font-medium">{m.name}</p><p className="text-[12px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{m.email}</p></>}
            actions={(m) => (m.role === 'owner' ? null : <Quiet onClick={() => setMembers(members.filter((x) => x.id !== m.id))}>{tx('Remove')}</Quiet>)} />
        </>
      ) : (
        <>
          <p className="mb-3 text-[13px] leading-[1.5] text-[var(--text-dim)] max-w-[680px]">{tx('Changes apply to everyone with that role straight away. A dash means the role cannot have it: free seats cannot take paid work, and only the owner handles billing.')}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <Quiet onClick={() => setPolicies({ ...policies, viewer: [...new Set<Action>([...policies.viewer, 'value.read', 'audit.read'])] })}>{tx('Let viewers read the value report')}</Quiet>
            <Quiet onClick={() => setPolicies({ ...policies, ...Object.fromEntries(EDITABLE.map((r) => [r, DEFAULTS[r]])) })}>{tx('Back to the defaults')}</Quiet>
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead><tr className="border-b border-[var(--border)] text-left text-[var(--text-dim)]">
                <th scope="col" className="px-3 py-2 font-medium">{tx('Permission')}</th>
                {EDITABLE.map((r) => <th key={r} scope="col" className="px-2 py-2 font-medium text-center">{ROLE[r]}</th>)}
              </tr></thead>
              <tbody>
                {SHOWN.map((a) => (
                  <tr key={a} className="border-b last:border-b-0 border-[var(--border)]">
                    <th scope="row" className="px-3 py-2 font-normal text-left">{ACTION[a]}</th>
                    {EDITABLE.map((r) => (
                      <td key={r} className="px-2 py-2 text-center">
                        {GRANTABLE[r].includes(a)
                          ? <input type="checkbox" aria-label={`${ROLE[r]}: ${ACTION[a]}`} checked={policies[r].includes(a)} onChange={() => flip(r, a)} />
                          : <span className="text-[var(--text-faint)]" aria-label={tx('Not available')}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {scoping && <ProjectAccess member={scoping} projects={live ? [...new Set(versions.data.versions.map((v) => v.container.split('-')[0]))] : data.projects.map((p) => p.name)} onClose={() => setScoping(null)} onSave={(projects) => { setMembers(members.map((x) => (x.id === scoping.id ? { ...x, projects } : x))); if (live) void paidApi.setMemberProjects(scoping.id, projects ?? []).then(report); setScoping(null) }} />}

      {inviting && (
        <Dialog title={tx('Invite a colleague')} onClose={() => setInviting(false)}
          footer={<><Quiet onClick={() => setInviting(false)}>{tx('Cancel')}</Quiet><Primary disabled={!/.+@.+\..+/.test(email) || full} onClick={invite}>{tx('Send invite')}</Primary></>}>
          <div className="grid gap-4">
            <Field label={tx('Email')}><input type="email" autoComplete="off" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={tx('Role')} hint={full ? tx('All paid seats are in use. Add a seat in Credits & billing, or invite a reviewer.') : undefined}>
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {EDITABLE.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
              </select>
            </Field>
          </div>
        </Dialog>
      )}
    </>
  )
}

function ProjectAccess({ member, projects, onClose, onSave }: { member: Member; projects: string[]; onClose: () => void; onSave: (p: string[] | null) => void }) {
  const tx = useTx()
  const [picked, setPicked] = useState<string[]>(member.projects ?? [])
  return (
    <Dialog title={tx('Projects {{name}} can see', { name: member.name })} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{tx('Cancel')}</Quiet><Primary onClick={() => onSave(picked.length ? picked : null)}>{tx('Save')}</Primary></>}>
      <div className="flex flex-col gap-2.5">
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{tx('Pick none to let them see all projects.')}</p>
        {projects.map((p) => (
          <label key={p} className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" className="mt-0.5" checked={picked.includes(p)} onChange={() => setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p])} />
            <span className="[overflow-wrap:anywhere]">{p}</span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}
