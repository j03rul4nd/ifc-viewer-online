// ─── SketchDemoBlock ──────────────────────────────────────────────────────────
// The poster of a live sketch. The engine, and three with it, loads only when the
// reader presses it; the picture is what a crawler and a slow phone get.

import React, { Suspense, useState } from 'react'
import { trackBlogToolClicked } from '../../lib/analytics'
import type { ShowcaseId } from '../../lib/sketch'
import type { SketchDemoLabels } from '../sketch/SketchDemo'

const SketchDemo = React.lazy(() => import('../sketch/SketchDemo'))

interface Props {
  scene: ShowcaseId
  title: string
  description: string
  poster: string
  posterAlt: string
  launchLabel: string
  labels: SketchDemoLabels
  lang?: string
}

export default function SketchDemoBlock({ scene, title, description, poster, posterAlt, launchLabel, labels, lang = 'en' }: Props) {
  const [running, setRunning] = useState(false)
  const start = () => {
    setRunning(true)
    trackBlogToolClicked({ tool: `sketch-demo-${scene}`, from: 'article', lang })
  }
  return (
    <figure className="my-9 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <figcaption className="p-4">
        <h3 className="text-[17px] font-semibold text-[var(--text)]">{title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-dim)]">{description}</p>
      </figcaption>
      {running ? (
        <Suspense fallback={<img src={`/${poster}`} alt={posterAlt} className="block aspect-[16/10] w-full object-cover" />}>
          <SketchDemo scene={scene} labels={labels} onOpen={() => trackBlogToolClicked({ tool: 'sketch-open', from: 'article', lang })} />
        </Suspense>
      ) : (
        <button type="button" onClick={start} className="group relative block w-full">
          <img src={`/${poster}`} alt={posterAlt} width={800} height={500} loading="lazy" decoding="async" className="block aspect-[16/10] w-full object-cover" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[var(--accent)] px-5 py-3 text-[15px] font-semibold text-[var(--accent-contrast,#04121a)] shadow-lg transition-transform group-hover:scale-105">{launchLabel}</span>
        </button>
      )}
    </figure>
  )
}
