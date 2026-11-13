// Certificate branding (Pro, dark): logo + studio name on new certificates,
// previewed live, and the certificate as a document to attach to an invoice
// with a line ready to paste. Issued certificates keep their fingerprint.
// Workspace (local / cloud): the logo is the workspace's, stored on the server
// and printed on every certificate it signs (PNG, JPG or WebP; no SVG there).

import { useEffect, useRef, useState } from 'react'
import { usePaidDataSource } from '../../../../hooks/usePaidQuery'
import { paidApi } from '../../../../lib/cloud/paid-client'
import { Panel, Primary, Quiet, Field, inputClass, scoreColor, CopyField } from '../../ui'
import { LOGO_MAX_KB, LOGO_TYPES, SAMPLE_BRAND, SAMPLE_CERT_DOC } from './pro-sample'
import { certificateHtml, invoiceLine, openPrintable, verifyUrl } from './pro-reports'
import { readAsDataUrl, setBrand, useBrand } from './brand-store'
import { useP } from './pro-i18n'

export function logoError(f: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(f.type)) return 'Use a PNG, SVG or JPG.'
  if (f.size > LOGO_MAX_KB * 1024) return 'The logo is over 512 KB. Export it smaller.'
  return null
}

export default function CertificateBrand() {
  const p = useP()
  const brand = useBrand()
  const [studio, setStudio] = useState(brand.studio)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const cert = SAMPLE_CERT_DOC
  const live = usePaidDataSource() !== 'sample'
  useEffect(() => {
    if (!live) return
    void paidApi.branding().then((r) => { if (r.ok) setBrand({ logo: r.value.logo }); else setErr(p('Could not load: {{error}}. Showing nothing rather than old data.', { error: r.error.code })) })
  }, [live])

  const pick = async (f?: File) => {
    if (!f) return
    const e = logoError(f)
    setErr(e)
    if (e) return
    const logo = await readAsDataUrl(f)
    if (live) {
      const r = await paidApi.setBranding(logo)
      if (!r.ok) { setErr(p('Could not save: {{error}}. Nothing changed.', { error: r.error.code })); return }
    }
    setBrand({ logo }); setSaved(false)
  }

  return (
    <div data-pro="certificate-brand" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-4 content-start">
        <Panel className="p-4 sm:p-5">
          <p className="text-[13.5px] font-medium">{p('Your brand on certificates')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{p('New certificates carry your logo and name. Issued ones do not change: their fingerprint is fixed.')}</p>
          <div className="mt-4 grid gap-3">
            <Field label={p('Logo')} hint={err ? <span className="text-[var(--danger)]" role="alert">{p(err)}</span> : p('PNG, SVG or JPG, up to 512 KB.')}>
              <div className="flex flex-wrap gap-2">
                <Quiet onClick={() => input.current?.click()}>{brand.logo ? p('Replace logo') : p('Upload logo')}</Quiet>
                {brand.logo && <Quiet onClick={() => { void (live ? paidApi.clearBranding() : Promise.resolve({ ok: true })).then((r) => { if (r.ok) { setBrand({ logo: null }); setSaved(false) } else setErr(p('Could not save: {{error}}. Nothing changed.', { error: r.ok ? '' : (r as { error: { code: string } }).error.code })) }) }}>{p('Remove')}</Quiet>}
              </div>
            </Field>
            <input ref={input} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Field label={p('Studio name')}><input className={inputClass} value={studio} onChange={(e) => { setStudio(e.target.value); setSaved(false) }} /></Field>
            <div className="flex items-center gap-3"><Primary onClick={() => { setBrand({ studio: studio || SAMPLE_BRAND.studio }); setSaved(true) }}>{p('Save')}</Primary>{saved && <span className="text-[12px] text-[var(--text-dim)]" role="status">{p('Saved. The next certificate will use it.')}</span>}</div>
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <p className="text-[13.5px] font-medium">{p('Attach it to your invoice')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{p('Your client pays sooner when the invoice proves what was delivered. Print the certificate to PDF and paste this line in the invoice.')}</p>
          <div className="mt-3"><CopyField label={p('Line for the invoice')} value={invoiceLine(cert, p)} mono={false} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Primary onClick={() => openPrintable(certificateHtml(cert, brand, p), `${cert.id}.html`)}>{p('Download to attach')}</Primary>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <p className="text-[12px] text-[var(--text-dim)] mb-3">{p('Preview')}</p>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            {brand.logo
              ? <img src={brand.logo} alt={p('Your logo')} className="h-10 max-w-[160px] object-contain" />
              : <span className="h-10 px-3 inline-flex items-center rounded-[6px] border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-faint)]">{p('Your logo here')}</span>}
            <span className="text-[11px] text-[var(--text-faint)] font-mono">{cert.id}</span>
          </div>
          <p className="mt-4 text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-faint)]">{p('Verified delivery')}</p>
          <p className="mt-1 text-[15px] font-semibold [overflow-wrap:anywhere]">{cert.file}</p>
          <p className="text-[12.5px] text-[var(--text-dim)]">{p('Checked against {{profile}} on {{date}}', { profile: cert.profile, date: cert.date })}</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums" style={{ color: scoreColor(cert.score) }}>{cert.score}</p>
          <p className="text-[12.5px]">{p('For {{client}}', { client: cert.client })}</p>
          <p className="mt-3 font-mono text-[11px] text-[var(--text-faint)] break-all">SHA-256 {cert.hash}</p>
          <p className="mt-1 text-[11.5px] text-[var(--text-dim)] break-all">{verifyUrl(cert.id)}</p>
          <p className="mt-3 pt-3 border-t border-[var(--border)] text-[12px] text-[var(--text-dim)]">{p('Issued by {{studio}}', { studio: brand.studio })}</p>
        </div>
      </Panel>
    </div>
  )
}
