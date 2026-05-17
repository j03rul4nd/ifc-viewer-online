// ─── useModelSession — Facade Pattern ────────────────────────────────────────
// One hook that exposes everything a viewer page needs: model info, validation
// state, editor history, and all derived booleans. Components read from this
// instead of importing five separate stores.
//
// Benefits:
//   • Single import for any component that needs cross-store state
//   • Derived values computed once (not repeated in every component)
//   • Easy to add cross-store invariants in one place
//   • Swapping a store doesn't ripple into every component
//
// Usage:
//   const session = useModelSession()
//   if (!session.hasModel) return <Empty />
//   return <Toolbar issueCount={session.issueCount} />

import { useModelStore }      from '../stores/modelStore'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore }     from '../stores/editorStore'
import { useUIStore }         from '../stores/uiStore'
import { modelRegistry }      from '../lib/model-registry'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ModelSession {
  // ── Model ────────────────────────────────────────────────────────────────────
  hasModel:        boolean
  fileName:        string | null
  elementCount:    number
  /** True if the model was loaded from the OPFS cache (no re-parsing). */
  fromCache:       boolean
  /** Buffer is present and large enough to be sent to the validator worker. */
  canValidate:     boolean

  // ── Validation ───────────────────────────────────────────────────────────────
  validationStatus: import('../types').ValidationStatus
  isValidating:     boolean
  validationError:  string | null
  issueCount:       number
  errorCount:       number
  warningCount:     number
  infoCount:        number
  hasIssues:        boolean
  /** Validation overlay is toggled on in the 3D view. */
  overlayActive:    boolean

  // ── Editor ────────────────────────────────────────────────────────────────────
  pendingDiffCount: number
  canUndo:          boolean
  canRedo:          boolean
  hasPendingEdits:  boolean

  // ── UI ────────────────────────────────────────────────────────────────────────
  treeVisible:      boolean
  treeWidth:        number
  mobileSidebarOpen: boolean
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useModelSession(): ModelSession {
  // Granular selectors — each store slice is subscribed independently
  // so a change in validationStore doesn't re-render because of modelStore.
  const modelInfo      = useModelStore((s) => s.modelInfo)
  const ifcBuffer      = useModelStore((s) => s.ifcBuffer)

  const valStatus      = useValidationStore((s) => s.validationStatus)
  const valError       = useValidationStore((s) => s.validationError)
  const valResult      = useValidationStore((s) => s.result)
  const valMode        = useValidationStore((s) => s.validationMode)

  const diffCount      = useEditorStore((s) => s.diffs.length)
  const canUndo        = useEditorStore((s) => s.canUndo)
  const canRedo        = useEditorStore((s) => s.canRedo)

  const treeVisible    = useUIStore((s) => s.treeVisible)
  const treeWidth      = useUIStore((s) => s.treeWidth)
  const mobileSidebar  = useUIStore((s) => s.mobileSidebarOpen)

  // ── Derived values ────────────────────────────────────────────────────────────
  const hasModel    = modelInfo !== null
  const isValidating = valStatus === 'running'
  // Any registered model with a non-empty buffer is enough; fall back to legacy scalar
  const canValidate = !isValidating && (
    modelRegistry.size() > 0 ||
    (!!ifcBuffer && ifcBuffer.byteLength >= 64)
  )

  const issueCount   = valResult?.stats.total    ?? 0
  const errorCount   = valResult?.stats.errors   ?? 0
  const warningCount = valResult?.stats.warnings  ?? 0
  const infoCount    = valResult?.stats.info      ?? 0

  return {
    // Model
    hasModel,
    fileName:         modelInfo?.fileName      ?? null,
    elementCount:     modelInfo?.elementCount  ?? 0,
    fromCache:        false,  // set by loader via useAppEvent in consuming component
    canValidate,

    // Validation
    validationStatus: valStatus,
    isValidating,
    validationError:  valError,
    issueCount,
    errorCount,
    warningCount,
    infoCount,
    hasIssues:        issueCount > 0,
    overlayActive:    valMode,

    // Editor
    pendingDiffCount: diffCount,
    canUndo,
    canRedo,
    hasPendingEdits:  diffCount > 0,

    // UI
    treeVisible,
    treeWidth,
    mobileSidebarOpen: mobileSidebar,
  }
}
