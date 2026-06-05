import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ValidationIssue, ValidationResult, SpatialNode, RulesConfig, ValidationStatus, ValidationProfile } from '../types'
import { DEFAULT_RULES as DEFAULT_RULES_VALUE, VALIDATION_PROFILES } from '../types'

// ── Profile persistence ────────────────────────────────────────────────────────

const PROFILE_STORAGE_KEY = 'ifc-validator:profile'
const CUSTOM_PROFILES_KEY  = 'ifc-validator:custom-profiles'

function loadPersistedProfileId(): string | null {
  try { return localStorage.getItem(PROFILE_STORAGE_KEY) } catch { return null }
}

function savePersistedProfileId(id: string | null): void {
  try {
    if (id) localStorage.setItem(PROFILE_STORAGE_KEY, id)
    else localStorage.removeItem(PROFILE_STORAGE_KEY)
  } catch { /* quota */ }
}

function loadCustomProfiles(): ValidationProfile[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROFILES_KEY)
    return raw ? (JSON.parse(raw) as ValidationProfile[]) : []
  } catch { return [] }
}

function saveCustomProfiles(profiles: ValidationProfile[]): void {
  try { localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(profiles)) } catch { /* quota */ }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActiveFilters {
  search:    string
  ruleIds:   string[]
  severities: Array<'error' | 'warning' | 'info'>
  groupBy:   'rule' | 'storey' | 'class'
  activeTab: 'all' | 'errors' | 'warnings' | 'info'
}

interface ValidationStore {
  result:           ValidationResult | null
  partialIssues:    ValidationIssue[]
  /** Full lifecycle of a validation run. */
  validationStatus: ValidationStatus
  /** Set when validationStatus === 'error'. */
  validationError:  string | null
  /** @deprecated Use `validationStatus === 'running'`. Kept for backward compat. */
  isRunning:        boolean
  progress:         number

  // ── Per-model spatial trees ────────────────────────────────────────────────
  /**
   * Spatial trees keyed by modelId.
   * Allows multiple models to keep their tree data independently.
   * Use setSpatialTreeForModel to write; read via selectSpatialTreeForModel selector.
   */
  spatialTrees:             Record<string, SpatialNode[]>
  /**
   * Physical-element decomposition maps keyed by modelId.
   * Maps parent expressId → child expressIds (from IfcRelAggregates, non-spatial only).
   * Used by collectElementIds to expand assembled elements (e.g. IfcStair → IfcStairFlight).
   */
  decompMaps:               Record<string, Map<number, number[]>>
  /**
   * Which model's tree is currently active (shown in ModelTree panel).
   * null when no model is loaded or no tree has been built yet.
   */
  activeValidationModelId:  string | null

  // ── Backward-compat single-model alias ────────────────────────────────────
  /**
   * @deprecated Use spatialTrees[activeValidationModelId] via selectActiveSpatialTree.
   * Kept so existing code that reads this field doesn't crash until migrated.
   */
  spatialTree: SpatialNode[]

  rules:            RulesConfig
  filters:          ActiveFilters
  validationMode:   boolean
  cachedResults:    Record<string, ValidationResult>
  /** Per-model validation results, keyed by modelId. */
  cachedResultsByModel: Record<string, ValidationResult>

  // ── Actions ────────────────────────────────────────────────────────────────

  setValidationStatus:  (status: ValidationStatus, error?: string) => void
  setProgress:          (pct: number) => void
  addPartialIssues:     (issues: ValidationIssue[]) => void
  setResult:            (result: ValidationResult) => void

  /** Store a spatial tree for a specific model. Also sets it as the active model. */
  setSpatialTreeForModel: (modelId: string, tree: SpatialNode[]) => void
  /** Store the physical-element decomposition map for a specific model. */
  setDecompMapForModel:   (modelId: string, map: Map<number, number[]>) => void
  /** @deprecated Use setSpatialTreeForModel(modelId, tree). */
  setSpatialTree:         (tree: SpatialNode[]) => void
  /** Set which model's tree is displayed in the tree panel. */
  setActiveValidationModelId: (modelId: string | null) => void
  /** Remove stored tree and validation data for a specific model. */
  clearValidationForModel: (modelId: string) => void

  setRules:             (rules: RulesConfig) => void
  setFilters:           (filters: Partial<ActiveFilters>) => void
  toggleValidationMode: () => void
  cacheResult:          (key: string, result: ValidationResult) => void
  /** Store a validation result keyed by modelId (separate from cache-key index). */
  cacheResultForModel:  (modelId: string, result: ValidationResult) => void
  /** Full reset — clears all per-model data. Called on navigate-to-landing. */
  reset:                () => void

  /** @deprecated Use setValidationStatus directly. */
  setRunning: (running: boolean) => void

  // ── Profile management ───────────────────────────────────────────────────────

  /** ID of the active predefined or custom profile, null = custom/manual rules */
  activeProfileId: string | null
  /** Select a predefined or custom profile by ID. Applies its RulesConfig and persists choice. */
  setActiveProfile: (profileId: string | null) => void

  /** User-defined profiles persisted in localStorage (max 5) */
  customProfiles: ValidationProfile[]
  addCustomProfile:    (profile: Omit<ValidationProfile, 'id'>) => void
  updateCustomProfile: (profileId: string, updates: Partial<Omit<ValidationProfile, 'id'>>) => void
  removeCustomProfile: (profileId: string) => void

  /** Whether to show the post-run coverage summary banner */
  showCoverageSummary: boolean
  dismissCoverageSummary: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: ActiveFilters = {
  search:    '',
  ruleIds:   [],
  severities: [],
  groupBy:   'rule',
  activeTab: 'all',
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useValidationStore = create<ValidationStore>()(
  devtools(
    (set) => ({
      result:                  null,
      partialIssues:           [],
      validationStatus:        'idle',
      validationError:         null,
      isRunning:               false,
      progress:                0,
      spatialTrees:            {},
      decompMaps:              {},
      activeValidationModelId: null,
      spatialTree:             [],   // backward-compat alias
      rules:                   DEFAULT_RULES_VALUE,
      filters:                 DEFAULT_FILTERS,
      validationMode:          false,
      cachedResults:           {},
      cachedResultsByModel:    {},
      activeProfileId:         loadPersistedProfileId(),
      customProfiles:          loadCustomProfiles(),
      showCoverageSummary:     false,

      setValidationStatus: (status, error) =>
        set(
          {
            validationStatus: status,
            validationError:  error ?? null,
            isRunning:        status === 'running',
            // Clear stale data when a new run starts so the panel shows
            // streaming partial issues instead of the previous run's results.
            ...(status === 'running' ? { partialIssues: [], result: null } : {}),
          },
          false,
          `setValidationStatus:${status}`,
        ),

      setProgress: (pct) => set({ progress: pct }, false, 'setProgress'),

      addPartialIssues: (issues) =>
        set(
          (s) => ({ partialIssues: [...s.partialIssues, ...issues] }),
          false,
          'addPartialIssues',
        ),

      setResult: (result) =>
        set(
          { result, validationStatus: 'complete', isRunning: false, progress: 100, showCoverageSummary: true },
          false,
          'setResult',
        ),

      setSpatialTreeForModel: (modelId, tree) =>
        set(
          (s) => ({
            spatialTrees:            { ...s.spatialTrees, [modelId]: tree },
            activeValidationModelId: modelId,
            // Keep backward-compat alias pointing to the latest tree
            spatialTree:             tree,
          }),
          false,
          `setSpatialTreeForModel:${modelId}`,
        ),

      setDecompMapForModel: (modelId, map) =>
        set(
          (s) => ({ decompMaps: { ...s.decompMaps, [modelId]: map } }),
          false,
          `setDecompMapForModel:${modelId}`,
        ),

      setSpatialTree: (tree) =>
        set((s) => {
          // Update the backward-compat alias and the active model's tree (if known)
          const activeId = s.activeValidationModelId
          return {
            spatialTree:  tree,
            spatialTrees: activeId
              ? { ...s.spatialTrees, [activeId]: tree }
              : s.spatialTrees,
          }
        }, false, 'setSpatialTree'),

      setActiveValidationModelId: (modelId) =>
        set(
          (s) => ({
            activeValidationModelId: modelId,
            // Keep backward-compat alias in sync
            spatialTree: modelId ? (s.spatialTrees[modelId] ?? []) : [],
          }),
          false,
          'setActiveValidationModelId',
        ),

      clearValidationForModel: (modelId) =>
        set(
          (s) => {
            const { [modelId]: _removed,  ...remainingTrees }   = s.spatialTrees
            const { [modelId]: _removedR, ...remainingResults } = s.cachedResultsByModel
            const { [modelId]: _removedD, ...remainingDecomp }  = s.decompMaps
            const isActive = s.activeValidationModelId === modelId
            const nextActiveId = isActive
              ? (Object.keys(remainingTrees)[0] ?? null)
              : s.activeValidationModelId
            return {
              spatialTrees:            remainingTrees,
              cachedResultsByModel:    remainingResults,
              decompMaps:              remainingDecomp,
              activeValidationModelId: nextActiveId,
              spatialTree:             nextActiveId ? (remainingTrees[nextActiveId] ?? []) : [],
            }
          },
          false,
          `clearValidationForModel:${modelId}`,
        ),

      setActiveProfile: (profileId) => {
        savePersistedProfileId(profileId)
        if (profileId === null) {
          return set(
            { activeProfileId: null, validationStatus: 'idle', result: null, partialIssues: [] },
            false,
            'setActiveProfile:null',
          )
        }
        // Look in predefined profiles first, then custom profiles
        const allProfiles = (s: { customProfiles: ValidationProfile[] }) =>
          [...VALIDATION_PROFILES, ...s.customProfiles]
        set(
          (s) => {
            const profile = allProfiles(s).find((p) => p.id === profileId)
            if (!profile) return { activeProfileId: profileId }
            // Reset status + clear stale result so the panel shows "Validar"
            // (not "Volver a validar") until the new profile has been run.
            return {
              activeProfileId:  profileId,
              rules:            profile.rules,
              validationStatus: 'idle' as ValidationStatus,
              result:           null,
              partialIssues:    [],
            }
          },
          false,
          `setActiveProfile:${profileId}`,
        )
      },

      addCustomProfile: (profileData) =>
        set(
          (s) => {
            if (s.customProfiles.length >= 5) return s
            const id = `custom-${Date.now()}`
            const profile: ValidationProfile = { ...profileData, id }
            const next = [...s.customProfiles, profile]
            saveCustomProfiles(next)
            return { customProfiles: next }
          },
          false,
          'addCustomProfile',
        ),

      updateCustomProfile: (profileId, updates) =>
        set(
          (s) => {
            const idx = s.customProfiles.findIndex((p) => p.id === profileId)
            if (idx === -1) return s
            const next = [...s.customProfiles]
            next[idx] = { ...next[idx], ...updates }
            saveCustomProfiles(next)
            const wasActive = s.activeProfileId === profileId
            return {
              customProfiles: next,
              ...(wasActive ? { rules: next[idx].rules } : {}),
            }
          },
          false,
          `updateCustomProfile:${profileId}`,
        ),

      removeCustomProfile: (profileId) =>
        set(
          (s) => {
            const next = s.customProfiles.filter((p) => p.id !== profileId)
            saveCustomProfiles(next)
            const wasActive = s.activeProfileId === profileId
            if (wasActive) savePersistedProfileId(null)
            return {
              customProfiles: next,
              ...(wasActive ? { activeProfileId: null } : {}),
            }
          },
          false,
          `removeCustomProfile:${profileId}`,
        ),

      dismissCoverageSummary: () =>
        set({ showCoverageSummary: false }, false, 'dismissCoverageSummary'),

      setRules: (rules) => set({ rules }, false, 'setRules'),

      setFilters: (filters) =>
        set((s) => ({ filters: { ...s.filters, ...filters } }), false, 'setFilters'),

      toggleValidationMode: () =>
        set((s) => ({ validationMode: !s.validationMode }), false, 'toggleValidationMode'),

      cacheResult: (key, result) =>
        set(
          (s) => ({ cachedResults: { ...s.cachedResults, [key]: result } }),
          false,
          'cacheResult',
        ),

      cacheResultForModel: (modelId, result) =>
        set(
          (s) => ({ cachedResultsByModel: { ...s.cachedResultsByModel, [modelId]: result } }),
          false,
          `cacheResultForModel:${modelId}`,
        ),

      reset: () =>
        set(
          {
            result:                  null,
            partialIssues:           [],
            validationStatus:        'idle',
            validationError:         null,
            isRunning:               false,
            progress:                0,
            spatialTrees:            {},
            decompMaps:              {},
            activeValidationModelId: null,
            spatialTree:             [],
            cachedResultsByModel:    {},
            showCoverageSummary:     false,
          },
          false,
          'reset',
        ),

      setRunning: (running) =>
        set(
          running
            ? { validationStatus: 'running', isRunning: true, partialIssues: [] }
            : { validationStatus: 'complete', isRunning: false },
          false,
          `setRunning:${running}`,
        ),
    }),
    { name: 'ValidationStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectValidationStatus = (s: ValidationStore) => s.validationStatus
export const selectIsRunning        = (s: ValidationStore) => s.isRunning
export const selectIssueCount       = (s: ValidationStore) => s.result?.stats.total   ?? 0
export const selectErrorCount       = (s: ValidationStore) => s.result?.stats.errors  ?? 0
export const selectHasIssues        = (s: ValidationStore) => (s.result?.stats.total  ?? 0) > 0

/** Returns the spatial tree for the currently active model (empty array if none). */
export const selectActiveSpatialTree = (s: ValidationStore): SpatialNode[] =>
  s.activeValidationModelId ? (s.spatialTrees[s.activeValidationModelId] ?? []) : s.spatialTree

/**
 * Returns all loaded spatial trees as an ordered array of {modelId, tree} pairs.
 *
 * ⚠️  UNSAFE SELECTOR — do NOT pass directly to `useStore(selectAllSpatialTrees)`.
 * `.map()` creates a new array on every call; Zustand uses Object.is comparison,
 * so the subscription never stabilises and causes an infinite re-render loop.
 *
 * ✅  Safe usage pattern:
 *   const record = useValidationStore((s) => s.spatialTrees)          // stable ref
 *   const allTrees = useMemo(
 *     () => Object.entries(record).map(([modelId, tree]) => ({ modelId, tree })),
 *     [record],
 *   )
 */
export const selectAllSpatialTrees = (s: ValidationStore): Array<{ modelId: string; tree: SpatialNode[] }> =>
  Object.entries(s.spatialTrees).map(([modelId, tree]) => ({ modelId, tree }))

/** Returns true when at least one model has a built spatial tree. */
export const selectHasAnyTree = (s: ValidationStore): boolean =>
  Object.keys(s.spatialTrees).length > 0 || s.spatialTree.length > 0

/** Returns the cached validation result for a specific model, or null. */
export const selectCachedResultForModel = (modelId: string) =>
  (s: ValidationStore): ValidationResult | null =>
    s.cachedResultsByModel[modelId] ?? null
