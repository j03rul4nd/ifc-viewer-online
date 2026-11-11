// ─── Home page: «open an IFC file» answered, and the links between the homes ──
// Copy and link targets live in home-guide.ts. Plain text on token surfaces:
// no effects, nothing under 13 px.

import * as Icons from '../Icons'
import { homeLang } from './home-copy'
import { HOME_GUIDE, HOME_LANGS, HOME_LANGUAGE_NAMES, guideHref, homePath } from './home-guide'

/** The questions people search before they have opened anything. Renders nothing in a language without a guide. */
export function HomeGuideSection({ lang }: { lang: string }) {
  const l = homeLang(lang)
  const g = HOME_GUIDE[l]
  if (!g) return null
  return (
    <section id="open-ifc" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="open-ifc-heading">
      <div className="max-w-[1200px] mx-auto">
        <div className="max-w-[720px] mb-8 sm:mb-12">
          <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">{g.label}</div>
          <h2 id="open-ifc-heading" className="font-semibold tracking-[-0.03em] m-0 text-balance" style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}>
            {g.title}
          </h2>
          <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 mb-0 leading-[1.55]">{g.intro}</p>
        </div>

        <div className="grid gap-x-12 gap-y-9 sm:gap-y-11 md:grid-cols-2">
          {g.items.map((item) => (
            <article key={item.q} className="border-t border-[var(--border)] pt-5">
              <h3 className="text-[17px] sm:text-[19px] font-semibold tracking-[-0.01em] leading-[1.3] m-0 mb-2.5 text-balance">{item.q}</h3>
              <p className="text-[14px] sm:text-[15px] text-[var(--text-dim)] leading-[1.6] m-0">{item.a}</p>
              {item.link && (
                <a
                  href={`${import.meta.env.BASE_URL}${guideHref(l, item.link.to)}`}
                  className="inline-flex items-center gap-1.5 mt-3.5 text-[14px] font-medium text-[var(--accent-2)] no-underline hover:underline underline-offset-2"
                >
                  {item.link.text}
                  <Icons.ArrowRight size={14} />
                </a>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Links to the ten homes, each in its own language. */
export function HomeLanguages({ lang }: { lang: string }) {
  const current = homeLang(lang)
  return (
    <nav aria-label="Languages" className="max-w-[1200px] mx-auto px-4 sm:px-7 pb-6 sm:pb-8" data-testid="home-languages">
      <ul className="list-none m-0 p-0 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {HOME_LANGS.map((l) => (
          <li key={l}>
            <a
              href={`${import.meta.env.BASE_URL}${homePath(l)}`}
              hrefLang={l}
              lang={l}
              aria-current={l === current ? 'page' : undefined}
              className={`inline-flex items-center min-h-[32px] no-underline hover:text-[var(--text)] transition-colors ${l === current ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'}`}
            >
              {HOME_LANGUAGE_NAMES[l]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
