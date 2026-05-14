import { create } from 'zustand'
import type { ValidationIssue, ValidationResult, SpatialNode, RulesConfig, ValidationStatus } from '../types'
import { DEFAULT_RULES as DEFAULT_RULES_VALUE } from '../types'

export interface ActiveFilters {
  search: string
  ruleIds: string[]
  severities: Array<'error' | 'warning' | 'info'>
  groupBy: 'rule' | 'storey' | 'class'
  activeTab: 'all' | 'errors' | 'warnings' | 'info'
}

interface ValidationStore {
  result:         ValidationResult | null
  partialIssues:  ValidationIssue[]
  /** Replaces the old isRunning boolean — full lifecycle of a validation run. */
  validationStatus: ValidationStatus
  /** Set when validationStatus === 'error' */
  validationError:  string | null
  /** @deprecated Use `validationStatus === 'running'` instead. Kept for backward compat. */
  isRunning: boolean
  progress:       number
  spatialTree:    SpatialNode[]
  rules:          RulesConfig
  filters:        ActiveFilters
  validationMode: boolean
  cachedResults:  Record<string, ValidationResult>

  setValidationStatus: (status: ValidationStatus, error?: string) => void
  setProgress:         (pct: number) => void
  addPartialIssues:    (issues: ValidationIssue[]) => void
  setResult:           (result: ValidationResult) => void
  setSpatialTree:      (tree: SpatialNode[]) => void
  setRules:            (rules: RulesConfig) => void
  setFilters:          (filters: Partial<ActiveFilters>) => void
  toggleValidationMode: () => void
  cacheResult:         (key: string, result: ValidationResult) => void
  reset:               () => void

  /** @deprecated Use setValidationStatus directly. */
  setRunning: (running: boolean) => void
}

const DEFAULT_FILTERS: ActiveFilters = {
  search:    '',
  ruleIds:   [],
  severities: [],
  groupBy:   'rule',
  activeTab: 'all',
}

export const useValidationStore = create<ValidationStore>((set) => ({
  result:           null,
  partialIssues:    [],
  validationStatus: 'idle',
  validationError:  null,
  isRunning:        false,
  progress:         0,
  spatialTree:      [],
  rules:            DEFAULT_RULES_VALUE,
  filters:          DEFAULT_FILTERS,
  validationMode:   false,
  cachedResults:    {},

  setValidationStatus: (status, error) =>
    set({
      validationStatus: status,
      validationError:  error ?? null,
      isRunning:        status === 'running',
      // Clear partials when starting a new run
      ...(status === 'running' ? { partialIssues: [] } : {}),
    }),

  setProgress: (pct) => set({ progress: pct }),

  addPartialIssues: (issues) =>
    set((s) => ({ partialIssues: [...s.partialIssues, ...issues] })),

  setResult: (result) =>
    set({ result, validationStatus: 'complete', isRunning: false, progress: 100 }),

  setSpatialTree:   (tree)    => set({ spatialTree: tree }),
  setRules:         (rules)   => set({ rules }),
  setFilters:       (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  toggleValidationMode: ()    => set((s) => ({ validationMode: !s.validationMode })),

  cacheResult: (key, result) =>
    set((s) => ({ cachedResults: { ...s.cachedResults, [key]: result } })),

  reset: () =>
    set({
      result:           null,
      partialIssues:    [],
      validationStatus: 'idle',
      validationError:  null,
      isRunning:        false,
      progress:         0,
      spatialTree:      [],
    }),

  // ── Backward-compat shim ──────────────────────────────────────────────────
  setRunning: (running) =>
    set(running
      ? { validationStatus: 'running', isRunning: true, partialIssues: [] }
      : { validationStatus: 'complete', isRunning: false },
    ),
}))
