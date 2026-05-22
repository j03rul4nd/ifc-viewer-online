/**
 * Canonical i18n entry point.
 *
 * Import from here instead of directly from 'react-i18next' so that:
 *  1. The TypeScript declaration merging in `./types` is always applied.
 *  2. The configured i18n instance is guaranteed to be initialised.
 *
 * Usage:
 *   import { useTranslation, Trans } from '@/i18n'
 *   import { useLocale }              from '@/i18n'
 *   import { useToolbarT, useViewerT } from '@/i18n'
 */

// Side-effect: registers CustomTypeOptions declaration merge
import './types'

// Re-export the configured instance
export { default as i18n } from './config'
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, LOCALE_SHORT, formatNumber, formatDate } from './config'
export type { SupportedLocale } from './config'

// Re-export react-i18next primitives so callers have one import
export { useTranslation, Trans, I18nextProvider } from 'react-i18next'

// Convenience hooks
export { useLocale } from './hooks/useLocale'
export * from './hooks/namespaces'
