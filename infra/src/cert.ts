// The domain's certificate (D-082, D-091), in us-east-1: CloudFront only takes certificates from
// there. Validated by DNS records in the domain's Route 53 zone, renewed by AWS.
import { Stack, type StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';

export class CertStack extends Stack {
  readonly certificate: Certificate;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { domain: { name: string; hostedZoneId: string } },
  ) {
    super(scope, id, { ...props, crossRegionReferences: true });
    const zone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.domain.hostedZoneId,
      zoneName: props.domain.name,
    });
    this.certificate = new Certificate(this, 'Certificate', {
      domainName: props.domain.name,
      validation: CertificateValidation.fromDns(zone),
    });
  }
}
