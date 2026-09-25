// ─── Post caption ──────────────────────────────────────────────────────────────
// The text that goes with the image when it's posted: what the project is,
// where, by whom, the numbers that make people stop, and hashtags a feed can
// find it by. Written from the same fields as the cover, so the post and the
// picture never disagree — and nothing is made up (no AI, D-22).
//
// Each platform reads differently: Pinterest indexes a short description (500
// characters) and a handful of tags; LinkedIn penalises tag walls (three to
// five); Instagram wants the tags, a dozen is normal.

import type { CoverFact } from './types'

export type CaptionPlatform = 'pinterest' | 'instagram' | 'linkedin'

export interface CaptionInput {
  title: string
  subtitle: string
  location: string
  studio: string
  client: string
  concept: string
  tagline: string
  website: string
  facts: CoverFact[]
}

export interface CaptionStrings {
  /** "By {{studio}}" style, already interpolated by the caller if needed. */
  by: (studio: string) => string
  /** "For {{client}}". */
  for: (client: string) => string
}

const BASE: Record<CaptionPlatform, string[]> = {
  pinterest: ['architecture', 'architecturedesign', 'archviz', 'bim'],
  instagram: ['architecture', 'architecturedesign', 'archviz', 'architecturalvisualization', 'bim', 'ifc', 'openbim', 'archilovers'],
  linkedin: ['architecture', 'bim', 'openbim', 'aec'],
}

const MAX_TAGS: Record<CaptionPlatform, number> = { pinterest: 6, instagram: 14, linkedin: 5 }

/** "Sant Martí, Barcelona" → "santmarti", "barcelona": ASCII, no spaces, ≤ 24 chars. */
export function toTag(s: string): string {
  return s
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
}

export function hashtags(input: CaptionInput, platform: CaptionPlatform): string[] {
  const place = input.location.split(/[,/·|–-]/).map((p) => toTag(p)).filter((t) => t.length >= 3).slice(0, 2)
  const studio = toTag(input.studio)
  const tags = [...BASE[platform], ...place, ...(studio.length >= 3 && studio.length <= 20 ? [studio] : [])]
  return [...new Set(tags)].slice(0, MAX_TAGS[platform]).map((t) => `#${t}`)
}

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export function buildCaption(input: CaptionInput, platform: CaptionPlatform, s: CaptionStrings): string {
  const title = input.title.trim()
  const head = [title, input.location.trim()].filter(Boolean).join(' — ')
  const lines: string[] = []
  if (head) lines.push(head)
  if (input.subtitle.trim()) lines.push(input.subtitle.trim())
  const body = input.concept.trim() || input.tagline.trim()
  const credits = [input.studio.trim() && s.by(input.studio.trim()), input.client.trim() && s.for(input.client.trim())].filter(Boolean).join(' · ')
  const tags = hashtags(input, platform).join(' ')

  if (platform === 'pinterest') {
    // One paragraph: Pinterest shows the first ~50 characters and indexes the rest.
    const facts = input.facts.slice(0, 3).map((f) => `${f.label}: ${f.value}`).join(' · ')
    const para = [lines.join('. '), body && clip(body, 260), facts, credits].filter(Boolean).join('. ')
    return clip(`${para}${tags ? `\n\n${tags}` : ''}`, 500)
  }

  if (body) lines.push('', body)
  const facts = input.facts.slice(0, platform === 'linkedin' ? 6 : 5)
  if (facts.length) lines.push('', ...facts.map((f) => `▪ ${f.label}: ${f.value}`))
  if (credits || input.website.trim()) lines.push('', ...[credits, input.website.trim()].filter(Boolean))
  if (tags) lines.push('', tags)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
