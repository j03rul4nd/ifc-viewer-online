/**
 * Typed per-namespace hooks.
 *
 * Prefer these over `useTranslation('namespace')` because:
 *  - Eliminates string-literal namespace typos at the call site.
 *  - Provides full key autocomplete scoped to the namespace.
 *  - Single place to add namespace-level extras (e.g. caching, context).
 *
 * Usage:
 *   const { t } = useToolbarT()
 *   t('validate')  // ✅ autocomplete, compile-time safe
 */
import { useTranslation } from 'react-i18next'

export const useCommonT      = () => useTranslation('common')
export const useToolbarT     = () => useTranslation('toolbar')
export const useValidationT  = () => useTranslation('validation')
export const useViewerT      = () => useTranslation('viewer')
export const useSidebarT     = () => useTranslation('sidebar')
export const useLandingT     = () => useTranslation('landing')
export const useMeasurementT = () => useTranslation('measurement')
export const useEditorT      = () => useTranslation('editor')
export const useErrorsT      = () => useTranslation('errors')
export const useToastsT      = () => useTranslation('toasts')
export const useTreeT        = () => useTranslation('tree')
export const useBlogT        = () => useTranslation('blog')
