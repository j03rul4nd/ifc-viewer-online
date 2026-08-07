// Resolver half of ts-hook.mjs — runs on the module loader thread.
//
//  · resolve() — extensionless relative import → './x.ts' or './x/index.ts'.
//  · load()    — rewrites `import.meta.env` (a Vite construct that does not
//                exist in Node) to a global stub, so app modules can be
//                imported outside the bundler. See ts-hook.mjs for the stub.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    // './foo' → './foo.ts', then the directory form './foo/index.ts'.
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = new URL(specifier + suffix, context.parentURL)
      if (existsSync(fileURLToPath(candidate))) return next(specifier + suffix, context)
    }
  }
  return next(specifier, context)
}

export async function load(url, context, next) {
  const result = await next(url, context)
  if (url.endsWith('.ts') && result.source) {
    const source = result.source.toString().replaceAll('import.meta.env', 'globalThis.__VITE_ENV__')
    return { ...result, source }
  }
  return result
}
