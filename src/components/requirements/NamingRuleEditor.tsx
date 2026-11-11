// ─── NamingRuleEditor ─────────────────────────────────────────────────────────
// The receiver's ISO 19650 naming rule for a requirements link (N1): fields,
// separator, allowed values, status and revision, IfcProject. Free, like the
// rest of the link: the check runs in the supplier's browser. A "try a name"
// box shows the verdict the supplier will get.

import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { checkNaming, isoPreset, ISO_STATUS_CODES, type NamingRule } from '../../lib/requirements/iso-naming'

export function useIsoPreset(): () => NamingRule {
  const { t } = useTranslation('ids')
  return () => isoPreset([
    t('requirements.naming.fields.project'), t('requirements.naming.fields.originator'), t('requirements.naming.fields.volume'),
    t('requirements.naming.fields.level'), t('requirements.naming.fields.type'), t('requirements.naming.fields.role'),
    t('requirements.naming.fields.number'),
  ])
}

const splitList = (text: string): string[] => text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)

export default function NamingRuleEditor({ rule, onChange }: { rule: NamingRule; onChange: (r: NamingRule) => void }) {
  const { t } = useTranslation('ids')
  const preset = useIsoPreset()
  const [sample, setSample] = useState('')
  const field = 'h-7 px-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]'

  const setField = (i: number, patch: Partial<NamingRule['f'][number]>): void => {
    const f = rule.f.map((x, k) => (k === i ? { ...x, ...patch } : x))
    onChange({ ...rule, f })
  }

  const result = useMemo(() => (sample.trim() ? checkNaming(rule, sample.trim()) : null), [rule, sample])

  return (
    <div className="flex flex-col gap-2 pl-6">
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)]">
        <label className="flex items-center gap-1.5">
          {t('requirements.naming.separator')}
          <select className={`${field} w-12`} value={rule.sep} onChange={(e) => onChange({ ...rule, sep: e.target.value })}>
            <option value="-">-</option>
            <option value="_">_</option>
            <option value=".">.</option>
          </select>
        </label>
        <button type="button" onClick={() => onChange(preset())} className="ml-auto text-[11px] text-[var(--accent)] hover:underline">
          {t('requirements.naming.reset')}
        </button>
      </div>

      <ol className="m-0 p-0 list-none flex flex-col gap-1">
        {rule.f.map((f, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-4 text-right text-[10.5px] text-[var(--text-faint)]">{i + 1}</span>
            <input className={`${field} w-28`} value={f.c} maxLength={40} aria-label={t('requirements.naming.fieldName')}
              onChange={(e) => setField(i, { c: e.target.value })} />
            <input className={`${field} flex-1 min-w-0`} value={(f.v ?? []).join(', ')} aria-label={t('requirements.naming.values')}
              placeholder={f.d ? t('requirements.naming.digits') : t('requirements.naming.anyValue')}
              onChange={(e) => { const v = splitList(e.target.value); setField(i, { v: v.length ? v : undefined }) }} />
            <button type="button" disabled={rule.f.length <= 1} onClick={() => onChange({ ...rule, f: rule.f.filter((_, k) => k !== i) })}
              className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30" aria-label={t('requirements.naming.removeField')}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      {rule.f.length < 12 && (
        <button type="button" onClick={() => onChange({ ...rule, f: [...rule.f, { c: t('requirements.naming.newField') }] })}
          className="self-start text-[11px] text-[var(--accent)] hover:underline">
          {t('requirements.naming.addField')}
        </button>
      )}

      <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]">
        <input type="checkbox" checked={!!rule.st} onChange={(e) => onChange({ ...rule, st: e.target.checked ? [...ISO_STATUS_CODES] : undefined, ...(e.target.checked || rule.rv ? {} : { pj: undefined }) })} />
        {t('requirements.naming.status')}
        {rule.st && (
          <input className={`${field} flex-1 min-w-0`} value={rule.st.join(', ')} aria-label={t('requirements.naming.status')}
            onChange={(e) => { const v = splitList(e.target.value.toUpperCase()); onChange({ ...rule, st: v.length ? v : [...ISO_STATUS_CODES] }) }} />
        )}
      </label>
      <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]">
        <input type="checkbox" checked={!!rule.rv} onChange={(e) => onChange({ ...rule, rv: e.target.checked || undefined, ...(e.target.checked || rule.st ? {} : { pj: undefined }) })} />
        {t('requirements.naming.revision')}
      </label>
      <label className={`flex items-center gap-2 text-[11.5px] ${rule.st || rule.rv ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>
        <input type="checkbox" disabled={!rule.st && !rule.rv} checked={!!rule.pj} onChange={(e) => onChange({ ...rule, pj: e.target.checked || undefined })} />
        {t('requirements.naming.project')}
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--text-dim)]">
        {t('requirements.naming.try')}
        <input className={`${field} font-mono`} value={sample} onChange={(e) => setSample(e.target.value)}
          placeholder={`${rule.f.map((f) => f.v?.[0] ?? (f.d ? '0001' : 'XX')).join(rule.sep)}${rule.st ? `${rule.sep}${rule.st[0]}` : ''}${rule.rv ? `${rule.sep}P01` : ''}.ifc`} />
      </label>
      {result && (
        <p className={`m-0 -mt-1 text-[11px] ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.ok ? t('requirements.naming.tryOk') : t('requirements.naming.fail', { count: result.issues.length })}
        </p>
      )}
    </div>
  )
}
