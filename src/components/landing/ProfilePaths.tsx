// Three ways in, one per role in the delivery (docs-planning/24 P2/P5).
// Plain cards with real links: no glow, no decrypt animation, text ≥ 13 px.
import { HOME_COPY, PATH_ORDER, homeLang, pathHref } from './home-copy'

interface Props {
  lang: string
  onLaunch: () => void
}

export default function ProfilePaths({ lang, onLaunch }: Props) {
  const c = HOME_COPY[homeLang(lang)]
  return (
    <section id="paths" className="border-t border-[var(--border)] py-14 sm:py-[72px] px-4 sm:px-7" aria-labelledby="paths-heading">
      <div className="max-w-[1100px] mx-auto">
        <h2 id="paths-heading" className="font-semibold tracking-[-0.02em] text-center m-0 mb-8 sm:mb-10" style={{ fontSize: 'clamp(22px, 5vw, 32px)' }}>
          {c.pathsTitle}
        </h2>
        <ul className="list-none m-0 p-0 grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {PATH_ORDER.map((id) => {
            const p = c.paths[id]
            const href = pathHref(id, lang)
            const inner = (
              <>
                <span className="block text-[13px] font-medium text-[var(--accent-2)]">{p.who}</span>
                <span className="block text-[18px] font-semibold text-[var(--text)] mt-2 mb-2 tracking-[-0.01em]">{p.title}</span>
                <span className="block text-[14px] leading-[1.55] text-[var(--text-dim)]">{p.body}</span>
                <span className="block text-[14px] font-semibold text-[var(--accent-2)] mt-4">{p.cta} →</span>
              </>
            )
            const cls = 'block h-full text-left p-5 sm:p-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] transition-colors no-underline cursor-pointer'
            return (
              <li key={id} data-path={id}>
                {href
                  ? <a href={href} className={cls}>{inner}</a>
                  : <button type="button" onClick={onLaunch} className={`${cls} w-full font-[inherit]`}>{inner}</button>}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
