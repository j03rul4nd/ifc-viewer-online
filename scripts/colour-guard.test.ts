// ─── colour guard ─────────────────────────────────────────────────────────────
// Ratchet for the light-mode migration: no file may gain hardcoded colours, and
// no new file may start with any. Counts per file live in
// scripts/colour-guard.baseline.json. See docs/theming.md, "Colour guard".
//
// Lives in scripts/ (not src/) because a test importing node:fs from under src/
// fails `tsc -b`.

import { describe, it, expect } from 'vitest'
// @ts-expect-error plain .mjs helper, no types
import { scanAll, readBaseline, scanText } from './colour-guard.mjs'

type Hit = { line: number; text: string; src: string }

describe('colour guard', () => {
  const scan = scanAll() as Record<string, Hit[]>
  const baseline = readBaseline() as Record<string, number>

  it('detects the patterns it claims to', () => {
    // Without this, a broken regex turns the ratchet into a pass.
    const sample = [
      'a #fff b #1a2b3c c #1a2b3c80',
      'rgba(0,0,0,.1) hsl(1 2% 3%)',
      'bg-gray-900 text-slate-400 border-zinc-700',
      'bg-white/10 text-white border-black/20',
      'bg-[#123456] bg-[rgba(1,2,3,.4)]',
      `#abc // theme-allow-color: brand`,
    ].join('\n')
    expect(scanText(sample, false).length).toBe(15)
  })

  it('adds no hardcoded colours', () => {
    const problems: string[] = []
    for (const [file, hits] of Object.entries(scan)) {
      const allowed = baseline[file] ?? 0
      if (hits.length > allowed) {
        problems.push(`${file}: ${hits.length} colours (baseline ${allowed})`)
        for (const h of hits) problems.push(`  ${file}:${h.line}  ${h.text}  | ${h.src}`)
      }
    }
    const message = [
      'New hardcoded colours. Use a token from src/index.css (docs/theming.md).',
      'If the colour has business meaning, add `// theme-allow-color: <reason>` on that line or the one above.',
      '(All matches in each file are listed; the new ones are among them.)',
      ...problems,
    ].join('\n')
    expect(problems, message).toEqual([])
  })

  it('hints when the baseline can be lowered', () => {
    const lower: string[] = []
    for (const [file, n] of Object.entries(baseline)) {
      const now = scan[file]?.length ?? 0
      if (now < n) lower.push(`${file}: ${n} -> ${now}`)
    }
    const message = ['Colours went down, nice. Lock it in: npm run theme:colour-baseline', ...lower].join('\n')
    expect(lower, message).toEqual([])
  })
})
