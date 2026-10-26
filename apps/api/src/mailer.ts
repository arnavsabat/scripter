// Outgoing email. The wording is D-033's "Plain" invitation, sent through Amazon SES (D-030);
// without a sender configured the development mailer prints the link, and tests capture it.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface Invitation {
  to: string;
  inviterName: string;
  seriesName: string;
  role: 'writer' | 'viewer';
  link: string;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

export function invitationEmail(i: Invitation): Email {
  const verb = i.role === 'writer' ? `write on ${i.seriesName}` : `read ${i.seriesName}`;
  return {
    to: i.to,
    subject: `${i.inviterName} invited you to ${i.seriesName}`,
    text: [
      `${i.inviterName} invited you to ${verb} in Writers’ Room.`,
      '',
      `Join ${i.seriesName}: ${i.link}`,
      '',
      'This link works for 14 days. If you weren’t expecting this, you can ignore it.',
    ].join('\n'),
  };
}

/** Amazon SES (D-030). Until the domain exists, `from` is a verified Gmail address (D-038). */
export function sesMailer(from: string, region: string): Mailer {
  const ses = new SESv2Client({ region });
  return {
    async send(email) {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: `Writers’ Room <${from}>`,
          Destination: { ToAddresses: [email.to] },
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: email.text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    },
  };
}

/** Development only: prints instead of sending, so invitation links can be clicked from the terminal. */
export const consoleMailer: Mailer = {
  send(email) {
    console.log(`[mail] to ${email.to}: ${email.subject}\n${email.text}\n`);
    return Promise.resolve();
  },
};

/** Tests: keeps every email so a test can read the link out of it. */
export function memoryMailer(): Mailer & { sent: Email[] } {
  const sent: Email[] = [];
  return {
    sent,
    send(email) {
      sent.push(email);
      return Promise.resolve();
    },
  };
}
