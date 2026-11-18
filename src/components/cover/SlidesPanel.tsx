// ─── Slides tab: what the deck (or carousel) is made of ────────────────────────

import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { isDeckFormat } from '../../lib/cover/formats'
import type { DeckOptions, SlidePlan, ViewsPerSlide } from '../../lib/cover/deck'
import type { CoverShot } from '../../lib/cover/types'
import type { History } from './useHistory'
import type { StudioDoc } from './doc'
import { Section, Toggle, chip, cls } from './ui'

interface Props {
  doc: StudioDoc
  update: History<StudioDoc>['update']
  plan: SlidePlan[]
  selected: string
  onSelect: (key: string) => void
  onDeck: () => void
}

const TOGGLES: Array<keyof Omit<DeckOptions, 'perSlide'>> = ['project', 'statement', 'views', 'data', 'closing']

/** What a view slide shows; the other kinds are named by their kind alone. */
function slideCaption(s: SlidePlan, shots: CoverShot[]): string {
  if (s.kind !== 'view' && s.kind !== 'grid') return ''
  return s.shots.map((i) => shots[i]?.label).filter(Boolean).join(' · ')
}

export default function SlidesPanel({ doc, update, plan, selected, onSelect, onDeck }: Props) {
  const { t } = useTranslation('capture')
  if (doc.mode !== 'deck') {
    return (
      <div className="space-y-3">
        <div className="text-[12.5px] text-[var(--text)]">{t('cover.slidesCoverOnly')}</div>
        <button className={cls.primary} onClick={onDeck}><Icons.Layers size={13} />{t('cover.switchToDeck')}</button>
      </div>
    )
  }
  const hidden = new Set(doc.hidden)
  const setDeck = (patch: Partial<DeckOptions>) => update((s) => ({ ...s, deck: { ...s.deck, ...patch } }))
  const toggleHidden = (key: string) => update((s) => ({ ...s, hidden: s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key] }))
  let n = 0

  return (
    <div className="space-y-5">
      <Section title={`${t('cover.deckOptions')} · ${t('cover.slideCount', { count: plan.filter((s) => s.kind === 'cover' || !hidden.has(s.key)).length })}`}>
        {TOGGLES.map((k) => <Toggle key={k} label={t(`cover.deck.${k}`)} checked={doc.deck[k]} onChange={(v) => setDeck({ [k]: v })} />)}
        {doc.deck.views && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[11px] text-[var(--text-dim)] mr-1">{t('cover.deck.perSlide')}</span>
            {([1, 2, 3, 4] as ViewsPerSlide[]).map((v) => <button key={v} onClick={() => setDeck({ perSlide: v })} className={chip(doc.deck.perSlide === v)}>{v}</button>)}
          </div>
        )}
        {!isDeckFormat(doc.format) && <div className="text-[11px] text-[var(--text-dim)] mt-2">{t('cover.carouselHint')}</div>}
      </Section>

      <Section title={t('cover.slidesList')}>
        <div className="text-[11px] text-[var(--text-dim)] mb-2">{t('cover.slidesHint')}</div>
        <div className="space-y-1">
          {plan.map((s) => {
            const off = s.kind !== 'cover' && hidden.has(s.key)
            if (!off) n++
            return (
              <div key={s.key} className={`flex items-center gap-2 rounded-[6px] px-2 py-1 border ${selected === s.key ? 'border-[var(--accent)]' : 'border-transparent hover:bg-[var(--surface-2)]'} ${off ? 'opacity-45' : ''}`}>
                <button className="flex-1 min-w-0 text-left flex items-center gap-2" onClick={() => onSelect(s.key)}>
                  <span className="text-[10.5px] tabular-nums text-[var(--text-dim)] w-5 shrink-0">{off ? '—' : String(n).padStart(2, '0')}</span>
                  <span className="text-[12px] text-[var(--text)] shrink-0">{t(`cover.slide.${s.kind}`)}</span>
                  <span className="text-[11px] text-[var(--text-dim)] truncate">{slideCaption(s, doc.shots)}</span>
                </button>
                {s.kind !== 'cover' && (
                  <button className={cls.icon} onClick={() => toggleHidden(s.key)} title={t(off ? 'cover.slideShow' : 'cover.slideHide')} aria-label={t(off ? 'cover.slideShow' : 'cover.slideHide')}>
                    {off ? <Icons.EyeOff size={13} /> : <Icons.Eye size={13} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
