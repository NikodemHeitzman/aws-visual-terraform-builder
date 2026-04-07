import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { AWS_RESOURCE_BY_TYPE } from './aws-resources'
import { cn } from '../../lib/utils'
import type { AwsNodeData } from './diagram-types'
import { AWS_ICON_PATHS } from '../icons/aws-icon-registry'

export function AwsNode({ data, selected }: NodeProps<AwsNodeData>) {
  const resource = AWS_RESOURCE_BY_TYPE[data.resourceType]

  return (
    <div
      className={cn(
        'min-w-44 rounded-lg border bg-card p-3 shadow-sm transition-shadow',
        data.flashInvalidPlacement && 'ring-2 ring-destructive/70 animate-pulse',
        selected && 'shadow-md ring-2 ring-primary/40',
      )}
    >
      <Handle position={Position.Left} type="target" />

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border',
            resource.accentClassName,
          )}
        >
          {AWS_ICON_PATHS[data.resourceType] ? (
            <img
              alt={`${resource.label} icon`}
              className="h-5 w-5 object-contain"
              src={AWS_ICON_PATHS[data.resourceType]}
            />
          ) : (
            <resource.Icon className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.label}</p>
          <p className="text-xs text-muted-foreground">{resource.label}</p>
        </div>
      </div>

      <Handle position={Position.Right} type="source" />
    </div>
  )
}
