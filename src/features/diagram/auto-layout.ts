import dagre from 'dagre'
import type { Edge, Node } from 'reactflow'
import type { AwsNodeData } from './diagram-types'

const AWS_NODE_W = 200
const AWS_NODE_H = 88
/** Inner margin around laid-out children inside `vpcGroup` (all sides). */
const PADDING = 150
const MIN_VPC_W = 420
const MIN_VPC_H = 280

/** Left pane: external root nodes (non-VPC), deterministic grid from (0,0). */
const EXTERNAL_GRID_COLS = 2
const EXTERNAL_GAP_X = 250
const EXTERNAL_ROW_STEP_Y = 150

/** Horizontal gap between the right edge of the external grid and the VPC column. */
const VPC_GAP_AFTER_GRID = 400

const VPC_PANE_Y_START = 0
const VPC_STACK_GAP = 80

/**
 * Pass 1: Dagre LR inside each `vpcGroup` (unchanged spacing/padding).
 * Pass 2: No Dagre — left grid for all external roots, fixed right column for VPC(s).
 */
export function getLayoutedElements(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
): { nodes: Node<AwsNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges }
  }

  const roots = nodes.filter((n) => !n.parentNode)
  const childrenByParent = new Map<string, Node<AwsNodeData>[]>()
  for (const n of nodes) {
    if (n.parentNode) {
      const list = childrenByParent.get(n.parentNode) ?? []
      list.push(n)
      childrenByParent.set(n.parentNode, list)
    }
  }

  type ChildLayout = {
    positions: Map<string, { x: number; y: number }>
    width: number
    height: number
  }

  const layoutVpcChildren = (children: Node<AwsNodeData>[]): ChildLayout => {
    if (children.length === 0) {
      return {
        positions: new Map(),
        width: MIN_VPC_W,
        height: MIN_VPC_H,
      }
    }

    const childIds = new Set(children.map((c) => c.id))
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({
      rankdir: 'LR',
      nodesep: 120,
      ranksep: 200,
      marginx: 48,
      marginy: 48,
    })

    for (const c of children) {
      g.setNode(c.id, { width: AWS_NODE_W, height: AWS_NODE_H })
    }

    for (const e of edges) {
      if (childIds.has(e.source) && childIds.has(e.target)) {
        g.setEdge(e.source, e.target)
      }
    }

    dagre.layout(g)

    const positions = new Map<string, { x: number; y: number }>()
    const inset = PADDING / 2
    let maxRight = inset
    let maxBottom = inset

    for (const c of children) {
      const dg = g.node(c.id)
      if (!dg) continue
      const x = dg.x - AWS_NODE_W / 2 + inset
      const y = dg.y - AWS_NODE_H / 2 + inset
      positions.set(c.id, { x, y })
      maxRight = Math.max(maxRight, x + AWS_NODE_W)
      maxBottom = Math.max(maxBottom, y + AWS_NODE_H)
    }

    const width = Math.max(MIN_VPC_W, maxRight + inset)
    const height = Math.max(MIN_VPC_H, maxBottom + inset)

    return { positions, width, height }
  }

  const vpcLayouts = new Map<string, ChildLayout>()
  for (const root of roots) {
    if (root.type !== 'vpcGroup') continue
    const kids = (childrenByParent.get(root.id) ?? [])
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
    vpcLayouts.set(root.id, layoutVpcChildren(kids))
  }

  const vpcRoots = roots
    .filter((r) => r.type === 'vpcGroup')
    .sort((a, b) => a.id.localeCompare(b.id))
  const externalRoots = roots
    .filter((r) => r.type !== 'vpcGroup')
    .sort((a, b) => a.id.localeCompare(b.id))

  const rootPositions = new Map<string, { x: number; y: number }>()

  const cellStepX = AWS_NODE_W + EXTERNAL_GAP_X

  let maxGridRight = 0
  externalRoots.forEach((r, i) => {
    const col = i % EXTERNAL_GRID_COLS
    const row = Math.floor(i / EXTERNAL_GRID_COLS)
    const x = col * cellStepX
    const y = row * EXTERNAL_ROW_STEP_Y
    rootPositions.set(r.id, { x, y })
    maxGridRight = Math.max(maxGridRight, x + AWS_NODE_W)
  })

  const vpcPaneX = maxGridRight + VPC_GAP_AFTER_GRID

  let vpcY = VPC_PANE_Y_START
  for (const vpc of vpcRoots) {
    const layout = vpcLayouts.get(vpc.id)
    const h = layout?.height ?? MIN_VPC_H
    rootPositions.set(vpc.id, { x: vpcPaneX, y: vpcY })
    vpcY += h + VPC_STACK_GAP
  }

  for (const r of roots) {
    if (!rootPositions.has(r.id)) {
      rootPositions.set(r.id, { x: 0, y: 0 })
    }
  }

  const nextById = new Map<string, Node<AwsNodeData>>()

  for (const root of roots) {
    const layout = root.type === 'vpcGroup' ? vpcLayouts.get(root.id) : undefined
    const pos = rootPositions.get(root.id) ?? { x: 0, y: 0 }

    if (root.type === 'vpcGroup' && layout) {
      nextById.set(root.id, {
        ...root,
        position: pos,
        style: { ...root.style, width: layout.width, height: layout.height },
      })
      for (const c of childrenByParent.get(root.id) ?? []) {
        const p = layout.positions.get(c.id)
        if (p) {
          nextById.set(c.id, { ...c, position: p })
        }
      }
    } else {
      nextById.set(root.id, { ...root, position: pos })
    }
  }

  const result: Node<AwsNodeData>[] = []
  for (const n of nodes) {
    const updated = nextById.get(n.id)
    result.push(updated ?? n)
  }

  return { nodes: result, edges }
}
