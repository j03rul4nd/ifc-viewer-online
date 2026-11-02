// Bundles the server and the viewer code it reuses into one file. web-ifc and
// the MCP SDK stay as dependencies; import.meta.env is what Vite would define.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/** The workers point web-ifc at the app's served WASM; in Node the package finds its own. */
const webIfcShim = {
  name: 'web-ifc-node',
  setup(b) {
    b.onResolve({ filter: /^web-ifc$/ }, (a) => (a.namespace === 'shim' ? { path: 'web-ifc', external: true } : { path: 'web-ifc', namespace: 'shim' }))
    b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
      contents: "import * as m from 'web-ifc'; export * from 'web-ifc'; export class IfcAPI extends m.IfcAPI { SetWasmPath() {} }",
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@modelcontextprotocol/sdk', '@xmldom/xmldom', 'zod'],
  plugins: [webIfcShim],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }),
  },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
})
