// ─── Guided tour of revision compare ─────────────────────────────────────────
// About two minutes, in site words: what a site engineer needs from two issues
// of the same drawings. Same TourStep format as the workspace tours; `title` and
// `body` are keys of the `compare` namespace (rc.tour.<id>.*), translated where
// the tour is shown. Steps whose anchor is not on screen (phone layout, a
// collapsed panel) are skipped by the overlay. Never starts on its own: the
// link `?tour=revision` or the Help button starts it.
import type { TourStep } from './tours'

export const REVISION_TOUR_ID = 'revision'

export type RevisionTourStepId =
  | 'local' | 'list' | 'moved' | 'table' | 'review' | 'filters' | 'views' | 'export' | 'end'

export interface RevisionTourStep extends TourStep {
  id: RevisionTourStepId
}

/** `data-tour` anchors live in RevisionWorkspace / RevisionExports. */
const ANCHOR: Record<RevisionTourStepId, string> = {
  local: 'rc-local',
  list: 'rc-list',
  moved: 'rc-card',
  table: 'rc-table',
  review: 'rc-review',
  filters: 'rc-filters',
  views: 'rc-views',
  export: 'rc-exports',
  end: 'rc-help',
}

export const REVISION_TOUR_STEPS: RevisionTourStep[] = (Object.keys(ANCHOR) as RevisionTourStepId[]).map((id) => ({
  id,
  target: ANCHOR[id],
  title: `rc.tour.${id}.title`,
  body: `rc.tour.${id}.body`,
}))

/** The overlay's own English strings → compare keys. */
export const TOUR_UI_KEYS: Record<string, string> = {
  Skip: 'rc.tour.ui.skip',
  Back: 'rc.tour.ui.back',
  Next: 'rc.tour.ui.next',
  Done: 'rc.tour.ui.done',
  '{{title}} · {{n}} of {{total}}': 'rc.tour.ui.of',
}
