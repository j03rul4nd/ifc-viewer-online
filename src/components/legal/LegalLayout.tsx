import React, { useEffect } from 'react'
import * as Icons from '../Icons'
import SideRays from '../reactbits/SideRays'

interface LegalLayoutProps {
  pageTitle: string
  lastUpdated: string
  onNavigateToLanding: () => void
  children: React.ReactNode
}

export default function LegalLayout({ pageTitle, lastUpdated, onNavigateToLanding, children }: LegalLayoutProps) {
  useEffect(() => {
    const prev = document.title
    document.title = `${pageTitle} · IFC Viewer Online`
    return () => { document.title = prev }
  }, [pageTitle])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}>
      {/* ── Ambient SideRays decoration ── */}
      <div
        className="absolute left-0 right-0 top-0 pointer-events-none hidden sm:block"
        style={{ height: '65vh', zIndex: 0 }}
        aria-hidden="true"
      >
        <SideRays
          speed={0.6}
          rayColor1="#5E6AD2"
          rayColor2="#8B93E8"
          intensity={0.65}
          spread={1.1}
          origin="top-right"
          saturation={1.0}
          blend={0.5}
          falloff={2.8}
          opacity={0.22}
        />
      </div>

      {/* ── Header ── */}
      <header
        className="border-b border-[var(--border)] px-4 sm:px-7 py-4 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: 'var(--bg)', position: 'relative' }}
      >
        <button
          onClick={onNavigateToLanding}
          className="flex items-center gap-2 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          <Icons.Logo size={18} aria-hidden="true" />
          <span className="text-[13px] font-semibold tracking-tight">IFC Viewer Online</span>
        </button>
        <button
          onClick={onNavigateToLanding}
          className="ml-auto flex items-center gap-1 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
          aria-label="Back to home"
        >
          <Icons.Chevron
            size={13}
            className="transition-transform"
            style={{ transform: 'rotate(180deg)' }}
          />
          Back
        </button>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-4 sm:px-7 py-10 sm:py-14" style={{ position: 'relative', zIndex: 1 }}>
        <article className="max-w-3xl mx-auto">
          <header className="mb-10">
            <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight mb-2">{pageTitle}</h1>
            <p className="text-[12.5px] text-[var(--text-faint)]">Last updated: {lastUpdated}</p>
          </header>
          <div className="legal-body">{children}</div>
        </article>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border)] px-4 sm:px-7 py-5 text-[11px] text-[var(--text-faint)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <span>© 2026 IFC Viewer Online</span>
          <button
            onClick={onNavigateToLanding}
            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors bg-transparent border-0 p-0 cursor-pointer text-left"
          >
            ← Back to home
          </button>
        </div>
      </footer>
    </div>
  )
}
