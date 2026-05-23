/**
 * Isolated dynamic locale loader.
 *
 * This file contains ONLY the dynamic import template so Rollup's static
 * analyser never sees both a static import (config.ts bundles EN eagerly)
 * and a dynamic import of the same file in the same module — eliminating
 * the "dynamic import will not move module into another chunk" warning.
 *
 * Vite turns each `import(../locales/${lng}/${ns}.json)` call into a
 * separate async chunk per locale×namespace combination, downloaded only
 * when that language is first requested.
 */
export function loadLocaleNamespace(language: string, namespace: string): Promise<unknown> {
  return import(`../locales/${language}/${namespace}.json`)
}
