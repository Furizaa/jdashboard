import type { GanttNode } from '~/kernel'

// A chart is stored **flat with `parentId`** and presented as a tree (ADR-0012
// §3). This module is the one place that conversion happens: the store never
// sees a tree, and nothing above this file sees a `parentId`.
//
// Placement is therefore *this module's* concern, by design — which is why
// `gantt-schema.ts` validates that an **edge** names a real node and
// deliberately does not validate that a `parentId` does. A dangling `parentId`
// is a case that genuinely reaches us, and so is a parent cycle. Both have the
// same answer: **nothing is ever dropped.** A node whose parent is missing is
// re-rooted, a parent cycle is cut at its first repeat, and every node in the
// chart appears exactly once in the tree. A chart is a system of record
// (ADR-0012 §1); a loader that silently loses a lane because an agent
// transposed a slug is not one.
//
// Pure functions over kernel types. No I/O, no time, no framework.

export type GanttTreeNode = {
  readonly node: GanttNode
  readonly children: readonly GanttTreeNode[]
}

export type GanttTree = {
  /** Depth-0 lanes, in sibling order. */
  readonly roots: readonly GanttTreeNode[]
  /** Every node in the chart, by id — the lookup the rest of the context works through. */
  readonly byId: ReadonlyMap<string, GanttTreeNode>
  /**
   * The parent each node *ended up with*, which is not always the one it
   * declared. Arrow re-anchoring walks this (view-model/gantt-layout), so it has
   * to be the effective link rather than the stored one.
   */
  readonly parentOf: ReadonlyMap<string, string | null>
  /**
   * Nodes whose `parentId` named a node that is not in the chart. Re-rooted
   * rather than dropped, and **named** rather than silently re-rooted: the
   * layout counts these into "needs attention" so a typo'd slug is something the
   * header reports instead of something the tree quietly absorbs.
   */
  readonly reRooted: ReadonlySet<string>
  /** Nodes whose own parent link was cut to break a `parentId` cycle. */
  readonly cycleBroken: ReadonlySet<string>
}

/** Stable sibling order: the declared `order`, then the id to break a tie. */
function bySiblingOrder(a: GanttNode, b: GanttNode): number {
  return a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order
}

/**
 * The flat `parentId` list as a tree.
 *
 * Two repairs happen here, both of them additive:
 *
 * - **A missing parent re-roots.** The node keeps its children, its body and its
 *   dates; it just appears at depth 0.
 * - **A parent cycle is cut at the first repeat.** Walking up from each node
 *   with a `seen` set, the first node reached twice loses its *own* parent link
 *   — so `a → b → c → a` becomes the subtree `a > c > b` rather than an infinite
 *   descent. Cuts accumulate as we go, which is what makes two overlapping
 *   cycles terminate as cheaply as one.
 */
export function buildTree(nodes: readonly GanttNode[]): GanttTree {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))

  const reRooted = new Set<string>()
  for (const node of nodes) {
    if (node.parentId !== null && !nodeById.has(node.parentId)) reRooted.add(node.id)
  }

  const cycleBroken = new Set<string>()
  const declaredParent = (id: string): string | null => {
    if (cycleBroken.has(id) || reRooted.has(id)) return null
    return nodeById.get(id)?.parentId ?? null
  }
  for (const node of nodes) {
    const seen = new Set<string>([node.id])
    let current = declaredParent(node.id)
    while (current !== null) {
      if (seen.has(current)) {
        cycleBroken.add(current)
        break
      }
      seen.add(current)
      current = declaredParent(current)
    }
  }

  const parentOf = new Map<string, string | null>(
    nodes.map((node) => [node.id, declaredParent(node.id)] as const),
  )

  const childrenOf = new Map<string, GanttNode[]>()
  const rootNodes: GanttNode[] = []
  for (const node of nodes) {
    const parentId = parentOf.get(node.id) ?? null
    if (parentId === null) {
      rootNodes.push(node)
      continue
    }
    const siblings = childrenOf.get(parentId)
    if (siblings === undefined) childrenOf.set(parentId, [node])
    else siblings.push(node)
  }

  const byId = new Map<string, GanttTreeNode>()
  // Recursion terminates because the cuts above leave a forest: every node has
  // one effective parent or none, and no chain returns to where it started.
  const build = (node: GanttNode): GanttTreeNode => {
    const children = (childrenOf.get(node.id) ?? []).toSorted(bySiblingOrder).map(build)
    const treeNode: GanttTreeNode = { node, children }
    byId.set(node.id, treeNode)
    return treeNode
  }

  const roots = rootNodes.toSorted(bySiblingOrder).map(build)
  return { roots, byId, parentOf, reRooted, cycleBroken }
}

export type GanttVisibleRow = {
  readonly node: GanttNode
  /** 0 for a root lane. */
  readonly depth: number
  readonly hasChildren: boolean
  readonly collapsed: boolean
}

/**
 * The tree flattened to the rows a reader can see, in reading order.
 *
 * A collapsed node is still a row — it is the row carrying the affordance to
 * expand — and its descendants are not. That is the set arrows re-anchor
 * *onto* (ADR-0012 §10), which is why this is computed over the whole tree and
 * never over a window: windowing decides what is drawn, collapse decides what
 * exists.
 */
export function visibleRows(
  tree: GanttTree,
  collapsed: ReadonlySet<string>,
): readonly GanttVisibleRow[] {
  const rows: GanttVisibleRow[] = []
  const walk = (treeNode: GanttTreeNode, depth: number): void => {
    const isCollapsed = collapsed.has(treeNode.node.id)
    rows.push({
      node: treeNode.node,
      depth,
      hasChildren: treeNode.children.length > 0,
      collapsed: isCollapsed,
    })
    if (isCollapsed) return
    for (const child of treeNode.children) walk(child, depth + 1)
  }
  for (const root of tree.roots) walk(root, 0)
  return rows
}
