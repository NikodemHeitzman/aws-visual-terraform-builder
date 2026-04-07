import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from 'reactflow'
import {
  createDefaultResourceLabel,
  getDefaultNodeConfig,
  type AwsResourceType,
} from './aws-resources'
import type { AwsNodeData } from './diagram-types'
import { migrateSecurityGroupNodeData } from './security-group-rules'

/** Drop nodes whose parent no longer exists (e.g. VPC deleted) until stable; prune invalid edges. */
function syncGraphAfterStructuralChange(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
): { nodes: Node<AwsNodeData>[]; edges: Edge[] } {
  let nextNodes = nodes
  let changed = true
  while (changed) {
    changed = false
    const idSet = new Set(nextNodes.map((n) => n.id))
    const filtered = nextNodes.filter(
      (n) => !n.parentNode || idSet.has(n.parentNode),
    )
    if (filtered.length !== nextNodes.length) {
      changed = true
      nextNodes = filtered
    }
  }
  const idSet = new Set(nextNodes.map((n) => n.id))
  const nextEdges = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  )
  return { nodes: nextNodes, edges: nextEdges }
}

type DiagramState = {
  nodes: Node<AwsNodeData>[]
  edges: Edge[]
  history: Array<{ nodes: Node<AwsNodeData>[]; edges: Edge[]; selectedNodeId: string | null }>
  /** Incremented after JSON / Terraform import so the canvas can call fitView. */
  fitViewRequestId: number
  selectedNodeId: string | null
  hoveredNodeId: string | null
  hoveredEdgeId: string | null
  setHoveredNode: (id: string | null) => void
  setHoveredEdge: (id: string | null) => void
  undo: () => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  deleteEdge: (edgeId: string) => void
  setSelectedNodeId: (nodeId: string | null) => void
  addNode: (
    resourceType: AwsResourceType,
    position: XYPosition,
    options?: { parentNodeId?: string },
  ) => string
  deleteNode: (nodeId: string) => void
  resetCanvas: () => void
  updateNodeData: (nodeId: string, data: Partial<AwsNodeData>) => void
  exportDiagram: () => {
    nodes: Node<AwsNodeData>[]
    edges: Edge[]
  }
  importDiagram: (snapshot: { nodes: Node<AwsNodeData>[]; edges: Edge[] }) => void
  loadImportedDiagram: (nodes: Node<AwsNodeData>[], edges: Edge[]) => void
}

const initialNodes: Node<AwsNodeData>[] = []

const initialEdges: Edge[] = []

function cloneSnapshot(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
  selectedNodeId: string | null,
) {
  return {
    nodes: nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data } })),
    edges: edges.map((e) => ({ ...e })),
    selectedNodeId,
  }
}

function withHistory(state: DiagramState) {
  const next = cloneSnapshot(state.nodes, state.edges, state.selectedNodeId)
  const history = [...state.history, next]
  return history.length > 60 ? history.slice(history.length - 60) : history
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  history: [],
  fitViewRequestId: 0,
  selectedNodeId: null,
  hoveredNodeId: null,
  hoveredEdgeId: null,
  setHoveredNode: (id) => {
    set({ hoveredNodeId: id })
  },
  setHoveredEdge: (id) => {
    set({ hoveredEdgeId: id })
  },
  undo: () => {
    set((state) => {
      if (state.history.length === 0) return state
      const prev = state.history[state.history.length - 1]
      return {
        nodes: prev.nodes,
        edges: prev.edges,
        selectedNodeId: prev.selectedNodeId,
        hoveredNodeId: null,
        hoveredEdgeId: null,
        history: state.history.slice(0, -1),
      }
    })
  },
  onNodesChange: (changes) => {
    set((state) => {
      const history = withHistory(state)
      let nodes = applyNodeChanges(changes, state.nodes)
      const synced = syncGraphAfterStructuralChange(nodes, state.edges)
      nodes = synced.nodes
      const edges = synced.edges
      const selectedStillExists =
        state.selectedNodeId === null ||
        nodes.some((node) => node.id === state.selectedNodeId)
      return {
        nodes,
        edges,
        selectedNodeId: selectedStillExists ? state.selectedNodeId : null,
        hoveredNodeId:
          state.hoveredNodeId === null ||
          nodes.some((n) => n.id === state.hoveredNodeId)
            ? state.hoveredNodeId
            : null,
        hoveredEdgeId:
          state.hoveredEdgeId === null ||
          edges.some((e) => e.id === state.hoveredEdgeId)
            ? state.hoveredEdgeId
            : null,
        history,
      }
    })
  },
  onEdgesChange: (changes) => {
    set((state) => {
      const history = withHistory(state)
      const edges = applyEdgeChanges(changes, state.edges)
      return {
        edges,
        hoveredEdgeId:
          state.hoveredEdgeId === null ||
          edges.some((e) => e.id === state.hoveredEdgeId)
            ? state.hoveredEdgeId
            : null,
        history,
      }
    })
  },
  onConnect: (connection) => {
    set((state) => ({
      history: withHistory(state),
      edges: addEdge(
        { ...connection, type: 'default', animated: true },
        state.edges,
      ),
    }))
  },
  deleteEdge: (edgeId) => {
    set((state) => ({
      history: withHistory(state),
      edges: state.edges.filter((edge) => edge.id !== edgeId),
      hoveredEdgeId: state.hoveredEdgeId === edgeId ? null : state.hoveredEdgeId,
    }))
  },
  setSelectedNodeId: (nodeId) => {
    set({ selectedNodeId: nodeId })
  },
  addNode: (resourceType, position, options) => {
    let createdNodeId = ''
    set((state) => {
      const history = withHistory(state)
      const nextIndex =
        state.nodes.filter((node) => node.data.resourceType === resourceType).length + 1
      const nodeId = `${resourceType}-${nextIndex}-${Date.now()}`
      createdNodeId = nodeId

      const parentNodeId = options?.parentNodeId
      const parentNode = parentNodeId
        ? state.nodes.find((node) => node.id === parentNodeId)
        : undefined
      const relativePosition =
        parentNode && resourceType !== 'vpc'
          ? {
              x: position.x - parentNode.position.x,
              y: position.y - parentNode.position.y,
            }
          : position

      return {
        nodes: [
          ...state.nodes,
          {
            id: nodeId,
            type: resourceType === 'vpc' ? 'vpcGroup' : 'awsNode',
            position: relativePosition,
            parentNode: parentNode && resourceType !== 'vpc' ? parentNode.id : undefined,
            extent: parentNode && resourceType !== 'vpc' ? 'parent' : undefined,
            style: resourceType === 'vpc' ? { width: 560, height: 320 } : undefined,
            data: {
              resourceType,
              label: `${createDefaultResourceLabel(resourceType)}-${nextIndex}`,
              ...getDefaultNodeConfig(resourceType),
            },
          },
        ],
        selectedNodeId: nodeId,
        history,
      }
    })
    return createdNodeId
  },
  deleteNode: (nodeId) => {
    set((state) => {
      const history = withHistory(state)
      const nodesAfterRemove = state.nodes.filter((node) => node.id !== nodeId)
      const edgesAfterRemove = state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      )
      const synced = syncGraphAfterStructuralChange(nodesAfterRemove, edgesAfterRemove)
      const selectedStillExists =
        state.selectedNodeId === null ||
        synced.nodes.some((node) => node.id === state.selectedNodeId)
      const hoverNodeOk =
        state.hoveredNodeId !== null && state.hoveredNodeId !== nodeId
          ? state.hoveredNodeId
          : null
      const hoverEdgeOk =
        state.hoveredEdgeId === null ||
        synced.edges.some((e) => e.id === state.hoveredEdgeId)
          ? state.hoveredEdgeId
          : null
      return {
        nodes: synced.nodes,
        edges: synced.edges,
        selectedNodeId: selectedStillExists ? state.selectedNodeId : null,
        hoveredNodeId: hoverNodeOk,
        hoveredEdgeId: hoverEdgeOk,
        history,
      }
    })
  },
  resetCanvas: () => {
    set({
      nodes: initialNodes,
      edges: initialEdges,
      history: [],
      selectedNodeId: null,
      hoveredNodeId: null,
      hoveredEdgeId: null,
      fitViewRequestId: 0,
    })
  },
  updateNodeData: (nodeId, data) => {
    set((state) => ({
      history: withHistory(state),
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node
        return {
          ...node,
          data: {
            ...node.data,
            ...data,
          },
        }
      }),
    }))
  },
  exportDiagram: () => {
    const state = get()
    return {
      nodes: state.nodes,
      edges: state.edges,
    }
  },
  importDiagram: (snapshot) => {
    const migratedNodes = snapshot.nodes.map((node) => ({
      ...node,
      data: migrateSecurityGroupNodeData(node.data),
    }))
    const synced = syncGraphAfterStructuralChange(migratedNodes, snapshot.edges)
    set({
      nodes: synced.nodes,
      edges: synced.edges,
      history: [],
      selectedNodeId: null,
      hoveredNodeId: null,
      hoveredEdgeId: null,
      fitViewRequestId: get().fitViewRequestId + 1,
    })
  },
  loadImportedDiagram: (nodes, edges) => {
    const migratedNodes = nodes.map((node) => ({
      ...node,
      data: migrateSecurityGroupNodeData(node.data),
    }))
    const synced = syncGraphAfterStructuralChange(migratedNodes, edges)
    set({
      nodes: synced.nodes,
      edges: synced.edges,
      history: [],
      selectedNodeId: null,
      hoveredNodeId: null,
      hoveredEdgeId: null,
      fitViewRequestId: get().fitViewRequestId + 1,
    })
  },
}))
