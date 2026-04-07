import type { LucideIcon } from 'lucide-react'
import { defaultEgressRuleRows, defaultIngressRuleRows } from './security-group-rules'
import {
  Box,
  Database,
  FunctionSquare,
  Globe,
  HardDrive,
  Hexagon,
  Key,
  LayoutGrid,
  Mail,
  Network,
  Package,
  Server,
} from 'lucide-react'

export type AwsResourceType =
  | 'vpc'
  | 'subnet'
  | 'security-group'
  | 'ec2'
  | 'alb'
  | 's3'
  | 'rds'
  | 'lambda'
  | 'api-gateway'
  | 'dynamodb'
  | 'sqs'
  | 'iam-role'
  | 'ecr-repo'
  | 'ecs-cluster'
  | 'eks-cluster'
  | 'aws-provider'

export type AwsResourceDefinition = {
  type: AwsResourceType
  label: string
  Icon: LucideIcon
  accentClassName: string
}

export const RESOURCE_DND_MIME = 'application/aws-resource-type'

const VPC_ALLOWED_RESOURCE_TYPES: AwsResourceType[] = [
  'vpc',
  'subnet',
  'security-group',
  'ec2',
  'alb',
  'rds',
  'lambda',
  'ecs-cluster',
  'eks-cluster',
]

export const AWS_RESOURCES: AwsResourceDefinition[] = [
  {
    type: 'aws-provider',
    label: 'AWS Provider',
    Icon: Globe,
    accentClassName: 'bg-slate-50 text-slate-800 border-slate-300 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-600',
  },
  {
    type: 'vpc',
    label: 'VPC',
    Icon: Network,
    accentClassName: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    type: 'subnet',
    label: 'Subnet',
    Icon: Box,
    accentClassName: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  {
    type: 'security-group',
    label: 'Security Group',
    Icon: Box,
    accentClassName: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  },
  {
    type: 'ec2',
    label: 'EC2 Instance',
    Icon: Server,
    accentClassName: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    type: 'alb',
    label: 'Application Load Balancer',
    Icon: Network,
    accentClassName: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    type: 's3',
    label: 'S3 Bucket',
    Icon: HardDrive,
    accentClassName: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    type: 'rds',
    label: 'RDS Database',
    Icon: Database,
    accentClassName: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    type: 'lambda',
    label: 'Lambda Function',
    Icon: FunctionSquare,
    accentClassName: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    type: 'api-gateway',
    label: 'API Gateway',
    Icon: Globe,
    accentClassName: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    type: 'dynamodb',
    label: 'DynamoDB Table',
    Icon: Database,
    accentClassName: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    type: 'sqs',
    label: 'SQS Queue',
    Icon: Mail,
    accentClassName: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  {
    type: 'iam-role',
    label: 'IAM Role',
    Icon: Key,
    accentClassName: 'bg-stone-50 text-stone-700 border-stone-200',
  },
  {
    type: 'ecr-repo',
    label: 'ECR Repository',
    Icon: Package,
    accentClassName: 'bg-red-50 text-red-800 border-red-200',
  },
  {
    type: 'ecs-cluster',
    label: 'ECS Cluster',
    Icon: LayoutGrid,
    accentClassName: 'bg-lime-50 text-lime-900 border-lime-200',
  },
  {
    type: 'eks-cluster',
    label: 'EKS Cluster',
    Icon: Hexagon,
    accentClassName: 'bg-purple-50 text-purple-900 border-purple-200',
  },
]

export const AWS_RESOURCE_BY_TYPE = Object.fromEntries(
  AWS_RESOURCES.map((resource) => [resource.type, resource]),
) as Record<AwsResourceType, AwsResourceDefinition>

export function isAwsResourceType(value: string): value is AwsResourceType {
  return value in AWS_RESOURCE_BY_TYPE
}

export function isAllowedInVpc(resourceType: AwsResourceType) {
  return VPC_ALLOWED_RESOURCE_TYPES.includes(resourceType)
}

export function createDefaultResourceLabel(resourceType: AwsResourceType) {
  const base = AWS_RESOURCE_BY_TYPE[resourceType].label
  return base.toLowerCase().replace(/\s+/g, '-')
}

export function getDefaultNodeConfig(resourceType: AwsResourceType) {
  switch (resourceType) {
    case 'vpc':
      return {
        cidrBlock: '10.0.0.0/16',
        backgroundColor: 'rgba(224, 242, 254, 0.72)',
      }
    case 'subnet':
      return {
        cidrBlock: '10.0.1.0/24',
        availabilityZone: 'us-east-1a',
        isPublicSubnet: true,
      }
    case 'security-group':
      return {
        ingressRuleRows: defaultIngressRuleRows(),
        egressRuleRows: defaultEgressRuleRows(),
      }
    case 'ec2':
      return {
        instanceType: 't2.micro',
        ami: 'ami-0c55b159cbfafe1f0',
      }
    case 'alb':
      return {
        albInternal: false,
      }
    case 's3':
      return { bucketPrivacy: 'private' as const }
    case 'lambda':
      return {
        lambdaRuntime: 'nodejs20.x' as const,
        lambdaHandler: 'index.handler',
        lambdaFilename: 'lambda.zip',
      }
    case 'rds':
      return {
        rdsEngine: 'postgres' as const,
        dbName: 'appdb',
        dbUsername: 'admin',
        dbPassword: 'replace_me_securely',
        publiclyAccessible: false,
      }
    case 'api-gateway':
      return { apiDescription: 'API Gateway created from visual builder' }
    case 'dynamodb':
      return {
        dynamoTableName: 'app-table',
        dynamoHashKeyName: 'id',
        dynamoHashKeyType: 'S' as const,
      }
    case 'sqs':
      return {
        sqsQueueName: 'app-queue',
        sqsFifo: false,
      }
    case 'iam-role':
      return {
        iamRoleName: 'app-role',
        iamServicePrincipal: 'ec2.amazonaws.com',
      }
    case 'ecr-repo':
      return { ecrRepositoryName: 'my-app-repo' }
    case 'ecs-cluster':
      return { ecsClusterName: 'app-cluster' }
    case 'eks-cluster':
      return {
        eksClusterName: 'k8s-cluster',
        eksKubernetesVersion: '1.28',
      }
    case 'aws-provider':
      return {
        awsProviderRegion: 'us-east-1',
      }
    default:
      return {}
  }
}
