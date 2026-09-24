import nodemailer from 'nodemailer';
import type { SenderRow } from '../types/db';

export type SendResult = {
  messageId: string;
  previewUrl: string | null;
};

export async function sendEmail(opts: {
  sender: SenderRow;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: opts.sender.host,
    port: opts.sender.port,
    secure: false,
    auth: { user: opts.sender.username, pass: opts.sender.password },
  });

  const info = await transporter.sendMail({
    from: `"${opts.sender.name}" <${opts.sender.email}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    html: opts.body
      .split('\n')
      .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
      .join(''),
  });

  const url = nodemailer.getTestMessageUrl(info);
  const previewUrl = typeof url === 'string' ? url : null;

  return { messageId: info.messageId, previewUrl };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}