// @vitest-environment node
// Parity for the paid workspace namespace. Keys are the English text (natural
// keys, see components/workspace/i18n.tsx), so this checks three things:
//   1. en/workspace.json matches what the code asks for (re-extracted here);
//   2. every locale translates every key, and nothing extra;
//   3. each translation keeps the same {{params}} and <0>…</0> tags.
// A string added to the workspace without translations fails here.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import en from './en/workspace.json'
import es from './es/workspace.json'
import ca from './ca/workspace.json'
import fr from './fr/workspace.json'
import de from './de/workspace.json'
import it_ from './it/workspace.json'
import pt from './pt/workspace.json'
import ja from './ja/workspace.json'
import zh from './zh/workspace.json'
import th from './th/workspace.json'

const LOCALES: Record<string, Record<string, string>> = { es, ca, fr, de, it: it_, pt, ja, zh, th }
const EN = en as Record<string, string>
const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
const tags = (s: string) => [...s.matchAll(/<\/?(\d+)>/g)].map((m) => m[0]).sort()

describe('workspace locale parity', () => {
  it('the English catalogue is up to date with the code', () => {
    const script = resolve(__dirname, '../../scripts/i18n/extract-workspace.cjs')
    expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow()
  })

  for (const [lng, data] of Object.entries(LOCALES)) {
    it(`${lng} translates every key, and nothing extra`, () => {
      expect(Object.keys(data).sort()).toEqual(Object.keys(EN).sort())
    })
    it(`${lng} keeps every param and tag`, () => {
      const bad = Object.keys(EN).filter((k) => data[k] !== undefined && (params(data[k]).join() !== params(EN[k]).join() || tags(data[k]).join() !== tags(EN[k]).join()))
      expect(bad).toEqual([])
    })
  }
})
