// The domain's DNS (D-096, D-097): a Route 53 public hosted zone for the domain, which is registered
// at Porkbun. Deployed once, before anything that writes records. Then Porkbun's nameservers are
// pointed at the four it prints, and WR_HOSTED_ZONE_ID in infra/.env.local is set from its output,
// after which the other stacks write their own records (certificate, site, email, sign-in).
import { CfnOutput, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';

export class DnsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { zoneName: string }) {
    super(scope, id, props);
    const zone = new PublicHostedZone(this, 'Zone', { zoneName: props.zoneName });
    // The domain's records outlive any stack: deleting this one never takes the site offline.
    zone.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new CfnOutput(this, 'HostedZoneId', { value: zone.hostedZoneId });
    new CfnOutput(this, 'NameServers', {
      value: Fn.join(', ', zone.hostedZoneNameServers!),
      description: 'Porkbun → the domain → Authoritative nameservers: replace them with these four',
    });
  }
}
