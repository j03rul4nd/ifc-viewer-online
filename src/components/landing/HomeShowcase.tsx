// ─── Home page: the pictures of the viewer, and the comparison ───────────────
// Every picture here is a capture of the viewer (home-showcase.ts names them).
// The .jpg in `src` is what search engines index; browsers take the .webp.
// Reserved sizes on every image, so nothing shifts as they arrive.

import * as Icons from '../Icons'
import { homeLang } from './home-copy'
import {
  COMPARE_ROWS, HERO_IMAGE, HERO_MOBILE, HERO_SCENE_QUERY, HOME_IMAGE_DIR, SHOT_IMAGES, SHOT_ORDER,
  SHOWCASE_COPY, examplesPath, type HomeImage, type ShotId,
} from './home-showcase'

const base = (): string => `${import.meta.env.BASE_URL}${HOME_IMAGE_DIR}`

function srcSet(img: HomeImage): string {
  return img.webp.map((w) => `${base()}${img.file}-${w}.webp ${w}w`).join(', ')
}

// ── Hero: the app window, with the scene it shows one click away ─────────────
export function HeroFigure({ lang }: { lang: string }) {
  const c = SHOWCASE_COPY[homeLang(lang)]
  const sceneHref = `${import.meta.env.BASE_URL}${HERO_SCENE_QUERY}`
  return (
    <figure className="m-0 mt-9 sm:mt-12" data-testid="hero-figure">
      <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--surface)]">
        <picture>
          <source
            media="(max-width: 639px)"
            type="image/webp"
            srcSet={`${base()}${HERO_MOBILE.file}`}
            width={HERO_MOBILE.width}
            height={HERO_MOBILE.height}
          />
          <source type="image/webp" srcSet={srcSet(HERO_IMAGE)} sizes="(max-width: 1240px) 100vw, 1200px" />
          <img
            src={`${base()}${HERO_IMAGE.file}.jpg`}
            alt={c.heroAlt}
            width={HERO_IMAGE.width}
            height={HERO_IMAGE.height}
            className="block w-full h-auto"
            decoding="async"
            {...{ fetchpriority: 'high' }}
          />
        </picture>
      </div>
      <figcaption className="mt-3 text-[13px] sm:text-[14px] leading-[1.5] text-[var(--text-dim)] max-w-[860px]">
        {c.heroCaption}{' '}
        <span className="hidden sm:inline">{c.heroCaptionPanel}{' '}</span>
        {/* 124 MB of models: offered where a desk and a connection are likely. */}
        <a href={sceneHref} className="hidden sm:inline text-[var(--accent-2)] font-medium no-underline hover:underline underline-offset-2 whitespace-nowrap">
          {c.heroOpen} →
        </a>
      </figcaption>
    </figure>
  )
}

// ── The viewer at work: three captures, each with what it shows and where to go ──
export function ShowcaseSection({ lang, links }: { lang: string; links: Record<ShotId, string> }) {
  const c = SHOWCASE_COPY[homeLang(lang)]
  return (
    <section id="in-action" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="in-action-heading">
      <div className="max-w-[1200px] mx-auto">
        <div className="max-w-[720px] mb-10 sm:mb-14">
          <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">{c.label}</div>
          <h2 id="in-action-heading" className="font-semibold tracking-[-0.03em] m-0" style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}>
            {c.title}
          </h2>
          <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 mb-0 leading-[1.55]">{c.sub}</p>
        </div>

        <div className="flex flex-col gap-12 sm:gap-20">
          {SHOT_ORDER.map((id, i) => {
            const img = SHOT_IMAGES[id]
            const shot = c.shots[id]
            return (
              <article key={id} className="grid gap-5 lg:gap-12 lg:grid-cols-12 items-center" data-shot={id}>
                <figure className={`m-0 lg:col-span-8 ${i % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
                    <picture>
                      <source type="image/webp" srcSet={srcSet(img)} sizes="(max-width: 1023px) 100vw, 780px" />
                      <img
                        src={`${base()}${img.file}.jpg`}
                        alt={shot.alt}
                        width={img.width}
                        height={img.height}
                        className="block w-full h-auto"
                        loading="lazy"
                        decoding="async"
                      />
                    </picture>
                  </div>
                </figure>
                <div className="lg:col-span-4">
                  <h3 className="text-[19px] sm:text-[22px] font-semibold tracking-[-0.02em] leading-[1.2] m-0 mb-3 text-balance">{shot.title}</h3>
                  <p className="text-[14px] sm:text-[15px] text-[var(--text-dim)] leading-[1.6] m-0 mb-4">{shot.body}</p>
                  <a href={links[id]} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent-2)] no-underline hover:underline underline-offset-2">
                    {shot.cta}
                    <Icons.ArrowRight size={14} />
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Solibri / Flinker: what each one says about itself ────────────────────────
export function CompareSection({ lang, solibriHref }: { lang: string; solibriHref: string }) {
  const c = SHOWCASE_COPY[homeLang(lang)].compare
  const cell = 'align-top text-left px-4 py-3.5 text-[13px] sm:text-[14px] leading-[1.5] border-t border-[var(--border)]'
  return (
    <section id="compare" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="compare-heading">
      <div className="max-w-[1200px] mx-auto">
        <div className="max-w-[720px] mb-8 sm:mb-10">
          <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">{c.label}</div>
          <h2 id="compare-heading" className="font-semibold tracking-[-0.03em] m-0" style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}>
            {c.title}
          </h2>
          <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 mb-0 leading-[1.55]">{c.sub}</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <td className="px-4 py-3.5 w-[16%]" />
                <th scope="col" className="text-left px-4 py-3.5 text-[14px] font-semibold text-[var(--accent-2)] w-[32%]">IFC Viewer Online</th>
                <th scope="col" className="text-left px-4 py-3.5 text-[14px] font-semibold w-[26%]">Solibri</th>
                <th scope="col" className="text-left px-4 py-3.5 text-[14px] font-semibold w-[26%]">Flinker</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((id) => (
                <tr key={id}>
                  <th scope="row" className={`${cell} font-medium text-[var(--text-dim)]`}>{c.rows[id].label}</th>
                  <td className={`${cell} text-[var(--text)]`}>{c.rows[id].us}</td>
                  <td className={`${cell} text-[var(--text-dim)]`}>{c.rows[id].solibri}</td>
                  <td className={`${cell} text-[var(--text-dim)]`}>{c.rows[id].flinker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[13px] text-[var(--text-faint)] mt-4 mb-0 leading-[1.5]">
          {c.note}{' '}
          <a href={solibriHref} className="text-[var(--accent-2)] no-underline hover:underline underline-offset-2">{c.more} →</a>
        </p>
      </div>
    </section>
  )
}

export { examplesPath }
