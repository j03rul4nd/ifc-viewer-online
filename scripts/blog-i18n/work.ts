// ─── Translation work directory ──────────────────────────────────────────────
// <workDir>/src/<slug>.<n>.json     English parts (written by extract.ts)
// <workDir>/<lang>/<slug>.<n>.json  the same parts, translated
//
// Shared by check.ts (a translator verifies their own parts) and apply.ts
// (turns a finished language into src/lib/blog-i18n/<lang>.ts).

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serpWidth } from '../../src/lib/serp-width'
import { checkSegments, type SegmentProblem, type Segments } from './segments'

export interface ManifestEntry { slug: string; parts: number; chars: number }

export function readManifest(workDir: string): ManifestEntry[] {
  return JSON.parse(readFileSync(path.join(workDir, 'src', 'manifest.json'), 'utf8'))
}

/** All parts of a post merged, or null when any part is missing. */
export function readSegments(workDir: string, dir: string, slug: string, parts: number): Segments | null {
  const out: Segments = {}
  for (let n = 0; n < parts; n++) {
    const file = path.join(workDir, dir, `${slug}.${n}.json`)
    if (!existsSync(file)) return null
    Object.assign(out, JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')))
  }
  return out
}

// What a search result shows, in Latin-character widths (see serp-width.ts):
// the same budgets scripts/seo/serp-budget.test.ts holds every post to.
export const TITLE_BUDGET = 60
export const DESC_MIN = 80
export const DESC_MAX = 160

export function listingProblems(segs: Segments): SegmentProblem[] {
  const problems: SegmentProblem[] = []
  const title = segs.seoTitle ?? segs.title
  const desc = segs.seoDescription ?? segs.excerpt
  if (title && serpWidth(title) > TITLE_BUDGET) problems.push({ key: 'seoTitle', problem: `too wide for a search result: ${serpWidth(title)} > ${TITLE_BUDGET}` })
  if (segs.seoTitle && segs.title && serpWidth(segs.seoTitle) > serpWidth(segs.title)) problems.push({ key: 'seoTitle', problem: 'wider than the article title — shorten it, or make it equal to the title' })
  if (desc && serpWidth(desc) > DESC_MAX) problems.push({ key: 'seoDescription', problem: `too wide for a search result: ${serpWidth(desc)} > ${DESC_MAX}` })
  if (desc && serpWidth(desc) < DESC_MIN) problems.push({ key: 'seoDescription', problem: `too short to say anything: ${serpWidth(desc)} < ${DESC_MIN}` })
  return problems
}

export function postProblems(workDir: string, lang: string, entry: ManifestEntry): SegmentProblem[] | null {
  const src = readSegments(workDir, 'src', entry.slug, entry.parts)
  const out = readSegments(workDir, lang, entry.slug, entry.parts)
  if (!src) throw new Error(`no source parts for ${entry.slug}`)
  if (!out) return null
  return [...checkSegments(src, out, lang), ...listingProblems(out)]
}
