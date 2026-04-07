import type { AwsNodeData, SecurityGroupRuleRow } from './diagram-types'

export function newSgRuleId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `sg-rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function defaultIngressRuleRows(): SecurityGroupRuleRow[] {
  return [
    {
      id: newSgRuleId(),
      allTraffic: false,
      protocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      cidr: '0.0.0.0/0',
    },
    {
      id: newSgRuleId(),
      allTraffic: false,
      protocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      cidr: '0.0.0.0/0',
    },
  ]
}

export function defaultEgressRuleRows(): SecurityGroupRuleRow[] {
  return [
    {
      id: newSgRuleId(),
      allTraffic: true,
      protocol: 'tcp',
      fromPort: 0,
      toPort: 0,
      cidr: '0.0.0.0/0',
    },
  ]
}

/** Parse one legacy line like `80/tcp 0.0.0.0/0` or `all -1 0.0.0.0/0`. */
export function parseLegacySgLine(line: string): SecurityGroupRuleRow | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const [portProtoRaw, cidrRaw = '0.0.0.0/0'] = trimmed.split(/\s+/, 2)
  const [portPartRaw, protocolPartRaw = '-1'] = portProtoRaw.split('/', 2)
  const portPart = portPartRaw.toLowerCase()
  const protocolLower = protocolPartRaw.toLowerCase()

  if (portPart === 'all') {
    return {
      id: newSgRuleId(),
      allTraffic: true,
      protocol: 'tcp',
      fromPort: 0,
      toPort: 0,
      cidr: cidrRaw,
    }
  }

  const protocol: 'tcp' | 'udp' =
    protocolLower === 'udp' ? 'udp' : protocolLower === 'tcp' ? 'tcp' : 'tcp'

  if (portPart.includes('-')) {
    const [fromRaw, toRaw] = portPart.split('-', 2)
    const fromPort = Number.parseInt(fromRaw, 10)
    const toPort = Number.parseInt(toRaw, 10)
    return {
      id: newSgRuleId(),
      allTraffic: false,
      protocol,
      fromPort,
      toPort,
      cidr: cidrRaw,
    }
  }

  const p = Number.parseInt(portPart, 10)
  return {
    id: newSgRuleId(),
    allTraffic: false,
    protocol,
    fromPort: p,
    toPort: p,
    cidr: cidrRaw,
  }
}

export function legacyRulesTextToRows(text: string | undefined): SecurityGroupRuleRow[] {
  if (!text?.trim()) return []
  return text
    .split('\n')
    .map((line) => parseLegacySgLine(line))
    .filter((row): row is SecurityGroupRuleRow => Boolean(row))
}

/** Merge legacy string fields into row arrays when rows are missing (import / old state). */
export function migrateSecurityGroupNodeData(data: AwsNodeData): AwsNodeData {
  if (data.resourceType !== 'security-group') return data

  let ingressRuleRows = data.ingressRuleRows
  let egressRuleRows = data.egressRuleRows

  if (ingressRuleRows === undefined && data.ingressRules?.trim()) {
    ingressRuleRows = legacyRulesTextToRows(data.ingressRules)
  }
  if (egressRuleRows === undefined && data.egressRules?.trim()) {
    egressRuleRows = legacyRulesTextToRows(data.egressRules)
  }

  if (ingressRuleRows === undefined) {
    ingressRuleRows = defaultIngressRuleRows()
  }
  if (egressRuleRows === undefined) {
    egressRuleRows = defaultEgressRuleRows()
  }

  return {
    ...data,
    ingressRuleRows,
    egressRuleRows,
  }
}

export function ruleRowTfPortsProtocol(row: SecurityGroupRuleRow): {
  fromPort: number
  toPort: number
  protocol: string
} {
  if (row.allTraffic) {
    return { fromPort: 0, toPort: 0, protocol: '-1' }
  }
  return {
    fromPort: row.fromPort,
    toPort: row.toPort,
    protocol: row.protocol,
  }
}
