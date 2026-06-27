import './i18n/config'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { analyticsAllowed } from './stores/consentStore'
import { captureAttribution } from './lib/attribution'
import { parseAppUrlParams, parseInvitePath } from './lib/url-params'
import './index.css'

// Initialize PostHog analytics before first render — but only when the user has
// not objected (GDPR Art. 21) and the browser is not signalling GPC/DNT.
// No-op when VITE_POSTHOG_KEY is not set (local dev without .env.local).
if (analyticsAllowed()) initAnalytics()

// First-touch attribution: capture a personalized invite tag from either the
// query (?ref=/?invite=) or the pretty path (/i/<code>), register it as a
// PostHog super-property (so every later event is attributed), and strip it from
// the URL. After init so the super-property attaches; before render so the URL
// is clean by the time App derives its route.
captureAttribution({ ref: parseAppUrlParams().ref ?? parseInvitePath() })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
