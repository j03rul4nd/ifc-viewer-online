// ─── AdminView ────────────────────────────────────────────────────────────────
// /admin — the REAL platform console, wired to the Worker's v5 super-admin
// surface (/admin/* — ifc-cloud-api/src/routes/admin.ts). The security
// boundary is SERVER-SIDE: the Worker answers 404 to anyone whose
// users.global_role is not super_admin; the client-side email gate in App is
// only a fast path to avoid a pointless probe. Every mutation here lands in
// the append-only admin_audit_log on the Worker.
//
// CLERK-FREE (I-1): the session token comes from cloudAccountStore.getToken().
// Emails/names are NOT shown for other users — the DB stores none (they live
// in Clerk); rows are keyed by Clerk user id.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import {
  getAdminOverview, listAdminUsers, patchAdminUser, deleteAdminUser,
  listAdminOrgs, patchAdminOrg, listAdminWorkspaces, patchAdminWorkspace,
  getAdminWorkspaceUsage, resetAdminWorkspaceUsage,
  listAdminPlans, createAdminPlan, patchAdminPlan,
  type AdminOverview, type AdminUserSummary, type AdminOrg,
  type AdminWorkspace, type AdminWorkspaceUsage, type AdminCustomPlan, type PlanId,
} from '../../lib/cloud/admin-client'

interface AdminViewProps {
  onBack: () => void
  authorized: boolean
  theme?: 'dark' | 'light'
}

type Tab = 'overview' | 'users' | 'orgs' | 'workspaces' | 'plans'
type Gate = 'loading' | 'ok' | 'denied' | 'offline'

const nf = new Intl.NumberFormat('en-US')
const df = (iso: string) => new Date(iso).toISOString().slice(0, 10)
const short = (id: string) => (id.length > 18 ? `${id.slice(0, 15)}…` : id)

export default function AdminView({ onBack, authorized, theme = 'dark' }: AdminViewProps) {
  const { t } = useTranslation('pro')
  const light = theme === 'light'
  const getToken = useCloudAccountStore((s) => s.getToken)
  const accountStatus = useCloudAccountStore((s) => s.status)

  const [gate, setGate] = useState<Gate>('loading')
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  /** Run an authenticated call; resolves null (+ notice) on failure. */
  const call = useCallback(async <T,>(fn: (token: string) => Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message?: string } }>): Promise<T | null> => {
    const token = getToken ? await getToken() : null
    if (!token) { setGate('denied'); return null }
    const res = await fn(token)
    if (!res.ok) {
      setNotice(res.error.message ?? res.error.code)
      return null
    }
    return res.value
  }, [getToken])

  // Gate probe: /admin/overview. 404/unauthorized → denied (the server is the boundary).
  useEffect(() => {
    if (!authorized || accountStatus !== 'signed-in') {
      if (accountStatus !== 'loading') setGate(authorized ? 'denied' : 'denied')
      return
    }
    let cancelled = false
    void (async () => {
      const token = getToken ? await getToken() : null
      if (!token) { if (!cancelled) setGate('denied'); return }
      const res = await getAdminOverview(token)
      if (cancelled) return
      if (res.ok) { setOverview(res.value); setGate('ok') }
      else if (res.error.code === 'cloud_disabled' || res.error.code === 'network') setGate('offline')
      else setGate('denied')
    })()
    return () => { cancelled = true }
  }, [authorized, accountStatus, getToken])

  // ── Shared styles (same idiom as DashboardView) ────────────────────────────
  const card: React.CSSProperties = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)', boxShadow: '0 20px 50px -24px rgba(40,48,120,0.22)' }
    : { background: 'rgba(18,19,26,0.6)', borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 24px 70px -30px rgba(0,0,0,0.7)' }
  const ghost: React.CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)' }
  const chrome = `min-h-full w-full ${light ? 'lp-light' : ''}`

  if (gate !== 'ok') {
    const msg = gate === 'loading' ? t('admin.loading')
      : gate === 'offline' ? t('admin.offline')
      : t('admin.denied')
    return (
      <div className={`${chrome} grid place-items-center`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="rounded-2xl border p-8 text-center max-w-[380px]" style={card}>
          <p className="text-[14px] mb-4" style={{ color: 'var(--text-dim)' }}>{msg}</p>
          {gate !== 'loading' && (
            <button onClick={onBack} className="h-9 px-4 rounded-lg text-[12px] font-medium border" style={ghost}>{t('admin.back')}</button>
          )}
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('admin.tabOverview') },
    { id: 'users', label: t('admin.tabUsers') },
    { id: 'orgs', label: t('admin.tabOrgs') },
    { id: 'workspaces', label: t('admin.tabWorkspaces') },
    { id: 'plans', label: t('admin.tabPlans') },
  ]

  return (
    <div className={chrome} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="pointer-events-none fixed inset-0" aria-hidden style={{ background: light ? 'radial-gradient(90% 60% at 50% -10%, rgba(139,92,246,0.12), transparent 60%)' : 'radial-gradient(90% 60% at 50% -10%, rgba(139,92,246,0.20), transparent 60%)' }} />

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-5 py-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-[-0.02em] leading-tight">{t('admin.title')}</h1>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'rgba(94,106,210,0.15)', color: 'var(--accent)' }}>{t('admin.liveBadge')}</span>
          </div>
          <button onClick={onBack} className="h-9 px-4 rounded-lg text-[12px] font-medium border" style={ghost}>{t('admin.back')}</button>
        </header>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <nav className="flex gap-1.5 mb-6 flex-wrap">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className="h-8 px-3.5 rounded-lg text-[12px] font-medium border transition-colors"
              style={tab === x.id
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                : ghost}
            >{x.label}</button>
          ))}
        </nav>

        {notice && (
          <div className="flex items-center justify-between gap-3 text-[12px] rounded-xl px-4 py-2.5 mb-4 border" style={{ borderColor: 'rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.06)', color: light ? '#8a5a00' : '#f5c76a' }}>
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-[11px] underline opacity-80">{t('admin.dismiss')}</button>
          </div>
        )}

        {tab === 'overview' && <OverviewTab overview={overview} card={card} />}
        {tab === 'users' && <UsersTab call={call} card={card} ghost={ghost} busy={busy} setBusy={setBusy} setNotice={setNotice} />}
        {tab === 'orgs' && <OrgsTab call={call} card={card} ghost={ghost} setBusy={setBusy} busy={busy} />}
        {tab === 'workspaces' && <WorkspacesTab call={call} card={card} ghost={ghost} busy={busy} setBusy={setBusy} setNotice={setNotice} />}
        {tab === 'plans' && <PlansTab call={call} card={card} ghost={ghost} busy={busy} setBusy={setBusy} />}
      </div>
    </div>
  )
}

// ── Helpers shared by tabs ────────────────────────────────────────────────────

type Caller = <T>(fn: (token: string) => Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message?: string } }>) => Promise<T | null>

const thCls = 'py-1.5 px-2 font-medium'
const planBadge = (plan: string): React.CSSProperties => plan === 'free'
  ? { background: 'var(--surface-2)', color: 'var(--text-muted)' }
  : { background: 'rgba(94,106,210,0.15)', color: 'var(--accent)' }
const statusColor = (s: string): React.CSSProperties =>
  s === 'active' ? { color: 'var(--ok, #4caf82)' }
  : s === 'past_due' || s === 'suspended' ? { color: '#F5A623' }
  : { color: 'var(--danger, #e5534b)' }

function SectionCard({ card, title, children }: { card: React.CSSProperties; title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border p-5 backdrop-blur-xl overflow-x-auto mb-5" style={card}>
      {title && <h2 className="text-[14px] font-semibold mb-3">{title}</h2>}
      {children}
    </section>
  )
}

function PlanSelect({ value, onChange, disabled, ghost }: { value: PlanId; onChange: (p: PlanId) => void; disabled?: boolean; ghost: React.CSSProperties }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PlanId)}
      className="h-7 px-1.5 rounded-md text-[11px] border bg-transparent"
      style={ghost}
    >
      <option value="free">free</option>
      <option value="pro">pro</option>
      <option value="org">org</option>
    </select>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ overview, card }: { overview: AdminOverview | null; card: React.CSSProperties }) {
  const { t } = useTranslation('pro')
  if (!overview) return null
  const kpis = [
    { label: t('admin.kpiUsers'), value: nf.format(overview.users) },
    { label: t('admin.kpiPaid'), value: nf.format(overview.active_paid_users), accent: true },
    { label: t('admin.kpiOrgs'), value: nf.format(overview.organizations) },
    { label: t('admin.kpiWorkspaces'), value: nf.format(overview.workspaces) },
    { label: t('admin.kpiCerts'), value: nf.format(overview.certificates), accent: true },
    { label: t('admin.kpiSubmissions'), value: nf.format(overview.submissions) },
  ]
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-[18px] border p-4 backdrop-blur-xl flex flex-col gap-1.5" style={card}>
          <span className="text-[28px] font-semibold tabular-nums leading-none" style={k.accent ? { color: 'var(--accent)' } : undefined}>{k.value}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersTab({ call, card, ghost, busy, setBusy, setNotice }: {
  call: Caller; card: React.CSSProperties; ghost: React.CSSProperties
  busy: boolean; setBusy: (b: boolean) => void; setNotice: (m: string | null) => void
}) {
  const { t } = useTranslation('pro')
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (after?: string) => {
    const res = await call((tk) => listAdminUsers(tk, after))
    if (res) {
      setUsers((prev) => after ? [...prev, ...res.users] : res.users)
      setCursor(res.next_cursor)
    }
    setLoaded(true)
  }, [call])

  useEffect(() => { void load() }, [load])

  const mutate = async (id: string, body: Parameters<typeof patchAdminUser>[2]) => {
    setBusy(true)
    const res = await call((tk) => patchAdminUser(tk, id, body))
    if (res) await load()
    setBusy(false)
  }

  const remove = async (id: string) => {
    if (!window.confirm(t('admin.deleteConfirm', { id }))) return
    setBusy(true)
    const res = await call((tk) => deleteAdminUser(tk, id))
    if (res) { setNotice(t('admin.deleted')); await load() }
    setBusy(false)
  }

  return (
    <SectionCard card={card} title={t('admin.usersTitle')}>
      <table className="w-full text-left border-collapse min-w-[720px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <th className={`${thCls} pl-0`}>{t('admin.thUser')}</th>
            <th className={thCls}>{t('admin.thRole')}</th>
            <th className={thCls}>{t('admin.thPlan')}</th>
            <th className={thCls}>{t('admin.thOrgs')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thWorkspaces')}</th>
            <th className={thCls}>{t('admin.thJoined')}</th>
            <th className={thCls}>{t('admin.thStatus')}</th>
            <th className={`${thCls} pr-0 text-right`}>{t('admin.thActions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="py-2 pr-2 text-[11px] font-mono" title={u.id}>{short(u.id)}</td>
              <td className="py-2 px-2 text-[11px]">
                {u.global_role === 'super_admin'
                  ? <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase" style={{ background: 'rgba(245,166,35,0.14)', color: '#F5A623' }}>{t('admin.roleSuperAdmin')}</span>
                  : <span style={{ color: 'var(--text-muted)' }}>{t('admin.roleUser')}</span>}
              </td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1.5">
                  <PlanSelect value={u.plan} disabled={busy} ghost={ghost} onChange={(p) => void mutate(u.id, { plan: p })} />
                  {u.custom_plan && <span className="px-1.5 py-0.5 rounded text-[9px]" style={planBadge('pro')} title={u.custom_plan.name}>★</span>}
                </div>
              </td>
              <td className="py-2 px-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {u.organizations.length === 0 ? '—' : u.organizations.map((o) => o.role).join(', ')}
              </td>
              <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{u.workspaces}</td>
              <td className="py-2 px-2 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{df(u.created_at)}</td>
              <td className="py-2 px-2 text-[11px] font-medium" style={statusColor(u.status === 'disabled' ? 'canceled' : u.plan_status)}>
                {u.status === 'disabled' ? t('admin.statusDisabled') : u.plan_status}
              </td>
              <td className="py-2 pl-2 text-right whitespace-nowrap">
                <button
                  disabled={busy || u.global_role === 'super_admin'}
                  onClick={() => void mutate(u.id, { status: u.status === 'disabled' ? 'active' : 'disabled' })}
                  className="h-7 px-2 rounded-md text-[10px] border mr-1.5 disabled:opacity-40" style={ghost}
                >{u.status === 'disabled' ? t('admin.enable') : t('admin.disable')}</button>
                <button
                  disabled={busy || u.global_role === 'super_admin'}
                  onClick={() => void remove(u.id)}
                  className="h-7 px-2 rounded-md text-[10px] border disabled:opacity-40"
                  style={{ borderColor: 'rgba(229,83,75,0.4)', color: 'var(--danger, #e5534b)' }}
                >{t('admin.delete')}</button>
              </td>
            </tr>
          ))}
          {loaded && users.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('admin.empty')}</td></tr>
          )}
        </tbody>
      </table>
      {cursor && (
        <button onClick={() => void load(cursor)} className="mt-3 h-8 px-3 rounded-lg text-[11px] border" style={ghost}>{t('admin.loadMore')}</button>
      )}
    </SectionCard>
  )
}

// ── Organizations ─────────────────────────────────────────────────────────────

function OrgsTab({ call, card, ghost, busy, setBusy }: {
  call: Caller; card: React.CSSProperties; ghost: React.CSSProperties
  busy: boolean; setBusy: (b: boolean) => void
}) {
  const { t } = useTranslation('pro')
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await call(listAdminOrgs)
    if (res) setOrgs(res.organizations)
    setLoaded(true)
  }, [call])

  useEffect(() => { void load() }, [load])

  const mutate = async (id: string, body: Parameters<typeof patchAdminOrg>[2]) => {
    setBusy(true)
    const res = await call((tk) => patchAdminOrg(tk, id, body))
    if (res) await load()
    setBusy(false)
  }

  return (
    <SectionCard card={card} title={t('admin.orgsTitle')}>
      <table className="w-full text-left border-collapse min-w-[640px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <th className={`${thCls} pl-0`}>{t('admin.thOrg')}</th>
            <th className={thCls}>{t('admin.thPlan')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thSeats')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thMembers')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thDepartments')}</th>
            <th className={thCls}>{t('admin.thStatus')}</th>
            <th className={`${thCls} pr-0 text-right`}>{t('admin.thActions')}</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="py-2 pr-2 text-[11px]">{o.name}<span className="block font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>{short(o.id)}</span></td>
              <td className="py-2 px-2"><PlanSelect value={o.plan} disabled={busy} ghost={ghost} onChange={(p) => void mutate(o.id, { plan: p })} /></td>
              <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{o.seats}</td>
              <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{o.members}</td>
              <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{o.departments}</td>
              <td className="py-2 px-2 text-[11px] font-medium" style={statusColor(o.status)}>{o.status}</td>
              <td className="py-2 pl-2 text-right whitespace-nowrap">
                <button
                  disabled={busy}
                  onClick={() => void mutate(o.id, { status: o.status === 'suspended' ? 'active' : 'suspended' })}
                  className="h-7 px-2 rounded-md text-[10px] border disabled:opacity-40" style={ghost}
                >{o.status === 'suspended' ? t('admin.enable') : t('admin.suspend')}</button>
              </td>
            </tr>
          ))}
          {loaded && orgs.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('admin.empty')}</td></tr>
          )}
        </tbody>
      </table>
    </SectionCard>
  )
}

// ── Workspaces ────────────────────────────────────────────────────────────────

function WorkspacesTab({ call, card, ghost, busy, setBusy, setNotice }: {
  call: Caller; card: React.CSSProperties; ghost: React.CSSProperties
  busy: boolean; setBusy: (b: boolean) => void; setNotice: (m: string | null) => void
}) {
  const { t } = useTranslation('pro')
  const [rows, setRows] = useState<AdminWorkspace[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [usage, setUsage] = useState<AdminWorkspaceUsage | null>(null)

  const load = useCallback(async () => {
    const res = await call((tk) => listAdminWorkspaces(tk))
    if (res) setRows(res.workspaces)
    setLoaded(true)
  }, [call])

  useEffect(() => { void load() }, [load])

  const toggleUsage = async (id: string) => {
    if (expanded === id) { setExpanded(null); setUsage(null); return }
    setExpanded(id); setUsage(null)
    const res = await call((tk) => getAdminWorkspaceUsage(tk, id))
    if (res) setUsage(res)
  }

  const editLimits = async (w: AdminWorkspace) => {
    const current = JSON.stringify(w.limit_overrides ?? {}, null, 0)
    const raw = window.prompt(t('admin.limitsPrompt'), current)
    if (raw === null) return
    let parsed: Record<string, number> | null
    try {
      parsed = raw.trim() === '' || raw.trim() === '{}' ? null : JSON.parse(raw) as Record<string, number>
    } catch { setNotice(t('admin.limitsInvalid')); return }
    setBusy(true)
    const res = await call((tk) => patchAdminWorkspace(tk, w.id, { limitOverrides: parsed }))
    if (res) await load()
    setBusy(false)
  }

  const resetUsage = async (id: string) => {
    if (!window.confirm(t('admin.resetConfirm'))) return
    setBusy(true)
    const res = await call((tk) => resetAdminWorkspaceUsage(tk, id))
    if (res) setNotice(t('admin.resetDone', { count: res.counters_reset }))
    setBusy(false)
    if (expanded === id) { setExpanded(null); setUsage(null) }
  }

  return (
    <SectionCard card={card} title={t('admin.workspacesTitle')}>
      <table className="w-full text-left border-collapse min-w-[720px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            <th className={`${thCls} pl-0`}>{t('admin.thWorkspace')}</th>
            <th className={thCls}>{t('admin.thOwner')}</th>
            <th className={thCls}>{t('admin.thPlan')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thProjects')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thSubmissions')}</th>
            <th className={`${thCls} text-right`}>{t('admin.thClients')}</th>
            <th className={thCls}>{t('admin.thLimits')}</th>
            <th className={`${thCls} pr-0 text-right`}>{t('admin.thActions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <React.Fragment key={w.id}>
              <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-2 pr-2 text-[11px]">{w.name}<span className="block font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>{short(w.id)}</span></td>
                <td className="py-2 px-2 text-[11px] font-mono" style={{ color: 'var(--text-dim)' }} title={w.owner_user_id ?? w.org_id ?? ''}>
                  {w.org_id ? `org ${short(w.org_id)}` : w.owner_user_id ? short(w.owner_user_id) : '—'}
                </td>
                <td className="py-2 px-2"><span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase" style={planBadge(w.plan)}>{w.plan}</span></td>
                <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{w.projects}</td>
                <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{w.submissions}</td>
                <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{w.clients}</td>
                <td className="py-2 px-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {w.limit_overrides ? Object.entries(w.limit_overrides).map(([k, v]) => `${k}=${v}`).join(' ') : '—'}
                </td>
                <td className="py-2 pl-2 text-right whitespace-nowrap">
                  <button disabled={busy} onClick={() => void toggleUsage(w.id)} className="h-7 px-2 rounded-md text-[10px] border mr-1.5" style={ghost}>{t('admin.usage')}</button>
                  <button disabled={busy} onClick={() => void editLimits(w)} className="h-7 px-2 rounded-md text-[10px] border mr-1.5" style={ghost}>{t('admin.limits')}</button>
                  <button disabled={busy} onClick={() => void resetUsage(w.id)} className="h-7 px-2 rounded-md text-[10px] border" style={{ borderColor: 'rgba(245,166,35,0.4)', color: '#F5A623' }}>{t('admin.reset')}</button>
                </td>
              </tr>
              {expanded === w.id && (
                <tr>
                  <td colSpan={8} className="py-2 px-3 text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
                    {!usage ? t('admin.loading') : (
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        {usage.counters.length === 0 && <span>{t('admin.noUsage')}</span>}
                        {usage.counters.map((c) => (
                          <span key={`${c.metric}-${c.period_start}`} className="tabular-nums">
                            {c.metric} · {df(c.period_start)}: <strong>{c.count}</strong>
                          </span>
                        ))}
                        {usage.api_keys.map((k) => (
                          <span key={k.id} className="tabular-nums font-mono">
                            {k.prefix}{k.revoked ? ' (revoked)' : ''}: {k.usage.reduce((s, u) => s + u.calls, 0)} calls/31d
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {loaded && rows.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('admin.empty')}</td></tr>
          )}
        </tbody>
      </table>
    </SectionCard>
  )
}

// ── Custom plans ──────────────────────────────────────────────────────────────

function PlansTab({ call, card, ghost, busy, setBusy }: {
  call: Caller; card: React.CSSProperties; ghost: React.CSSProperties
  busy: boolean; setBusy: (b: boolean) => void
}) {
  const { t } = useTranslation('pro')
  const [plans, setPlans] = useState<AdminCustomPlan[]>([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [basePlan, setBasePlan] = useState<PlanId>('pro')
  const [limitsRaw, setLimitsRaw] = useState('{}')
  const [price, setPrice] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await call(listAdminPlans)
    if (res) setPlans(res.plans)
    setLoaded(true)
  }, [call])

  useEffect(() => { void load() }, [load])

  const inputStyle: React.CSSProperties = { borderColor: 'var(--border)', background: 'transparent', color: 'var(--text)' }

  const create = async () => {
    setFormError(null)
    if (!name.trim()) { setFormError(t('admin.planNameRequired')); return }
    let limits: Record<string, number>
    try {
      limits = limitsRaw.trim() === '' ? {} : JSON.parse(limitsRaw) as Record<string, number>
    } catch { setFormError(t('admin.limitsInvalid')); return }
    const cents = price.trim() === '' ? null : Math.round(Number(price) * 100)
    if (cents !== null && !Number.isFinite(cents)) { setFormError(t('admin.priceInvalid')); return }
    setBusy(true)
    const res = await call((tk) => createAdminPlan(tk, { name: name.trim(), basePlan, limits, priceCentsMonth: cents }))
    if (res) { setName(''); setLimitsRaw('{}'); setPrice(''); await load() }
    setBusy(false)
  }

  const toggleActive = async (p: AdminCustomPlan) => {
    setBusy(true)
    const res = await call((tk) => patchAdminPlan(tk, p.id, { active: !p.active }))
    if (res) await load()
    setBusy(false)
  }

  const totalAssigned = useMemo(() =>
    (p: AdminCustomPlan) => p.assigned.users + p.assigned.organizations + p.assigned.workspaces, [])

  return (
    <>
      <SectionCard card={card} title={t('admin.newPlanTitle')}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('admin.planName')}
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 px-2.5 rounded-lg border text-[12px] w-[180px]" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('admin.planBase')}
            <PlanSelect value={basePlan} ghost={ghost} onChange={setBasePlan} />
          </label>
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('admin.planLimits')}
            <input value={limitsRaw} onChange={(e) => setLimitsRaw(e.target.value)} placeholder='{"api_keys": 10}' className="h-8 px-2.5 rounded-lg border text-[12px] font-mono w-[220px]" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('admin.planPrice')}
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="49" inputMode="decimal" className="h-8 px-2.5 rounded-lg border text-[12px] w-[90px]" style={inputStyle} />
          </label>
          <button disabled={busy} onClick={() => void create()} className="h-8 px-4 rounded-lg text-[12px] font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>{t('admin.createPlan')}</button>
        </div>
        {formError && <p className="mt-2 text-[11px]" style={{ color: 'var(--danger, #e5534b)' }}>{formError}</p>}
      </SectionCard>

      <SectionCard card={card} title={t('admin.plansTitle')}>
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              <th className={`${thCls} pl-0`}>{t('admin.thPlanName')}</th>
              <th className={thCls}>{t('admin.thBase')}</th>
              <th className={thCls}>{t('admin.thLimits')}</th>
              <th className={`${thCls} text-right`}>{t('admin.thPrice')}</th>
              <th className={`${thCls} text-right`}>{t('admin.thAssigned')}</th>
              <th className={`${thCls} pr-0 text-right`}>{t('admin.thActions')}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border)', opacity: p.active ? 1 : 0.5 }}>
                <td className="py-2 pr-2 text-[11px]">{p.name}</td>
                <td className="py-2 px-2"><span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase" style={planBadge(p.base_plan)}>{p.base_plan}</span></td>
                <td className="py-2 px-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {Object.entries(p.limits).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}
                </td>
                <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>
                  {p.price_cents_month === null ? '—' : `€${(p.price_cents_month / 100).toFixed(0)}/mo`}
                </td>
                <td className="py-2 px-2 text-[11px] text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>{totalAssigned(p)}</td>
                <td className="py-2 pl-2 text-right">
                  <button disabled={busy} onClick={() => void toggleActive(p)} className="h-7 px-2 rounded-md text-[10px] border" style={ghost}>
                    {p.active ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </td>
              </tr>
            ))}
            {loaded && plans.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('admin.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>
    </>
  )
}
