import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Shopify's `t` filter already HTML-escapes output (keys not ending in `_html`),
// so piping it through `| escape` again renders literal entities like &quot;.
const DIRS = [
  'integrations/shopify/blocks',
  'integrations/shopify/snippets',
  'integrations/shopify/app/extensions/ifc-viewer/blocks',
  'integrations/shopify/app/extensions/ifc-viewer/snippets',
]

describe('shopify liquid: no double escaping of translations', () => {
  it('never pipes `| t` output through `| escape`', () => {
    const offenders: string[] = []
    for (const dir of DIRS) {
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.liquid'))) {
        readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
          if (/\|\s*t\b[^|}]*\|\s*escape\b/.test(line)) offenders.push(`${dir}/${f}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
