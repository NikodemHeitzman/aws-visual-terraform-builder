import type { NodeProps } from 'reactflow'
import { Handle, NodeResizer, Position } from 'reactflow'
import { AWS_ICON_PATHS } from '../icons/aws-icon-registry'
import { cn } from '../../lib/utils'
import type { AwsNodeData } from './diagram-types'

const DEFAULT_VPC_FILL = 'rgba(224, 242, 254, 0.72)'

export function VpcGroupNode({ data, selected }: NodeProps<AwsNodeData>) {
  const fill = data.backgroundColor ?? DEFAULT_VPC_FILL

  return (
    <>
      <NodeResizer
        handleClassName="!h-3 !w-3 !rounded-sm !border-2 !border-primary !bg-background shadow-sm"
        isVisible={selected}
        lineClassName="!border-primary/70"
        minHeight={200}
        minWidth={320}
      />
      <div
        className={cn(
          'relative box-border h-full w-full rounded-xl border-2 border-dashed border-sky-400/55 p-3 dark:border-sky-400/40',
          selected && 'ring-2 ring-primary/40',
        )}
        style={{ backgroundColor: fill }}
      >
        <Handle position={Position.Left} type="target" />
        <Handle position={Position.Right} type="source" />
        <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/90 px-2 py-1 shadow-sm backdrop-blur-sm dark:bg-card/95">
          <img
            alt="VPC icon"
            className="h-4 w-4 object-contain"
            src={AWS_ICON_PATHS.vpc}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">
              {data.label || 'VPC'}
            </p>
            <p className="text-[10px] text-muted-foreground">Network Boundary</p>
          </div>
        </div>
      </div>
    </>
  )
}
