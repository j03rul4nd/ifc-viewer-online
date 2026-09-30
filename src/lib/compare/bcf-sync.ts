// ─── compare/bcf-sync.ts ──────────────────────────────────────────────────────
// Keep the issue list honest after a new delivery. Two directions:
//
//   • update — every open BCF topic that points at elements (viewpoint
//     componentGuids) gets a comment saying what happened to them in the new
//     version: removed, modified (and how), or untouched. When every element a
//     topic points at is gone, or every IDS failure it was raised for is
//     resolved, the topic is proposed for closing — proposed, never closed
//     silently: the coordinator decides.
//   • create — new topics for what the new version introduced: IDS failures
//     that appeared, and groups of changes worth a review (per class/storey).
//
// Pure: returns patches and topics; the caller applies them to bcfStore.

import type { BcfComment, BcfTopic } from '../../types'
import type { ElementDiff, SetDiff } from './types'
import type { IdsVersionDiff } from './ids-versions'

export interface BcfSyncText {
  /** e.g. (n, label) => `${n} element(s) removed in ${label}` */
  removed: (names: string, label: string) => string
  modified: (names: string, what: string, label: string) => string
  unchanged: (label: string) => string
  idsResolved: (spec: string, label: string) => string
  proposeClose: string
  changeGroupTitle: (status: 'added' | 'removed' | 'modified', count: number, ifcClass: string, storey: string) => string
  idsTopicTitle: (spec: string, count: number) => string
  author: string
}

export interface TopicPatch {
  topicGuid: string
  comment: BcfComment
  /** Suggested new status ('Resolved') — the UI shows it; applying it is a choice. */
  proposedStatus?: string
}

function topicGuids(t: BcfTopic): string[] {
  return [...new Set(t.viewpoints.flatMap((v) => v.componentGuids ?? []))]
}

const CLOSED = /^(closed|resolved|done|cerrad|resuelt)/i

/** Label stamped on every topic a comparison creates, so later passes can tell them apart. */
export function versionLabel(diff: SetDiff): string {
  return `version:${diff.headLabel}`
}

function describe(d: ElementDiff): string {
  return `${d.name || d.ifcClass} (${d.globalId})`
}

export function planTopicUpdates(
  topics: readonly BcfTopic[], diff: SetDiff, text: BcfSyncText,
  ids?: IdsVersionDiff | null, now: Date = new Date(),
): TopicPatch[] {
  const byGid = new Map(diff.elements.map((e) => [e.globalId, e]))
  const resolvedBySpecGid = new Map<string, string>() // gid → spec
  for (const r of ids?.resolved ?? []) resolvedBySpecGid.set(r.globalId, r.spec)
  const patches: TopicPatch[] = []

  const ownLabel = versionLabel(diff)
  for (const t of topics) {
    if (t.status && CLOSED.test(t.status)) continue
    // Raised from this very comparison: its comment would only repeat its description.
    if (t.labels?.includes(ownLabel)) continue
    const gids = topicGuids(t)
    if (gids.length === 0) continue
    const removed: ElementDiff[] = [], modified: ElementDiff[] = []
    const resolvedSpecs = new Set<string>()
    for (const g of gids) {
      const d = byGid.get(g)
      if (d?.status === 'removed') removed.push(d)
      else if (d?.status === 'modified') modified.push(d)
      const spec = resolvedBySpecGid.get(g)
      if (spec) resolvedSpecs.add(spec)
    }
    const lines: string[] = []
    if (removed.length) lines.push(text.removed(removed.map(describe).join(', '), diff.headLabel))
    if (modified.length) {
      for (const m of modified) {
        const what = [...new Set(m.changes.map((c) => (c.key ? `${c.category}: ${c.key}` : c.category)))].slice(0, 6).join('; ')
        lines.push(text.modified(describe(m), what, diff.headLabel))
      }
    }
    for (const spec of resolvedSpecs) lines.push(text.idsResolved(spec, diff.headLabel))
    if (lines.length === 0) {
      // Say so: "nothing changed on the elements of this issue" is itself
      // news for a topic someone was waiting on.
      lines.push(text.unchanged(diff.headLabel))
    }

    const allGone = removed.length === gids.length
    const allResolved = gids.every((g) => resolvedBySpecGid.has(g))
    const propose = allGone || (resolvedSpecs.size > 0 && allResolved)
    if (propose) lines.push(text.proposeClose)

    patches.push({
      topicGuid: t.guid,
      comment: {
        guid: crypto.randomUUID(), date: now.toISOString(), author: text.author,
        text: lines.join('\n'), local: true,
      },
      proposedStatus: propose ? 'Resolved' : undefined,
    })
  }
  return patches
}

function topic(title: string, description: string, gids: string[], topicType: string, author: string, labels: string[], now: Date): BcfTopic {
  return {
    guid: crypto.randomUUID(),
    title, description, status: 'Open', topicType, priority: topicType === 'Error' ? 'High' : 'Normal',
    creationDate: now.toISOString(), creationAuthor: author, labels,
    // Component-only viewpoint: opening it selects the elements; no camera is
    // stored because none was chosen — the viewer frames the selection.
    viewpoints: gids.length ? [{ guid: crypto.randomUUID(), componentGuids: gids.slice(0, 500) }] : [],
    comments: [], source: 'generated',
  }
}

export interface NewTopicOptions {
  /** Raise topics for introduced IDS failures (one per spec). Default true. */
  idsIntroduced?: boolean
  /** Raise change-review topics per class × storey × status. Default: removed only. */
  changeStatuses?: Array<'added' | 'removed' | 'modified'>
  /** Skip change groups smaller than this. Default 1. */
  minGroup?: number
}

export function buildNewTopics(
  diff: SetDiff, text: BcfSyncText, ids?: IdsVersionDiff | null,
  opts: NewTopicOptions = {}, now: Date = new Date(),
): BcfTopic[] {
  const out: BcfTopic[] = []
  const label = versionLabel(diff)

  if (ids && opts.idsIntroduced !== false) {
    const bySpec = new Map<string, typeof ids.introduced>()
    for (const f of ids.introduced) {
      const list = bySpec.get(f.spec) ?? []
      list.push(f); bySpec.set(f.spec, list)
    }
    for (const [spec, list] of bySpec) {
      const desc = list.slice(0, 50).map((f) => `• ${f.name || f.ifcClass} (${f.globalId}) — ${f.reasons.join('; ')}`).join('\n')
      out.push(topic(text.idsTopicTitle(spec, list.length), desc, list.map((f) => f.globalId), 'Error', text.author, ['IDS', label], now))
    }
  }

  const statuses = new Set(opts.changeStatuses ?? ['removed'])
  const minGroup = opts.minGroup ?? 1
  const groups = new Map<string, ElementDiff[]>()
  for (const e of diff.elements) {
    if (e.status === 'unchanged' || !statuses.has(e.status)) continue
    const k = `${e.status}\u0000${e.ifcClass}\u0000${e.storey ?? '—'}`
    const list = groups.get(k) ?? []
    list.push(e); groups.set(k, list)
  }
  for (const [k, list] of groups) {
    if (list.length < minGroup) continue
    const [status, cls, storey] = k.split('\u0000') as ['added' | 'removed' | 'modified', string, string]
    const desc = list.slice(0, 50).map((e) => {
      const what = e.changes.map((c) => (c.key ? `${c.category}:${c.key}` : c.category)).slice(0, 4).join(', ')
      return `• ${describe(e)}${what ? ` — ${what}` : ''}`
    }).join('\n')
    // Removed elements are not in the new model: the viewpoint still lists
    // them so the topic keeps the record, and opening it in the OLD version works.
    out.push(topic(text.changeGroupTitle(status, list.length, cls, storey), desc, list.map((e) => e.globalId),
      status === 'removed' ? 'Warning' : 'Info', text.author, ['change-review', label], now))
  }
  return out
}
