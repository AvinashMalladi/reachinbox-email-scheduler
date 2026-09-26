import nodemailer from 'nodemailer';
import { env } from '../config/env';
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
  if (env.BREVO_API_KEY) {
    return sendViaBrevoApi(opts, env.BREVO_API_KEY);
  }

  const transporter = nodemailer.createTransport({
    host: opts.sender.host,
    port: opts.sender.port,
    secure: opts.sender.secure ?? false,
    auth: { user: opts.sender.username, pass: opts.sender.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
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

async function sendViaBrevoApi(
  opts: {
    sender: SenderRow;
    to: string;
    subject: string;
    body: string;
  },
  apiKey: string,
): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const html = opts.body
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
    .join('');

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: opts.sender.name, email: opts.sender.email },
        to: [{ email: opts.to }],
        subject: opts.subject,
        textContent: opts.body,
        htmlContent: html,
      }),
      signal: controller.signal,
    });

    const payload = (await res.json().catch(() => null)) as { messageId?: string } | null;
    if (!res.ok || !payload?.messageId) {
      throw new Error(`Brevo API ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    }
    return { messageId: payload.messageId, previewUrl: null };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Brevo API request timed out after 30s');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}