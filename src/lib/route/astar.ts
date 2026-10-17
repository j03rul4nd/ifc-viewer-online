// ─── astar ────────────────────────────────────────────────────────────────────
// Shortest path on a weighted graph, with an admissible heuristic. Shared by
// the street network (lib/route/osm-network) and the indoor grid
// (lib/route/indoor). Pure; a binary heap keeps it O(E log V) on a city.

export interface Graph {
  /** Neighbours of node `n` and the cost (seconds) of going there. */
  neighbours(n: number, visit: (to: number, cost: number) => void): void
  /** A lower bound of the cost from `n` to `goal` (0 = Dijkstra). */
  heuristic(n: number, goal: number): number
}

export interface PathResult { nodes: number[]; cost: number }

class Heap {
  private k: number[] = []
  private p: number[] = []
  get size(): number { return this.k.length }
  push(key: number, prio: number): void {
    const k = this.k, p = this.p
    let i = k.length
    k.push(key); p.push(prio)
    while (i > 0) {
      const up = (i - 1) >> 1
      if (p[up] <= prio) break
      k[i] = k[up]; p[i] = p[up]; i = up
    }
    k[i] = key; p[i] = prio
  }
  pop(): number {
    const k = this.k, p = this.p
    const top = k[0]
    const lk = k.pop()!, lp = p.pop()!
    if (k.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        if (l >= k.length) break
        const c = r < k.length && p[r] < p[l] ? r : l
        if (p[c] >= lp) break
        k[i] = k[c]; p[i] = p[c]; i = c
      }
      k[i] = lk; p[i] = lp
    }
    return top
  }
}

/** Cheapest path from any of `starts` (with their initial cost) to `goal`, or null. */
export function astar(g: Graph, starts: ReadonlyArray<{ node: number; cost: number }>, goal: number, maxExpanded = 2_000_000): PathResult | null {
  const best = new Map<number, number>()
  const prev = new Map<number, number>()
  const heap = new Heap()
  for (const s of starts) {
    if ((best.get(s.node) ?? Infinity) <= s.cost) continue
    best.set(s.node, s.cost)
    heap.push(s.node, s.cost + g.heuristic(s.node, goal))
  }
  const closed = new Set<number>()
  let expanded = 0
  while (heap.size) {
    const n = heap.pop()
    if (closed.has(n)) continue
    if (n === goal) {
      const nodes = [n]
      for (let c = n; prev.has(c);) { c = prev.get(c)!; nodes.push(c) }
      return { nodes: nodes.reverse(), cost: best.get(n)! }
    }
    closed.add(n)
    if (++expanded > maxExpanded) return null
    const base = best.get(n)!
    g.neighbours(n, (to, cost) => {
      if (closed.has(to)) return
      const c = base + cost
      if (c < (best.get(to) ?? Infinity)) {
        best.set(to, c)
        prev.set(to, n)
        heap.push(to, c + g.heuristic(to, goal))
      }
    })
  }
  return null
}
