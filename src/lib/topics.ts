// ─── topics ───────────────────────────────────────────────────────────────────
// Pure, kind-agnostic topic model. A topic is a many-to-many label (survey
// date, area, discipline) — unlike scene groups, which are single-membership
// containers pinned by the SDK SceneGroup contract. Members are keyed
// `${kind}:${stableKey}` so models, meshes, videos and layers can join later
// without a migration; this release writes only 'cloud:<fileKey>'.

export type ItemKind = 'cloud' | 'model' | 'mesh' | 'video' | 'layer'

export interface Topic {
  id: string
  name: string
  color: number
  source: 'user' | 'fileDate'
  /** 'YYYY-MM-DD' for a topic made from a file date. */
  date?: string
}

export interface TopicState {
  topics: Topic[]
  /** itemKey → topic ids, in the order they were added. */
  members: Record<string, string[]>
}

export const MAX_TOPICS = 24
export const MAX_TOPIC_NAME = 40
export const MAX_MEMBER_KEYS = 2000

/** None magenta: that is the Locate flash. */
export const TOPIC_PALETTE: readonly number[] = [
  0x2F80ED, 0xF2994A, 0x27AE60, 0xEB5757, 0x9B51E0, 0x00A3BF, 0xE2B93B, 0x8D6E63, 0x56CCF2, 0x6FCF97,
]

export function itemKey(kind: ItemKind, stableKey: string): string {
  return `${kind}:${stableKey}`
}

export function nextTopicColor(topics: ReadonlyArray<Topic>): number {
  const used = new Set(topics.map((t) => t.color))
  return TOPIC_PALETTE.find((c) => !used.has(c)) ?? TOPIC_PALETTE[topics.length % TOPIC_PALETTE.length]
}

let seq = 0
export function newTopicId(): string {
  seq += 1
  return `tp-${Date.now().toString(36)}-${seq}`
}

export const EMPTY_TOPICS: TopicState = { topics: [], members: {} }

/** Forgiving parse: anything that does not fit is dropped, never thrown. */
export function parseTopicState(raw: unknown): TopicState {
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return { topics: [], members: {} } }
  }
  if (!value || typeof value !== 'object') return { topics: [], members: {} }
  const o = value as { v?: unknown; topics?: unknown; members?: unknown }
  if (o.v !== 1 || !Array.isArray(o.topics)) return { topics: [], members: {} }
  const topics: Topic[] = []
  const ids = new Set<string>()
  for (const t of o.topics) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || ids.has(r.id)) continue
    if (typeof r.name !== 'string' || !r.name.trim()) continue
    ids.add(r.id)
    const topic: Topic = {
      id: r.id,
      name: r.name.trim().slice(0, MAX_TOPIC_NAME),
      color: typeof r.color === 'number' && Number.isInteger(r.color) ? Math.min(0xFFFFFF, Math.max(0, r.color)) : nextTopicColor(topics),
      source: r.source === 'fileDate' ? 'fileDate' : 'user',
    }
    if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) topic.date = r.date
    topics.push(topic)
    if (topics.length >= MAX_TOPICS) break
  }
  const members: Record<string, string[]> = {}
  if (o.members && typeof o.members === 'object') {
    for (const [key, list] of Object.entries(o.members as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const clean = [...new Set(list.filter((x): x is string => typeof x === 'string' && ids.has(x)))]
      if (clean.length) members[key] = clean
    }
  }
  return { topics, members }
}

/** The topics an item belongs to, in topic order. */
export function topicsOf(state: TopicState, key: string): Topic[] {
  const mine = state.members[key]
  if (!mine?.length) return []
  const set = new Set(mine)
  return state.topics.filter((t) => set.has(t.id))
}

export function primaryTopicColor(state: TopicState, key: string): number | null {
  return topicsOf(state, key)[0]?.color ?? null
}

export function memberKeys(state: TopicState, topicId: string): string[] {
  return Object.keys(state.members).filter((k) => state.members[k].includes(topicId))
}

export function membershipState(state: TopicState, keys: readonly string[], topicId: string): 'all' | 'some' | 'none' {
  if (keys.length === 0) return 'none'
  const n = keys.filter((k) => state.members[k]?.includes(topicId)).length
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some'
}

/**
 * One suggestion per file date, for items not already in a fileDate topic of
 * that date. Suggestions only — topics are never auto-created.
 */
export function fileDateSuggestions(
  items: ReadonlyArray<{ key: string; fileDate?: string | null }>, state: TopicState,
): { date: string; keys: string[] }[] {
  const byDate = new Map<string, string[]>()
  for (const item of items) {
    if (!item.fileDate) continue
    const covered = topicsOf(state, item.key).some((t) => t.source === 'fileDate' && t.date === item.fileDate)
    if (covered) continue
    const list = byDate.get(item.fileDate) ?? []
    if (!list.includes(item.key)) list.push(item.key)
    byDate.set(item.fileDate, list)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, keys]) => ({ date, keys }))
}
