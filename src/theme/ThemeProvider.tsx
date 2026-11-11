import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme, readStoredMode, resolveTheme, systemPrefersLight, urlThemeOverride, writeStoredMode,
  type ResolvedTheme, type ThemeMode,
} from './themeCore'
import { setSceneTheme } from './sceneTheme'

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight)
  const urlTheme = useMemo(() => urlThemeOverride(), [])

  useEffect(() => {
    if (mode !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onChange = (e: MediaQueryListEvent) => setPrefersLight(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [mode])

  const resolvedTheme = urlTheme ?? resolveTheme(mode, prefersLight)

  useEffect(() => {
    applyTheme(resolvedTheme)
    setSceneTheme(resolvedTheme)
  }, [resolvedTheme])

  const setMode = useCallback((next: ThemeMode) => {
    writeStoredMode(next)
    setModeState(next)
  }, [])

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Current theme mode, the resolved light/dark theme, and a setter. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
