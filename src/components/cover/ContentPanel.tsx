// ─── Text tab: the words on the cover, the project facts, the brand ───────────

import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { AUTO_FACT_IDS, MAX_CUSTOM_FACTS, type AutoFactId } from '../../lib/cover/facts'
import type { CoverFact } from '../../lib/cover/types'
import type { History } from './useHistory'
import { TEXT_FIELDS, type StudioDoc, type TextField } from './doc'
import { Section, Toggle, cls } from './ui'

interface Props {
  doc: StudioDoc
  update: History<StudioDoc>['update']
  /** What each automatic fact reads right now (null = the model can't say). */
  autoValues: Partial<Record<AutoFactId, string>>
  logoUrl: string | null
  onLogo: (file: File | undefined) => void
  onLogoRemove: () => void
}

const FIELDS: TextField[] = [...TEXT_FIELDS, 'website']

export default function ContentPanel({ doc, update, autoValues, logoUrl, onLogo, onLogoRemove }: Props) {
  const { t } = useTranslation('capture')
  const setText = (f: TextField, v: string) => update((s) => ({ ...s, text: { ...s.text, [f]: v } }), `text-${f}`)
  const setFacts = (fn: (rows: CoverFact[]) => CoverFact[], coalesce?: string) => update((s) => ({ ...s, facts: fn(s.facts) }), coalesce)

  return (
    <div className="space-y-5">
      <Section title={t('cover.content')}>
        <div className="space-y-2">
          {FIELDS.map((f) => (
            <label key={f} className="block">
              <span className="block text-[11px] text-[var(--text-dim)] mb-0.5">{t(`cover.field.${f}`)}</span>
              {f === 'concept'
                ? <textarea className={`${cls.input} h-[84px] py-1.5 resize-y`} value={doc.text[f]} placeholder={t('cover.conceptPlaceholder')} onChange={(e) => setText(f, e.target.value)} />
                : <input className={cls.input} value={doc.text[f]} inputMode={f === 'website' ? 'url' : undefined} placeholder={f === 'website' ? 'studio.com' : undefined} onChange={(e) => setText(f, e.target.value)} />}
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('cover.facts')}>
        <div className={cls.sub}>{t('cover.factsAuto')}</div>
        <div className="mb-3">
          {AUTO_FACT_IDS.map((id) => {
            const v = autoValues[id]
            return (
              <div key={id} className={`flex items-center gap-2 ${v ? '' : 'opacity-45'}`}>
                <Toggle label={t(`cover.fact.${id}`)} checked={doc.autoFacts[id] && !!v} onChange={(on) => update((s) => ({ ...s, autoFacts: { ...s.autoFacts, [id]: on } }))} />
                <span className="ml-auto text-[11.5px] tabular-nums text-[var(--text-dim)]">{v ?? '—'}</span>
              </div>
            )
          })}
        </div>
        <div className={cls.sub}>{t('cover.factsCustom')}</div>
        <div className="space-y-1.5">
          {doc.facts.map((f, i) => (
            <div key={i} className="flex gap-1.5">
              <input className={`${cls.input} flex-[1.1]`} value={f.label} placeholder={t('cover.factLabelPh')} aria-label={t('cover.factLabel')}
                onChange={(e) => setFacts((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)), `fact-${i}-l`)} />
              <input className={`${cls.input} flex-1`} value={f.value} placeholder={t('cover.factValuePh')} aria-label={t('cover.factValue')}
                onChange={(e) => setFacts((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)), `fact-${i}-v`)} />
              <button className={cls.icon} onClick={() => setFacts((rows) => rows.filter((_, j) => j !== i))} title={t('cover.factRemove')} aria-label={t('cover.factRemove')}><Icons.X size={13} /></button>
            </div>
          ))}
        </div>
        {doc.facts.length < MAX_CUSTOM_FACTS && (
          <button className={`${cls.btnSm} mt-2`} onClick={() => setFacts((rows) => [...rows, { label: '', value: '' }])}><Icons.Plus size={12} />{t('cover.factAdd')}</button>
        )}
        <div className="text-[11px] text-[var(--text-dim)] mt-2">{t('cover.factsHint')}</div>
      </Section>

      <Section title={t('cover.brand')}>
        <div className="flex items-center gap-2">
          <label className={`${cls.btn} cursor-pointer`}>
            <Icons.Upload size={13} />{t('cover.logoUpload')}
            <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {logoUrl && (
            <>
              <img src={logoUrl} alt="" className="h-7 max-w-[80px] object-contain rounded bg-[var(--surface-2)] p-0.5" />
              <button className={cls.btn} onClick={onLogoRemove}>{t('cover.logoRemove')}</button>
            </>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-dim)] mt-2">{t('cover.brandHint')}</div>
      </Section>
    </div>
  )
}
