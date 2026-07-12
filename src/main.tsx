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

// Clerk (F2 auth) is strictly optional AND must never ride in the anonymous
// bundle (invariant I-1 / S-1): the provider module is imported dynamically,
// only when a publishable key is configured. Without the key the app renders
// exactly as before and zero auth bytes are fetched — an unset key on Vercel
// can never take the SPA down. vite.config keeps @clerk/* out of vendor-ui so
// the dynamic import is a real separate chunk.
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Clerk's post-auth navigations (after sign-in/up/out) default to a FULL page
// load, which killed the flow: the account modal unmounted, the user landed on
// the home page, and the fresh session was only picked up on the next manual
// reload. Handing Clerk an SPA router keeps every step in-page: the History
// API changes the URL, the popstate event lets App re-derive its route, the
// React tree survives, and the session bridge flips the store live.
const spaNavigate = (replace: boolean) => (to: string): void => {
  const target = new URL(to, window.location.origin)
  const samePage =
    target.pathname === window.location.pathname && target.search === window.location.search
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  // Only a REAL page change re-derives the app route. Clerk's internal flow
  // steps (hash-only) and its post-auth return to the URL the user is already
  // on must not reset the current view — that's what kept kicking freshly
  // signed-in users back to the landing.
  if (!samePage) window.dispatchEvent(new PopStateEvent('popstate'))
}

const LazyClerkProvider = clerkPubKey
  ? React.lazy(async () => {
      // The bridge ships in the same lazy chunk: it mirrors the Clerk session
      // into cloudAccountStore so the rest of the app never imports @clerk/*.
      const [{ ClerkProvider }, { default: ClerkSessionBridge }] = await Promise.all([
        import('@clerk/react'),
        import('./components/account/ClerkSessionBridge'),
      ])
      return {
        default: ({ children }: { children: React.ReactNode }) => (
          <ClerkProvider
            publishableKey={clerkPubKey}
            afterSignOutUrl="/"
            routerPush={spaNavigate(false)}
            routerReplace={spaNavigate(true)}
          >
            <ClerkSessionBridge />
            {children}
          </ClerkProvider>
        ),
      }
    })
  : null

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {LazyClerkProvider ? (
      <React.Suspense fallback={null}>
        <LazyClerkProvider>{app}</LazyClerkProvider>
      </React.Suspense>
    ) : (
      app
    )}
  </React.StrictMode>,
)
