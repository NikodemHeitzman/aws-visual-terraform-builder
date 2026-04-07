import type { Edge, Node } from 'reactflow'
import type { AwsNodeData } from '../diagram/diagram-types'
import type { AwsResourceType } from '../diagram/aws-resources'
import {
  migrateSecurityGroupNodeData,
  ruleRowTfPortsProtocol,
} from '../diagram/security-group-rules'

type NodeMap = Map<string, Node<AwsNodeData>>
type TerraformFiles = { mainTf: string; variablesTf: string; outputsTf: string }

function toTfName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

/** Terraform resource block name — always from unique `node.id`, never user-editable label. */
function tfResourceId(node: Node<AwsNodeData>) {
  return toTfName(node.id)
}

function quoted(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function getByType(
  nodes: Node<AwsNodeData>[],
  resourceType: AwsResourceType,
): Node<AwsNodeData>[] {
  return nodes.filter((node) => node.data.resourceType === resourceType)
}

function incomingSources(nodeId: string, edges: Edge[], nodeMap: NodeMap) {
  return edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is Node<AwsNodeData> => Boolean(node))
}

function firstLinked(
  nodeId: string,
  edges: Edge[],
  nodeMap: NodeMap,
  allowed: AwsResourceType[],
) {
  return incomingSources(nodeId, edges, nodeMap).find((node) =>
    allowed.includes(node.data.resourceType),
  )
}

function parentVpc(node: Node<AwsNodeData>, nodeMap: NodeMap) {
  if (!node.parentNode) return undefined
  const parent = nodeMap.get(node.parentNode)
  if (!parent) return undefined
  return parent.data.resourceType === 'vpc' ? parent : undefined
}

function associatedVpc(node: Node<AwsNodeData>, edges: Edge[], nodeMap: NodeMap) {
  const fromParent = parentVpc(node, nodeMap)
  if (fromParent) return fromParent
  return firstLinked(node.id, edges, nodeMap, ['vpc'])
}

function associatedSubnet(node: Node<AwsNodeData>, edges: Edge[], nodeMap: NodeMap) {
  const linkedSubnet = firstLinked(node.id, edges, nodeMap, ['subnet'])
  if (linkedSubnet) return linkedSubnet

  const parent = parentVpc(node, nodeMap)
  if (!parent) return undefined

  return Array.from(nodeMap.values()).find(
    (candidate) =>
      candidate.data.resourceType === 'subnet' &&
      (candidate.parentNode === parent.id ||
        firstLinked(candidate.id, edges, nodeMap, ['vpc'])?.id === parent.id),
  )
}

function subnetsForVpc(
  vpc: Node<AwsNodeData>,
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
  nodeMap: NodeMap,
) {
  return nodes.filter((node) => {
    if (node.data.resourceType !== 'subnet') return false
    return associatedVpc(node, edges, nodeMap)?.id === vpc.id
  })
}

function linkedSecurityGroups(node: Node<AwsNodeData>, edges: Edge[], nodeMap: NodeMap) {
  return incomingSources(node.id, edges, nodeMap).filter(
    (candidate) => candidate.data.resourceType === 'security-group',
  )
}

function tfRef(node: Node<AwsNodeData>) {
  const tfType = terraformTypeFor(node.data.resourceType)
  return `${tfType}.${tfResourceId(node)}`
}

function terraformTypeFor(resourceType: AwsResourceType) {
  switch (resourceType) {
    case 'vpc':
      return 'aws_vpc'
    case 'subnet':
      return 'aws_subnet'
    case 'security-group':
      return 'aws_security_group'
    case 'ec2':
      return 'aws_instance'
    case 'alb':
      return 'aws_lb'
    case 's3':
      return 'aws_s3_bucket'
    case 'rds':
      return 'aws_db_instance'
    case 'lambda':
      return 'aws_lambda_function'
    case 'api-gateway':
      return 'aws_api_gateway_rest_api'
    case 'dynamodb':
      return 'aws_dynamodb_table'
    case 'sqs':
      return 'aws_sqs_queue'
    case 'iam-role':
      return 'aws_iam_role'
    case 'ecr-repo':
      return 'aws_ecr_repository'
    case 'ecs-cluster':
      return 'aws_ecs_cluster'
    case 'eks-cluster':
      return 'aws_eks_cluster'
    case 'aws-provider':
      return '__visual_only__'
  }
}

type SubnetRefsResult = {
  subnetRefs: string[]
  extraSubnetBlocks: string[]
}

function alternateAz(baseAz: string | undefined) {
  if (!baseAz) return 'us-east-1b'
  if (/[a-z]$/i.test(baseAz)) {
    return `${baseAz.slice(0, -1)}b`
  }
  return `${baseAz}b`
}

function pickNonConflictingAutoCidr(existingCidrs: string[]): string {
  const taken = new Set(existingCidrs.filter(Boolean).map((c) => c.trim()))
  const pool = [
    '10.0.250.0/24',
    '10.0.251.0/24',
    '10.0.252.0/24',
    '10.0.253.0/24',
    '10.0.249.0/24',
    '10.0.248.0/24',
    '10.0.247.0/24',
  ]
  return pool.find((c) => !taken.has(c)) ?? '10.0.245.0/24'
}

function ensureAtLeastTwoSubnetRefsForVpc(
  vpc: Node<AwsNodeData>,
  existingSubnets: Node<AwsNodeData>[],
  reason: 'rds' | 'alb' | 'eks',
): SubnetRefsResult {
  const vpcResourceId = tfResourceId(vpc)

  if (existingSubnets.length >= 2) {
    return {
      subnetRefs: existingSubnets.slice(0, 2).map((subnet) => `${tfRef(subnet)}.id`),
      extraSubnetBlocks: [],
    }
  }

  if (existingSubnets.length === 1) {
    const s = existingSubnets[0]
    const existingCidr = s.data.cidrBlock?.trim()
    const autoCidr = pickNonConflictingAutoCidr(existingCidr ? [existingCidr] : [])
    const firstAz = s.data.availabilityZone ?? 'us-east-1a'
    const secondAz = alternateAz(firstAz)
    const autoSubnetName = `${vpcResourceId}_${reason}_private_auto_b`
    const extraBlocks = [
      [
        `resource "aws_subnet" "${autoSubnetName}" {`,
        `  vpc_id                  = ${tfRef(vpc)}.id`,
        `  cidr_block              = ${quoted(autoCidr)}`,
        `  availability_zone       = ${quoted(secondAz)}`,
        `  map_public_ip_on_launch = false`,
        `  tags = {`,
        `    Name = ${quoted(`${vpcResourceId}-${reason}-auto-private-b`)}`,
        `  }`,
        `}`,
      ].join('\n'),
    ]
    return {
      subnetRefs: [`${tfRef(s)}.id`, `aws_subnet.${autoSubnetName}.id`],
      extraSubnetBlocks: extraBlocks,
    }
  }

  const firstAz = 'us-east-1a'
  const secondAz = 'us-east-1b'
  const autoSubnetNameA = `${vpcResourceId}_${reason}_private_auto_a`
  const autoSubnetNameB = `${vpcResourceId}_${reason}_private_auto_b`
  const extraBlocks = [
    [
      `resource "aws_subnet" "${autoSubnetNameA}" {`,
      `  vpc_id                  = ${tfRef(vpc)}.id`,
      `  cidr_block              = "10.0.249.0/24"`,
      `  availability_zone       = ${quoted(firstAz)}`,
      `  map_public_ip_on_launch = false`,
      `  tags = {`,
      `    Name = ${quoted(`${vpcResourceId}-${reason}-auto-private-a`)}`,
      `  }`,
      `}`,
    ].join('\n'),
    [
      `resource "aws_subnet" "${autoSubnetNameB}" {`,
      `  vpc_id                  = ${tfRef(vpc)}.id`,
      `  cidr_block              = "10.0.250.0/24"`,
      `  availability_zone       = ${quoted(secondAz)}`,
      `  map_public_ip_on_launch = false`,
      `  tags = {`,
      `    Name = ${quoted(`${vpcResourceId}-${reason}-auto-private-b`)}`,
      `  }`,
      `}`,
    ].join('\n'),
  ]

  return {
    subnetRefs: [`aws_subnet.${autoSubnetNameA}.id`, `aws_subnet.${autoSubnetNameB}.id`],
    extraSubnetBlocks: extraBlocks,
  }
}

function ensureAtLeastOneSubnetRefForVpc(
  vpc: Node<AwsNodeData>,
  existingSubnets: Node<AwsNodeData>[],
  reason: 'lambda',
) {
  if (existingSubnets.length > 0) {
    return {
      subnetRefs: existingSubnets.map((subnet) => `${tfRef(subnet)}.id`),
      extraSubnetBlocks: [] as string[],
    }
  }
  const vpcResourceId = tfResourceId(vpc)
  const autoSubnetName = `${vpcResourceId}_${reason}_auto_a`
  return {
    subnetRefs: [`aws_subnet.${autoSubnetName}.id`],
    extraSubnetBlocks: [
      [
        `resource "aws_subnet" "${autoSubnetName}" {`,
        `  vpc_id                  = ${tfRef(vpc)}.id`,
        `  cidr_block              = "10.0.248.0/24"`,
        `  availability_zone       = "us-east-1a"`,
        `  map_public_ip_on_launch = false`,
        `  tags = {`,
        `    Name = ${quoted(`${vpcResourceId}-${reason}-auto-a`)}`,
        `  }`,
        `}`,
      ].join('\n'),
    ],
  }
}

function renderVpc(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  return [
    `resource "aws_vpc" "${resourceId}" {`,
    `  cidr_block = ${quoted(node.data.cidrBlock ?? '10.0.0.0/16')}`,
    `  tags = {`,
    `    Name = ${quoted(displayName)}`,
    `  }`,
    `}`,
  ].join('\n')
}

function renderSubnet(node: Node<AwsNodeData>, edges: Edge[], nodeMap: NodeMap) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  const linkedVpc = associatedVpc(node, edges, nodeMap)
  const vpcIdRef = linkedVpc ? `${tfRef(linkedVpc)}.id` : 'aws_vpc.main.id'

  return [
    `resource "aws_subnet" "${resourceId}" {`,
    `  vpc_id                  = ${vpcIdRef}`,
    `  cidr_block              = ${quoted(node.data.cidrBlock ?? '10.0.1.0/24')}`,
    `  availability_zone       = ${quoted(node.data.availabilityZone ?? 'us-east-1a')}`,
    `  map_public_ip_on_launch = ${(node.data.isPublicSubnet ?? true) ? 'true' : 'false'}`,
    `  tags = {`,
    `    Name = ${quoted(displayName)}`,
    `  }`,
    `}`,
  ].join('\n')
}

function renderSecurityGroup(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  const linkedVpc = associatedVpc(node, edges, nodeMap)
  const vpcIdRef = linkedVpc ? `${tfRef(linkedVpc)}.id` : 'aws_vpc.main.id'
  const migrated = migrateSecurityGroupNodeData(node.data)
  const ingressRows = migrated.ingressRuleRows ?? []
  const egressRows = migrated.egressRuleRows ?? []

  const ingressBlocks = ingressRows.map((row) => {
    const parsed = ruleRowTfPortsProtocol(row)
    return [
      `  ingress {`,
      `    from_port   = ${parsed.fromPort}`,
      `    to_port     = ${parsed.toPort}`,
      `    protocol    = ${quoted(parsed.protocol)}`,
      `    cidr_blocks = [${quoted(row.cidr)}]`,
      `  }`,
    ].join('\n')
  })

  const egressBlocks = egressRows.map((row) => {
    const parsed = ruleRowTfPortsProtocol(row)
    return [
      `  egress {`,
      `    from_port   = ${parsed.fromPort}`,
      `    to_port     = ${parsed.toPort}`,
      `    protocol    = ${quoted(parsed.protocol)}`,
      `    cidr_blocks = [${quoted(row.cidr)}]`,
      `  }`,
    ].join('\n')
  })

  return [
    `resource "aws_security_group" "${resourceId}" {`,
    `  name   = ${quoted(displayName)}`,
    `  vpc_id = ${vpcIdRef}`,
    ...ingressBlocks,
    ...egressBlocks,
    `  tags = {`,
    `    Name = ${quoted(displayName)}`,
    `  }`,
    `}`,
  ].join('\n')
}

function renderEc2(node: Node<AwsNodeData>, edges: Edge[], nodeMap: NodeMap) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  const linkedSubnet = associatedSubnet(node, edges, nodeMap)
  const linkedIamRole = firstLinked(node.id, edges, nodeMap, ['iam-role'])
  const securityGroups = linkedSecurityGroups(node, edges, nodeMap)
  const subnetIdRef = linkedSubnet
    ? `${tfRef(linkedSubnet)}.id`
    : 'aws_subnet.public_subnet.id'
  const profileResourceId = `${resourceId}_instance_profile`

  const instanceProfileBlock = linkedIamRole
    ? [
        `resource "aws_iam_instance_profile" "${profileResourceId}" {`,
        `  name = ${quoted(`${resourceId}-instance-profile`)}`,
        `  role = aws_iam_role.${tfResourceId(linkedIamRole)}.name`,
        `}`,
        '',
      ].join('\n')
    : ''

  return [
    instanceProfileBlock,
    `resource "aws_instance" "${resourceId}" {`,
    `  ami           = ${quoted(node.data.ami ?? 'ami-0c55b159cbfafe1f0')}`,
    `  instance_type = ${quoted(node.data.instanceType ?? 't2.micro')}`,
    `  subnet_id     = ${subnetIdRef}`,
    ...(linkedIamRole
      ? [`  iam_instance_profile = aws_iam_instance_profile.${profileResourceId}.name`]
      : []),
    ...(securityGroups.length > 0
      ? [
          `  vpc_security_group_ids = [${securityGroups
            .map((sg) => `${tfRef(sg)}.id`)
            .join(', ')}]`,
        ]
      : []),
    ...(node.data.privateIp ? [`  private_ip    = ${quoted(node.data.privateIp)}`] : []),
    `  tags = {`,
    `    Name = ${quoted(displayName)}`,
    `  }`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function renderAlb(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
  nodes: Node<AwsNodeData>[],
) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  const vpc = associatedVpc(node, edges, nodeMap)
  const fallbackVpc = 'aws_vpc.main.id'
  const linkedVpcId = vpc ? `${tfRef(vpc)}.id` : fallbackVpc
  const linkedVpcSubnets = vpc ? subnetsForVpc(vpc, nodes, edges, nodeMap) : []
  const fallbackSubnetB = `${resourceId}_public_subnet_b`
  const ensured = vpc
    ? ensureAtLeastTwoSubnetRefsForVpc(vpc, linkedVpcSubnets, 'alb')
    : {
        subnetRefs: ['aws_subnet.public_subnet.id', `aws_subnet.${fallbackSubnetB}.id`],
        extraSubnetBlocks: [
          [
            `resource "aws_subnet" "${fallbackSubnetB}" {`,
            `  vpc_id            = aws_vpc.main.id`,
            `  cidr_block        = "10.0.2.0/24"`,
            `  availability_zone = "us-east-1b"`,
            `}`,
          ].join('\n'),
        ] as string[],
      }
  const sgName = `${resourceId}_lb_sg`

  return [
    ...ensured.extraSubnetBlocks,
    [
      `resource "aws_security_group" "${sgName}" {`,
      `  name   = ${quoted(`${resourceId}-lb-sg`)}`,
      `  vpc_id = ${linkedVpcId}`,
      `  ingress {`,
      `    from_port   = 80`,
      `    to_port     = 80`,
      `    protocol    = "tcp"`,
      `    cidr_blocks = ["0.0.0.0/0"]`,
      `  }`,
      `  egress {`,
      `    from_port   = 0`,
      `    to_port     = 0`,
      `    protocol    = "-1"`,
      `    cidr_blocks = ["0.0.0.0/0"]`,
      `  }`,
      `}`,
      '',
      `resource "aws_lb" "${resourceId}" {`,
      `  name               = ${quoted(displayName)}`,
      `  internal           = ${node.data.albInternal ? 'true' : 'false'}`,
      `  load_balancer_type = "application"`,
      `  security_groups    = [aws_security_group.${sgName}.id]`,
      `  subnets            = [${ensured.subnetRefs.join(', ')}]`,
      `}`,
      '',
      `resource "aws_lb_target_group" "${resourceId}_tg" {`,
      `  name     = ${quoted(`${resourceId}-tg`)}`,
      `  port     = 80`,
      `  protocol = "HTTP"`,
      `  vpc_id   = ${linkedVpcId}`,
      `}`,
      '',
      `resource "aws_lb_listener" "${resourceId}_listener" {`,
      `  load_balancer_arn = aws_lb.${resourceId}.arn`,
      `  port              = "80"`,
      `  protocol          = "HTTP"`,
      `  default_action {`,
      `    type             = "forward"`,
      `    target_group_arn = aws_lb_target_group.${resourceId}_tg.arn`,
      `  }`,
      `}`,
    ].join('\n'),
  ].join('\n\n')
}

function renderS3(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const bucketLabel = node.data.label || resourceId
  const acl = node.data.bucketPrivacy === 'public-read' ? 'public-read' : 'private'

  return [
    `resource "aws_s3_bucket" "${resourceId}" {`,
    `  bucket = ${quoted(bucketLabel)}`,
    `  tags = {`,
    `    Name = ${quoted(bucketLabel)}`,
    `  }`,
    `}`,
    '',
    `resource "aws_s3_bucket_acl" "${resourceId}_acl" {`,
    `  bucket = aws_s3_bucket.${resourceId}.id`,
    `  acl    = ${quoted(acl)}`,
    `}`,
  ].join('\n')
}

function renderRds(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
  nodes: Node<AwsNodeData>[],
) {
  const resourceId = tfResourceId(node)
  const engine = node.data.rdsEngine ?? 'postgres'
  const securityGroups = linkedSecurityGroups(node, edges, nodeMap)
  const vpc = associatedVpc(node, edges, nodeMap)
  const fallbackSubnetRef = 'aws_subnet.public_subnet.id'
  const fallbackSubnetB = `${resourceId}_public_subnet_b`

  const ensured = vpc
    ? ensureAtLeastTwoSubnetRefsForVpc(vpc, subnetsForVpc(vpc, nodes, edges, nodeMap), 'rds')
    : {
        subnetRefs: [fallbackSubnetRef, `aws_subnet.${fallbackSubnetB}.id`],
        extraSubnetBlocks: [
          [
            `resource "aws_subnet" "${fallbackSubnetB}" {`,
            `  vpc_id            = aws_vpc.main.id`,
            `  cidr_block        = "10.0.2.0/24"`,
            `  availability_zone = "us-east-1b"`,
            `}`,
          ].join('\n'),
        ] as string[],
      }

  return [
    ...ensured.extraSubnetBlocks,
    [
      `resource "aws_db_subnet_group" "${resourceId}_subnets" {`,
      `  name       = ${quoted(`${resourceId}-subnets`)}`,
      `  subnet_ids = [${ensured.subnetRefs.join(', ')}]`,
      `}`,
      '',
      `resource "aws_db_instance" "${resourceId}" {`,
      `  allocated_storage    = 20`,
      `  engine               = ${quoted(engine)}`,
      `  instance_class       = "db.t3.micro"`,
      `  db_subnet_group_name = aws_db_subnet_group.${resourceId}_subnets.name`,
      ...(securityGroups.length > 0
        ? [
            `  vpc_security_group_ids = [${securityGroups
              .map((sg) => `${tfRef(sg)}.id`)
              .join(', ')}]`,
          ]
        : []),
      `  db_name              = ${quoted(node.data.dbName ?? 'appdb')}`,
      `  username             = var.${resourceId}_db_username`,
      `  password             = var.${resourceId}_db_password`,
      `  skip_final_snapshot  = true`,
      `  publicly_accessible  = ${node.data.publiclyAccessible ? 'true' : 'false'}`,
      `}`,
    ].join('\n'),
  ].join('\n\n')
}

function renderLambda(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
  nodes: Node<AwsNodeData>[],
) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  const linkedIamRole = firstLinked(node.id, edges, nodeMap, ['iam-role'])
  const generatedRoleName = `${resourceId}_exec_role`
  const roleAttachName = `${resourceId}_basic_exec`
  const parent = parentVpc(node, nodeMap)
  const lambdaVpc = parent ?? associatedVpc(node, edges, nodeMap)
  const lambdaVpcSubnets = lambdaVpc ? subnetsForVpc(lambdaVpc, nodes, edges, nodeMap) : []
  const ensured = lambdaVpc
    ? ensureAtLeastOneSubnetRefForVpc(lambdaVpc, lambdaVpcSubnets, 'lambda')
    : { subnetRefs: [], extraSubnetBlocks: [] as string[] }
  const lambdaDefaultSgName = `${resourceId}_default_sg`

  const roleArnLine = linkedIamRole
    ? `  role          = aws_iam_role.${tfResourceId(linkedIamRole)}.arn`
    : `  role          = aws_iam_role.${generatedRoleName}.arn`

  const builtinRoleBlocks = linkedIamRole
    ? []
    : [
        `resource "aws_iam_role" "${generatedRoleName}" {`,
        `  name = ${quoted(`${resourceId}-lambda-exec-role`)}`,
        `  assume_role_policy = jsonencode({`,
        `    Version = "2012-10-17"`,
        `    Statement = [{`,
        `      Action = "sts:AssumeRole"`,
        `      Effect = "Allow"`,
        `      Principal = { Service = "lambda.amazonaws.com" }`,
        `    }]`,
        `  })`,
        `}`,
        '',
        `resource "aws_iam_role_policy_attachment" "${roleAttachName}" {`,
        `  role       = aws_iam_role.${generatedRoleName}.name`,
        `  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"`,
        `}`,
      ]

  const vpcSgBlocks = lambdaVpc
    ? [
        '',
        `resource "aws_security_group" "${lambdaDefaultSgName}" {`,
        `  name   = ${quoted(`${resourceId}-lambda-default-sg`)}`,
        `  vpc_id = ${tfRef(lambdaVpc)}.id`,
        `  egress {`,
        `    from_port   = 0`,
        `    to_port     = 0`,
        `    protocol    = "-1"`,
        `    cidr_blocks = ["0.0.0.0/0"]`,
        `  }`,
        `}`,
      ]
    : []

  return [
    ...ensured.extraSubnetBlocks,
    [...builtinRoleBlocks, ...vpcSgBlocks, '', `resource "aws_lambda_function" "${resourceId}" {`,
      `  function_name = ${quoted(displayName)}`,
      `  runtime       = ${quoted(node.data.lambdaRuntime ?? 'nodejs20.x')}`,
      roleArnLine,
      `  handler       = ${quoted(node.data.lambdaHandler ?? 'index.handler')}`,
      `  filename      = ${quoted(node.data.lambdaFilename ?? 'lambda.zip')}`,
      ...(lambdaVpc
        ? [
            `  vpc_config {`,
            `    subnet_ids         = [${ensured.subnetRefs.join(', ')}]`,
            `    security_group_ids = [aws_security_group.${lambdaDefaultSgName}.id]`,
            `  }`,
          ]
        : []),
      `}`,
    ].join('\n'),
  ].join('\n\n')
}

function renderApiGateway(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const displayName = node.data.label || resourceId
  return [
    `resource "aws_api_gateway_rest_api" "${resourceId}" {`,
    `  name        = ${quoted(displayName)}`,
    `  description = ${quoted(node.data.apiDescription ?? 'API Gateway created from visual builder')}`,
    `}`,
  ].join('\n')
}

function renderDynamoDb(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const tableName = node.data.dynamoTableName ?? node.data.label ?? node.id
  const hashKeyName = node.data.dynamoHashKeyName ?? 'id'
  const hashKeyType = node.data.dynamoHashKeyType ?? 'S'
  return [
    `resource "aws_dynamodb_table" "${resourceId}" {`,
    `  name         = ${quoted(tableName)}`,
    `  billing_mode = "PAY_PER_REQUEST"`,
    `  hash_key     = ${quoted(hashKeyName)}`,
    `  attribute {`,
    `    name = ${quoted(hashKeyName)}`,
    `    type = ${quoted(hashKeyType)}`,
    `  }`,
    `}`,
  ].join('\n')
}

function renderSqs(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const baseQueueName = node.data.sqsQueueName ?? node.data.label ?? 'queue'
  const isFifo = Boolean(node.data.sqsFifo)
  const queueName = isFifo && !baseQueueName.endsWith('.fifo')
    ? `${baseQueueName}.fifo`
    : baseQueueName
  return [
    `resource "aws_sqs_queue" "${resourceId}" {`,
    `  name       = ${quoted(queueName)}`,
    `  fifo_queue = ${isFifo ? 'true' : 'false'}`,
    `}`,
  ].join('\n')
}

function renderIamRole(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const roleName = node.data.iamRoleName ?? node.data.label ?? node.id
  const principal = node.data.iamServicePrincipal ?? 'ec2.amazonaws.com'
  return [
    `resource "aws_iam_role" "${resourceId}" {`,
    `  name = ${quoted(roleName)}`,
    `  assume_role_policy = jsonencode({`,
    `    Version = "2012-10-17"`,
    `    Statement = [{`,
    `      Action = "sts:AssumeRole"`,
    `      Effect = "Allow"`,
    `      Principal = { Service = ${quoted(principal)} }`,
    `    }]`,
    `  })`,
    `}`,
  ].join('\n')
}

function renderEcr(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const repoName = node.data.ecrRepositoryName ?? node.data.label ?? 'my-app-repo'
  return [
    `resource "aws_ecr_repository" "${resourceId}" {`,
    `  name                 = ${quoted(repoName)}`,
    `  force_destroy        = true`,
    `  image_tag_mutability = "MUTABLE"`,
    `}`,
  ].join('\n')
}

function renderEcs(node: Node<AwsNodeData>) {
  const resourceId = tfResourceId(node)
  const clusterName = node.data.ecsClusterName ?? node.data.label ?? 'app-cluster'
  return [
    `resource "aws_ecs_cluster" "${resourceId}" {`,
    `  name = ${quoted(clusterName)}`,
    `}`,
  ].join('\n')
}

function renderEks(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
  nodes: Node<AwsNodeData>[],
) {
  const resourceId = tfResourceId(node)
  const clusterName = node.data.eksClusterName ?? node.data.label ?? 'k8s-cluster'
  const k8sVersion = node.data.eksKubernetesVersion ?? '1.28'
  const roleResourceId = `${resourceId}_eks_cluster_role`
  const attachResourceId = `${resourceId}_eks_cluster_policy_attach`

  const parent = parentVpc(node, nodeMap)
  const eksVpc = parent ?? associatedVpc(node, edges, nodeMap)
  const linkedVpcSubnets = eksVpc ? subnetsForVpc(eksVpc, nodes, edges, nodeMap) : []
  const fallbackSubnetB = `${resourceId}_eks_subnet_b`

  const ensured = eksVpc
    ? ensureAtLeastTwoSubnetRefsForVpc(eksVpc, linkedVpcSubnets, 'eks')
    : {
        subnetRefs: ['aws_subnet.public_subnet.id', `aws_subnet.${fallbackSubnetB}.id`],
        extraSubnetBlocks: [
          [
            `resource "aws_subnet" "${fallbackSubnetB}" {`,
            `  vpc_id            = aws_vpc.main.id`,
            `  cidr_block        = "10.0.2.0/24"`,
            `  availability_zone = "us-east-1b"`,
            `}`,
          ].join('\n'),
        ] as string[],
      }

  const roleAndCluster = [
    `resource "aws_iam_role" "${roleResourceId}" {`,
    `  name = ${quoted(`${resourceId}-eks-cluster-role`)}`,
    `  assume_role_policy = jsonencode({`,
    `    Version = "2012-10-17"`,
    `    Statement = [{`,
    `      Action = "sts:AssumeRole"`,
    `      Effect = "Allow"`,
    `      Principal = { Service = "eks.amazonaws.com" }`,
    `    }]`,
    `  })`,
    `}`,
    ``,
    `resource "aws_iam_role_policy_attachment" "${attachResourceId}" {`,
    `  role       = aws_iam_role.${roleResourceId}.name`,
    `  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"`,
    `}`,
    ``,
    `resource "aws_eks_cluster" "${resourceId}" {`,
    `  name     = ${quoted(clusterName)}`,
    `  role_arn = aws_iam_role.${roleResourceId}.arn`,
    `  version  = ${quoted(k8sVersion)}`,
    ``,
    `  vpc_config {`,
    `    subnet_ids = [${ensured.subnetRefs.join(', ')}]`,
    `  }`,
    ``,
    `  depends_on = [aws_iam_role_policy_attachment.${attachResourceId}]`,
    `}`,
  ].join('\n')

  return [...ensured.extraSubnetBlocks, roleAndCluster].join('\n\n')
}

function renderNode(
  node: Node<AwsNodeData>,
  edges: Edge[],
  nodeMap: NodeMap,
  nodes: Node<AwsNodeData>[],
) {
  switch (node.data.resourceType) {
    case 'vpc':
      return renderVpc(node)
    case 'subnet':
      return renderSubnet(node, edges, nodeMap)
    case 'security-group':
      return renderSecurityGroup(node, edges, nodeMap)
    case 'ec2':
      return renderEc2(node, edges, nodeMap)
    case 'alb':
      return renderAlb(node, edges, nodeMap, nodes)
    case 's3':
      return renderS3(node)
    case 'rds':
      return renderRds(node, edges, nodeMap, nodes)
    case 'lambda':
      return renderLambda(node, edges, nodeMap, nodes)
    case 'api-gateway':
      return renderApiGateway(node)
    case 'dynamodb':
      return renderDynamoDb(node)
    case 'sqs':
      return renderSqs(node)
    case 'iam-role':
      return renderIamRole(node)
    case 'ecr-repo':
      return renderEcr(node)
    case 'ecs-cluster':
      return renderEcs(node)
    case 'eks-cluster':
      return renderEks(node, edges, nodeMap, nodes)
    case 'aws-provider':
      return ''
  }
}

/** Terraform-safe label derived from edge id (for aws_lambda_permission etc.). */
function tfEdgeIntegrationId(edge: Edge) {
  return toTfName(edge.id)
}

function renderApiGatewayToLambdaEdge(
  apiNode: Node<AwsNodeData>,
  lambdaNode: Node<AwsNodeData>,
  edge: Edge,
) {
  const eid = tfEdgeIntegrationId(edge)
  const apiTf = tfResourceId(apiNode)
  const lambdaTf = tfResourceId(lambdaNode)
  const permName = `apigw_to_lambda_${eid}`
  const segmentName = `${eid}_apigw_segment`
  const proxyName = `${eid}_apigw_proxy`
  const methodName = `${eid}_apigw_any`
  const integrationName = `${eid}_apigw_lambda_integration`

  return [
    `resource "aws_lambda_permission" "${permName}" {`,
    `  statement_id  = ${quoted(`AllowAPIGateway_${eid}`)}`,
    `  action        = "lambda:InvokeFunction"`,
    `  function_name = aws_lambda_function.${lambdaTf}.function_name`,
    `  principal     = "apigateway.amazonaws.com"`,
    `  source_arn    = "\${aws_api_gateway_rest_api.${apiTf}.execution_arn}/*/*"`,
    `}`,
    ``,
    `resource "aws_api_gateway_resource" "${segmentName}" {`,
    `  rest_api_id = aws_api_gateway_rest_api.${apiTf}.id`,
    `  parent_id   = aws_api_gateway_rest_api.${apiTf}.root_resource_id`,
    `  path_part   = ${quoted(`i_${eid}`)}`,
    `}`,
    ``,
    `resource "aws_api_gateway_resource" "${proxyName}" {`,
    `  rest_api_id = aws_api_gateway_rest_api.${apiTf}.id`,
    `  parent_id   = aws_api_gateway_resource.${segmentName}.id`,
    `  path_part   = "{proxy+}"`,
    `}`,
    ``,
    `resource "aws_api_gateway_method" "${methodName}" {`,
    `  rest_api_id   = aws_api_gateway_rest_api.${apiTf}.id`,
    `  resource_id   = aws_api_gateway_resource.${proxyName}.id`,
    `  http_method   = "ANY"`,
    `  authorization = "NONE"`,
    `}`,
    ``,
    `resource "aws_api_gateway_integration" "${integrationName}" {`,
    `  rest_api_id = aws_api_gateway_rest_api.${apiTf}.id`,
    `  resource_id = aws_api_gateway_resource.${proxyName}.id`,
    `  http_method = aws_api_gateway_method.${methodName}.http_method`,
    ``,
    `  integration_http_method = "POST"`,
    `  type                    = "AWS_PROXY"`,
    `  uri                     = aws_lambda_function.${lambdaTf}.invoke_arn`,
    ``,
    `  depends_on = [aws_lambda_permission.${permName}]`,
    `}`,
  ].join('\n')
}

function renderS3ToSqsIntegrationBlocks(
  edges: Edge[],
  nodeMap: NodeMap,
): string[] {
  const s3sqs = edges.filter((edge) => {
    const s = nodeMap.get(edge.source)
    const t = nodeMap.get(edge.target)
    return s?.data.resourceType === 's3' && t?.data.resourceType === 'sqs'
  })
  if (s3sqs.length === 0) return []

  const bucketToQueues = new Map<string, Set<string>>()
  const queueToBuckets = new Map<string, Set<string>>()

  for (const edge of s3sqs) {
    if (!bucketToQueues.has(edge.source)) bucketToQueues.set(edge.source, new Set())
    bucketToQueues.get(edge.source)!.add(edge.target)
    if (!queueToBuckets.has(edge.target)) queueToBuckets.set(edge.target, new Set())
    queueToBuckets.get(edge.target)!.add(edge.source)
  }

  const parts: string[] = []

  for (const [queueId, bucketIds] of queueToBuckets) {
    const queueNode = nodeMap.get(queueId)
    if (!queueNode) continue
    const qTf = tfResourceId(queueNode)
    const policyName = `${qTf}_s3_send_policy`
    const statementLines = [...bucketIds].map((bid) => {
      const bTf = tfResourceId(nodeMap.get(bid)!)
      return [
        `    {`,
        `      Sid       = ${quoted(`S3Send_${bTf}`)}`,
        `      Effect    = "Allow"`,
        `      Principal = { Service = "s3.amazonaws.com" }`,
        `      Action    = "sqs:SendMessage"`,
        `      Resource  = aws_sqs_queue.${qTf}.arn`,
        `      Condition = {`,
        `        ArnEquals = { "aws:SourceArn" = aws_s3_bucket.${bTf}.arn }`,
        `      }`,
        `    },`,
      ].join('\n')
    })

    parts.push(
      [
        `resource "aws_sqs_queue_policy" "${policyName}" {`,
        `  queue_url = aws_sqs_queue.${qTf}.id`,
        `  policy = jsonencode({`,
        `    Version   = "2012-10-17"`,
        `    Statement = [`,
        ...statementLines,
        `    ]`,
        `  })`,
        `}`,
      ].join('\n'),
    )
  }

  for (const [bucketId, queueIds] of bucketToQueues) {
    const bucketNode = nodeMap.get(bucketId)
    if (!bucketNode) continue
    const bTf = tfResourceId(bucketNode)
    const notifName = `${bTf}_s3_to_sqs_notification`
    const queueBlocks = [...queueIds].map((qid) => {
      const qTf = tfResourceId(nodeMap.get(qid)!)
      return [
        `  queue {`,
        `    queue_arn     = aws_sqs_queue.${qTf}.arn`,
        `    events        = ["s3:ObjectCreated:*"]`,
        `  }`,
      ].join('\n')
    })
    const policyNames = [...queueIds]
      .map((qid) => `${tfResourceId(nodeMap.get(qid)!)}_s3_send_policy`)
      .map((name) => `aws_sqs_queue_policy.${name}`)

    parts.push(
      [
        `resource "aws_s3_bucket_notification" "${notifName}" {`,
        `  bucket = aws_s3_bucket.${bTf}.id`,
        ``,
        ...queueBlocks,
        ``,
        `  depends_on = [${policyNames.join(', ')}]`,
        `}`,
      ].join('\n'),
    )
  }

  return parts
}

function renderSmartEdgeBlocks(edges: Edge[], nodeMap: NodeMap): string {
  const chunks: string[] = []

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    if (!sourceNode || !targetNode) continue

    if (
      sourceNode.data.resourceType === 'api-gateway' &&
      targetNode.data.resourceType === 'lambda'
    ) {
      chunks.push(renderApiGatewayToLambdaEdge(sourceNode, targetNode, edge))
    }
  }

  chunks.push(...renderS3ToSqsIntegrationBlocks(edges, nodeMap))

  return chunks.filter(Boolean).join('\n\n')
}

function renderNetworkScaffolding(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
  nodeMap: NodeMap,
) {
  const vpcs = getByType(nodes, 'vpc')
  const subnets = getByType(nodes, 'subnet')
  const parts: string[] = []

  vpcs.forEach((vpc) => {
    const vpcResourceId = tfResourceId(vpc)
    const igwName = `${vpcResourceId}_igw`
    parts.push(
      [
        `resource "aws_internet_gateway" "${igwName}" {`,
        `  vpc_id = ${tfRef(vpc)}.id`,
        `}`,
      ].join('\n'),
    )

    subnets
      .filter((subnet) => {
        const subnetVpc = associatedVpc(subnet, edges, nodeMap)
        return subnetVpc?.id === vpc.id && (subnet.data.isPublicSubnet ?? true)
      })
      .forEach((subnet) => {
        const subnetResourceId = tfResourceId(subnet)
        const routeTableName = `${subnetResourceId}_rt`
        parts.push(
          [
            `resource "aws_route_table" "${routeTableName}" {`,
            `  vpc_id = ${tfRef(vpc)}.id`,
            `  route {`,
            `    cidr_block = "0.0.0.0/0"`,
            `    gateway_id = aws_internet_gateway.${igwName}.id`,
            `  }`,
            `}`,
            '',
            `resource "aws_route_table_association" "${subnetResourceId}_rta" {`,
            `  subnet_id      = ${tfRef(subnet)}.id`,
            `  route_table_id = aws_route_table.${routeTableName}.id`,
            `}`,
          ].join('\n'),
        )
      })
  })

  return parts
}

export function generateTerraformFiles(
  nodes: Node<AwsNodeData>[],
  edges: Edge[],
): TerraformFiles {
  const nodeMap: NodeMap = new Map(nodes.map((node) => [node.id, node]))
  const blocks = nodes.map((node) => renderNode(node, edges, nodeMap, nodes))
  const networkBlocks = renderNetworkScaffolding(nodes, edges, nodeMap)
  const hasVpc = getByType(nodes, 'vpc').length > 0
  const hasSubnet = getByType(nodes, 'subnet').length > 0
  const ec2Nodes = getByType(nodes, 'ec2')
  const rdsNodes = getByType(nodes, 'rds')

  const fallback = [
    !hasVpc
      ? `resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}\n`
      : '',
    !hasSubnet
      ? `resource "aws_subnet" "public_subnet" {\n  vpc_id = aws_vpc.main.id\n  cidr_block = "10.0.1.0/24"\n}\n`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const mainTf = [
    `terraform {`,
    `  required_version = ">= 1.5.0"`,
    `  backend "s3" {`,
    `    bucket  = "company-terraform-state-bucket"`,
    `    key     = "platform/env/terraform.tfstate"`,
    `    region  = "eu-central-1"`,
    `    encrypt = true`,
    `  }`,
    `  required_providers {`,
    `    aws = {`,
    `      source  = "hashicorp/aws"`,
    `      version = "~> 5.0"`,
    `    }`,
    `  }`,
    `}`,
    ``,
    `provider "aws" {`,
    `  region = var.aws_region`,
    `}`,
    ``,
    fallback,
    blocks.join('\n\n'),
    networkBlocks.join('\n\n'),
    renderSmartEdgeBlocks(edges, nodeMap),
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const variableBlocks = [
    `variable "aws_region" {`,
    `  type    = string`,
    `  default = "us-east-1"`,
    `}`,
    '',
    ...rdsNodes.flatMap((node) => {
      const resourceId = tfResourceId(node)
      return [
        `variable "${resourceId}_db_username" {`,
        `  type    = string`,
        `  default = ${quoted(node.data.dbUsername ?? 'admin')}`,
        `}`,
        '',
        `variable "${resourceId}_db_password" {`,
        `  type      = string`,
        `  sensitive = true`,
        `  default   = ${quoted(node.data.dbPassword ?? 'replace_me_securely')}`,
        `}`,
        '',
      ]
    }),
  ]
    .filter(Boolean)
    .join('\n')

  const outputsTf = [
    ...ec2Nodes.map((node) => {
      const resourceId = tfResourceId(node)
      return [
        `output "${resourceId}_public_ip" {`,
        `  value = aws_instance.${resourceId}.public_ip`,
        `}`,
      ].join('\n')
    }),
  ].join('\n\n')

  return { mainTf, variablesTf: variableBlocks, outputsTf }
}

export function generateTerraform(nodes: Node<AwsNodeData>[], edges: Edge[]) {
  return generateTerraformFiles(nodes, edges).mainTf
}
