// SES identities (D-030, D-038): the sender, and the addresses its sandbox may send to. Each gets
// a verification link by email, which must be clicked before Cognito can send from it.
import { Stack, type StackProps } from 'aws-cdk-lib';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

export class EmailStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { senderEmail: string; testRecipients: string[] },
  ) {
    super(scope, id, props);
    const addresses = [...new Set([props.senderEmail, ...props.testRecipients])];
    addresses.forEach((address, i) => {
      new EmailIdentity(this, `Address${i}`, { identity: Identity.email(address) });
    });
  }
}
