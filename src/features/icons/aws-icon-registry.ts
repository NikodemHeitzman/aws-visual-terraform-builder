import type { AwsResourceType } from '../diagram/aws-resources'

export type AwsIconRegistry = Partial<Record<AwsResourceType, string>>

// Place official AWS Architecture SVG files in: public/aws-icons/
// Then keep filenames in sync with this registry.
export const AWS_ICON_PATHS: AwsIconRegistry = {
  vpc: '/aws-icons/vpc.svg',
  subnet: '/aws-icons/subnet.svg',
  'security-group': '/aws-icons/ec2-instance.svg',
  ec2: '/aws-icons/ec2-instance.svg',
  s3: '/aws-icons/s3-bucket.svg',
  rds: '/aws-icons/rds.svg',
  lambda: '/aws-icons/lambda.svg',
  'api-gateway': '/aws-icons/api-gateway.svg',
}
