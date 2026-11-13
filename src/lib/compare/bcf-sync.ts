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

import { strToU8, zipSync } from 'fflate'
import type { BcfComment, BcfTopic, BcfViewpoint, CameraViewpoint } from '../../types'
import type { ElementDiff, SetDiff } from './types'
import type { ChangeKind, RevisionChange, RevisionDiff } from './revision-types'
import { buildBcfTextEntries } from '../bcf'
import { REVISION_KIND_COLOUR, bcfColour } from './kind-colours'
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

// ── Revision compare: one BCF 3.0 topic per change (spec 10 V2.3) ────────────
// Title = the site sentence; the viewpoint selects and colours the element by
// GlobalId (B side; A side for a removed one) and carries the capture's camera
// and PNG snapshot, so the designer opens exactly what the site saw.

export interface RevisionBcfText {
  author: string
  /** The site sentence of a change, used as the topic title. */
  sentence: (c: RevisionChange) => string
  /** Topic description; default lists element, class, storey, files and A/B fields. */
  description?: (c: RevisionChange) => string
  /** TopicType per kind; default 'Issue'. */
  topicType?: (c: RevisionChange) => string
}

/** Colour of each kind in the viewpoint (RRGGBB, as BCF wants it). */
export const CHANGE_KIND_BCF_COLOR = Object.fromEntries(
  Object.keys(REVISION_KIND_COLOUR).map((k) => [k, bcfColour(k as ChangeKind)]),
) as Record<ChangeKind, string>

/** Label stamped on revision-change topics, plus the kind as its own label. */
export const REVISION_CHANGE_LABEL = 'revision-change'

/** GlobalIds a change points at in the version where it can be seen. */
export function changeComponentGuids(c: RevisionChange): string[] {
  const ids = c.kind === 'removed' ? c.match.baseGlobalIds : c.match.headGlobalIds
  return ids.length ? [...ids] : [c.globalId]
}

function defaultDescription(c: RevisionChange): string {
  const lines = [`${c.name || c.ifcClass} — ${c.ifcClass}${c.storey ? ` — ${c.storey}` : ''}`, `GlobalId: ${c.globalId}`]
  if (c.baseFile || c.headFile) lines.push(`A: ${c.baseFile ?? '—'}  B: ${c.headFile ?? '—'}`)
  for (const ch of c.changes.slice(0, 20)) {
    const f = (v: unknown) => (v == null ? '—' : Array.isArray(v) ? v.join(', ') : String(v))
    lines.push(`• ${ch.key || ch.category}: ${f(ch.before)} → ${f(ch.after)}`)
  }
  return lines.join('\n')
}

// Used when a change has no capture: an isometric look at the scene origin.
// The viewpoint stays valid (BCF 3.0 requires a camera) and the selection is
// what a viewer frames on opening.
const FALLBACK_CAMERA = {
  cameraPosition: { x: 20, y: 20, z: 20 },
  cameraDirection: { x: -0.5773503, y: -0.5773503, z: -0.5773503 },
  cameraUp: { x: -0.4082483, y: 0.8164966, z: -0.4082483 },
  fieldOfView: 60, aspectRatio: 1.5,
}

export interface RevisionChangeCapture {
  snapshot?: string
  camera?: CameraViewpoint | null
}

/** One topic per change (unchanged ones skipped). Pure apart from uuids. */
export function buildRevisionChangeTopics(
  diff: RevisionDiff,
  text: RevisionBcfText,
  captures: Readonly<Record<string, RevisionChangeCapture | undefined>> = {},
  now: Date = new Date(),
): BcfTopic[] {
  const label = `version:${diff.headLabel}`
  return diff.changes.filter((c) => c.kind !== 'unchanged').map((c) => {
    const cap = captures[c.globalId]
    const cam = cap?.camera
    const vp: BcfViewpoint = {
      guid: crypto.randomUUID(),
      componentGuids: changeComponentGuids(c),
      ...(cam
        ? { cameraPosition: cam.position, cameraDirection: cam.direction, cameraUp: cam.up ?? { x: 0, y: 1, z: 0 }, fieldOfView: cam.fovDeg, aspectRatio: cam.aspect }
        : FALLBACK_CAMERA),
      ...(cap?.snapshot?.startsWith('data:image/png') ? { snapshotBase64: cap.snapshot } : {}),
    }
    return {
      guid: crypto.randomUUID(),
      title: text.sentence(c),
      description: (text.description ?? defaultDescription)(c),
      status: 'Open',
      topicType: text.topicType?.(c) ?? 'Issue',
      priority: c.review === 'affects_site' ? 'High' : 'Normal',
      creationDate: now.toISOString(),
      creationAuthor: text.author,
      labels: [REVISION_CHANGE_LABEL, c.kind, label],
      viewpoints: [vp],
      comments: [],
      source: 'generated',
    } satisfies BcfTopic
  })
}

/**
 * Add `<Coloring>` to a viewpoint file written by bcf.ts (which only writes
 * the selection). Schema order inside <Components>: Selection, Visibility, Coloring.
 */
export function addViewpointColoring(bcfv: string, color: string, guids: readonly string[]): string {
  if (!guids.length || !bcfv.includes('</Components>')) return bcfv
  const comps = guids.map((g) => `<Component IfcGuid="${g}" />`).join('\n          ')
  const block = `  <Coloring>
      <Color Color="${color}">
        <Components>
          ${comps}
        </Components>
      </Color>
    </Coloring>
  </Components>`
  return bcfv.replace('</Components>', block)
}

/**
 * The .bcfzip (BCF 3.0) of a revision diff: one topic per change with its
 * selection, kind colour, camera and PNG snapshot. Built in memory — nothing
 * leaves the browser.
 */
export function revisionChangesToBcfZip(
  diff: RevisionDiff,
  text: RevisionBcfText,
  captures: Readonly<Record<string, RevisionChangeCapture | undefined>> = {},
  now: Date = new Date(),
): { bytes: Uint8Array; topics: BcfTopic[] } {
  const topics = buildRevisionChangeTopics(diff, text, captures, now)
  const kindOf = new Map(topics.map((t) => [t.guid, t.labels![1] as ChangeKind]))
  const entries: Record<string, Uint8Array> = {}
  for (const [path, xml] of Object.entries(buildBcfTextEntries(topics, '3.0'))) {
    let out = xml
    const m = /^([^/]+)\/viewpoint_(\d+)\.bcfv$/.exec(path)
    if (m) {
      const t = topics.find((x) => x.guid === m[1])!
      const vp = t.viewpoints[Number(m[2])]
      out = addViewpointColoring(xml, CHANGE_KIND_BCF_COLOR[kindOf.get(t.guid) ?? 'unchanged'], vp.componentGuids ?? [])
    }
    entries[path] = strToU8(out)
  }
  for (const t of topics) {
    t.viewpoints.forEach((vp, i) => {
      const b64 = vp.snapshotBase64?.split(',')[1]
      if (b64) entries[`${t.guid}/snapshot_${i}.png`] = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    })
  }
  return { bytes: zipSync(entries, { level: 6 }), topics }
}
