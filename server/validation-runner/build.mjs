// Bundles the validation runner for Node: one ESM file plus web-ifc's Node
// WASM next to it. `npm run build:runner` → dist-runner/.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(root, 'dist-runner')
mkdirSync(out, { recursive: true })

await build({
  entryPoints: [resolve(root, 'server/validation-runner/runner.ts')],
  outfile: resolve(out, 'runner.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // jsdom stays external (native-ish deps); everything else is inlined.
  external: ['jsdom'],
  alias: { 'web-ifc': resolve(root, 'node_modules/web-ifc/web-ifc-api-node.js') },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"server"',
    // The workers call SetWasmPath(BASE_URL). Empty = relative to the bundle,
    // where web-ifc's Node build looks next to __dirname (set in the banner).
    'import.meta.env.BASE_URL': '""',
  },
  banner: { js: [
    "import { createRequire as __cr } from 'node:module';",
    "import { fileURLToPath as __fu } from 'node:url';",
    "import { dirname as __dn } from 'node:path';",
    "const require = __cr(import.meta.url);",
    "const __filename = __fu(import.meta.url);",
    "const __dirname = __dn(__filename) + '/';",
  ].join(' ') },
  logLevel: 'warning',
})

copyFileSync(resolve(root, 'node_modules/web-ifc/web-ifc-node.wasm'), resolve(out, 'web-ifc-node.wasm'))
console.log('dist-runner/runner.mjs ready')
