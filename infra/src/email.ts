// SES identities (D-030, D-038): the sender, and the addresses its sandbox may send to. Each gets
// a verification link by email, which must be clicked before Cognito can send from it. Once the
// domain exists (D-082), the domain itself is an identity, verified by DKIM records written into
// its Route 53 zone, with a DMARC policy: then any address at it can send, and Arnav can ask SES
// for production access (out of the sandbox).
import { Stack, type StackProps } from 'aws-cdk-lib';
import { HostedZone, TxtRecord } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

export class EmailStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      senderEmail: string;
      testRecipients: string[];
      domain?: { name: string; hostedZoneId: string };
    },
  ) {
    super(scope, id, props);
    if (props.domain) {
      const zone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: props.domain.hostedZoneId,
        zoneName: props.domain.name,
      });
      new EmailIdentity(this, 'Domain', { identity: Identity.publicHostedZone(zone) });
      new TxtRecord(this, 'Dmarc', {
        zone,
        recordName: '_dmarc',
        values: ['v=DMARC1; p=quarantine; adkim=s; aspf=r'],
      });
    }
    const addresses = [...new Set([props.senderEmail, ...props.testRecipients])];
    addresses.forEach((address, i) => {
      new EmailIdentity(this, `Address${i}`, { identity: Identity.email(address) });
    });
  }
}
