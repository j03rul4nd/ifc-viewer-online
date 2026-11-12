import { ConnectorError, type Fetch } from './types'

/** Request with a bearer token; maps HTTP errors to ConnectorError. */
export async function authed(fetchFn: Fetch, url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` }
  const res = await fetchFn(url, { ...init, headers })
  if (!res.ok) {
    // 429 and 5xx are worth retrying on the next poll; 401/403 need a new sign-in.
    const retryable = res.status === 429 || res.status >= 500
    throw new ConnectorError(`${init.method ?? 'GET'} ${url.split('?')[0]} → ${res.status}`, res.status, retryable)
  }
  return res
}

export async function requestJson<T>(fetchFn: Fetch, url: string, token: string, init: RequestInit = {}): Promise<T> {
  return (await (await authed(fetchFn, url, token, init)).json()) as T
}
