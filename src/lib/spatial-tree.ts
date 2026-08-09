// ─── spatial-tree ─────────────────────────────────────────────────────────────
// The logic behind ModelTree: flattening the spatial hierarchies of every loaded
// model into one virtualisable list, and indexing issues onto it.
//
// WHY IT IS NOT IN THE COMPONENT. All of it turns out to hinge on one thing that
// is easy to get wrong and impossible to see in a screenshot: **an expressId is
// only unique within its own file**. Every IFC numbers its entities from #1, so
// in the federated Poblenou set #348 is a column in the structural model, a
// glazed panel in the architectural one and a duct segment in the services one.
//
// While the tree kept its expansion state in a `Set<number>` of expressIds, that
// meant opening a storey in one model opened whatever happened to share its
// number in the others — chevrons flipping on rows nobody clicked, a node
// refusing to collapse because a sibling tree was holding its id open. Same for
// selection highlight, for "which row is being renamed", and for which rows
// offered a Fix GUID action.
//
// Every function here is therefore keyed on `scopedElementKey(modelId, id)`, and
// spatial-tree.test.ts runs the whole thing over two models with DELIBERATELY
// COLLIDING ids. That fixture is the point of the file: a single-model test
// passes just as happily with the bug in place.
//
// Pure — no React, no stores. The component decides what to do; this decides
// what is true.

import { scopedElementKey } from './visibility'
import type { SpatialNode, SpatialElement, ValidationIssue } from '../types'

export { scopedElementKey }

/** One model's spatial hierarchy, as the validation store holds it. */
export interface ModelTreeSource {
  modelId: string
  tree: SpatialNode[]
}

// ── The flat list the virtualiser renders ─────────────────────────────────────

export type FlatNode =
  | {
      kind: 'model-header'
      modelId: string
      fileName: string
      nodeCount: number
      isCollapsed: boolean
    }
  | {
      kind: 'spatial'
      depth: number
      node: SpatialNode
      key: string
      isExpanded: boolean
      hasChildren: boolean
      modelId: string
    }
  | {
      kind: 'element'
      depth: number
      element: SpatialElement
      key: string
      parentExpressId: number
      modelId: string
    }

export interface FlattenOptions {
  /** Scoped keys of the spatial nodes that are open. */
  expanded: ReadonlySet<string>
  /** Model ids whose whole subtree is folded away behind its header. */
  collapsedModels: ReadonlySet<string>
  /** Header rows only earn their space when there is more than one model. */
  showHeaders: boolean
  /** Display name per model id; falls back to a cleaned-up model id. */
  fileNameOf: (modelId: string) => string
}

function hasChildrenOf(node: SpatialNode): boolean {
  return node.children.length > 0 || node.containedElements.length > 0
}

function flattenNodes(
  nodes: SpatialNode[],
  modelId: string,
  expanded: ReadonlySet<string>,
  depth: number,
  out: FlatNode[],
): void {
  for (const node of nodes) {
    const key = scopedElementKey(modelId, node.expressId)
    const isExpanded = expanded.has(key)
    out.push({ kind: 'spatial', depth, node, key, isExpanded, hasChildren: hasChildrenOf(node), modelId })
    if (!isExpanded) continue
    flattenNodes(node.children, modelId, expanded, depth + 1, out)
    for (const element of node.containedElements) {
      out.push({
        kind: 'element',
        depth: depth + 1,
        element,
        key: scopedElementKey(modelId, element.expressId),
        parentExpressId: node.expressId,
        modelId,
      })
    }
  }
}

export function flattenTrees(trees: readonly ModelTreeSource[], opts: FlattenOptions): FlatNode[] {
  const out: FlatNode[] = []
  for (const { modelId, tree } of trees) {
    if (tree.length === 0) continue
    if (opts.showHeaders) {
      out.push({
        kind: 'model-header',
        modelId,
        fileName: opts.fileNameOf(modelId),
        nodeCount: tree.length,
        isCollapsed: opts.collapsedModels.has(modelId),
      })
    }
    if (!opts.collapsedModels.has(modelId)) {
      flattenNodes(tree, modelId, opts.expanded, 0, out)
    }
  }
  return out
}

// ── Search ────────────────────────────────────────────────────────────────────

function nodeMatches(node: SpatialNode, q: string): boolean {
  return (
    node.name.toLowerCase().includes(q) ||
    node.ifcClass.toLowerCase().includes(q) ||
    (node.longName?.toLowerCase().includes(q) ?? false) ||
    (node.globalId?.toLowerCase().includes(q) ?? false) ||
    String(node.expressId).includes(q)
  )
}

function elementMatches(element: SpatialElement, q: string): boolean {
  return (
    element.name.toLowerCase().includes(q) ||
    element.ifcClass.toLowerCase().includes(q) ||
    (element.globalId?.toLowerCase().includes(q) ?? false) ||
    String(element.expressId).includes(q)
  )
}

/** Keep a node when it or any descendant matches; matched paths stay open. */
function filterNodes(
  nodes: SpatialNode[],
  modelId: string,
  q: string,
  depth: number,
  out: FlatNode[],
): boolean {
  let kept = false
  for (const node of nodes) {
    const selfMatch = nodeMatches(node, q)
    const matchedElements = node.containedElements.filter((e) => elementMatches(e, q))
    const childBuffer: FlatNode[] = []
    const childKept = filterNodes(node.children, modelId, q, depth + 1, childBuffer)

    if (!selfMatch && matchedElements.length === 0 && !childKept) continue
    kept = true
    out.push({
      kind: 'spatial',
      depth,
      node,
      key: scopedElementKey(modelId, node.expressId),
      isExpanded: true,
      hasChildren: hasChildrenOf(node),
      modelId,
    })
    // A node that matches shows all of its elements; one that only contains a
    // match shows just the matches, so the hit is not buried in its siblings.
    for (const element of selfMatch ? node.containedElements : matchedElements) {
      out.push({
        kind: 'element',
        depth: depth + 1,
        element,
        key: scopedElementKey(modelId, element.expressId),
        parentExpressId: node.expressId,
        modelId,
      })
    }
    out.push(...childBuffer)
  }
  return kept
}

export function flattenTreesFiltered(
  trees: readonly ModelTreeSource[],
  query: string,
  opts: Pick<FlattenOptions, 'showHeaders' | 'fileNameOf'>,
): FlatNode[] {
  const q = query.trim().toLowerCase()
  const out: FlatNode[] = []
  for (const { modelId, tree } of trees) {
    if (tree.length === 0) continue
    const buffer: FlatNode[] = []
    if (!filterNodes(tree, modelId, q, 0, buffer)) continue
    if (opts.showHeaders) {
      out.push({
        kind: 'model-header',
        modelId,
        fileName: opts.fileNameOf(modelId),
        nodeCount: tree.length,
        isCollapsed: false,
      })
    }
    out.push(...buffer)
  }
  return out
}

// ── Expansion state ───────────────────────────────────────────────────────────

/** Every spatial node in every tree, as scoped keys. */
export function collectSpatialKeys(trees: readonly ModelTreeSource[]): Set<string> {
  const keys = new Set<string>()
  const walk = (nodes: SpatialNode[], modelId: string): void => {
    for (const node of nodes) {
      keys.add(scopedElementKey(modelId, node.expressId))
      walk(node.children, modelId)
    }
  }
  for (const { modelId, tree } of trees) walk(tree, modelId)
  return keys
}

/**
 * What should be open when a tree first arrives: the top two levels of every
 * model, plus whatever the user had already opened and still exists.
 *
 * Pruning against `collectSpatialKeys` is what stops a removed model's
 * expansion state from resurrecting when a later model happens to reuse its
 * ids — which, since ids start at #1 in every file, it always does.
 */
export function nextExpansion(
  trees: readonly ModelTreeSource[],
  previous: ReadonlySet<string>,
): Set<string> {
  const valid = collectSpatialKeys(trees)
  const next = new Set<string>()
  for (const key of previous) if (valid.has(key)) next.add(key)
  for (const { modelId, tree } of trees) {
    for (const root of tree) {
      next.add(scopedElementKey(modelId, root.expressId))
      for (const child of root.children) next.add(scopedElementKey(modelId, child.expressId))
    }
  }
  return next
}

/**
 * The model that owns `expressId`, and the scoped keys of every node on the way
 * down to it — what "reveal in tree" needs to open.
 *
 * `preferModelId` matters: with federated models the same number exists in all
 * of them, so a caller that knows which model it means (a validation issue does)
 * must be able to say so. Without it this returns the first match, which is a
 * guess, and is flagged as one by `exact: false`.
 */
export function locateElement(
  trees: readonly ModelTreeSource[],
  expressId: number,
  preferModelId?: string,
): { modelId: string; ancestorKeys: string[]; exact: boolean } | null {
  const search = (source: ModelTreeSource): string[] | null => {
    const walk = (nodes: SpatialNode[]): string[] | null => {
      for (const node of nodes) {
        const key = scopedElementKey(source.modelId, node.expressId)
        if (node.expressId === expressId) return [key]
        if (node.containedElements.some((e) => e.expressId === expressId)) return [key]
        const deeper = walk(node.children)
        if (deeper) return [key, ...deeper]
      }
      return null
    }
    return walk(source.tree)
  }

  if (preferModelId) {
    const preferred = trees.find((t) => t.modelId === preferModelId)
    const keys = preferred ? search(preferred) : null
    if (keys) return { modelId: preferModelId, ancestorKeys: keys, exact: true }
  }
  // No model named, or the named one does not have it: take the first match and
  // say so. With a single model loaded there is nothing to be wrong about, so
  // that one still counts as exact.
  for (const source of trees) {
    const keys = search(source)
    if (keys) return { modelId: source.modelId, ancestorKeys: keys, exact: trees.length === 1 }
  }
  return null
}

/**
 * Where "reveal in tree" should actually go.
 *
 * THE CASE THIS EXISTS FOR: the tree lists what each storey CONTAINS
 * (IfcRelContainedInSpatialStructure). Anything that is a PART of something
 * else — the 102 glazed panels of a curtain wall, the flight inside a stair —
 * is aggregated into its host and appears nowhere in the tree. Clicking
 * "reveal in tree" on one of those used to do nothing at all: no scroll, no
 * message, no indication that the button had been pressed.
 *
 * So when the element itself is not listed, walk up its decomposition until
 * something is, and reveal that instead — the curtain wall for a panel, the
 * stair for a flight. That is what the user wanted anyway, and saying which
 * one you landed on is the difference between an answer and a shrug.
 *
 * `hostOf` returns the element that a part belongs to (IfcRelAggregates),
 * or undefined at the top. Passed in rather than imported so this stays free
 * of store shapes.
 */
export interface RevealTarget {
  modelId: string
  /** What to scroll to: the element asked for, or the nearest listed host. */
  expressId: number
  ancestorKeys: string[]
  /** True when the element asked for is not in the tree and a host stood in. */
  viaHost: boolean
  /** False when the model was guessed rather than given. */
  exact: boolean
}

/** How far up a decomposition chain to look before giving up. */
const MAX_HOST_HOPS = 8

export function resolveRevealTarget(
  trees: readonly ModelTreeSource[],
  expressId: number,
  preferModelId: string | undefined,
  hostOf: (modelId: string, expressId: number) => number | undefined,
): RevealTarget | null {
  const direct = locateElement(trees, expressId, preferModelId)
  if (direct) {
    return { modelId: direct.modelId, expressId, ancestorKeys: direct.ancestorKeys, viaHost: false, exact: direct.exact }
  }

  // Not listed anywhere. Try to climb, in each candidate model — the chain is
  // per model, so a part of model A must not be resolved through model B's
  // aggregation just because the ids collide.
  const candidates = preferModelId
    ? [preferModelId, ...trees.map((t) => t.modelId).filter((id) => id !== preferModelId)]
    : trees.map((t) => t.modelId)

  for (const modelId of candidates) {
    const seen = new Set<number>([expressId])
    let current = hostOf(modelId, expressId)
    for (let hop = 0; current !== undefined && hop < MAX_HOST_HOPS; hop++) {
      if (seen.has(current)) break            // circular aggregation, seen in the wild
      seen.add(current)
      const found = locateElement(trees, current, modelId)
      if (found && found.modelId === modelId) {
        return { modelId, expressId: current, ancestorKeys: found.ancestorKeys, viaHost: true, exact: found.exact }
      }
      current = hostOf(modelId, current)
    }
  }
  return null
}

/** Invert a host → parts map into the parts → host lookup `resolveRevealTarget` wants. */
export function invertDecomposition(decomp: Map<number, number[]> | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!decomp) return out
  for (const [host, parts] of decomp) {
    for (const part of parts) if (!out.has(part)) out.set(part, host)
  }
  return out
}

// ── Issue index ───────────────────────────────────────────────────────────────

export interface IssueCounts { errors: number; warnings: number; info: number }

export interface ModelIssueIndex {
  /** Issues landing directly on an expressId, within this model. */
  direct: Map<number, IssueCounts>
  /** Issues on a node plus everything under it, within this model. */
  rollup: Map<number, IssueCounts>
  /** expressIds in this model with a GUID issue — drives the Fix GUID action. */
  guidIssues: Set<number>
}

const EMPTY_INDEX: ModelIssueIndex = { direct: new Map(), rollup: new Map(), guidIssues: new Set() }
/** A stable empty index, so a row without issues does not get a new object each render. */
export const emptyIssueIndex = (): ModelIssueIndex => EMPTY_INDEX

const GUID_RULES = new Set(['RULE_INVALID_GUID_FORMAT', 'RULE_DUPLICATE_GUID'])

function rollupSubtree(
  node: SpatialNode,
  direct: Map<number, IssueCounts>,
  rollup: Map<number, IssueCounts>,
): IssueCounts {
  let errors = 0, warnings = 0, info = 0
  const own = direct.get(node.expressId)
  if (own) { errors += own.errors; warnings += own.warnings; info += own.info }
  for (const element of node.containedElements) {
    const d = direct.get(element.expressId)
    if (d) { errors += d.errors; warnings += d.warnings; info += d.info }
  }
  for (const child of node.children) {
    const c = rollupSubtree(child, direct, rollup)
    errors += c.errors; warnings += c.warnings; info += c.info
  }
  const total = { errors, warnings, info }
  rollup.set(node.expressId, total)
  return total
}

/**
 * Index every issue onto the model it belongs to, once, for all models.
 *
 * Built in one pass rather than per row: the previous code asked "does this
 * element have a GUID issue?" by scanning the whole issue array inside every
 * visible row, on every partial validation batch — O(rows x issues) many times a
 * second while a large model streams.
 *
 * Unstamped issues (no modelId) are attributed to the only model when there is
 * one, and to none when there are several. Spreading them across every model
 * would count each of them three times in a federated scene, which shows up as
 * a badge that disagrees with the panel.
 */
export function buildIssueIndex(
  issues: readonly ValidationIssue[],
  trees: readonly ModelTreeSource[],
): Map<string, ModelIssueIndex> {
  const byModel = new Map<string, ModelIssueIndex>()
  for (const { modelId } of trees) {
    byModel.set(modelId, { direct: new Map(), rollup: new Map(), guidIssues: new Set() })
  }
  const soleModel = trees.length === 1 ? trees[0].modelId : null

  for (const issue of issues) {
    const modelId = issue.modelId ?? soleModel
    if (!modelId) continue
    const index = byModel.get(modelId)
    if (!index) continue

    const counts = index.direct.get(issue.expressId) ?? { errors: 0, warnings: 0, info: 0 }
    if (issue.severity === 'error') counts.errors++
    else if (issue.severity === 'warning') counts.warnings++
    else counts.info++
    index.direct.set(issue.expressId, counts)

    if (GUID_RULES.has(issue.ruleId)) index.guidIssues.add(issue.expressId)
  }

  for (const { modelId, tree } of trees) {
    const index = byModel.get(modelId)
    if (!index) continue
    for (const root of tree) rollupSubtree(root, index.direct, index.rollup)
  }
  return byModel
}

// ── Misc ──────────────────────────────────────────────────────────────────────

/** Strips the loader's `-${Date.now()}` suffix to recover the file name. */
export function fileNameFromModelId(modelId: string): string {
  return modelId.replace(/-\d{13,}$/, '') || modelId
}
