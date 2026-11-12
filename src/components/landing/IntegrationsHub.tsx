// Home page: where the viewer runs besides our own site. The SDK leads (it is
// the one integration anyone can use today), followed by every other
// integration with an honest status. Data and copy live in home-integrations.ts;
// this file only lays them out, so a new integration never touches it.
import React, { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { homeLang } from './home-copy'
import { highlight } from './highlight'
import {
  INTEGRATIONS, INTEGRATIONS_COPY, INTEGRATION_ORDER, SNIPPET_ORDER, SNIPPET_TABS, snippet,
  type Integration, type IntegrationStatus, type SnippetId,
} from './home-integrations'
import { trackLandingIntegrationClick } from '../../lib/analytics'
import { openFeatureRequest } from '../../stores/cloudAccountStore'

/** Snippets are pasted on other sites, so they name the public host. */
const PUBLIC_ORIGIN = 'https://www.ifcvieweronline.eu'

const TOKEN_CLASS = {
  comment: 'tok-comment', string: 'tok-string', tag: 'tok-tag', keyword: 'tok-keyword', attr: 'tok-attr', plain: '',
} as const

function StatusBadge({ status, label }: { status: IntegrationStatus; label: string }) {
  const dot = status === 'available' ? 'bg-[var(--ok)]'
    : status === 'review' ? 'bg-[var(--warn)]'
    : 'border border-[var(--text-faint)]'
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-dim)] whitespace-nowrap">
      <span aria-hidden="true" className={`inline-block w-[7px] h-[7px] rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const LINK_CLS = 'inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent-2)] no-underline hover:underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

function IntegrationLink({ item, cta, notify, lang }: { item: Integration; cta: string; notify: string; lang: ReturnType<typeof homeLang> }) {
  const l = item.link
  if (l.kind === 'notify') {
    return (
      <button
        type="button"
        className={LINK_CLS}
        aria-label={`${notify}: ${item.name}`}
        onClick={() => {
          trackLandingIntegrationClick({ integration: item.id, action: 'notify' })
          openFeatureRequest(`landing_integrations:${item.id}`, { feature: l.feature })
        }}
      >
        {notify}
      </button>
    )
  }
  const external = l.kind === 'external'
  return (
    <a
      href={external ? l.href : l.href(lang)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={LINK_CLS}
      aria-label={`${cta}: ${item.name}`}
      onClick={() => trackLandingIntegrationClick({ integration: item.id, action: 'open' })}
    >
      {cta}
      <Icons.ArrowRight size={13} />
    </a>
  )
}

export default function IntegrationsHub({ lang }: { lang: string }) {
  const { t } = useTranslation('landing')
  const hl = homeLang(lang)
  const c = INTEGRATIONS_COPY[hl]
  const [tab, setTab] = useState<SnippetId>('js')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const uid = useId()
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

  const choose = (id: SnippetId, focus = false) => {
    setTab(id)
    if (focus) tabRefs.current[id]?.focus()
    trackLandingIntegrationClick({ integration: id === 'js' ? 'sdk' : id, action: 'tab' })
  }
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = SNIPPET_ORDER.indexOf(tab)
    const n = SNIPPET_ORDER.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    choose(SNIPPET_ORDER[next], true)
  }

  const code = snippet(tab, c, PUBLIC_ORIGIN)
  const btn = 'inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[14px] font-medium rounded-[9px] no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

  return (
    <section
      id="integrations"
      className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7 scroll-mt-16"
      aria-labelledby="integrations-heading"
    >
      <div className="max-w-[1100px] mx-auto">
        <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2.5">{c.label}</div>
        <h2
          id="integrations-heading"
          className="font-semibold tracking-[-0.03em] m-0 mb-3 sm:mb-4 max-w-[720px]"
          style={{ fontSize: 'clamp(22px, 5vw, 32px)' }}
        >
          {c.title}
        </h2>
        <p className="text-[14px] sm:text-[15px] text-[var(--text-dim)] leading-[1.55] m-0 max-w-[640px]">{c.body}</p>

        <div className="mt-9 sm:mt-12 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-12 items-start">
          {/* SDK: the one integration anyone can use today. */}
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] m-0 mb-4">{c.sdkTitle}</h3>
            <ul className="flex flex-col gap-2 mb-7 list-none p-0 m-0">
              {[t('sdk.b1'), t('sdk.b2'), t('sdk.b3'), t('sdk.b4')].map((b, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[14px] text-[var(--text-dim)]">
                  <span className="text-[var(--ok)] shrink-0" aria-hidden="true"><Icons.Check size={15} /></span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 flex-wrap">
              <a
                href={`${base}/embed/`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => trackLandingIntegrationClick({ integration: 'sdk', action: 'cta' })}
                className={`${btn} bg-[var(--accent)] text-white hover:brightness-110`}
              >
                {t('sdk.explore')}
                <Icons.ArrowRight size={14} />
              </a>
              <a
                href={`${base}/sdk/`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => trackLandingIntegrationClick({ integration: 'sdk', action: 'open' })}
                className={`${btn} border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)]`}
              >
                {t('sdk.docs')}
              </a>
            </div>
          </div>

          {/* Code: one tab per way in, each one code that works today. */}
          <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="flex items-stretch justify-between gap-3 border-b border-[var(--border)] px-2">
              <div role="tablist" aria-label={c.codeLabel} className="flex" onKeyDown={onTabKey}>
                {SNIPPET_ORDER.map((id) => {
                  const on = id === tab
                  return (
                    <button
                      key={id}
                      ref={(el) => { tabRefs.current[id] = el }}
                      type="button"
                      role="tab"
                      id={`${uid}-tab-${id}`}
                      aria-selected={on}
                      aria-controls={`${uid}-panel`}
                      tabIndex={on ? 0 : -1}
                      onClick={() => choose(id)}
                      className={`relative h-10 px-3 text-[13px] font-medium bg-transparent border-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] ${on ? 'text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'}`}
                    >
                      {SNIPPET_TABS[id].label}
                      {on && <span aria-hidden="true" className="absolute left-3 right-3 -bottom-px h-[2px] bg-[var(--accent)]" />}
                    </button>
                  )
                })}
              </div>
              <span className="hidden sm:flex items-center pr-2 text-[13px] font-mono text-[var(--text-faint)]">{SNIPPET_TABS[tab].file}</span>
            </div>
            <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
              <pre
                tabIndex={0}
                className="m-0 p-4 whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] leading-[1.65] font-mono text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <code>
                  {highlight(code).map((tk, i) => (
                    TOKEN_CLASS[tk.kind] ? <span key={i} className={TOKEN_CLASS[tk.kind]}>{tk.text}</span> : <React.Fragment key={i}>{tk.text}</React.Fragment>
                  ))}
                </code>
              </pre>
              {tab === 'wordpress' && (
                <p className="m-0 px-4 pb-4 text-[13px] text-[var(--text-dim)]">{c.wpNote}</p>
              )}
            </div>
          </div>
        </div>

        {/* Every integration, with an honest status. */}
        <ul className="lp-card-grid list-none m-0 mt-10 sm:mt-14 p-0 grid sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-[var(--border)] overflow-hidden">
          {INTEGRATION_ORDER.map((id) => {
            const item = INTEGRATIONS[id]
            const Icon = Icons[item.icon]
            const copy = c.items[id]
            return (
              <li key={id} className="flex flex-col gap-2 p-5 sm:p-6 min-w-0">
                <h3 className="flex items-center gap-2.5 m-0 text-[15px] font-semibold text-[var(--text)]">
                  <span className="text-[var(--text-dim)] shrink-0" aria-hidden="true"><Icon size={17} /></span>
                  <span className="[overflow-wrap:anywhere]">{item.name}</span>
                </h3>
                <p className="m-0 text-[14px] leading-[1.55] text-[var(--text-dim)] flex-1">{copy.value}</p>
                <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
                  <IntegrationLink item={item} cta={copy.cta} notify={c.notify} lang={hl} />
                  <StatusBadge status={item.status} label={c.status[item.status]} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
