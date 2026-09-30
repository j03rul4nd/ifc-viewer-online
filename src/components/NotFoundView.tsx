// ─── NotFoundView ─────────────────────────────────────────────────────────────
// The SPA's 404. Vercel rewrites every unknown path to index.html, so without
// this the app used to fall back to the landing for any mistyped URL — which
// hid broken links and let crawlers index junk paths as duplicate landings.
//
// Bimo (BimoState "notFound") carries the page: confused, then he shakes his
// head. The response is still HTTP 200 (it is a rewrite), so the page marks
// itself noindex while it is mounted to keep it out of search results.

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BimoState } from './mascot/BimoStage'

interface NotFoundViewProps {
  path: string
  onNavigateHome: () => void
  onNavigateToBlog: () => void
  theme?: 'dark' | 'light'
}

export default function NotFoundView({ path, onNavigateHome, onNavigateToBlog, theme = 'dark' }: NotFoundViewProps) {
  const { t } = useTranslation('common', { keyPrefix: 'mascot.notFoundPage' })
  const { t: ts } = useTranslation('common', { keyPrefix: 'mascot.states.notFound' })

  useEffect(() => {
    const prevTitle = document.title
    document.title = `${ts('title')} · IFC Viewer Online`
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => { document.title = prevTitle; meta.remove() }
  }, [ts])

  return (
    <main className={`min-h-full w-full bg-[var(--bg)] text-[var(--text)] ${theme === 'light' ? 'lp-light' : ''}`}>
      <BimoState
        kind="notFound"
        fullPage
        detail={path}
        actions={[
          { label: t('home'), onClick: onNavigateHome, primary: true },
          { label: t('blog'), onClick: onNavigateToBlog },
        ]}
      />
    </main>
  )
}
