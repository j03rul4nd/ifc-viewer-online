import { create } from 'zustand'
import type { ValidationIssue, ValidationResult, SpatialNode, RulesConfig } from '../types'
import { DEFAULT_RULES as DEFAULT_RULES_VALUE } from '../types'

interface ActiveFilters {
  search: string
  ruleIds: string[]
  severities: Array<'error' | 'warning' | 'info'>
  groupBy: 'rule' | 'storey' | 'class'
  activeTab: 'all' | 'errors' | 'warnings' | 'info'
}

interface ValidationStore {
  result: ValidationResult | null
  /** Issues streamed in so far before the full result is ready. */
  partialIssues: ValidationIssue[]
  isRunning: boolean
  progress: number
  spatialTree: SpatialNode[]
  rules: RulesConfig
  filters: ActiveFilters
  validationMode: boolean
  /** Cached result keyed by opfs cache key — shown immediately on model reopen. */
  cachedResults: Record<string, ValidationResult>

  setRunning: (running: boolean) => void
  setProgress: (pct: number) => void
  addPartialIssues: (issues: ValidationIssue[]) => void
  setResult: (result: ValidationResult) => void
  setSpatialTree: (tree: SpatialNode[]) => void
  setRules: (rules: RulesConfig) => void
  setFilters: (filters: Partial<ActiveFilters>) => void
  toggleValidationMode: () => void
  cacheResult: (key: string, result: ValidationResult) => void
  reset: () => void
}

const DEFAULT_FILTERS: ActiveFilters = {
  search: '',
  ruleIds: [],
  severities: [],
  groupBy: 'rule',
  activeTab: 'all',
}

export const useValidationStore = create<ValidationStore>((set) => ({
  result: null,
  partialIssues: [],
  isRunning: false,
  progress: 0,
  spatialTree: [],
  rules: DEFAULT_RULES_VALUE,
  filters: DEFAULT_FILTERS,
  validationMode: false,
  cachedResults: {},

  setRunning: (running) => set(running ? { isRunning: true, partialIssues: [] } : { isRunning: false }),
  setProgress: (pct) => set({ progress: pct }),
  addPartialIssues: (issues) =>
    set((s) => ({ partialIssues: [...s.partialIssues, ...issues] })),
  setResult: (result) => set({ result, isRunning: false, progress: 100 }),
  setSpatialTree: (tree) => set({ spatialTree: tree }),
  setRules: (rules) => set({ rules }),
  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  toggleValidationMode: () => set((s) => ({ validationMode: !s.validationMode })),
  cacheResult: (key, result) =>
    set((s) => ({ cachedResults: { ...s.cachedResults, [key]: result } })),
  reset: () =>
    set({ result: null, partialIssues: [], isRunning: false, progress: 0, spatialTree: [] }),
}))
