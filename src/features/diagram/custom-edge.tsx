import { memo, useCallback, type MouseEvent, type PointerEvent } from 'react'
import { X } from 'lucide-react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  Position,
} from 'reactflow'
import { cn } from '../../lib/utils'
import { useDiagramStore } from './diagram-store'

/**
 * Custom edge with thicker stroke and a mid-path delete control.
 * Smooth-step path reads better across compound (parent) nodes; animation from parent `.animated` class.
 */
export const CustomEdge = memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  style,
  markerEnd,
  markerStart,
  selected,
  interactionWidth,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  })

  const onDeletePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  const onDeleteClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      useDiagramStore.getState().deleteEdge(id)
    },
    [id],
  )

  const strokeColor = selected
    ? 'hsl(var(--primary))'
    : 'hsl(var(--muted-foreground))'
  const strokeWidth = selected ? 3.5 : 2.5

  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={interactionWidth ?? 28}
        labelX={labelX}
        labelY={labelY}
        markerEnd={markerEnd}
        markerStart={markerStart}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none z-[10]"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: style?.opacity ?? 1,
            transition: (style?.transition as string | undefined) ?? undefined,
          }}
        >
          <button
            aria-label="Delete connection"
            className={cn(
              'nodrag nopan pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full',
              'border border-border bg-background text-red-600 shadow-md dark:text-red-400',
              'transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            type="button"
            onPointerDown={onDeletePointerDown}
            onClick={onDeleteClick}
          >
            <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
