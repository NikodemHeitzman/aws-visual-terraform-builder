import type { AwsResourceType } from './aws-resources'

export type S3BucketPrivacy = 'private' | 'public-read'
export type RdsEngine = 'postgres' | 'mysql'
export type LambdaRuntime = 'nodejs20.x' | 'python3.12'
export type DynamoHashKeyType = 'S' | 'N' | 'B'

/** One row in the Security Group rules table (ingress / egress). */
export type SecurityGroupRuleRow = {
  id: string
  allTraffic: boolean
  protocol: 'tcp' | 'udp'
  fromPort: number
  toPort: number
  cidr: string
}

export type AwsNodeData = {
  label: string
  resourceType: AwsResourceType
  cidrBlock?: string
  availabilityZone?: string
  isPublicSubnet?: boolean
  ingressRuleRows?: SecurityGroupRuleRow[]
  egressRuleRows?: SecurityGroupRuleRow[]
  /** @deprecated Use ingressRuleRows; still read when loading old JSON */
  ingressRules?: string
  /** @deprecated Use egressRuleRows */
  egressRules?: string
  ami?: string
  instanceType?: string
  privateIp?: string
  albInternal?: boolean
  bucketPrivacy?: S3BucketPrivacy
  rdsEngine?: RdsEngine
  dbName?: string
  dbUsername?: string
  dbPassword?: string
  publiclyAccessible?: boolean
  lambdaRuntime?: LambdaRuntime
  lambdaHandler?: string
  lambdaFilename?: string
  apiDescription?: string
  dynamoTableName?: string
  dynamoHashKeyName?: string
  dynamoHashKeyType?: DynamoHashKeyType
  sqsQueueName?: string
  sqsFifo?: boolean
  iamRoleName?: string
  iamServicePrincipal?: string
  ecrRepositoryName?: string
  ecsClusterName?: string
  eksClusterName?: string
  eksKubernetesVersion?: string
  /** Visual only — maps from `provider "aws"` import; not emitted as duplicate HCL by default. */
  awsProviderRegion?: string
  awsProviderAlias?: string
  /** VPC container fill (CSS color); used by vpcGroup node + properties panel */
  backgroundColor?: string
  /** Transient UI hint after invalid drop near VPC */
  flashInvalidPlacement?: boolean
}
