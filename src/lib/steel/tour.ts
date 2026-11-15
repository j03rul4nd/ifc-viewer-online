// ─── Guided tour of the steel takeoff (demo link `?tour=steel`) ──────────────
// Same TourStep format as the workspace tours; `title`/`body` are steel text
// keys (lib/steel/i18n), translated where the tour is shown. Anchors are
// `data-tour` values in SteelTakeoffPanel; the last step has no anchor (a
// centred card) and invites the user to drop their own IFC. The row and the
// Excel steps are interactive: the click goes through and moves the tour on.
import type { TourStep } from '../workspace-tours/tours'
import type { SteelTextKey } from './i18n'

export type SteelTourStepId = 'table' | 'row' | 'bar' | 'export' | 'end'

export interface SteelTourStep extends TourStep {
  id: SteelTourStepId
  title: SteelTextKey
  body: SteelTextKey
}

export const STEEL_TOUR_STEPS: SteelTourStep[] = [
  { id: 'table', target: 'steel-table', title: 'tourTableTitle', body: 'tourTableBody' },
  { id: 'row', target: 'steel-row', title: 'tourRowTitle', body: 'tourRowBody', interactive: true },
  { id: 'bar', target: 'steel-bar', title: 'tourBarTitle', body: 'tourBarBody' },
  { id: 'export', target: 'steel-xlsx', title: 'tourExportTitle', body: 'tourExportBody', interactive: true },
  { id: 'end', title: 'tourEndTitle', body: 'tourEndBody' },
]

/** The overlay's own English strings → steel text keys. */
export const STEEL_TOUR_UI: Record<string, SteelTextKey> = {
  Skip: 'tourSkip',
  Back: 'tourBack',
  Next: 'tourNext',
  Done: 'tourDone',
  '{{title}} · {{n}} of {{total}}': 'tourOf',
}
