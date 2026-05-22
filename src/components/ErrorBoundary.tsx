import React from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '../lib/logger'

const log = createLogger('ErrorBoundary')

// ── Types ──────────────────────────────────────────────────────────────────────

type FallbackRenderFn = (error: Error, reset: () => void) => React.ReactNode

interface Props {
  children:    React.ReactNode
  /** Custom fallback: either a static node or a render function. */
  fallback?:   React.ReactNode | FallbackRenderFn
  /** Called after every caught error (e.g. to send to an error tracker). */
  onError?:    (error: Error, info: React.ErrorInfo) => void
}

interface State {
  error: Error | null
}

// ── Default fallback UI ────────────────────────────────────────────────────────

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation('errors')
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg,#0e0e12)] text-[var(--text,#e2e2e8)] p-8 gap-5">
      <div style={{ fontSize: 32 }}>⚠</div>
      <div className="text-[18px] font-semibold tracking-tight text-[var(--danger,#f04040)]">
        {t('boundary.title')}
      </div>
      <pre className="text-[12px] text-[var(--text-dim,#888)] max-w-lg text-center bg-[var(--surface,#1a1a22)] border border-[var(--border,#2e2e3a)] rounded-[10px] p-4 whitespace-pre-wrap break-words font-mono leading-relaxed">
        {error.message}
      </pre>
      <button
        onClick={reset}
        className="px-5 py-2 bg-[var(--accent,#5E6AD2)] text-white rounded-[8px] text-[13px] font-medium hover:brightness-110 active:brightness-90 transition"
      >
        {t('boundary.reload')}
      </button>
      {import.meta.env.DEV && error.stack && (
        <details className="text-[10px] text-[var(--text-faint,#555)] max-w-lg w-full">
          <summary className="cursor-pointer mb-1 select-none">{t('boundary.stackTrace')}</summary>
          <pre className="whitespace-pre-wrap break-all">{error.stack}</pre>
        </details>
      )}
    </div>
  )
}

// ── Boundary class ─────────────────────────────────────────────────────────────

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error('Caught render error:', error.message, info.componentStack ?? '')
    this.props.onError?.(error, info)
  }

  reset = (): void => this.setState({ error: null })

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const { fallback } = this.props
    if (typeof fallback === 'function') return (fallback as FallbackRenderFn)(error, this.reset)
    if (fallback != null)              return fallback
    return <DefaultFallback error={error} reset={this.reset} />
  }
}

// ── Convenience wrapper ────────────────────────────────────────────────────────

/** Wrap any component tree with an error boundary (function-component style). */
export function withErrorBoundary<P extends object>(
  Component:  React.ComponentType<P>,
  boundaryProps?: Omit<Props, 'children'>,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )
  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`
  return Wrapped
}
