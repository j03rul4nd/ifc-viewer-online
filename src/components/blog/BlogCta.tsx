// ─── Topic CTAs inside a blog post ────────────────────────────────────────────
// 'top' a one-line bar, 'mid' a card, 'end' a card with the lead form. The
// interest comes from lib/blog-cta (post topic, else what was read before).

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { blogOffer, getSeen, postInterest, recordSeen, resolveBlogInterest, type Interest, type PostLike } from '../../lib/blog-cta'
import { trackBlogCtaClicked, trackBlogCtaViewed } from '../../lib/analytics'
import BlogLeadForm from './BlogLeadForm'

export type CtaPosition = 'top' | 'mid' | 'end'

/**
 * The interest for this post, borrowing from the session's earlier reads, and
 * records the post as seen. `lookup` turns a seen slug back into a post.
 */
export function useBlogInterest(post: PostLike, lookup: (slug: string) => PostLike | undefined): Interest {
  const interest = useMemo(() => {
    const seen = getSeen().filter((s) => s !== post.slug)
    const seenInterests = seen.map((s) => lookup(s)).filter((p): p is PostLike => !!p).map(postInterest)
    return resolveBlogInterest(post, seenInterests)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.slug])
  useEffect(() => { recordSeen(post.slug) }, [post.slug])
  return interest
}

export default function BlogCta(props: { position: CtaPosition; interest: Interest; slug: string; category: string; lang: string }) {
  const { position, interest, slug, category, lang } = props
  const { t } = useTranslation('blog', { keyPrefix: 'cta', lng: lang })
  const offer = blogOffer(interest, lang)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let fired = false
    const io = new IntersectionObserver((entries) => {
      if (fired || !entries.some((e) => e.isIntersecting)) return
      fired = true
      trackBlogCtaViewed({ topic: interest, position, category })
      io.disconnect()
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [interest, position, category, slug])

  const click = (target: 'viewer' | 'plans') => () => trackBlogCtaClicked({ topic: interest, position, category, target })
  const primaryLabel = interest === 'steel' ? t('primarySteel') : t('primary')
  const feature = t(`feature.${offer.offerKey}`)

  const primary = (
    <a href={offer.viewerHref} onClick={click('viewer')} data-cta={`blog_${position}_viewer`}
      className="ed-focus inline-flex items-center rounded-md bg-[var(--accent)] px-3.5 py-2 text-[14px] font-semibold text-white hover:brightness-110 transition-all">
      {primaryLabel} →
    </a>
  )
  const secondary = offer.secondaryHref && (
    <a href={offer.secondaryHref} onClick={click('plans')} data-cta={`blog_${position}_plans`}
      className="ed-focus text-[14px] font-semibold text-[var(--accent-2)] underline-offset-2 hover:underline">
      {t('secondary', { feature })}
    </a>
  )

  if (position === 'top') {
    return (
      <aside ref={ref} aria-label={primaryLabel}
        className="my-6 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] text-[var(--text)]">{t(`top.${interest}`)}</p>
        <a href={offer.viewerHref} onClick={click('viewer')} data-cta="blog_top_viewer"
          className="ed-focus shrink-0 text-[14px] font-semibold text-[var(--accent-2)] hover:underline">
          {primaryLabel} →
        </a>
      </aside>
    )
  }

  return (
    <aside ref={ref} aria-label={t(`midTitle.${interest}`)}
      className="my-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <p className="text-[17px] font-semibold text-[var(--text)]">{t(`midTitle.${interest}`)}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">{t(`midBody.${interest}`)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {primary}
        {secondary}
      </div>
      {position === 'end' && (
        <BlogLeadForm slug={slug} category={category} interest={interest} offerKey={offer.offerKey} lang={lang} />
      )}
    </aside>
  )
}
