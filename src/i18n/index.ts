// Re-export the configured i18n instance
export { default } from './config';
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './config';
export type { SupportedLocale } from './config';

// Re-export types (side-effect import for declaration merging)
import './types';
