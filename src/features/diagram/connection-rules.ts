import type { AwsResourceType } from './aws-resources'
import { AWS_RESOURCE_BY_TYPE } from './aws-resources'

/**
 * Directed edges: drag from source node's handle → target node's handle.
 * Only these pairs are allowed; everything else is rejected.
 */
const ALLOWED_TARGETS: Partial<Record<AwsResourceType, AwsResourceType[]>> = {
  vpc: ['subnet', 'security-group'],
  subnet: ['ec2', 'rds', 'lambda', 'alb', 'security-group'],
  'security-group': ['ec2', 'rds', 'lambda'],
  'iam-role': ['ec2', 'lambda'],
  'api-gateway': ['lambda', 'alb'],
  ec2: ['rds', 's3', 'dynamodb', 'sqs'],
  lambda: ['rds', 's3', 'dynamodb', 'sqs'],
  s3: ['sqs'],
  alb: ['ec2'],
}

export function isAwsConnectionAllowed(
  sourceType: AwsResourceType,
  targetType: AwsResourceType,
): boolean {
  const allowed = ALLOWED_TARGETS[sourceType]
  return Boolean(allowed?.includes(targetType))
}

export function awsConnectionRejectionMessage(
  sourceType: AwsResourceType,
  targetType: AwsResourceType,
): string {
  const src = AWS_RESOURCE_BY_TYPE[sourceType]?.label ?? sourceType
  const tgt = AWS_RESOURCE_BY_TYPE[targetType]?.label ?? targetType
  return `${src} cannot connect to ${tgt}. Allowed paths follow AWS-style relationships (e.g. Subnet → compute, API Gateway → Lambda/ALB, compute → data services).`
}
