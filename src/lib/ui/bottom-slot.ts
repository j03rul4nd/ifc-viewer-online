// One bottom slot: Validation and IDS are never expanded together.
//
// The rule is a pair of store subscriptions rather than code inside either
// store's `set`: idsStore keeps cross-store side effects at its callers
// (idsStore.ts, the panelOpen notes), and two stores importing each other
// would be a cycle. Subscriptions catch every path at once — setters, toggles,
// setState from the SDK or tours, Flood's 'open affected' and the phone score
// pill, which used to stack both drawers. The last one opened wins.
import { useUIStore } from '../../stores/uiStore'
import { useIdsStore } from '../../stores/idsStore'

let detach: (() => void) | null = null

/** Installs the rule; idempotent. Returns the function that removes it. */
export function installBottomSlotRule(): () => void {
  if (detach) return detach
  const offUi = useUIStore.subscribe((s, p) => {
    if (s.validationPanelOpen && !p.validationPanelOpen && useIdsStore.getState().panelOpen) {
      useIdsStore.getState().setPanelOpen(false)
    }
  })
  const offIds = useIdsStore.subscribe((s, p) => {
    if (s.panelOpen && !p.panelOpen && useUIStore.getState().validationPanelOpen) {
      // The persisting setter, like every existing IDS opener.
      useUIStore.getState().setValidationPanelOpen(false)
    }
  })
  const d = () => {
    offUi()
    offIds()
    if (detach === d) detach = null
  }
  detach = d
  return d
}
