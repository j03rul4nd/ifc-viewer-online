// Certificate branding (Pro, dark): logo + studio name on new certificates,
// previewed live. Issued certificates keep their fingerprint and don't change.

import { useEffect, useRef, useState } from 'react'
import { Panel, Primary, Quiet, Field, inputClass, scoreColor } from '../../ui'
import { LOGO_MAX_KB, LOGO_TYPES, SAMPLE_BRAND } from './pro-sample'
import { useP } from './pro-i18n'

export function logoError(f: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(f.type)) return 'Use a PNG, SVG or JPG.'
  if (f.size > LOGO_MAX_KB * 1024) return 'The logo is over 512 KB. Export it smaller.'
  return null
}

export default function CertificateBrand() {
  const p = useP()
  const [logo, setLogo] = useState<string | null>(null)
  const [studio, setStudio] = useState(SAMPLE_BRAND.studio)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo) }, [logo])

  const pick = (f?: File) => {
    if (!f) return
    const e = logoError(f)
    setErr(e)
    if (e) return
    setLogo(URL.createObjectURL(f)); setSaved(false)
  }

  return (
    <div data-pro="certificate-brand" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="p-4 sm:p-5">
        <p className="text-[13.5px] font-medium">{p('Your brand on certificates')}</p>
        <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{p('New certificates carry your logo and name. Issued ones do not change: their fingerprint is fixed.')}</p>
        <div className="mt-4 grid gap-3">
          <Field label={p('Logo')} hint={err ? <span className="text-[var(--danger)]" role="alert">{p(err)}</span> : p('PNG, SVG or JPG, up to 512 KB.')}>
            <div className="flex flex-wrap gap-2">
              <Quiet onClick={() => input.current?.click()}>{logo ? p('Replace logo') : p('Upload logo')}</Quiet>
              {logo && <Quiet onClick={() => { setLogo(null); setSaved(false) }}>{p('Remove')}</Quiet>}
            </div>
          </Field>
          <input ref={input} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Field label={p('Studio name')}><input className={inputClass} value={studio} onChange={(e) => { setStudio(e.target.value); setSaved(false) }} /></Field>
          <div className="flex items-center gap-3"><Primary onClick={() => setSaved(true)}>{p('Save')}</Primary>{saved && <span className="text-[12px] text-[var(--text-dim)]" role="status">{p('Saved. The next certificate will use it.')}</span>}</div>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <p className="text-[12px] text-[var(--text-dim)] mb-3">{p('Preview')}</p>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            {logo
              ? <img src={logo} alt={p('Your logo')} className="h-10 max-w-[160px] object-contain" />
              : <span className="h-10 px-3 inline-flex items-center rounded-[6px] border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-faint)]">{p('Your logo here')}</span>}
            <span className="text-[11px] text-[var(--text-faint)] font-mono">CERT-9A41</span>
          </div>
          <p className="mt-4 text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-faint)]">{p('Verified delivery')}</p>
          <p className="mt-1 text-[15px] font-semibold [overflow-wrap:anywhere]">HCA_ARQ_v4.ifc</p>
          <p className="text-[12.5px] text-[var(--text-dim)]">{p('Checked against {{profile}} on {{date}}', { profile: 'EIR Ajuntament de Sabadell 2026', date: '2026-11-11' })}</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums" style={{ color: scoreColor(84) }}>84</p>
          <p className="mt-3 font-mono text-[11px] text-[var(--text-faint)] break-all">SHA-256 7c1e…b902</p>
          <p className="mt-3 pt-3 border-t border-[var(--border)] text-[12px] text-[var(--text-dim)]">{p('Issued by {{studio}}', { studio: studio || SAMPLE_BRAND.studio })}</p>
        </div>
      </Panel>
    </div>
  )
}
