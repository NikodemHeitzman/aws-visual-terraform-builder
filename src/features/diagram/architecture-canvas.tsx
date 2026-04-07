import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type OnInit,
  type NodeMouseHandler,
  type OnSelectionChangeFunc,
  type NodeTypes,
  type ReactFlowInstance,
  type EdgeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import '@reactflow/node-resizer/dist/style.css'
import { AwsNode } from './aws-node'
import { CustomEdge } from './custom-edge'
import { VpcGroupNode } from './vpc-group-node'
import { useDiagramStore } from './diagram-store'
import {
  AWS_RESOURCE_BY_TYPE,
  isAllowedInVpc,
  isAwsResourceType,
  RESOURCE_DND_MIME,
} from './aws-resources'
import type { AwsNodeData } from './diagram-types'
import {
  awsConnectionRejectionMessage,
  isAwsConnectionAllowed,
} from './connection-rules'
import { useThemeStore } from '../ui/theme-store'
import { ToastViewport, type ToastItem } from '../../components/ui/toast'

/** True if the pointer released on a React Flow handle (new edge or reconnect), not empty canvas. */
function pointerReleasedOverConnectHandle(
  event: globalThis.MouseEvent | globalThis.TouchEvent,
): boolean {
  const x =
    'clientX' in event
      ? event.clientX
      : (event.changedTouches?.[0]?.clientX ?? Number.NaN)
  const y =
    'clientY' in event
      ? event.clientY
      : (event.changedTouches?.[0]?.clientY ?? Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const el = document.elementFromPoint(x, y)
  return Boolean(el?.closest('.react-flow__handle'))
}

const HOVER_TRANSITION = 'opacity 0.3s ease'

function applyDiagramHoverStyles(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
  hoveredNodeId: string | null,
  hoveredEdgeId: string | null,
): { nodes: Node<AwsNodeData>[]; edges: Edge[] } {
  const isAnyHovered = hoveredNodeId !== null || hoveredEdgeId !== null

  const neighborIds = new Set<string>()
  if (hoveredNodeId) {
    for (const e of edges) {
      if (e.source === hoveredNodeId) neighborIds.add(e.target)
      if (e.target === hoveredNodeId) neighborIds.add(e.source)
    }
  }

  const hoveredEdge = hoveredEdgeId
    ? edges.find((e) => e.id === hoveredEdgeId)
    : undefined

  const nextNodes = nodes.map((node) => {
    let full = true
    if (isAnyHovered) {
      full =
        (hoveredNodeId !== null && node.id === hoveredNodeId) ||
        (hoveredNodeId !== null && neighborIds.has(node.id)) ||
        (hoveredEdge !== undefined &&
          (node.id === hoveredEdge.source || node.id === hoveredEdge.target))
    }
    return {
      ...node,
      style: {
        ...node.style,
        opacity: full ? 1 : 0.2,
        transition: HOVER_TRANSITION,
      },
    }
  })

  const nextEdges = edges.map((edge) => {
    let full = true
    if (isAnyHovered) {
      full =
        (hoveredEdgeId !== null && edge.id === hoveredEdgeId) ||
        (hoveredNodeId !== null &&
          (edge.source === hoveredNodeId || edge.target === hoveredNodeId))
    }
    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: full ? 1 : 0.2,
        transition: HOVER_TRANSITION,
      },
    }
  })

  return { nodes: nextNodes, edges: nextEdges }
}

const VPC_PLACEMENT_HINTS: Partial<Record<keyof typeof AWS_RESOURCE_BY_TYPE, string>> = {
  s3: 'S3 Bucket is a managed/global service and cannot be placed inside a VPC.',
  'api-gateway':
    'API Gateway is a managed service edge component and cannot be placed inside a VPC.',
  dynamodb: 'DynamoDB is a managed service and cannot be placed inside a VPC.',
  sqs: 'SQS Queue is a managed service and cannot be placed inside a VPC.',
  'iam-role': 'IAM Role is an account-level identity resource, not a VPC resource.',
  'ecr-repo':
    'ECR is a regional container registry and is not placed inside a VPC boundary in this model.',
  'aws-provider':
    'The AWS provider block is account/region configuration, not a VPC workload.',
}

export function ArchitectureCanvas() {
  const theme = useThemeStore((state) => state.theme)
  const isDark = theme === 'dark'
  const nodes = useDiagramStore((state) => state.nodes)
  const edges = useDiagramStore((state) => state.edges)
  const hoveredNodeId = useDiagramStore((state) => state.hoveredNodeId)
  const hoveredEdgeId = useDiagramStore((state) => state.hoveredEdgeId)
  const setHoveredNode = useDiagramStore((state) => state.setHoveredNode)
  const setHoveredEdge = useDiagramStore((state) => state.setHoveredEdge)
  const fitViewRequestId = useDiagramStore((state) => state.fitViewRequestId)
  const onNodesChange = useDiagramStore((state) => state.onNodesChange)
  const onEdgesChange = useDiagramStore((state) => state.onEdgesChange)
  const onConnect = useDiagramStore((state) => state.onConnect)
  const setSelectedNodeId = useDiagramStore((state) => state.setSelectedNodeId)
  const addNode = useDiagramStore((state) => state.addNode)
  const updateNodeData = useDiagramStore((state) => state.updateNodeData)

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const didConnectThisGestureRef = useRef(false)
  const lastInvalidConnectionRef = useRef<{ source: string; target: string } | null>(
    null,
  )

  const pushToast = useCallback(
    (title: string, description?: string, variant: ToastItem['variant'] = 'default') => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((current) => [...current, { id, title, description, variant }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, 4200)
    },
    [],
  )

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ awsNode: AwsNode, vpcGroup: VpcGroupNode }),
    [],
  )

  const edgeTypes = useMemo<EdgeTypes>(
    () => ({ default: CustomEdge }),
    [],
  )

  const { nodes: displayNodes, edges: displayEdges } = useMemo(
    () => applyDiagramHoverStyles(nodes, edges, hoveredNodeId, hoveredEdgeId),
    [nodes, edges, hoveredNodeId, hoveredEdgeId],
  )

  const onNodeMouseEnter = useCallback<NodeMouseHandler>(
    (_, node) => {
      setHoveredNode(node.id)
    },
    [setHoveredNode],
  )

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null)
  }, [setHoveredNode])

  const onEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (_, edge) => {
      setHoveredEdge(edge.id)
    },
    [setHoveredEdge],
  )

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null)
  }, [setHoveredEdge])

  const onNodeClick = (_: ReactMouseEvent, node: Node<AwsNodeData>) => {
    setSelectedNodeId(node.id)
  }

  const handleSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes: selectedNodes }) => {
      setSelectedNodeId(selectedNodes[0]?.id ?? null)
    },
    [setSelectedNodeId],
  )

  const onInit: OnInit = (instance) => {
    reactFlowInstance.current = instance
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      useDiagramStore.setState((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, selected: true })),
        edges: state.edges.map((e) => ({ ...e, selected: true })),
        selectedNodeId: state.nodes[0]?.id ?? null,
      }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (fitViewRequestId === 0) return
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        reactFlowInstance.current?.fitView({ padding: 0.15, duration: 280 })
      })
    })
    return () => window.cancelAnimationFrame(id)
  }, [fitViewRequestId])

  const isValidConnection = useCallback((connection: Connection) => {
    const { nodes: storeNodes } = useDiagramStore.getState()
    if (!connection.source || !connection.target) {
      lastInvalidConnectionRef.current = null
      return false
    }
    if (connection.source === connection.target) {
      lastInvalidConnectionRef.current = null
      return false
    }
    const sourceNode = storeNodes.find((n) => n.id === connection.source)
    const targetNode = storeNodes.find((n) => n.id === connection.target)
    if (!sourceNode?.data?.resourceType || !targetNode?.data?.resourceType) {
      lastInvalidConnectionRef.current = null
      return false
    }
    const ok = isAwsConnectionAllowed(
      sourceNode.data.resourceType,
      targetNode.data.resourceType,
    )
    if (ok) {
      lastInvalidConnectionRef.current = null
    } else {
      lastInvalidConnectionRef.current = {
        source: connection.source,
        target: connection.target,
      }
    }
    return ok
  }, [])

  const handleConnectStart = useCallback(() => {
    didConnectThisGestureRef.current = false
    lastInvalidConnectionRef.current = null
  }, [])

  const handleConnect = useCallback(
    (connection: Connection) => {
      didConnectThisGestureRef.current = true
      lastInvalidConnectionRef.current = null
      onConnect(connection)
    },
    [onConnect],
  )

  const handleConnectEnd = useCallback(
    (event: globalThis.MouseEvent | globalThis.TouchEvent) => {
    if (
      !didConnectThisGestureRef.current &&
      lastInvalidConnectionRef.current &&
      pointerReleasedOverConnectHandle(event)
    ) {
      const { nodes: storeNodes } = useDiagramStore.getState()
      const { source, target } = lastInvalidConnectionRef.current
      const sourceNode = storeNodes.find((n) => n.id === source)
      const targetNode = storeNodes.find((n) => n.id === target)
      if (sourceNode?.data?.resourceType && targetNode?.data?.resourceType) {
        pushToast(
          'Invalid connection',
          awsConnectionRejectionMessage(
            sourceNode.data.resourceType,
            targetNode.data.resourceType,
          ),
          'destructive',
        )
      }
    }
    lastInvalidConnectionRef.current = null
  },
    [pushToast],
  )

  const handleReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    useDiagramStore.setState((state) => ({
      edges: reconnectEdge(oldEdge, connection, state.edges),
    }))
  }, [])

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!reactFlowInstance.current) return

    const resourceType = event.dataTransfer.getData(RESOURCE_DND_MIME)
    if (!isAwsResourceType(resourceType)) return

    const position = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    const vpcParent = nodes
      .filter((node) => node.type === 'vpcGroup')
      .find((node) => {
        const width = Number(node.style?.width ?? 560)
        const height = Number(node.style?.height ?? 320)
        return (
          position.x >= node.position.x &&
          position.x <= node.position.x + width &&
          position.y >= node.position.y &&
          position.y <= node.position.y + height
        )
      })

    const attemptedVpcDrop = Boolean(vpcParent) && resourceType !== 'vpc'
    const canNestInsideVpc = isAllowedInVpc(resourceType)
    const assignParentNodeId =
      attemptedVpcDrop && canNestInsideVpc ? vpcParent?.id : undefined
    let finalPosition = position

    if (attemptedVpcDrop && !canNestInsideVpc) {
      const resourceLabel = AWS_RESOURCE_BY_TYPE[resourceType].label
      if (vpcParent) {
        const width = Number(vpcParent.style?.width ?? 560)
        const height = Number(vpcParent.style?.height ?? 320)
        const minY = vpcParent.position.y + 16
        const maxY = vpcParent.position.y + height - 16
        finalPosition = {
          x: vpcParent.position.x + width + 24,
          y: Math.min(Math.max(position.y, minY), maxY),
        }
      }
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((current) => [
        ...current,
        {
          id,
          title: 'Invalid VPC placement',
          description:
            VPC_PLACEMENT_HINTS[resourceType] ??
            `${resourceLabel} cannot be placed inside a VPC.`,
          variant: 'destructive',
        },
      ])
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, 3600)
    }

    const newNodeId = addNode(resourceType, finalPosition, {
      parentNodeId: assignParentNodeId,
    })

    if (attemptedVpcDrop && !canNestInsideVpc) {
      updateNodeData(newNodeId, { flashInvalidPlacement: true })
      window.setTimeout(() => {
        updateNodeData(newNodeId, { flashInvalidPlacement: false })
      }, 320)
    }
  }

  return (
    <section className="h-full flex-1 bg-muted/30">
      <ReactFlow
        deleteKeyCode={['Backspace', 'Delete']}
        edgeTypes={edgeTypes}
        fitView
        edges={displayEdges}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        nodes={displayNodes}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onConnectStart={handleConnectStart}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgesChange={onEdgesChange}
        onSelectionChange={handleSelectionChange}
        onReconnect={handleReconnect}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={() => {
          setSelectedNodeId(null)
          setHoveredNode(null)
          setHoveredEdge(null)
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={onInit}
        multiSelectionKeyCode={['Control', 'Meta']}
        selectionOnDrag
      >
        <MiniMap
          maskColor={
            isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.75)'
          }
          nodeColor={isDark ? 'hsl(217.2 91.2% 55%)' : 'hsl(221.2 83.2% 53.3%)'}
          nodeStrokeColor={
            isDark ? 'hsl(210 40% 90%)' : 'hsl(222.2 47.4% 20%)'
          }
          pannable
          style={{
            backgroundColor: isDark ? 'hsl(222.2 47% 11%)' : 'hsl(0 0% 100%)',
          }}
          zoomable
        />
        <Controls />
        <Background
          color={isDark ? 'hsl(217.2 32.6% 28%)' : 'hsl(214.3 31.8% 82%)'}
          gap={18}
          size={1}
        />
      </ReactFlow>
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }}
      />
    </section>
  )
}
