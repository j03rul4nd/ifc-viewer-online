/**
 * Theme state outside React: read/write the stored mode, resolve 'system',
 * and stamp data-theme on <html>. The inline script in index.html mirrors
 * readMode/resolve so the first paint already has the right palette.
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ifc-theme'
/** Default 'dark': existing users see no change until they opt in. */
export const DEFAULT_MODE: ThemeMode = 'dark'

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system'
}

/** `?theme=light|dark` wins for this page view (embeds/SDK), not persisted. */
export function urlThemeOverride(search: string = typeof location !== 'undefined' ? location.search : ''): ResolvedTheme | null {
  try {
    const v = new URLSearchParams(search).get('theme')
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(v) ? v : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

export function writeStoredMode(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, mode) } catch { /* storage blocked */ }
}

export function systemPrefersLight(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
  } catch {
    return false
  }
}

export function resolveTheme(mode: ThemeMode, prefersLight = systemPrefersLight()): ResolvedTheme {
  if (mode === 'system') return prefersLight ? 'light' : 'dark'
  return mode
}

export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}
