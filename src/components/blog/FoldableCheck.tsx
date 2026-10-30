// ─── FoldableCheck.tsx ───────────────────────────────────────────────────────
// "What will this viewer do on my phone?" Reads what the browser reports, live:
// fold the device while reading and the answer changes. No device names and no
// simulated capability: the verdict comes from the same functions the app uses
// (lib/ui/display-segments). The three layouts below are drawings, labelled so;
// the words come with the post, so they are translated with it.

import React, { useEffect, useState } from 'react'
import { foldableVerdict, readSegments, type FoldableVerdict } from '../../lib/ui/display-segments'
import { trackBlogToolClicked, trackFoldableReport } from '../../lib/analytics'

export interface FoldableCheckLabels {
  live: string
  segments: string
  viewport: string
  pointer: string
  touch: string
  mouse: string
  verdicts: Record<FoldableVerdict, string>
  open: string
  openHint: string
  shapes: string
  book: string
  tabletop: string
  flat: string
  viewer: string
  pane: string
  report: string
  reportYes: string
  reportNo: string
  reportThanks: string
}

interface Props {
  title?: string
  caption?: string
  labels: FoldableCheckLabels
  lang?: string
}

const WATCHED = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)', '(pointer: coarse)']

function read() {
  const segments = readSegments(window as unknown as Parameters<typeof readSegments>[0])
  const width = window.innerWidth
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return { segments: segments.length, width, height: window.innerHeight, coarse, verdict: foldableVerdict({ segments, viewportWidth: width, coarsePointer: coarse }) }
}

type Shape = 'book' | 'tabletop' | 'flat'

function Drawing({ shape, labels }: { shape: Shape; labels: FoldableCheckLabels }) {
  const box = 'flex items-center justify-center rounded-[4px] text-[10px] font-semibold text-center leading-tight p-1'
  const viewer = `${box} flex-1 bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[var(--text)]`
  const pane = `${box} flex-1 bg-[var(--surface-2)] text-[var(--text-dim)]`
  return (
    <div
      aria-hidden="true"
      className={`mx-auto flex gap-[5px] rounded-[10px] border border-[var(--border-strong)] p-[5px] transition-all duration-300 ${shape === 'tabletop' ? 'h-[190px] w-[150px] flex-col' : 'h-[150px] w-[210px]'}`}
    >
      {shape === 'flat' ? (
        <div className={viewer}>{labels.viewer}</div>
      ) : (
        <>
          <div className={viewer}>{labels.viewer}</div>
          <div className={pane}>{labels.pane}</div>
        </>
      )}
    </div>
  )
}

export default function FoldableCheck({ title, caption, labels, lang = 'en' }: Props) {
  const [state, setState] = useState<ReturnType<typeof read> | null>(null)
  const [shape, setShape] = useState<Shape>('book')
  const [reported, setReported] = useState(false)

  useEffect(() => {
    const update = () => setState(read())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const queries = WATCHED.map((q) => window.matchMedia?.(q))
    queries.forEach((q) => q?.addEventListener?.('change', update))
    const posture = (navigator as unknown as { devicePosture?: EventTarget }).devicePosture
    posture?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      queries.forEach((q) => q?.removeEventListener?.('change', update))
      posture?.removeEventListener?.('change', update)
    }
  }, [])

  const verdict = state?.verdict
  const tone = verdict === 'two-screens' || verdict === 'manual' ? 'var(--ok)' : 'var(--text-dim)'
  // Same-origin, resolved here so the viewer reads a full URL. split=1 asks for
  // the split; where the screen cannot give one the app stays single-screen.
  const href = `${import.meta.env.BASE_URL}?model=${encodeURIComponent(`${typeof window === 'undefined' ? '' : window.location.origin}${import.meta.env.BASE_URL}Ifc2x3_Duplex_Architecture.ifc`)}&split=1&lang=${lang}`

  const report = (works: boolean) => {
    if (!state) return
    trackFoldableReport({ verdict: state.verdict, works, segments: state.segments, lang })
    setReported(true)
  }

  return (
    <figure className="my-7 sm:my-10 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      {title && <h3 className="m-0 mb-3 text-[15px] font-semibold text-[var(--text)]">{title}</h3>}

      <div aria-live="polite">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[var(--text-faint)]">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: tone }} />
          {labels.live}
        </div>
        <p className="mt-2 mb-3 text-[15px] leading-snug font-medium" style={{ color: verdict === 'two-screens' || verdict === 'manual' ? 'var(--text)' : 'var(--text-dim)' }}>
          {verdict ? labels.verdicts[verdict] : ' '}
        </p>
        {state && (
          <dl className="m-0 grid grid-cols-3 gap-2 text-[12px]">
            <div><dt className="text-[var(--text-faint)]">{labels.segments}</dt><dd className="m-0 font-mono text-[var(--text)]">{state.segments}</dd></div>
            <div><dt className="text-[var(--text-faint)]">{labels.viewport}</dt><dd className="m-0 font-mono text-[var(--text)]">{state.width}×{state.height}</dd></div>
            <div><dt className="text-[var(--text-faint)]">{labels.pointer}</dt><dd className="m-0 text-[var(--text)]">{state.coarse ? labels.touch : labels.mouse}</dd></div>
          </dl>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <a
          href={href}
          onClick={() => trackBlogToolClicked({ tool: 'foldable-open', from: 'article', lang })}
          className="inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white no-underline"
        >
          {labels.open}
        </a>
        <span className="text-[12px] text-[var(--text-dim)]">{labels.openHint}</span>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-3 text-[12px] text-[var(--text-faint)]">{labels.shapes}</div>
        <div role="group" className="mb-4 flex flex-wrap gap-1.5">
          {(['book', 'tabletop', 'flat'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={shape === s}
              onClick={() => setShape(s)}
              className={`min-h-[40px] rounded-[8px] border px-3 text-[13px] ${shape === s ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}
            >
              {labels[s]}
            </button>
          ))}
        </div>
        <Drawing shape={shape} labels={labels} />
      </div>

      {/* Only where the answer says something about a device. */}
      {verdict && verdict !== 'desktop' && (
        <div className="mt-5 border-t border-[var(--border)] pt-4 text-[13px] text-[var(--text-dim)]">
          {reported ? labels.reportThanks : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1">{labels.report}</span>
              <button type="button" onClick={() => report(true)} className="min-h-[40px] rounded-[8px] border border-[var(--border)] px-3 text-[var(--text)]">{labels.reportYes}</button>
              <button type="button" onClick={() => report(false)} className="min-h-[40px] rounded-[8px] border border-[var(--border)] px-3 text-[var(--text)]">{labels.reportNo}</button>
            </div>
          )}
        </div>
      )}

      {caption && <figcaption className="mt-3 text-[12px] text-[var(--text-faint)]">{caption}</figcaption>}
    </figure>
  )
}
