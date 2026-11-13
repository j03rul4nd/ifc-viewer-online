// ─── FeatureDemo.tsx ──────────────────────────────────────────────────────────
// The guided paid-workspace demo (`?demo=reception-flow`) inside a preview
// post, opened at the step the post is about, plus a three-step ladder:
//   1. try the free tool with your own IFC (works today),
//   2. walk through the whole guided demo (sample data),
//   3. join the waitlist or talk to us (the paid tools are not open).
//
// LCP: nothing heavy loads with the article. The frame is an empty, fixed-ratio
// box with one button; the workspace boots in an iframe only when the reader
// asks. On a phone (narrow or touch) there is no iframe at all: the button opens
// the demo full screen instead.
//
// The demo link turns on the pricing preview for the tab (sessionStorage). The
// iframe shares that storage with the article, so the block puts the previous
// values back when it unmounts or the page is left: reading a post must not make
// /pricing/ look open.

import React, { useEffect, useRef, useState } from 'react'
import { featureDemoCopy, featureDemoLinks, type FeatureDemoStep } from '../../lib/blog-feature-demo-copy'
import { trackBlogToolClicked } from '../../lib/analytics'

const KEYS = ['ifc:preview-pricing', 'ifc:demo'] as const

export interface FeatureDemoProps {
  step: FeatureDemoStep
  free: 'validator' | 'viewer'
  role: 'solo' | 'team' | 'receive' | 'build'
  talk: 'contractors' | 'engineering'
  lang: string
  slug?: string
}

function isSmallScreen(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(max-width: 760px), (pointer: coarse)').matches
}

export default function FeatureDemo(props: FeatureDemoProps) {
  const { step, lang, slug } = props
  const c = featureDemoCopy(lang)
  const links = featureDemoLinks(props)
  const [live, setLive] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [small, setSmall] = useState(false)
  const saved = useRef<Array<[string, string | null]> | null>(null)

  useEffect(() => { setSmall(isSmallScreen()) }, [])

  // Put the tab's preview flags back as they were before the demo ran.
  useEffect(() => {
    const restore = () => {
      if (!saved.current) return
      try {
        for (const [k, v] of saved.current) {
          if (v === null) sessionStorage.removeItem(k)
          else sessionStorage.setItem(k, v)
        }
      } catch { /* storage blocked */ }
      saved.current = null
    }
    window.addEventListener('pagehide', restore)
    return () => { window.removeEventListener('pagehide', restore); restore() }
  }, [])

  const track = (what: string) => trackBlogToolClicked({ tool: `feature-demo:${step}:${what}${slug ? `:${slug}` : ''}`, from: 'article', lang })

  const start = () => {
    track('start')
    if (small) { window.location.assign(links.demo); return }
    try { saved.current = KEYS.map((k) => [k, sessionStorage.getItem(k)]) } catch { saved.current = null }
    setLive('loading')
  }

  return (
    <section
      className="my-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      aria-label={c.kicker}
      data-feature-demo={step}
    >
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{c.kicker}</span>
        <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--text)]">{c.steps[step]}</h3>
        <p className="mt-1 text-[13.5px] leading-[1.6] text-[var(--text-dim)]">{c.body}</p>
      </div>

      <div className="relative mx-4 mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] sm:mx-5" style={{ aspectRatio: small ? undefined : '16 / 10' }}>
        {live === 'idle' || small ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <button
              type="button"
              onClick={start}
              className="ed-focus rounded-lg bg-[var(--accent)] px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {small ? c.openFull : c.start}
            </button>
            {small && <span className="text-[12.5px] text-[var(--text-faint)]">{c.mobileNote}</span>}
          </div>
        ) : (
          <>
            {live === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[var(--text-dim)]" aria-live="polite">{c.loading}</div>
            )}
            <iframe
              src={links.demo}
              title={c.steps[step]}
              onLoad={() => setLive('ready')}
              className="absolute inset-0 h-full w-full border-0"
              style={{ opacity: live === 'ready' ? 1 : 0, transition: 'opacity .3s' }}
            />
          </>
        )}
      </div>
      <p className="mx-4 mt-2 text-[12px] text-[var(--text-faint)] sm:mx-5">
        {c.sample}
        {live !== 'idle' && !small && (
          <> · <a className="ed-focus underline" href={links.demo} target="_blank" rel="noopener" onClick={() => track('full')}>{c.openFull}</a></>
        )}
      </p>

      <ol className="mt-4 grid gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        <li className="bg-[var(--surface)] p-4">
          <span className="block text-[11px] font-semibold text-[var(--text-faint)]">1 · {c.ladder.freeNote}</span>
          <a className="ed-focus mt-1 block text-[14px] font-semibold text-[var(--accent-2)]" href={links.free} onClick={() => track('free')}>{c.ladder.free} →</a>
        </li>
        <li className="bg-[var(--surface)] p-4">
          <span className="block text-[11px] font-semibold text-[var(--text-faint)]">2 · {c.ladder.demoNote}</span>
          <a className="ed-focus mt-1 block text-[14px] font-semibold text-[var(--accent-2)]" href={links.demoStart} onClick={() => track('tour')}>{c.ladder.demo} →</a>
        </li>
        <li className="bg-[var(--surface)] p-4">
          <span className="block text-[11px] font-semibold text-[var(--text-faint)]">3 · {c.ladder.laterNote}</span>
          <a className="ed-focus mt-1 block text-[14px] font-semibold text-[var(--accent-2)]" href={links.waitlist} onClick={() => track('waitlist')}>{c.ladder.waitlist} →</a>
          <a className="ed-focus mt-1 block text-[13px] text-[var(--text-dim)] underline" href={links.talk} onClick={() => track('talk')}>{c.ladder.talk}</a>
        </li>
      </ol>
    </section>
  )
}
