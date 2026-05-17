import { useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import { createLogger } from '../lib/logger'

const log          = createLogger('Prefs')
const STORAGE_KEY  = 'ifc-viewer:prefs'
const DEBOUNCE_MS  = 500

interface PersistedPrefs {
  treeWidth:   number
  treeVisible: boolean
}

function readPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<PersistedPrefs>) : {}
  } catch (err) {
    log.warn('Failed to read preferences from localStorage:', err)
    return {}
  }
}

function writePrefs(prefs: PersistedPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    log.debug('Preferences saved:', prefs)
  } catch (err) {
    log.warn('Failed to write preferences to localStorage (quota exceeded?):', err)
  }
}

/**
 * Hydrates treeWidth / treeVisible from localStorage on mount, then
 * debounce-saves any changes back whenever either value changes.
 */
export function usePersistedPreferences(): void {
  const { treeWidth, treeVisible, setTreeWidth, setTreeVisible } = useUIStore()
  const hydrated = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One-time hydration from localStorage
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const saved = readPrefs()
    if (saved.treeWidth   !== undefined) {
      log.debug('Hydrating treeWidth:', saved.treeWidth)
      setTreeWidth(saved.treeWidth)
    }
    if (saved.treeVisible !== undefined) {
      log.debug('Hydrating treeVisible:', saved.treeVisible)
      setTreeVisible(saved.treeVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced persist on change
  useEffect(() => {
    if (!hydrated.current) return
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      writePrefs({ treeWidth, treeVisible })
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [treeWidth, treeVisible])
}
