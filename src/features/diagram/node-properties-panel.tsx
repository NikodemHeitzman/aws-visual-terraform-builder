import { Trash2 } from 'lucide-react'
import { AWS_RESOURCE_BY_TYPE } from './aws-resources'
import {
  AWS_AVAILABILITY_ZONES,
  AWS_AVAILABILITY_ZONES_BY_REGION,
} from './aws-availability-zones'
import type {
  AwsNodeData,
  DynamoHashKeyType,
  LambdaRuntime,
  RdsEngine,
  S3BucketPrivacy,
  SecurityGroupRuleRow,
} from './diagram-types'
import { useDiagramStore } from './diagram-store'
import { migrateSecurityGroupNodeData, newSgRuleId } from './security-group-rules'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

const VPC_FILL_SWATCHES: { label: string; value: string }[] = [
  { label: 'Sky', value: 'rgba(224, 242, 254, 0.72)' },
  { label: 'Slate', value: 'rgba(241, 245, 249, 0.82)' },
  { label: 'Violet', value: 'rgba(237, 233, 254, 0.78)' },
  { label: 'Emerald', value: 'rgba(209, 250, 229, 0.72)' },
  { label: 'Amber', value: 'rgba(254, 243, 199, 0.78)' },
  { label: 'Rose', value: 'rgba(255, 228, 230, 0.78)' },
]

function colorPickerValue(css: string | undefined): string {
  if (css?.startsWith('#') && css.length >= 7) return css.slice(0, 7)
  return '#38bdf8'
}

type SecurityGroupRulesEditorProps = {
  nodeId: string
  data: AwsNodeData
  updateNodeData: (id: string, partial: Partial<AwsNodeData>) => void
}

function SecurityGroupRulesEditor({
  nodeId,
  data,
  updateNodeData,
}: SecurityGroupRulesEditorProps) {
  const sg = migrateSecurityGroupNodeData(data)
  const ingressRows = sg.ingressRuleRows ?? []
  const egressRows = sg.egressRuleRows ?? []

  const updateIngress = (rows: SecurityGroupRuleRow[]) => {
    updateNodeData(nodeId, { ingressRuleRows: rows })
  }
  const updateEgress = (rows: SecurityGroupRuleRow[]) => {
    updateNodeData(nodeId, { egressRuleRows: rows })
  }

  const updateIngressRow = (id: string, patch: Partial<SecurityGroupRuleRow>) => {
    updateIngress(ingressRows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }
  const updateEgressRow = (id: string, patch: Partial<SecurityGroupRuleRow>) => {
    updateEgress(egressRows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ingress</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateIngress([
                ...ingressRows,
                {
                  id: newSgRuleId(),
                  allTraffic: false,
                  protocol: 'tcp',
                  fromPort: 80,
                  toPort: 80,
                  cidr: '0.0.0.0/0',
                },
              ])
            }
          >
            Add rule
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">All</th>
                <th className="p-2 font-medium">Proto</th>
                <th className="p-2 font-medium">From</th>
                <th className="p-2 font-medium">To</th>
                <th className="p-2 font-medium">CIDR</th>
                <th className="w-10 p-2" />
              </tr>
            </thead>
            <tbody>
              {ingressRows.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="p-1 align-middle">
                    <input
                      checked={row.allTraffic}
                      className="h-4 w-4"
                      type="checkbox"
                      onChange={(event) => {
                        const all = event.target.checked
                        updateIngressRow(row.id, {
                          allTraffic: all,
                          fromPort: all ? 0 : row.fromPort || 80,
                          toPort: all ? 0 : row.toPort || 80,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <select
                      className="w-full rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      value={row.protocol}
                      onChange={(event) => {
                        updateIngressRow(row.id, {
                          protocol: event.target.value as SecurityGroupRuleRow['protocol'],
                        })
                      }}
                    >
                      <option value="tcp">tcp</option>
                      <option value="udp">udp</option>
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      className="w-16 rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      type="number"
                      value={row.allTraffic ? '' : row.fromPort}
                      onChange={(event) => {
                        updateIngressRow(row.id, {
                          fromPort: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="w-16 rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      type="number"
                      value={row.allTraffic ? '' : row.toPort}
                      onChange={(event) => {
                        updateIngressRow(row.id, {
                          toPort: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="w-full min-w-[7rem] rounded border border-input bg-background px-1 py-1 font-mono"
                      type="text"
                      value={row.cidr}
                      onChange={(event) => {
                        updateIngressRow(row.id, { cidr: event.target.value })
                      }}
                    />
                  </td>
                  <td className="p-1 align-middle">
                    <button
                      aria-label="Remove ingress rule"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      type="button"
                      onClick={() =>
                        updateIngress(ingressRows.filter((r) => r.id !== row.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ingressRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No ingress rules (no inbound).</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Egress</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateEgress([
                ...egressRows,
                {
                  id: newSgRuleId(),
                  allTraffic: true,
                  protocol: 'tcp',
                  fromPort: 0,
                  toPort: 0,
                  cidr: '0.0.0.0/0',
                },
              ])
            }
          >
            Add rule
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">All</th>
                <th className="p-2 font-medium">Proto</th>
                <th className="p-2 font-medium">From</th>
                <th className="p-2 font-medium">To</th>
                <th className="p-2 font-medium">CIDR</th>
                <th className="w-10 p-2" />
              </tr>
            </thead>
            <tbody>
              {egressRows.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="p-1 align-middle">
                    <input
                      checked={row.allTraffic}
                      className="h-4 w-4"
                      type="checkbox"
                      onChange={(event) => {
                        const all = event.target.checked
                        updateEgressRow(row.id, {
                          allTraffic: all,
                          fromPort: all ? 0 : row.fromPort || 80,
                          toPort: all ? 0 : row.toPort || 80,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <select
                      className="w-full rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      value={row.protocol}
                      onChange={(event) => {
                        updateEgressRow(row.id, {
                          protocol: event.target.value as SecurityGroupRuleRow['protocol'],
                        })
                      }}
                    >
                      <option value="tcp">tcp</option>
                      <option value="udp">udp</option>
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      className="w-16 rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      type="number"
                      value={row.allTraffic ? '' : row.fromPort}
                      onChange={(event) => {
                        updateEgressRow(row.id, {
                          fromPort: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="w-16 rounded border border-input bg-background px-1 py-1 disabled:opacity-50"
                      disabled={row.allTraffic}
                      type="number"
                      value={row.allTraffic ? '' : row.toPort}
                      onChange={(event) => {
                        updateEgressRow(row.id, {
                          toPort: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="w-full min-w-[7rem] rounded border border-input bg-background px-1 py-1 font-mono"
                      type="text"
                      value={row.cidr}
                      onChange={(event) => {
                        updateEgressRow(row.id, { cidr: event.target.value })
                      }}
                    />
                  </td>
                  <td className="p-1 align-middle">
                    <button
                      aria-label="Remove egress rule"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      type="button"
                      onClick={() =>
                        updateEgress(egressRows.filter((r) => r.id !== row.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {egressRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No egress rules.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium">All</span>: any protocol (-1). Otherwise set TCP/UDP and
        port range (single port: same From and To).
      </p>
    </div>
  )
}

export function NodePropertiesPanel() {
  const selectedNodeId = useDiagramStore((state) => state.selectedNodeId)
  const nodes = useDiagramStore((state) => state.nodes)
  const updateNodeData = useDiagramStore((state) => state.updateNodeData)
  const deleteNode = useDiagramStore((state) => state.deleteNode)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)

  if (!selectedNode) {
    return (
      <aside className="w-80 border-l bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Properties
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Select a node to configure basic resource properties.
        </p>
      </aside>
    )
  }

  const resource = AWS_RESOURCE_BY_TYPE[selectedNode.data.resourceType]
  const availabilityZoneValue = selectedNode.data.availabilityZone ?? 'us-east-1a'
  const hasCustomAvailabilityZone =
    !AWS_AVAILABILITY_ZONES.includes(availabilityZoneValue)

  return (
    <aside className="w-80 space-y-4 border-l bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Properties
        </h2>
        <p className="mt-1 text-sm font-medium">{resource.label}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          type="text"
          value={selectedNode.data.label}
          onChange={(event) => {
            updateNodeData(selectedNode.id, { label: event.target.value })
          }}
        />
      </label>

      {selectedNode.data.resourceType === 'aws-provider' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Region</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder="us-east-1"
              value={selectedNode.data.awsProviderRegion ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  awsProviderRegion: event.target.value,
                })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Provider alias (optional)
            </span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder="eu-west-1"
              value={selectedNode.data.awsProviderAlias ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  awsProviderAlias: event.target.value || undefined,
                })
              }}
            />
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'vpc' && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            VPC area color
          </span>
          <div className="flex flex-wrap gap-2">
            {VPC_FILL_SWATCHES.map((swatch) => {
              const currentFill =
                selectedNode.data.backgroundColor ?? VPC_FILL_SWATCHES[0].value
              const active = swatch.value === currentFill
              return (
                <button
                  key={swatch.value}
                  className={cn(
                    'h-9 w-9 rounded-md border-2 shadow-sm transition-transform hover:scale-105',
                    active
                      ? 'border-primary ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'border-border',
                  )}
                  title={swatch.label}
                  type="button"
                  style={{ backgroundColor: swatch.value }}
                  onClick={() =>
                    updateNodeData(selectedNode.id, {
                      backgroundColor: swatch.value,
                    })
                  }
                />
              )
            })}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Custom color
            </span>
            <input
              className="h-10 w-full cursor-pointer rounded-md border border-input bg-background"
              type="color"
              value={colorPickerValue(selectedNode.data.backgroundColor)}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  backgroundColor: event.target.value,
                })
              }}
            />
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'ec2' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Instance Type
            </span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedNode.data.instanceType ?? 't2.micro'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { instanceType: event.target.value })
              }}
            >
              <option value="t2.micro">t2.micro</option>
              <option value="t3.micro">t3.micro</option>
              <option value="t3.small">t3.small</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">AMI</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.ami ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { ami: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Private IP
            </span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder="10.0.1.10"
              value={selectedNode.data.privateIp ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { privateIp: event.target.value })
              }}
            />
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'alb' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={Boolean(selectedNode.data.albInternal)}
            type="checkbox"
            onChange={(event) => {
              updateNodeData(selectedNode.id, {
                albInternal: event.target.checked,
              })
            }}
          />
          Internal load balancer
        </label>
      )}

      {(selectedNode.data.resourceType === 'vpc' ||
        selectedNode.data.resourceType === 'subnet') && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">CIDR</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder={
                selectedNode.data.resourceType === 'vpc' ? '10.0.0.0/16' : '10.0.1.0/24'
              }
              value={selectedNode.data.cidrBlock ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { cidrBlock: event.target.value })
              }}
            />
          </label>

          {selectedNode.data.resourceType === 'subnet' && (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Availability Zone (quick pick)
                </span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={availabilityZoneValue}
                  onChange={(event) => {
                    updateNodeData(selectedNode.id, {
                      availabilityZone: event.target.value,
                    })
                  }}
                >
                  {hasCustomAvailabilityZone && (
                    <option value={availabilityZoneValue}>{availabilityZoneValue}</option>
                  )}
                  {AWS_AVAILABILITY_ZONES_BY_REGION.map(({ region, zones }) => (
                    <optgroup key={region} label={region}>
                      {zones.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Availability Zone (manual)
                </span>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  list="aws-availability-zones"
                  type="text"
                  value={availabilityZoneValue}
                  onChange={(event) => {
                    updateNodeData(selectedNode.id, {
                      availabilityZone: event.target.value.trim(),
                    })
                  }}
                />
              </label>
              <datalist id="aws-availability-zones">
                {AWS_AVAILABILITY_ZONES.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  checked={selectedNode.data.isPublicSubnet ?? true}
                  type="checkbox"
                  onChange={(event) => {
                    updateNodeData(selectedNode.id, {
                      isPublicSubnet: event.target.checked,
                    })
                  }}
                />
                Public subnet (internet route + public IP mapping)
              </label>
            </div>
          )}
        </div>
      )}

      {selectedNode.data.resourceType === 'security-group' && (
        <SecurityGroupRulesEditor
          data={selectedNode.data}
          nodeId={selectedNode.id}
          updateNodeData={updateNodeData}
        />
      )}

      {selectedNode.data.resourceType === 's3' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Bucket Privacy
          </span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            value={selectedNode.data.bucketPrivacy ?? 'private'}
            onChange={(event) => {
              updateNodeData(selectedNode.id, {
                bucketPrivacy: event.target.value as S3BucketPrivacy,
              })
            }}
          >
            <option value="private">private</option>
            <option value="public-read">public-read</option>
          </select>
        </label>
      )}

      {selectedNode.data.resourceType === 'rds' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Engine</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedNode.data.rdsEngine ?? 'postgres'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  rdsEngine: event.target.value as RdsEngine,
                })
              }}
            >
              <option value="postgres">postgres</option>
              <option value="mysql">mysql</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">DB Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.dbName ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { dbName: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Username</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.dbUsername ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { dbUsername: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="password"
              value={selectedNode.data.dbPassword ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { dbPassword: event.target.value })
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={Boolean(selectedNode.data.publiclyAccessible)}
              type="checkbox"
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  publiclyAccessible: event.target.checked,
                })
              }}
            />
            Publicly accessible
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'lambda' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Runtime</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedNode.data.lambdaRuntime ?? 'nodejs20.x'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  lambdaRuntime: event.target.value as LambdaRuntime,
                })
              }}
            >
              <option value="nodejs20.x">nodejs20.x</option>
              <option value="python3.12">python3.12</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Handler</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.lambdaHandler ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { lambdaHandler: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Artifact File
            </span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.lambdaFilename ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { lambdaFilename: event.target.value })
              }}
            />
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'api-gateway' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Description
          </span>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            rows={3}
            value={selectedNode.data.apiDescription ?? ''}
            onChange={(event) => {
              updateNodeData(selectedNode.id, { apiDescription: event.target.value })
            }}
          />
        </label>
      )}

      {selectedNode.data.resourceType === 'dynamodb' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Table Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.dynamoTableName ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { dynamoTableName: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Hash Key Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.dynamoHashKeyName ?? 'id'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { dynamoHashKeyName: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Hash Key Type</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedNode.data.dynamoHashKeyType ?? 'S'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  dynamoHashKeyType: event.target.value as DynamoHashKeyType,
                })
              }}
            >
              <option value="S">S (String)</option>
              <option value="N">N (Number)</option>
              <option value="B">B (Binary)</option>
            </select>
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'sqs' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Queue Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.sqsQueueName ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { sqsQueueName: event.target.value })
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={Boolean(selectedNode.data.sqsFifo)}
              type="checkbox"
              onChange={(event) => {
                updateNodeData(selectedNode.id, { sqsFifo: event.target.checked })
              }}
            />
            FIFO queue
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'ecr-repo' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Repository Name
          </span>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            type="text"
            placeholder="my-app-repo"
            value={selectedNode.data.ecrRepositoryName ?? ''}
            onChange={(event) => {
              updateNodeData(selectedNode.id, { ecrRepositoryName: event.target.value })
            }}
          />
        </label>
      )}

      {selectedNode.data.resourceType === 'ecs-cluster' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Cluster Name</span>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            type="text"
            placeholder="app-cluster"
            value={selectedNode.data.ecsClusterName ?? ''}
            onChange={(event) => {
              updateNodeData(selectedNode.id, { ecsClusterName: event.target.value })
            }}
          />
        </label>
      )}

      {selectedNode.data.resourceType === 'eks-cluster' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Cluster Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder="k8s-cluster"
              value={selectedNode.data.eksClusterName ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { eksClusterName: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Kubernetes Version
            </span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              placeholder="1.28"
              value={selectedNode.data.eksKubernetesVersion ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  eksKubernetesVersion: event.target.value,
                })
              }}
            />
          </label>
        </div>
      )}

      {selectedNode.data.resourceType === 'iam-role' && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Role Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.iamRoleName ?? ''}
              onChange={(event) => {
                updateNodeData(selectedNode.id, { iamRoleName: event.target.value })
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Service Principal
            </span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              value={selectedNode.data.iamServicePrincipal ?? 'ec2.amazonaws.com'}
              onChange={(event) => {
                updateNodeData(selectedNode.id, {
                  iamServicePrincipal: event.target.value,
                })
              }}
            />
          </label>
        </div>
      )}

      <div className="border-t pt-3">
        <Button
          className="w-full"
          variant="outline"
          onClick={() => deleteNode(selectedNode.id)}
        >
          Delete node
        </Button>
      </div>
    </aside>
  )
}
