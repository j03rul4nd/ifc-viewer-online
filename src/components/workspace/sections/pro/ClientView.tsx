// What the client sees when they open a client link (Pro, dark preview): the
// studio's logo, the model, the score with a short report, comments and the
// expiry. Shown inside the workspace so the coordinator checks it before
// sending. Expired and password-protected links show their own screens.

import { useState } from 'react'
import { Dialog, Primary, Quiet, inputClass, scoreColor } from '../../ui'
import { SAMPLE_COMMENTS, SAMPLE_DIFF, linkState, type ClientLink } from './pro-sample'
import { useBrand } from './brand-store'
import { useP } from './pro-i18n'

function ModelPlaceholder() {
  // A quiet isometric sketch stands in for the 3D viewer in the preview.
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full" role="img" aria-hidden>
      <g fill="none" stroke="var(--text-faint)" strokeWidth="1">
        {[0, 1, 2, 3].map((f) => <path key={f} d={`M60 ${140 - f * 26} L160 ${165 - f * 26} L270 ${120 - f * 26} L170 ${95 - f * 26} Z`} />)}
        <path d="M60 140 V62 M160 165 V87 M270 120 V42 M170 95 V17" />
      </g>
      <path d="M160 113 L215 90 L215 64 L160 87 Z" fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke="var(--accent)" />
    </svg>
  )
}

export default function ClientView({ link, onClose }: { link: ClientLink; onClose: () => void }) {
  const p = useP()
  const brand = useBrand()
  const [unlocked, setUnlocked] = useState(!link.password)
  const [secret, setSecret] = useState('')
  const [draft, setDraft] = useState('')
  const [comments, setComments] = useState(SAMPLE_COMMENTS)
  const state = linkState(link)
  const version = link.version === 'latest' ? SAMPLE_DIFF.to : link.version

  return (
    <Dialog size="lg" title={p('Your client sees this')} onClose={onClose} footer={<Quiet onClick={onClose}>{p('Close')}</Quiet>}>
      <div data-pro="client-view" className="rounded-[10px] border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          {brand.logo ? <img src={brand.logo} alt="" className="h-7 max-w-[140px] object-contain" /> : <span className="text-[13px] font-semibold">{brand.studio}</span>}
          <span className="text-[11.5px] text-[var(--text-dim)] text-right">{state === 'active' && link.expires ? p('Available until {{date}}', { date: link.expires }) : ''}</span>
        </div>

        {state !== 'active' ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[15px] font-medium">{state === 'expired' ? p('This link has expired') : p('This link is no longer available')}</p>
            <p className="text-[13px] text-[var(--text-dim)] mt-1">{p('Ask {{studio}} for a new one.', { studio: brand.studio })}</p>
          </div>
        ) : !unlocked ? (
          <form className="px-5 py-12 max-w-[320px] mx-auto text-center" onSubmit={(e) => { e.preventDefault(); if (secret.length >= 8) setUnlocked(true) }}>
            <p className="text-[15px] font-medium">{p('{{studio}} shared a model with you', { studio: brand.studio })}</p>
            <p className="text-[13px] text-[var(--text-dim)] mt-1 mb-4">{p('Enter the password they sent you.')}</p>
            <input type="password" aria-label={p('Password')} className={inputClass} value={secret} onChange={(e) => setSecret(e.target.value)} />
            <Primary type="submit" className="mt-3 w-full">{p('Open')}</Primary>
            <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">{p('Preview: any 8 characters open it.')}</p>
          </form>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="p-4 border-b lg:border-b-0 lg:border-r border-[var(--border)]">
              <p className="text-[15px] font-semibold">Hospital Comarcal — Ampliación</p>
              <p className="text-[12px] text-[var(--text-dim)]">{p('Version {{version}} · checked against {{profile}}', { version, profile: 'ISO 19650 basics' })}</p>
              <div className="mt-3 aspect-[16/9] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] p-2"><ModelPlaceholder /></div>
              <div className="mt-3 flex items-end gap-4">
                <div><p className="text-[11.5px] text-[var(--text-dim)]">{p('Score')}</p><p className="text-[30px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(SAMPLE_DIFF.scoreTo) }}>{SAMPLE_DIFF.scoreTo}</p></div>
                <p className="text-[12.5px] text-[var(--text-dim)] pb-1">{p('{{up}} points better than the previous delivery', { up: SAMPLE_DIFF.scoreTo - SAMPLE_DIFF.scoreFrom })}</p>
              </div>
              <ul className="mt-3 grid gap-1 text-[12.5px]">
                {SAMPLE_DIFF.rules.slice(0, 3).map((r) => <li key={r.rule} className="flex justify-between gap-3"><span>{p(r.rule)}</span><span className="tabular-nums text-[var(--text-dim)]">{r.after}</span></li>)}
              </ul>
              {link.download && <Quiet className="mt-3">{p('Download IFC')}</Quiet>}
            </div>
            <div className="p-4 flex flex-col">
              <p className="text-[13px] font-medium mb-2">{p('Comments')}</p>
              <ul className="grid gap-3 flex-1">
                {comments.map((c, i) => (
                  <li key={i} className="text-[12.5px]">
                    <p><span className="font-medium">{c.who}</span> <span className="text-[var(--text-faint)]">· {c.role} · {c.at}</span></p>
                    {c.element && <p className="font-mono text-[11px] text-[var(--text-dim)]">{c.element}</p>}
                    <p className="mt-0.5">{c.body}</p>
                  </li>
                ))}
              </ul>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; setComments([...comments, { who: 'Anna Soler', role: 'Propiedad', at: '2026-11-11 10:12', body: draft.trim() }]); setDraft('') }}>
                <input aria-label={p('Write a comment')} placeholder={p('Write a comment')} className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <Primary type="submit" disabled={!draft.trim()}>{p('Send')}</Primary>
              </form>
              <p className="mt-2 text-[11px] text-[var(--text-faint)]">{p('No account needed. Your client pays nothing.')}</p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
