// Account settings: who you are, how you sign in, what we tell you and how the
// tools behave by default. Sign-in itself is Clerk's (password, MFA, OAuth);
// these rows show the state and open Clerk's own flows, so nothing here stores
// credentials. Design only — Save shows the confirmation without persisting.

import { useState } from 'react'
import { NOTIFICATION_OPTIONS, SAMPLE_NOTIFICATIONS, type NotificationKey } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Tabs, useSubTab, SettingGroup, SettingRow, Field, Toggle, Primary, Quiet, Danger, inputClass, Dialog } from '../ui'
import { useTx, rich } from '../i18n'


const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Sign-in & security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
] as const
type Tab = (typeof TABS)[number]['id']

function SavedNote({ show }: { show: boolean }) {
  const tx = useTx()
  return <span role="status" className="text-[12px]" style={{ color: 'var(--ok)', visibility: show ? 'visible' : 'hidden' }}>{tx("Saved")}</span>
}

function Profile({ data }: SectionProps) {
  const tx = useTx()
  const a = data.account
  const [form, setForm] = useState({ name: a.name, org: a.org, role: 'BIM coordinator' })
  const [saved, setSaved] = useState(false)
  const dirty = form.name !== a.name || form.org !== a.org || form.role !== 'BIM coordinator'
  return (
    <>
      <SettingGroup title={tx("Profile")} tour="profile">
        <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
          <Field label={tx("Full name")}><input className={inputClass} value={form.name} autoComplete="name" onChange={(e) => { setForm({ ...form, name: e.target.value }); setSaved(false) }} /></Field>
          <Field label={tx("Company")} hint={tx("Shown on certificates and invoices.")}><input className={inputClass} value={form.org} autoComplete="organization" onChange={(e) => { setForm({ ...form, org: e.target.value }); setSaved(false) }} /></Field>
          <Field label={tx("Role")} hint={tx("Helps us order the tools you see first.")}>
            <select className={inputClass} value={form.role} onChange={(e) => { setForm({ ...form, role: e.target.value }); setSaved(false) }}>
              {['BIM coordinator', 'BIM manager', 'Architect', 'Engineer', 'Contractor', 'Client / owner', 'Other'].map((r) => <option key={r} value={r}>{tx(r)}</option>)}
            </select>
          </Field>
          <Field label={tx("Email")} hint={tx("Changing it sends a confirmation link to the new address.")}>
            <div className="flex gap-2"><input className={inputClass} value={a.email} readOnly aria-readonly /><Quiet className="shrink-0 !h-[38px] sm:!h-[34px]">{tx("Change")}</Quiet></div>
          </Field>
        </div>
        <div className="px-4 sm:px-5 py-3 flex items-center justify-end gap-3">
          <SavedNote show={saved} />
          <Quiet disabled={!dirty} onClick={() => setForm({ name: a.name, org: a.org, role: 'BIM coordinator' })}>{tx("Discard")}</Quiet>
          <Primary disabled={!dirty} onClick={() => setSaved(true)}>{tx("Save changes")}</Primary>
        </div>
      </SettingGroup>
    </>
  )
}

function Security({ data, actions }: SectionProps) {
  const tx = useTx()
  const [signOutAll, setSignOutAll] = useState(false)
  return (
    <>
      <SettingGroup title={tx("Sign-in")}>
        <SettingRow title={tx("Password")} detail={tx("Last changed 2026-07-10.")}><Quiet>{tx("Change password")}</Quiet></SettingRow>
        <SettingRow title={tx("Two-step verification")} detail={tx("Off. Recommended: an authenticator app protects certificates issued in your name.")}><Primary>{tx("Turn on")}</Primary></SettingRow>
        <SettingRow title={tx("Google")} detail={tx("Connected · laura@estudionorte.example")}><Quiet>{tx("Disconnect")}</Quiet></SettingRow>
        <SettingRow title={tx("Microsoft")} detail={tx("Not connected")}><Quiet>{tx("Connect")}</Quiet></SettingRow>
      </SettingGroup>
      <SettingGroup title={tx("Where you're signed in")}>
        {data.sessions.map((s) => (
          <SettingRow key={s.id} title={s.device} detail={<>{s.location} · {s.current ? <span className="font-medium text-[var(--text)]">{tx("This device")}</span> : tx('last seen {{date}}', { date: s.lastSeen })}</>}>
            {!s.current && <Quiet>{tx("Sign out")}</Quiet>}
          </SettingRow>
        ))}
        {data.sessions.length > 1 && (
          <div className="px-4 sm:px-5 py-3 flex justify-end"><Quiet onClick={() => setSignOutAll(true)}>{tx("Sign out everywhere else")}</Quiet></div>
        )}
      </SettingGroup>
      <p className="text-[12px] text-[var(--text-dim)]">{rich(tx("See something you don't recognise? Sign it out, change your password, and <0>tell us</0>."), [(c) => <button className="text-[var(--accent)] hover:underline" onClick={() => actions.contact('question')}>{c}</button>])}</p>
      {signOutAll && (
        <Dialog title={tx("Sign out other devices?")} onClose={() => setSignOutAll(false)}
          footer={<><Quiet onClick={() => setSignOutAll(false)}>{tx("Cancel")}</Quiet><Primary onClick={() => setSignOutAll(false)}>{tx('Sign out {{count}} devices', { count: data.sessions.length - 1 })}</Primary></>}>
          <p className="text-[13px]">{tx("Every session except this one ends now. Running cloud jobs keep going and their results stay in your workspace.")}</p>
        </Dialog>
      )}
    </>
  )
}

function Notifications() {
  const tx = useTx()
  const [prefs, setPrefs] = useState(SAMPLE_NOTIFICATIONS)
  const [digest, setDigest] = useState<'instant' | 'daily' | 'weekly'>('instant')
  const set = (k: NotificationKey, v: boolean) => setPrefs({ ...prefs, [k]: v })
  return (
    <>
      <SettingGroup title={tx("Email me when")}>
        {NOTIFICATION_OPTIONS.map((o) => (
          <SettingRow key={o.key} title={tx(o.label)} detail={tx(o.detail)}>
            <Toggle label={tx(o.label)} checked={prefs[o.key]} disabled={o.required} onChange={(v) => set(o.key, v)} />
          </SettingRow>
        ))}
      </SettingGroup>
      <SettingGroup title={tx("Delivery")}>
        <SettingRow title={tx("Bundle project alerts")} detail={tx("Score drops and job results, sent as they happen or in one email.")}>
          <select className={`${inputClass} !w-auto`} value={digest} onChange={(e) => setDigest(e.target.value as typeof digest)} aria-label={tx("Bundle project alerts")}>
            <option value="instant">{tx("As they happen")}</option><option value="daily">{tx("Daily digest")}</option><option value="weekly">{tx("Weekly digest")}</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </>
  )
}

function Preferences() {
  const tx = useTx()
  const [p, setP] = useState({ language: 'en', units: 'metric', dates: 'iso', profile: 'auto', autoRetry: true, keepFixed: true })
  return (
    <>
      <SettingGroup title={tx("Display")}>
        <SettingRow title={tx("Language")} detail={tx("Emails, invoices and certificates use it too.")}>
          <select className={`${inputClass} !w-auto`} aria-label={tx("Language")} value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>
            {[['en', 'English'], ['es', 'Español'], ['ca', 'Català'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </SettingRow>
        <SettingRow title={tx("Units")}>
          <select className={`${inputClass} !w-auto`} aria-label={tx("Units")} value={p.units} onChange={(e) => setP({ ...p, units: e.target.value })}>
            <option value="metric">{tx("Metric (m, m², m³)")}</option><option value="imperial">{tx("Imperial (ft, ft², ft³)")}</option>
          </select>
        </SettingRow>
        <SettingRow title={tx("Dates")}>
          <select className={`${inputClass} !w-auto`} aria-label={tx("Dates")} value={p.dates} onChange={(e) => setP({ ...p, dates: e.target.value })}>
            <option value="iso">2026-10-26</option><option value="eu">26/10/2026</option><option value="us">10/26/2026</option>
          </select>
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={tx("Defaults for new projects")}>
        <SettingRow title={tx("Requirements profile")} detail={tx("Used to score every delivery unless the project picks another.")}>
          <select className={`${inputClass} !w-auto`} aria-label={tx("Requirements profile")} value={p.profile} onChange={(e) => setP({ ...p, profile: e.target.value })}>
            <option value="auto">{tx("Health Score only")}</option><option value="iso19650">{tx("ISO 19650 basics")}</option><option value="catsalut">{tx("IDS CatSalut")}</option><option value="sabadell">{tx("EIR Ajuntament de Sabadell 2026")}</option>
          </select>
        </SettingRow>
        <SettingRow title={tx("Retry failed jobs once")} detail={tx("Only when the failure was on our side; no extra credits.")}><Toggle label={tx("Retry failed jobs once")} checked={p.autoRetry} onChange={(v) => setP({ ...p, autoRetry: v })} /></SettingRow>
        <SettingRow title={tx("Keep corrected files 7 days")} detail={tx("Off: deleted as soon as you download them.")}><Toggle label={tx("Keep corrected files 7 days")} checked={p.keepFixed} onChange={(v) => setP({ ...p, keepFixed: v })} /></SettingRow>
      </SettingGroup>
    </>
  )
}

export default function Settings(props: SectionProps) {
  const tx = useTx()
  const [tab, setTab] = useSubTab<Tab>('settings', TABS)
  return (
    <>
      <Head title={tx("Settings")} sub={tx("Your account, sign-in and the defaults the tools start from.")} />
      <Tabs label={tx("Settings")} tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'profile' && <Profile {...props} />}
      {tab === 'security' && <Security {...props} />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'preferences' && <Preferences />}
      {tab === 'profile' && (
        <SettingGroup title={tx("Leaving")} tone="danger" tour="leaving">
          <SettingRow title={tx("Cancel your plan")} detail={tx("Keeps the account and your projects (read-only); stops renewals.")}>
            <Quiet onClick={() => props.actions.go('billing')}>{tx("Go to billing")}</Quiet>
          </SettingRow>
          <SettingRow title={tx("Delete your account and data")} detail={tx("Everything we hold about you, after a 14-day grace period.")}>
            <Danger onClick={() => props.actions.go('privacy')}>{tx("Review and delete")}</Danger>
          </SettingRow>
        </SettingGroup>
      )}
    </>
  )
}
