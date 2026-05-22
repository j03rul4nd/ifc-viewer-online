/**
 * Locale registry — the ONE place to add a new language.
 *
 * To add a new locale:
 *   1. Add an entry below.
 *   2. Create src/locales/{code}/ and populate the 11 namespace JSON files
 *      (copy from src/locales/en/ as a starting point).
 *   That's it — config, types, UI and hooks all derive from this array.
 *
 * Fields
 * ──────
 * code        BCP-47 language tag (must match the folder name in src/locales/).
 * label       English name shown as accessible tooltip / aria-label.
 * labelNative Native-script name shown inside the dropdown.
 * short       2–3 char button label (fits in the compact trigger chip).
 * dir         Text direction — 'ltr' | 'rtl'.  Defaults to 'ltr'.
 * flag        Optional emoji flag shown next to the label.
 */

export type LocaleDefinition = {
  code:        string
  label:       string
  labelNative: string
  short:       string
  dir?:        'ltr' | 'rtl'
  flag?:       string
}

export const LOCALE_REGISTRY: LocaleDefinition[] = [
  { code: 'en', label: 'English',    labelNative: 'English',             short: 'EN',  dir: 'ltr', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish',    labelNative: 'Español',             short: 'ES',  dir: 'ltr', flag: '🇪🇸' },
  // ── Add more locales below ──────────────────────────────────────────────────
  // { code: 'fr', label: 'French',     labelNative: 'Français',            short: 'FR',  dir: 'ltr', flag: '🇫🇷' },
  // { code: 'de', label: 'German',     labelNative: 'Deutsch',             short: 'DE',  dir: 'ltr', flag: '🇩🇪' },
  // { code: 'pt', label: 'Portuguese', labelNative: 'Português',           short: 'PT',  dir: 'ltr', flag: '🇵🇹' },
  // { code: 'it', label: 'Italian',    labelNative: 'Italiano',            short: 'IT',  dir: 'ltr', flag: '🇮🇹' },
  // { code: 'nl', label: 'Dutch',      labelNative: 'Nederlands',          short: 'NL',  dir: 'ltr', flag: '🇳🇱' },
  // { code: 'pl', label: 'Polish',     labelNative: 'Polski',              short: 'PL',  dir: 'ltr', flag: '🇵🇱' },
  // { code: 'zh', label: 'Chinese',    labelNative: '中文',                short: 'ZH',  dir: 'ltr', flag: '🇨🇳' },
  // { code: 'ja', label: 'Japanese',   labelNative: '日本語',              short: 'JA',  dir: 'ltr', flag: '🇯🇵' },
  // { code: 'ko', label: 'Korean',     labelNative: '한국어',              short: 'KO',  dir: 'ltr', flag: '🇰🇷' },
  // { code: 'ar', label: 'Arabic',     labelNative: 'العربية',             short: 'AR',  dir: 'rtl', flag: '🇸🇦' },
  // { code: 'ru', label: 'Russian',    labelNative: 'Русский',             short: 'RU',  dir: 'ltr', flag: '🇷🇺' },
  // { code: 'tr', label: 'Turkish',    labelNative: 'Türkçe',              short: 'TR',  dir: 'ltr', flag: '🇹🇷' },
  // ───────────────────────────────────────────────────────────────────────────
]

// ── Derived constants (consumed by config.ts, components, hooks) ──────────────

/** Array of supported BCP-47 codes, inferred from the registry. */
export const SUPPORTED_LOCALES = LOCALE_REGISTRY.map((l) => l.code)

/** Union type of supported locale codes. */
export type SupportedLocale = (typeof LOCALE_REGISTRY)[number]['code']

/** Default locale — always the first entry in the registry. */
export const DEFAULT_LOCALE: SupportedLocale = LOCALE_REGISTRY[0].code

/** Map code → full locale definition for O(1) lookups. */
export const LOCALE_MAP = new Map<string, LocaleDefinition>(
  LOCALE_REGISTRY.map((l) => [l.code, l]),
)

/** Human-readable label for each locale (English name). */
export const LOCALE_LABELS: Record<string, string> = Object.fromEntries(
  LOCALE_REGISTRY.map((l) => [l.code, l.labelNative]),
)

/** Short code (2–3 chars) for each locale. */
export const LOCALE_SHORT: Record<string, string> = Object.fromEntries(
  LOCALE_REGISTRY.map((l) => [l.code, l.short]),
)
