import { useCallback } from 'react'
import { useValidationStore } from '../stores/validationStore'
import { useModelStore } from '../stores/modelStore'
import { modelRegistry } from '../lib/model-registry'
import { runValidation, runValidationAll, cancelValidation } from '../lib/validator'
import type { ValidationStatus, ValidationResult, RulesConfig } from '../types'

export interface ValidationRunnerResult {
  run:          (rules?: RulesConfig, modelId?: string, force?: boolean) => Promise<void>
  /** Validate every model in the scene and show the aggregate result. */
  runAll:       (rules?: RulesConfig, force?: boolean) => Promise<void>
  cancel:       () => void
  canRun:       boolean
  status:       ValidationStatus
  error:        string | null
  isRunning:    boolean
  progress:     number
  result:       ValidationResult | null
  issueCount:   number
  errorCount:   number
  warningCount: number
  hasIssues:    boolean
}

export function useValidationRunner(): ValidationRunnerResult {
  const { validationStatus, validationError, result, progress } = useValidationStore()
  const { ifcBuffer } = useModelStore()

  const isRunning = validationStatus === 'running'
  // canRun if any model buffer is available (registry or active store buffer)
  const canRun    = (!isRunning) && (modelRegistry.size() > 0 || !!ifcBuffer)

  const run = useCallback(async (rules?: RulesConfig, modelId?: string, force = false) => {
    if (!canRun) return
    try {
      await runValidation(modelId, rules, force)
    } catch {
      // validator.ts already sets status + fires toasts — nothing to do here
    }
  }, [canRun])

  const runAll = useCallback(async (rules?: RulesConfig, force = false) => {
    if (!canRun) return
    try {
      await runValidationAll(rules, force)
    } catch {
      // validator.ts already sets status + fires toasts — nothing to do here
    }
  }, [canRun])

  return {
    run,
    runAll,
    cancel: cancelValidation,
    canRun,
    status:       validationStatus,
    error:        validationError,
    isRunning,
    progress,
    result,
    issueCount:   result?.stats.total    ?? 0,
    errorCount:   result?.stats.errors   ?? 0,
    warningCount: result?.stats.warnings ?? 0,
    hasIssues:    (result?.stats.total   ?? 0) > 0,
  }
}
