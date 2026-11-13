// OAuth 2.0 authorization code + PKCE, the flow the Microsoft identity platform
// and Google both support for browser apps (no client secret in the page).
import { ConnectorError, type Fetch, type OAuthConfig, type OAuthTokens } from './types'

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function randomVerifier(len = 48): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return b64url(bytes)
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

export interface AuthRequest { clientId: string; redirectUri: string; state: string; verifier: string }

export async function authorizeUrl(cfg: OAuthConfig, req: AuthRequest): Promise<string> {
  const p = new URLSearchParams({
    client_id: req.clientId,
    response_type: 'code',
    redirect_uri: req.redirectUri,
    scope: cfg.scopes.join(' '),
    state: req.state,
    code_challenge: await pkceChallenge(req.verifier),
    code_challenge_method: 'S256',
    ...cfg.extraAuthParams,
  })
  return `${cfg.authorizeUrl}?${p}`
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number }

async function tokenCall(fetchFn: Fetch, cfg: OAuthConfig, body: Record<string, string>, now: number): Promise<OAuthTokens> {
  const res = await fetchFn(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) throw new ConnectorError(`token endpoint → ${res.status}`, res.status, res.status >= 500)
  const t = (await res.json()) as TokenResponse
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: now + t.expires_in * 1000 }
}

export function exchangeCode(fetchFn: Fetch, cfg: OAuthConfig, a: { clientId: string; redirectUri: string; code: string; verifier: string }, now = Date.now()) {
  return tokenCall(fetchFn, cfg, { grant_type: 'authorization_code', client_id: a.clientId, redirect_uri: a.redirectUri, code: a.code, code_verifier: a.verifier }, now)
}

/** Returns the same tokens while they have more than a minute left. */
export async function refreshIfNeeded(fetchFn: Fetch, cfg: OAuthConfig, clientId: string, t: OAuthTokens, now = Date.now()): Promise<OAuthTokens> {
  if (t.expiresAt - now > 60_000) return t
  if (!t.refreshToken) throw new ConnectorError('session expired: sign in again', 401)
  const next = await tokenCall(fetchFn, cfg, { grant_type: 'refresh_token', client_id: clientId, refresh_token: t.refreshToken }, now)
  return { ...next, refreshToken: next.refreshToken ?? t.refreshToken }
}
