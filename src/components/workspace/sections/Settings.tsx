// Account settings: who you are, how you sign in, what we tell you and how the
// tools behave by default. Sign-in itself is Clerk's (password, MFA, OAuth);
// these rows show the state and open Clerk's own flows, so nothing here stores
// credentials. Design only — Save shows the confirmation without persisting.

import { useState } from 'react'
import { NOTIFICATION_OPTIONS, SAMPLE_NOTIFICATIONS, type NotificationKey } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Tabs, useSubTab, SettingGroup, SettingRow, Field, Toggle, Primary, Quiet, Danger, inputClass, Dialog } from '../ui'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Sign-in & security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
] as const
type Tab = (typeof TABS)[number]['id']

function SavedNote({ show }: { show: boolean }) {
  return <span role="status" className="text-[12px]" style={{ color: 'var(--ok)', visibility: show ? 'visible' : 'hidden' }}>Saved</span>
}

function Profile({ data }: SectionProps) {
  const a = data.account
  const [form, setForm] = useState({ name: a.name, org: a.org, role: 'BIM coordinator' })
  const [saved, setSaved] = useState(false)
  const dirty = form.name !== a.name || form.org !== a.org || form.role !== 'BIM coordinator'
  return (
    <>
      <SettingGroup title="Profile">
        <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputClass} value={form.name} autoComplete="name" onChange={(e) => { setForm({ ...form, name: e.target.value }); setSaved(false) }} /></Field>
          <Field label="Company" hint="Shown on certificates and invoices."><input className={inputClass} value={form.org} autoComplete="organization" onChange={(e) => { setForm({ ...form, org: e.target.value }); setSaved(false) }} /></Field>
          <Field label="Role" hint="Helps us order the tools you see first.">
            <select className={inputClass} value={form.role} onChange={(e) => { setForm({ ...form, role: e.target.value }); setSaved(false) }}>
              {['BIM coordinator', 'BIM manager', 'Architect', 'Engineer', 'Contractor', 'Client / owner', 'Other'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Email" hint="Changing it sends a confirmation link to the new address.">
            <div className="flex gap-2"><input className={inputClass} value={a.email} readOnly aria-readonly /><Quiet className="shrink-0 !h-[38px] sm:!h-[34px]">Change</Quiet></div>
          </Field>
        </div>
        <div className="px-4 sm:px-5 py-3 flex items-center justify-end gap-3">
          <SavedNote show={saved} />
          <Quiet disabled={!dirty} onClick={() => setForm({ name: a.name, org: a.org, role: 'BIM coordinator' })}>Discard</Quiet>
          <Primary disabled={!dirty} onClick={() => setSaved(true)}>Save changes</Primary>
        </div>
      </SettingGroup>
    </>
  )
}

function Security({ data, actions }: SectionProps) {
  const [signOutAll, setSignOutAll] = useState(false)
  return (
    <>
      <SettingGroup title="Sign-in">
        <SettingRow title="Password" detail="Last changed 2026-07-10."><Quiet>Change password</Quiet></SettingRow>
        <SettingRow title="Two-step verification" detail="Off. Recommended: an authenticator app protects certificates issued in your name."><Primary>Turn on</Primary></SettingRow>
        <SettingRow title="Google" detail="Connected · laura@estudionorte.example"><Quiet>Disconnect</Quiet></SettingRow>
        <SettingRow title="Microsoft" detail="Not connected"><Quiet>Connect</Quiet></SettingRow>
      </SettingGroup>
      <SettingGroup title="Where you're signed in">
        {data.sessions.map((s) => (
          <SettingRow key={s.id} title={s.device} detail={<>{s.location} · {s.current ? <span style={{ color: 'var(--ok)' }}>This device</span> : `last seen ${s.lastSeen}`}</>}>
            {!s.current && <Quiet>Sign out</Quiet>}
          </SettingRow>
        ))}
        {data.sessions.length > 1 && (
          <div className="px-4 sm:px-5 py-3 flex justify-end"><Quiet onClick={() => setSignOutAll(true)}>Sign out everywhere else</Quiet></div>
        )}
      </SettingGroup>
      <p className="text-[12px] text-[var(--text-dim)]">See something you don't recognise? Sign it out, change your password, and <button className="text-[var(--accent)] hover:underline" onClick={() => actions.contact('question')}>tell us</button>.</p>
      {signOutAll && (
        <Dialog title="Sign out other devices?" onClose={() => setSignOutAll(false)}
          footer={<><Quiet onClick={() => setSignOutAll(false)}>Cancel</Quiet><Primary onClick={() => setSignOutAll(false)}>Sign out {data.sessions.length - 1} devices</Primary></>}>
          <p className="text-[13px]">Every session except this one ends now. Running cloud jobs keep going and their results stay in your workspace.</p>
        </Dialog>
      )}
    </>
  )
}

function Notifications() {
  const [prefs, setPrefs] = useState(SAMPLE_NOTIFICATIONS)
  const [digest, setDigest] = useState<'instant' | 'daily' | 'weekly'>('instant')
  const set = (k: NotificationKey, v: boolean) => setPrefs({ ...prefs, [k]: v })
  return (
    <>
      <SettingGroup title="Email me when">
        {NOTIFICATION_OPTIONS.map((o) => (
          <SettingRow key={o.key} title={o.label} detail={o.detail}>
            <Toggle label={o.label} checked={prefs[o.key]} disabled={o.required} onChange={(v) => set(o.key, v)} />
          </SettingRow>
        ))}
      </SettingGroup>
      <SettingGroup title="Delivery">
        <SettingRow title="Bundle project alerts" detail="Score drops and job results, sent as they happen or in one email.">
          <select className={`${inputClass} !w-auto`} value={digest} onChange={(e) => setDigest(e.target.value as typeof digest)} aria-label="Bundle project alerts">
            <option value="instant">As they happen</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </>
  )
}

function Preferences() {
  const [p, setP] = useState({ language: 'en', units: 'metric', dates: 'iso', profile: 'auto', autoRetry: true, keepFixed: true })
  return (
    <>
      <SettingGroup title="Display">
        <SettingRow title="Language" detail="Emails, invoices and certificates use it too.">
          <select className={`${inputClass} !w-auto`} aria-label="Language" value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>
            {[['en', 'English'], ['es', 'Español'], ['ca', 'Català'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </SettingRow>
        <SettingRow title="Units">
          <select className={`${inputClass} !w-auto`} aria-label="Units" value={p.units} onChange={(e) => setP({ ...p, units: e.target.value })}>
            <option value="metric">Metric (m, m², m³)</option><option value="imperial">Imperial (ft, ft², ft³)</option>
          </select>
        </SettingRow>
        <SettingRow title="Dates">
          <select className={`${inputClass} !w-auto`} aria-label="Dates" value={p.dates} onChange={(e) => setP({ ...p, dates: e.target.value })}>
            <option value="iso">2026-10-26</option><option value="eu">26/10/2026</option><option value="us">10/26/2026</option>
          </select>
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Defaults for new projects">
        <SettingRow title="Requirements profile" detail="Used to score every delivery unless the project picks another.">
          <select className={`${inputClass} !w-auto`} aria-label="Requirements profile" value={p.profile} onChange={(e) => setP({ ...p, profile: e.target.value })}>
            <option value="auto">Health Score only</option><option value="iso19650">ISO 19650 basics</option><option value="catsalut">IDS CatSalut</option><option value="sabadell">EIR Ajuntament de Sabadell 2026</option>
          </select>
        </SettingRow>
        <SettingRow title="Retry failed jobs once" detail="Only when the failure was on our side; no extra credits."><Toggle label="Retry failed jobs once" checked={p.autoRetry} onChange={(v) => setP({ ...p, autoRetry: v })} /></SettingRow>
        <SettingRow title="Keep corrected files 7 days" detail="Off: deleted as soon as you download them."><Toggle label="Keep corrected files 7 days" checked={p.keepFixed} onChange={(v) => setP({ ...p, keepFixed: v })} /></SettingRow>
      </SettingGroup>
    </>
  )
}

export default function Settings(props: SectionProps) {
  const [tab, setTab] = useSubTab<Tab>('settings', TABS)
  return (
    <>
      <Head title="Settings" sub="Your account, sign-in and the defaults the tools start from." />
      <Tabs label="Settings" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'profile' && <Profile {...props} />}
      {tab === 'security' && <Security {...props} />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'preferences' && <Preferences />}
      {tab === 'profile' && (
        <SettingGroup title="Leaving" tone="danger">
          <SettingRow title="Cancel your plan" detail="Keeps the account and your projects (read-only); stops renewals.">
            <Quiet onClick={() => props.actions.go('billing')}>Go to billing</Quiet>
          </SettingRow>
          <SettingRow title="Delete your account and data" detail="Everything we hold about you, after a 14-day grace period.">
            <Danger onClick={() => props.actions.go('privacy')}>Review and delete</Danger>
          </SettingRow>
        </SettingGroup>
      )}
    </>
  )
}
