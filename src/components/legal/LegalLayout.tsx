import React, { useEffect } from 'react'
import * as Icons from '../Icons'

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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* ── Header ── */}
      <header
        className="border-b border-[var(--border)] px-4 sm:px-7 py-4 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: 'var(--bg)' }}
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
      <main className="flex-1 px-4 sm:px-7 py-10 sm:py-14">
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
