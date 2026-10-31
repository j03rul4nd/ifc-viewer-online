// @vitest-environment node
// The layering other work relies on. Failing here means a dependency points the
// wrong way, which is what makes a component impossible to change safely.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['../../lib/sketch/*.ts', '../../hooks/sketch/*.ts', '../../stores/sketchStore.ts', '!**/*.test.ts'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const outside = import.meta.glob(['../../components/**/*.tsx', '!../../components/sketch/**', '../../App.tsx'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const imports = (code: string): string[] => [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1])

describe('sketch layers', () => {
  it('lib/sketch has no React, no store, no hook', () => {
    for (const [path, code] of Object.entries(sources)) {
      if (!path.includes('lib/sketch/')) continue
      for (const dep of imports(code)) {
        expect(`${path} -> ${dep}`).not.toMatch(/-> (react|.*stores\/|.*hooks\/|.*components\/)/)
      }
    }
  })

  it('hooks and the store never reach for components', () => {
    for (const [path, code] of Object.entries(sources)) {
      for (const dep of imports(code)) expect(`${path} -> ${dep}`).not.toMatch(/-> .*components\//)
    }
  })

  it('the rest of the app enters through the public surface or the route', () => {
    for (const [path, code] of Object.entries(outside)) {
      for (const dep of imports(code)) {
        if (dep.includes('lib/sketch/')) expect(`${path} -> ${dep}`).toBe('uses lib/sketch through its index')
      }
    }
  })
})
