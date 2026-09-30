// ─── compare/pairing.ts ───────────────────────────────────────────────────────
// Which file of this week's delivery is which file of last week's? Names drift
// ("ARQ_v03.ifc" → "ARQ_v04.ifc", "MEP 2026-09-21.ifc" → "MEP 2026-09-28.ifc"),
// so the name is only the last resort. In order of strength:
//   1. same IfcProject GlobalId AND a unique candidate
//   2. GlobalId overlap of the elements (Jaccard) — survives renames and splits
//   3. normalized file name (versions, dates and revision tags stripped)
// Greedy best-first matching; every pairing states its reason so the UI can
// show a wrong match instead of hiding it.

import type { FilePairing, ModelSnapshot } from './types'

type Pair = Omit<FilePairing, 'counts'>

/** "ARQ_Edificio-A_v03 (rev B) 2026-09-21.ifc" → "arq edificio a". */
export function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(ifc|ifczip|ifcxml)$/i, '')
    .replace(/\d{4}[-_.]?\d{2}[-_.]?\d{2}/g, ' ')          // dates
    .replace(/\((copy|copia|\d+)\)/g, ' ')
    // Separators to spaces BEFORE the version tags: "_v03" has no \b before
    // the v, underscore being a word character.
    .replace(/[_\-.()[\]]+/g, ' ')
    .replace(/\b(v|ver|version|rev|r|revision) ?[a-z]?\d+[a-z]?\b/g, ' ') // v03, rev2, R12
    .replace(/\b(rev|revision) [a-z]\b/g, ' ')          // rev B
    .replace(/\b\d+\b/g, ' ')                               // loose counters
    .replace(/\s+/g, ' ')
    .trim()
}

function guidSet(s: ModelSnapshot): Set<string> {
  const set = new Set<string>()
  for (const e of s.elements) if (e.globalId) set.add(e.globalId)
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const g of small) if (large.has(g)) inter++
  return inter / (a.size + b.size - inter)
}

export function pairSnapshots(base: readonly ModelSnapshot[], head: readonly ModelSnapshot[]): Pair[] {
  const bSets = base.map(guidSet), hSets = head.map(guidSet)
  const candidates: Array<{ bi: number; hi: number; score: number; overlap: number; reason: Pair['reason'] }> = []

  for (let bi = 0; bi < base.length; bi++) {
    for (let hi = 0; hi < head.length; hi++) {
      const overlap = jaccard(bSets[bi], hSets[hi])
      const sameProject = !!base[bi].projectGid && base[bi].projectGid === head[hi].projectGid
      const sameName = normalizeFileName(base[bi].fileName) === normalizeFileName(head[hi].fileName)
      // Overlap dominates; project and name only break ties or rescue empty files.
      let score = overlap * 10
      if (sameName) score += 1
      if (sameProject) score += 0.5
      if (score <= 0) continue
      const reason: Pair['reason'] = overlap >= 0.05 ? 'guid-overlap' : sameName ? 'file-name' : 'project'
      // A shared project GUID alone is weak when several files share it (a
      // federated project exports every discipline under one IfcProject).
      if (reason === 'project') {
        const sharing = head.filter((s) => s.projectGid === base[bi].projectGid).length
        if (sharing > 1) continue
      }
      candidates.push({ bi, hi, score, overlap, reason })
    }
  }

  candidates.sort((x, y) => y.score - x.score)
  const usedB = new Set<number>(), usedH = new Set<number>()
  const pairs: Pair[] = []
  for (const c of candidates) {
    if (usedB.has(c.bi) || usedH.has(c.hi)) continue
    usedB.add(c.bi); usedH.add(c.hi)
    pairs.push({ base: base[c.bi].fileName, head: head[c.hi].fileName, reason: c.reason, overlap: Math.round(c.overlap * 1000) / 1000 })
  }
  base.forEach((s, i) => { if (!usedB.has(i)) pairs.push({ base: s.fileName, head: null, reason: 'unmatched', overlap: 0 }) })
  head.forEach((s, i) => { if (!usedH.has(i)) pairs.push({ base: null, head: s.fileName, reason: 'unmatched', overlap: 0 }) })
  return pairs
}
