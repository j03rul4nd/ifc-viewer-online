// ─── Per-model name index for the batch rename ────────────────────────────────
// Everything the rename needs to know about one model's names, read from the
// spatial tree the validation run built: which storey each element sits on
// (for `{storey}`), its current Name, and every Name already in use (so a
// generated name can never collide).
//
// The storey comes from walking the tree, NOT from `issue.path`: the path holds
// names only, stops at the host for an aggregate part (`['#123']`), and puts the
// building — not the storey — second from the end for an element contained
// directly in a storey.

import type { SpatialElement, SpatialNode } from '../../types'
import { normName } from './name-pattern'

export interface ModelNameIndex {
  /** expressId → expressId of the storey it is on. Absent: not on a storey (or is one). */
  storeyOf: Map<number, number>
  /** expressId → current Name, raw. Pending renames applied; '' for the tree's fallbacks. */
  nameOf: Map<number, string>
  /** normName of every Name in the model, old and pending. */
  taken: Set<string>
}

const STOREY = /^ifcbuildingstorey$/i
/** What the worker shows for a node with no Name (validator.worker buildNode). */
const NODE_FALLBACK = '(unnamed)'

/** The tree's placeholder for an unnamed element is its own number. */
const elementName = (e: SpatialElement): string => (e.name === `#${e.expressId}` ? '' : e.name)
const nodeName = (n: SpatialNode): string => (n.name === NODE_FALLBACK ? '' : n.name)

export function buildModelNameIndex(
  tree: readonly SpatialNode[],
  pendingNames: ReadonlyMap<number, string>,
): ModelNameIndex {
  const storeyOf = new Map<number, number>()
  const nameOf   = new Map<number, string>()
  const taken    = new Set<string>()

  const record = (expressId: number, name: string, storey: number | undefined): void => {
    if (storey !== undefined) storeyOf.set(expressId, storey)
    nameOf.set(expressId, name)
    const key = normName(name)
    if (key) taken.add(key)
  }

  const visitElement = (e: SpatialElement, storey: number | undefined): void => {
    record(e.expressId, elementName(e), storey)
    for (const part of e.parts ?? []) record(part.expressId, elementName(part), storey)
  }

  // Iterative: a deep tree must not be able to blow the stack.
  const stack: Array<{ node: SpatialNode; storey: number | undefined }> =
    tree.map((node) => ({ node, storey: undefined }))
  while (stack.length > 0) {
    const { node, storey } = stack.pop()!
    // The storey node itself belongs to whatever is above it; its contents to it.
    record(node.expressId, nodeName(node), storey)
    const inner = STOREY.test(node.ifcClass) ? node.expressId : storey
    for (const e of node.containedElements) visitElement(e, inner)
    for (const child of node.children) stack.push({ node: child, storey: inner })
  }

  // Pending renames win for the current name; the old name stays taken
  // (conservative: undoing the rename must not create a duplicate).
  for (const [expressId, name] of pendingNames) {
    nameOf.set(expressId, name)
    const key = normName(name)
    if (key) taken.add(key)
  }

  return { storeyOf, nameOf, taken }
}
