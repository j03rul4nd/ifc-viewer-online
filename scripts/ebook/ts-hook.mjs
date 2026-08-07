// ─── TypeScript resolve hook for the ebook build ──────────────────────────────
//
// build-ebook.mjs imports the SHIPPING validator sources directly
// (src/types/index.ts, src/lib/validator.ts, src/i18n/rule-remediation.ts) so
// the book's rule reference is generated from the same table the product runs —
// it cannot drift. Those files import each other without file extensions
// ('../i18n/rule-remediation'), which Node's ESM resolver rejects, and they are
// TypeScript, which Node only strips types from behind a flag.
//
// So the ebook script runs as:
//   node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs …
// (see the "ebook" npm script). This module registers a resolver that appends
// '.ts' to extensionless relative specifiers when the file exists.

import { register } from 'node:module'

// Stand-in for Vite's `import.meta.env`, which app modules read for dev-only
// branches. The resolver's load() hook rewrites every reference to this global.
globalThis.__VITE_ENV__ = { DEV: false, PROD: true, MODE: 'production' }

register(new URL('./ts-resolver.mjs', import.meta.url))
