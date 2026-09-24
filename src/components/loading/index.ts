// ─── Loading UI — public surface ──────────────────────────────────────────────
// Four self-contained pieces, each mounted with one line by its host (the
// architecture is docs/MODEL_LOADING.md). All of them read only
// `useLoadingStore` and act only through `loadingController`; none takes props
// from its host beyond placement.

export { LoadingIndicator, type LoadingIndicatorVariant } from './LoadingIndicator'
export { LoadingCenter, type LoadingCenterAnchor } from './LoadingCenter'
export { FirstLoadCard } from './FirstLoadCard'
export { SceneLoadingSection } from './SceneLoadingSection'
