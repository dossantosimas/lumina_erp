import nodemailer from 'nodemailer';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailDelivery = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

type MailResult = {
  messageId: string;
  accepted: unknown[];
  rejected: unknown[];
};

export type SendMail = (
  message: EmailMessage & { from: string; replyTo: string },
) => Promise<MailResult>;

let transport: nodemailer.Transporter | undefined;

function smtpTransport() {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !password)
    throw new Error(
      'SMTP_NOT_CONFIGURED: faltan SMTP_USER o SMTP_APP_PASSWORD.',
    );
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || 'true') !== 'false',
    auth: { user, pass: password },
  });
  return { transport, user };
}

export async function sendEmail(message: EmailMessage): Promise<EmailDelivery> {
  const { transport: smtp, user } = smtpTransport();
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) throw new Error('SMTP_NOT_CONFIGURED: falta EMAIL_FROM.');
  return deliverEmail(message, { from, user }, (mail) => smtp.sendMail(mail));
}

export async function deliverEmail(
  message: EmailMessage,
  sender: { from: string; user: string },
  sendMail: SendMail,
): Promise<EmailDelivery> {
  const result = await sendMail({
    from: sender.from,
    replyTo: sender.user,
    ...message,
  });
  return {
    messageId: result.messageId,
    accepted: result.accepted.map(String),
    rejected: result.rejected.map(String),
  };
}
