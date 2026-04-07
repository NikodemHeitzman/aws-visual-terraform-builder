import type { Edge, Node } from 'reactflow'
import type { AwsNodeData } from './diagram-types'
import type { AwsResourceType } from './aws-resources'
import { getDefaultNodeConfig } from './aws-resources'
import {
  extractAllChildBlockInners,
  extractBracketListFromBody,
  parseTerraformProviders,
  parseTerraformResourceRef,
  parseTerraformResources,
  parseTopLevelAttributes,
  resourceAddress,
  stripProviderAssignmentLines,
  type ParsedProviderBlock,
  type ParsedTfResource,
} from './terraformParser'

const SUPPORTED: Partial<Record<string, AwsResourceType>> = {
  aws_vpc: 'vpc',
  aws_subnet: 'subnet',
  aws_security_group: 'security-group',
  aws_instance: 'ec2',
  aws_lb: 'alb',
  aws_s3_bucket: 's3',
  aws_db_instance: 'rds',
  aws_lambda_function: 'lambda',
  aws_api_gateway_rest_api: 'api-gateway',
  aws_dynamodb_table: 'dynamodb',
  aws_sqs_queue: 'sqs',
  aws_iam_role: 'iam-role',
  aws_ecr_repository: 'ecr-repo',
  aws_ecs_cluster: 'ecs-cluster',
  aws_eks_cluster: 'eks-cluster',
}

function sanitizeImportSegment(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function nodeIdForResource(terraformType: string, logicalName: string) {
  return `imp-${sanitizeImportSegment(terraformType)}-${sanitizeImportSegment(logicalName)}`
}

function parseBracketRefList(value: string): string[] {
  const t = value.trim()
  if (!t.startsWith('[') || !t.endsWith(']')) return []
  const inner = t.slice(1, -1)
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseLambdaRuntime(v: string): AwsNodeData['lambdaRuntime'] | undefined {
  if (v === 'nodejs20.x' || v === 'python3.12') return v
  return undefined
}

/** Map `aws_db_subnet_group.name` → list of subnet ref tokens from HCL body. */
function buildDbSubnetGroupSubnetRefs(all: ParsedTfResource[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of all) {
    if (r.terraformType !== 'aws_db_subnet_group') continue
    const listStr = extractBracketListFromBody(r.resourceInner, 'subnet_ids')
    if (!listStr) continue
    const parts = parseBracketRefList(listStr)
    if (parts.length > 0) {
      m.set(resourceAddress(r.terraformType, r.name), parts)
    }
  }
  return m
}

/**
 * Recreate Smart Edges from Terraform glue resources (API Gateway ↔ Lambda, S3 ↔ SQS).
 * Edges use `type: 'default'` → CustomEdge + smooth-step path on the canvas.
 */
function addReconstructedSmartEdges(
  allResources: ParsedTfResource[],
  addrToId: Map<string, string>,
  addEdge: (source: string, target: string) => void,
) {
  const apiGwExecutionArnRe = /aws_api_gateway_rest_api\.([a-zA-Z0-9_-]+)\.execution_arn/g

  for (const r of allResources) {
    if (r.terraformType !== 'aws_api_gateway_integration') continue
    const restRaw = r.attributes.rest_api_id?.trim()
    const uriRaw = r.attributes.uri?.trim()
    if (!restRaw || !uriRaw) continue
    const restNorm = restRaw.replace(/\.id\s*$/, '')
    const uriNorm = uriRaw.replace(/\.invoke_arn\s*$/, '')
    const apiRef = parseTerraformResourceRef(restNorm)
    const lambdaRef = parseTerraformResourceRef(uriNorm)
    if (!apiRef || apiRef.terraformType !== 'aws_api_gateway_rest_api') continue
    if (!lambdaRef || lambdaRef.terraformType !== 'aws_lambda_function') continue
    const apiId = addrToId.get(resourceAddress(apiRef.terraformType, apiRef.name))
    const lambdaId = addrToId.get(resourceAddress(lambdaRef.terraformType, lambdaRef.name))
    if (apiId && lambdaId) addEdge(apiId, lambdaId)
  }

  for (const r of allResources) {
    if (r.terraformType !== 'aws_lambda_permission') continue
    const principal = r.attributes.principal?.replace(/^"|"$/g, '').trim()
    if (principal !== 'apigateway.amazonaws.com') continue
    const fnRaw = r.attributes.function_name?.trim()
    if (!fnRaw) continue
    const fnNorm = fnRaw.replace(/\.function_name\s*$/, '').replace(/^"|"$/g, '')
    const lambdaRef = parseTerraformResourceRef(fnNorm)
    if (!lambdaRef || lambdaRef.terraformType !== 'aws_lambda_function') continue
    const lambdaId = addrToId.get(
      resourceAddress(lambdaRef.terraformType, lambdaRef.name),
    )
    if (!lambdaId) continue
    const haystack = `${stripProviderAssignmentLines(r.resourceInner)}\n${r.attributes.source_arn ?? ''}`
    let m: RegExpExecArray | null
    apiGwExecutionArnRe.lastIndex = 0
    while ((m = apiGwExecutionArnRe.exec(haystack)) !== null) {
      const apiTfName = m[1]
      const apiId = addrToId.get(resourceAddress('aws_api_gateway_rest_api', apiTfName))
      if (apiId) addEdge(apiId, lambdaId)
    }
  }

  for (const r of allResources) {
    if (r.terraformType !== 'aws_s3_bucket_notification') continue
    const sanitized = stripProviderAssignmentLines(r.resourceInner)
    const attrs = parseTopLevelAttributes(sanitized)
    const bucketRaw =
      attrs.bucket?.trim() ||
      sanitized.match(/\bbucket\s*=\s*([^\n#]+)/)?.[1]?.trim()
    if (!bucketRaw) continue
    const bucketNorm = bucketRaw.replace(/\.id\s*$/, '')
    const bucketRef = parseTerraformResourceRef(bucketNorm)
    if (!bucketRef || bucketRef.terraformType !== 'aws_s3_bucket') continue
    const bucketId = addrToId.get(resourceAddress(bucketRef.terraformType, bucketRef.name))
    if (!bucketId) continue
    for (const queueInner of extractAllChildBlockInners(sanitized, 'queue')) {
      const qSan = stripProviderAssignmentLines(queueInner)
      const qAttrs = parseTopLevelAttributes(qSan)
      const arnRaw =
        qAttrs.queue_arn?.trim() ||
        qSan.match(/\bqueue_arn\s*=\s*([^\n#]+)/)?.[1]?.trim()
      if (!arnRaw) continue
      const arnNorm = arnRaw.replace(/\.arn\s*$/, '')
      const queueRef = parseTerraformResourceRef(arnNorm)
      if (!queueRef || queueRef.terraformType !== 'aws_sqs_queue') continue
      const queueId = addrToId.get(resourceAddress(queueRef.terraformType, queueRef.name))
      if (queueId) addEdge(bucketId, queueId)
    }
  }

  const bucketArnInPolicy = /aws_s3_bucket\.([a-zA-Z0-9_-]+)\.arn/g

  for (const r of allResources) {
    if (r.terraformType !== 'aws_sqs_queue_policy') continue
    const sanitized = stripProviderAssignmentLines(r.resourceInner)
    const attrs = parseTopLevelAttributes(sanitized)
    let queueRef = attrs.queue_url
      ? parseTerraformResourceRef(attrs.queue_url.trim().replace(/\.id\s*$/, ''))
      : null
    if (!queueRef) {
      const qm = sanitized.match(/\bqueue_url\s*=\s*([^\n#]+)/)
      if (qm) {
        queueRef = parseTerraformResourceRef(qm[1].trim().replace(/\.id\s*$/, ''))
      }
    }
    if (!queueRef || queueRef.terraformType !== 'aws_sqs_queue') continue
    const queueId = addrToId.get(resourceAddress(queueRef.terraformType, queueRef.name))
    if (!queueId) continue
    let bm: RegExpExecArray | null
    bucketArnInPolicy.lastIndex = 0
    while ((bm = bucketArnInPolicy.exec(sanitized)) !== null) {
      const bucketId = addrToId.get(resourceAddress('aws_s3_bucket', bm[1]))
      if (bucketId) addEdge(bucketId, queueId)
    }
  }
}

function vpcParentFromSubnetTokens(
  parts: string[],
  addrToId: Map<string, string>,
  nodeById: Map<string, Node<AwsNodeData>>,
): string | undefined {
  for (const p of parts) {
    const normalized = p.replace(/\.id\s*$/, '')
    const pr = parseTerraformResourceRef(normalized)
    if (!pr || pr.terraformType !== 'aws_subnet') continue
    const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
    const sn = sid ? nodeById.get(sid) : undefined
    if (sn?.parentNode) return sn.parentNode
  }
  return undefined
}

export function mapParsedResourcesToDiagram(
  resources: ParsedTfResource[],
  providerBlocks: ParsedProviderBlock[] = [],
): { nodes: Node<AwsNodeData>[]; edges: Edge[] } {
  const dbSubnetGroupRefs = buildDbSubnetGroupSubnetRefs(resources)
  const filtered = resources.filter((r) => SUPPORTED[r.terraformType])
  const addrToId = new Map<string, string>()
  const nodeById = new Map<string, Node<AwsNodeData>>()

  for (const r of filtered) {
    const appType = SUPPORTED[r.terraformType]!
    const id = nodeIdForResource(r.terraformType, r.name)
    addrToId.set(resourceAddress(r.terraformType, r.name), id)

    const label = r.name.replace(/_/g, '-')
    const baseData: AwsNodeData = {
      label,
      resourceType: appType,
      ...getDefaultNodeConfig(appType),
    }

    const attrs = r.attributes

    if (appType === 'vpc') {
      if (attrs.cidr_block) baseData.cidrBlock = attrs.cidr_block
      nodeById.set(id, {
        id,
        type: 'vpcGroup',
        position: { x: 0, y: 0 },
        style: { width: 560, height: 320 },
        data: baseData,
      })
      continue
    }

    let parentNode: string | undefined
    if (appType === 'subnet') {
      const ref = attrs.vpc_id ? parseTerraformResourceRef(attrs.vpc_id) : null
      if (ref) {
        parentNode = addrToId.get(resourceAddress(ref.terraformType, ref.name))
      }
      if (attrs.cidr_block) baseData.cidrBlock = attrs.cidr_block
      if (attrs.availability_zone) baseData.availabilityZone = attrs.availability_zone
      if (attrs.map_public_ip_on_launch === 'false') baseData.isPublicSubnet = false
      if (attrs.map_public_ip_on_launch === 'true') baseData.isPublicSubnet = true
    }

    if (appType === 'security-group') {
      const ref = attrs.vpc_id ? parseTerraformResourceRef(attrs.vpc_id) : null
      if (ref) {
        parentNode = addrToId.get(resourceAddress(ref.terraformType, ref.name))
      }
    }

    if (appType === 'ec2') {
      if (attrs.ami) baseData.ami = attrs.ami
      if (attrs.instance_type) baseData.instanceType = attrs.instance_type
      if (attrs.private_ip) baseData.privateIp = attrs.private_ip
    }

    if (appType === 'alb') {
      if (attrs.internal === 'true') baseData.albInternal = true
      if (attrs.internal === 'false') baseData.albInternal = false
    }

    if (appType === 's3' && attrs.bucket) {
      baseData.label = attrs.bucket.replace(/"/g, '')
    }

    if (appType === 'rds') {
      if (attrs.engine) {
        const e = attrs.engine.toLowerCase()
        if (e.includes('mysql')) baseData.rdsEngine = 'mysql'
        else baseData.rdsEngine = 'postgres'
      }
      if (attrs.db_name) baseData.dbName = attrs.db_name
      if (attrs.username) baseData.dbUsername = attrs.username
      if (attrs.password) baseData.dbPassword = attrs.password
      if (attrs.publicly_accessible === 'true') baseData.publiclyAccessible = true
      if (attrs.publicly_accessible === 'false') baseData.publiclyAccessible = false
    }

    if (appType === 'lambda') {
      const rt = attrs.runtime ? parseLambdaRuntime(attrs.runtime) : undefined
      if (rt) baseData.lambdaRuntime = rt
      if (attrs.handler) baseData.lambdaHandler = attrs.handler
      if (attrs.filename) baseData.lambdaFilename = attrs.filename
    }

    if (appType === 'api-gateway' && attrs.description) {
      baseData.apiDescription = attrs.description
    }

    if (appType === 'dynamodb') {
      if (attrs.name) baseData.dynamoTableName = attrs.name
      if (attrs.hash_key) baseData.dynamoHashKeyName = attrs.hash_key
    }

    if (appType === 'sqs') {
      if (attrs.name) baseData.sqsQueueName = attrs.name
      if (attrs.fifo_queue === 'true') baseData.sqsFifo = true
    }

    if (appType === 'iam-role' && attrs.name) {
      baseData.iamRoleName = attrs.name
    }

    if (appType === 'ecr-repo' && attrs.name) {
      baseData.ecrRepositoryName = attrs.name
    }
    if (appType === 'ecs-cluster' && attrs.name) {
      baseData.ecsClusterName = attrs.name
    }
    if (appType === 'eks-cluster') {
      if (attrs.name) baseData.eksClusterName = attrs.name
      if (attrs.version) baseData.eksKubernetesVersion = attrs.version
    }

    nodeById.set(id, {
      id,
      type: 'awsNode',
      position: { x: 0, y: 0 },
      parentNode,
      extent: parentNode ? 'parent' : undefined,
      data: baseData,
    })
  }

  for (const r of filtered) {
    if (SUPPORTED[r.terraformType] !== 'ec2') continue
    const id = nodeIdForResource(r.terraformType, r.name)
    const attrs = r.attributes
    const ref = attrs.subnet_id ? parseTerraformResourceRef(attrs.subnet_id) : null
    if (!ref) continue
    const subnetId = addrToId.get(resourceAddress(ref.terraformType, ref.name))
    const subnetNode = subnetId ? nodeById.get(subnetId) : undefined
    const parentNode = subnetNode?.parentNode ?? subnetId
    const n = nodeById.get(id)
    if (!n || !parentNode) continue
    nodeById.set(id, {
      ...n,
      parentNode,
      extent: 'parent',
    })
  }

  for (const r of filtered) {
    if (SUPPORTED[r.terraformType] !== 'lambda') continue
    const vpcCfg = r.vpcConfigAttrs
    if (!vpcCfg?.subnet_ids) continue
    const parts = parseBracketRefList(vpcCfg.subnet_ids)
    let parentVpc: string | undefined
    for (const p of parts) {
      const normalized = p.replace(/\.id\s*$/, '')
      const pr = parseTerraformResourceRef(normalized)
      if (!pr) continue
      const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
      const sn = sid ? nodeById.get(sid) : undefined
      if (sn?.parentNode) {
        parentVpc = sn.parentNode
        break
      }
    }
    const id = nodeIdForResource(r.terraformType, r.name)
    const n = nodeById.get(id)
    if (n && parentVpc) {
      nodeById.set(id, {
        ...n,
        parentNode: parentVpc,
        extent: 'parent',
      })
    }
  }

  for (const r of filtered) {
    if (SUPPORTED[r.terraformType] !== 'eks-cluster') continue
    const vpcCfg = r.vpcConfigAttrs
    if (!vpcCfg?.subnet_ids) continue
    const parts = parseBracketRefList(vpcCfg.subnet_ids)
    let parentVpc: string | undefined
    for (const p of parts) {
      const normalized = p.replace(/\.id\s*$/, '')
      const pr = parseTerraformResourceRef(normalized)
      if (!pr) continue
      const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
      const sn = sid ? nodeById.get(sid) : undefined
      if (sn?.parentNode) {
        parentVpc = sn.parentNode
        break
      }
    }
    const id = nodeIdForResource(r.terraformType, r.name)
    const n = nodeById.get(id)
    if (n && parentVpc) {
      nodeById.set(id, {
        ...n,
        parentNode: parentVpc,
        extent: 'parent',
      })
    }
  }

  for (const r of filtered) {
    if (SUPPORTED[r.terraformType] !== 'alb') continue
    const attrs = r.attributes
    if (!attrs.subnets) continue
    const parts = parseBracketRefList(attrs.subnets)
    const parentVpc = vpcParentFromSubnetTokens(parts, addrToId, nodeById)
    if (!parentVpc) continue
    const id = nodeIdForResource(r.terraformType, r.name)
    const n = nodeById.get(id)
    if (!n) continue
    nodeById.set(id, {
      ...n,
      parentNode: parentVpc,
      extent: 'parent',
    })
  }

  for (const r of filtered) {
    if (SUPPORTED[r.terraformType] !== 'rds') continue
    const attrs = r.attributes
    const rawSg = attrs.db_subnet_group_name?.trim()
    if (!rawSg) continue
    const normalized = rawSg.replace(/\.name\s*$/, '')
    const ref = parseTerraformResourceRef(normalized)
    if (!ref || ref.terraformType !== 'aws_db_subnet_group') continue
    const groupAddr = resourceAddress(ref.terraformType, ref.name)
    const subnetTokens = dbSubnetGroupRefs.get(groupAddr) ?? []
    const parentVpc = vpcParentFromSubnetTokens(subnetTokens, addrToId, nodeById)
    if (!parentVpc) continue
    const id = nodeIdForResource(r.terraformType, r.name)
    const n = nodeById.get(id)
    if (!n) continue
    nodeById.set(id, {
      ...n,
      parentNode: parentVpc,
      extent: 'parent',
    })
  }

  const nodes: Node<AwsNodeData>[] = []
  for (const r of filtered) {
    const id = nodeIdForResource(r.terraformType, r.name)
    const n = nodeById.get(id)
    if (n) nodes.push(n)
  }

  let awsProviderImportIndex = 0
  for (const p of providerBlocks) {
    if (p.providerName !== 'aws') continue
    awsProviderImportIndex += 1
    const logicalName = p.alias
      ? `${p.providerName}_${p.alias}`
      : `${p.providerName}_default_${awsProviderImportIndex}`
    const id = nodeIdForResource('terraform_provider', logicalName)
    const regionRaw = p.attributes.region?.replace(/^"|"$/g, '').trim()
    const label =
      p.alias && regionRaw
        ? `aws (${p.alias}) · ${regionRaw}`
        : p.alias
          ? `aws (${p.alias})`
          : regionRaw
            ? `aws · ${regionRaw}`
            : 'aws-provider'
    const baseData: AwsNodeData = {
      label,
      resourceType: 'aws-provider',
      ...getDefaultNodeConfig('aws-provider'),
      ...(regionRaw ? { awsProviderRegion: regionRaw } : {}),
      ...(p.alias ? { awsProviderAlias: p.alias } : {}),
    }
    nodes.push({
      id,
      type: 'awsNode',
      position: { x: 0, y: 0 },
      data: baseData,
    })
  }

  const edges: Edge[] = []
  let edgeSeq = 0
  const addEdge = (source: string, target: string) => {
    if (!source || !target || source === target) return
    if (edges.some((e) => e.source === source && e.target === target)) return
    edges.push({
      id: `imp-e-${edgeSeq++}`,
      type: 'default',
      source,
      target,
      animated: true,
    })
  }

  for (const r of filtered) {
    const appType = SUPPORTED[r.terraformType]!
    const id = nodeIdForResource(r.terraformType, r.name)
    const attrs = r.attributes

    if (appType === 'subnet') {
      const ref = attrs.vpc_id ? parseTerraformResourceRef(attrs.vpc_id) : null
      if (ref) {
        const vpcId = addrToId.get(resourceAddress(ref.terraformType, ref.name))
        if (vpcId) addEdge(vpcId, id)
      }
    }

    if (appType === 'security-group') {
      const ref = attrs.vpc_id ? parseTerraformResourceRef(attrs.vpc_id) : null
      if (ref) {
        const vpcId = addrToId.get(resourceAddress(ref.terraformType, ref.name))
        if (vpcId) addEdge(vpcId, id)
      }
    }

    if (appType === 'ec2') {
      const ref = attrs.subnet_id ? parseTerraformResourceRef(attrs.subnet_id) : null
      if (ref) {
        const sid = addrToId.get(resourceAddress(ref.terraformType, ref.name))
        if (sid) addEdge(sid, id)
      }
    }

    if (appType === 'alb' && attrs.subnets) {
      const parts = parseBracketRefList(attrs.subnets)
      for (const p of parts) {
        const normalized = p.replace(/\.id\s*$/, '')
        const pr = parseTerraformResourceRef(normalized)
        if (!pr) continue
        const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
        if (sid) addEdge(sid, id)
      }
    }

    if (appType === 'rds' && attrs.db_subnet_group_name) {
      const normalized = attrs.db_subnet_group_name.trim().replace(/\.name\s*$/, '')
      const ref = parseTerraformResourceRef(normalized)
      if (!ref || ref.terraformType !== 'aws_db_subnet_group') continue
      const tokens =
        dbSubnetGroupRefs.get(resourceAddress(ref.terraformType, ref.name)) ?? []
      for (const p of tokens) {
        const pn = p.replace(/\.id\s*$/, '')
        const pr = parseTerraformResourceRef(pn)
        if (!pr) continue
        const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
        if (sid) addEdge(sid, id)
      }
    }

    if (appType === 'lambda' && attrs.role) {
      const normalized = attrs.role.replace(/\.arn\s*$/, '')
      const ref = parseTerraformResourceRef(normalized)
      if (ref) {
        const rid = addrToId.get(resourceAddress(ref.terraformType, ref.name))
        if (rid) addEdge(rid, id)
      }
    }

    if (appType === 'lambda' && r.vpcConfigAttrs?.subnet_ids) {
      const parts = parseBracketRefList(r.vpcConfigAttrs.subnet_ids)
      for (const p of parts) {
        const normalized = p.replace(/\.id\s*$/, '')
        const pr = parseTerraformResourceRef(normalized)
        if (!pr) continue
        const sid = addrToId.get(resourceAddress(pr.terraformType, pr.name))
        if (sid) addEdge(sid, id)
      }
    }
  }

  addReconstructedSmartEdges(resources, addrToId, addEdge)

  return { nodes, edges }
}

export function terraformMainTfToDiagram(hcl: string): {
  nodes: Node<AwsNodeData>[]
  edges: Edge[]
} {
  const parsed = parseTerraformResources(hcl)
  const providers = parseTerraformProviders(hcl)
  return mapParsedResourcesToDiagram(parsed, providers)
}
