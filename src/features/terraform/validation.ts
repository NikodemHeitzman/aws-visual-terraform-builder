import type { Edge, Node } from 'reactflow'
import type { AwsNodeData, SecurityGroupRuleRow } from '../diagram/diagram-types'
import { migrateSecurityGroupNodeData } from '../diagram/security-group-rules'

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const CIDR_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\/([0-9]|[12][0-9]|3[0-2])$/
const S3_BUCKET_NAME_REGEX =
  /^(?!\d+\.\d+\.\d+\.\d+$)(?!xn--)(?!.*\.\.)(?!.*-$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
function hasConnectionToTypes(
  nodeId: string,
  nodesById: Map<string, Node<AwsNodeData>>,
  edges: Edge[],
  allowedTypes: AwsNodeData['resourceType'][],
) {
  return edges.some((edge) => {
    if (edge.source !== nodeId && edge.target !== nodeId) return false
    const otherNodeId = edge.source === nodeId ? edge.target : edge.source
    const otherNode = nodesById.get(otherNodeId)
    return otherNode ? allowedTypes.includes(otherNode.data.resourceType) : false
  })
}

/** True if walking `parentNode` hits any of `types` (canvas nesting). */
function hasAncestorWithResourceTypes(
  node: Node<AwsNodeData>,
  nodesById: Map<string, Node<AwsNodeData>>,
  types: AwsNodeData['resourceType'][],
): boolean {
  const visited = new Set<string>()
  let parentId: string | undefined = node.parentNode
  while (parentId) {
    if (visited.has(parentId)) break
    visited.add(parentId)
    const parent = nodesById.get(parentId)
    if (!parent) break
    if (types.includes(parent.data.resourceType)) return true
    parentId = parent.parentNode
  }
  return false
}

function hasVpcOrSubnetContext(
  node: Node<AwsNodeData>,
  nodesById: Map<string, Node<AwsNodeData>>,
  edges: Edge[],
): boolean {
  return (
    hasConnectionToTypes(node.id, nodesById, edges, ['subnet', 'vpc']) ||
    hasAncestorWithResourceTypes(node, nodesById, ['vpc', 'subnet'])
  )
}

function parseIpv4ToInt(ip: string) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0)
}

function cidrRange(cidr: string) {
  if (!CIDR_REGEX.test(cidr)) return undefined
  const [ip, prefixRaw] = cidr.split('/')
  const prefix = Number.parseInt(prefixRaw, 10)
  const ipValue = parseIpv4ToInt(ip)
  const hostBits = 32 - prefix
  const mask = prefix === 0 ? 0 : (0xffffffff << hostBits) >>> 0
  const network = ipValue & mask
  const broadcast = network + 2 ** hostBits - 1
  return { network, broadcast }
}

function associatedVpc(
  subnetNode: Node<AwsNodeData>,
  nodesById: Map<string, Node<AwsNodeData>>,
  edges: Edge[],
) {
  if (subnetNode.parentNode) {
    const parent = nodesById.get(subnetNode.parentNode)
    if (parent?.data.resourceType === 'vpc') return parent
  }
  return edges
    .filter((edge) => edge.source === subnetNode.id || edge.target === subnetNode.id)
    .map((edge) =>
      nodesById.get(edge.source === subnetNode.id ? edge.target : edge.source),
    )
    .find((candidate) => candidate?.data.resourceType === 'vpc')
}

function validateSecurityGroupRuleRows(
  rows: SecurityGroupRuleRow[] | undefined,
  label: string,
  direction: 'ingress' | 'egress',
  errors: string[],
) {
  const list = rows ?? []
  list.forEach((row, index) => {
    const cidr = row.cidr.trim()
    if (!CIDR_REGEX.test(cidr)) {
      errors.push(
        `Security Group "${label}": invalid CIDR on ${direction} rule ${index + 1} ("${cidr}").`,
      )
    }
    if (row.allTraffic) return
    const { fromPort, toPort } = row
    if (
      Number.isNaN(fromPort) ||
      Number.isNaN(toPort) ||
      fromPort < 1 ||
      fromPort > 65535 ||
      toPort < 1 ||
      toPort > 65535
    ) {
      errors.push(
        `Security Group "${label}": ports must be 1–65535 on ${direction} rule ${index + 1}.`,
      )
    }
    if (fromPort > toPort) {
      errors.push(
        `Security Group "${label}": from_port > to_port on ${direction} rule ${index + 1}.`,
      )
    }
  })
}

export function validateDiagram(nodes: Node<AwsNodeData>[], edges: Edge[]) {
  const errors: string[] = []
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  if (nodes.length === 0) {
    errors.push('Add at least one resource to the canvas before generating Terraform.')
    return errors
  }

  nodes.forEach((node) => {
    if (!node.data.label?.trim()) {
      errors.push(`Resource "${node.id}" is missing a name.`)
    }

    if (node.data.resourceType === 'ec2') {
      if (!hasVpcOrSubnetContext(node, nodesById, edges)) {
        errors.push(`EC2 "${node.data.label}" should be connected to a Subnet or VPC.`)
      }
    }

    if (node.data.resourceType === 'subnet') {
      if (!associatedVpc(node, nodesById, edges)) {
        errors.push(`Subnet "${node.data.label}" should be connected to a VPC or nested inside a VPC.`)
      }

      const subnetCidr = node.data.cidrBlock?.trim()
      const linkedVpc = associatedVpc(node, nodesById, edges)
      const vpcCidr = linkedVpc?.data.cidrBlock?.trim()
      if (subnetCidr && vpcCidr && CIDR_REGEX.test(subnetCidr) && CIDR_REGEX.test(vpcCidr)) {
        const subnetRange = cidrRange(subnetCidr)
        const vpcRange = cidrRange(vpcCidr)
        if (
          subnetRange &&
          vpcRange &&
          (subnetRange.network < vpcRange.network ||
            subnetRange.broadcast > vpcRange.broadcast)
        ) {
          errors.push(
            `Subnet "${node.data.label}" CIDR (${subnetCidr}) must be inside VPC "${linkedVpc?.data.label}" CIDR (${vpcCidr}).`,
          )
        }
      }
    }

    if (
      (node.data.resourceType === 'vpc' || node.data.resourceType === 'subnet') &&
      node.data.cidrBlock &&
      !CIDR_REGEX.test(node.data.cidrBlock.trim())
    ) {
      errors.push(`Resource "${node.data.label}" has invalid CIDR format.`)
    }

    if (
      node.data.resourceType === 'ec2' &&
      node.data.privateIp &&
      !IPV4_REGEX.test(node.data.privateIp.trim())
    ) {
      errors.push(`EC2 "${node.data.label}" has invalid private IP format.`)
    }

    if (node.data.resourceType === 's3') {
      const bucketName = node.data.label.trim()
      if (!S3_BUCKET_NAME_REGEX.test(bucketName)) {
        errors.push(
          `S3 bucket "${bucketName}" name is invalid (use lowercase letters, numbers, dots, hyphens; no spaces).`,
        )
      }
    }

    if (node.data.resourceType === 'ecr-repo') {
      if (hasAncestorWithResourceTypes(node, nodesById, ['vpc'])) {
        errors.push(
          `ECR "${node.data.label}" cannot be nested inside a VPC (use the canvas root).`,
        )
      }
    }

    if (node.data.resourceType === 'aws-provider') {
      if (hasAncestorWithResourceTypes(node, nodesById, ['vpc'])) {
        errors.push(
          `AWS Provider "${node.data.label}" cannot be nested inside a VPC.`,
        )
      }
    }

    if (node.data.resourceType === 'security-group') {
      const isPlacedOrLinked =
        hasConnectionToTypes(node.id, nodesById, edges, ['vpc', 'ec2', 'rds']) ||
        hasAncestorWithResourceTypes(node, nodesById, ['vpc'])
      if (!isPlacedOrLinked) {
        errors.push(
          `Security Group "${node.data.label}" should be connected to VPC, EC2, or RDS, or nested inside a VPC.`,
        )
      }
      const migrated = migrateSecurityGroupNodeData(node.data)
      validateSecurityGroupRuleRows(
        migrated.ingressRuleRows,
        node.data.label,
        'ingress',
        errors,
      )
      validateSecurityGroupRuleRows(
        migrated.egressRuleRows,
        node.data.label,
        'egress',
        errors,
      )
    }
  })

  return errors
}
