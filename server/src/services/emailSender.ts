import nodemailer from 'nodemailer';
import net from 'node:net';
import { env } from '../config/env';
import type { SenderRow } from '../types/db';

export type SendResult = {
  messageId: string;
  previewUrl: string | null;
};

let etherealReachable: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

/**
 * One-shot probe: can THIS host actually reach Ethereal's SMTP?
 * Memoized + single-flight. Ethereal is the required mailer per the spec and
 * is used whenever it is reachable. Some free hosts (e.g. Render free tier)
 * block ALL outbound connections, so the probe fails there and delivery falls
 * back to Brevo's HTTPS API. The probe result is cached for the process.
 */
export function probeEthereal(host: string, port: number): Promise<boolean> {
  if (etherealReachable !== null) return Promise.resolve(etherealReachable);
  if (probePromise) return probePromise;
  probePromise = new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 12000);
    const done = (value: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  }).then((reachable) => {
    etherealReachable = reachable;
    return reachable;
  });
  return probePromise;
}

function renderHtml(body: string): string {
  return body
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
    .join('');
}

/**
 * Primary mailer (per the assignment spec): nodemailer + Ethereal SMTP.
 * Falls back to Brevo's HTTPS API ONLY when Ethereal's SMTP is unreachable
 * on the host (outbound egress blocked, e.g. Render free tier).
 */
export async function sendEmail(opts: {
  sender: SenderRow;
  to: string;
  subject: string;
  body: string;
  fromEmail?: string;
}): Promise<SendResult> {
  const reachable = await probeEthereal(opts.sender.host, opts.sender.port);

  if (reachable) {
    try {
      return await sendViaEtherealSmtp(opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[mailer] Ethereal SMTP send failed after probe: ${message} — attempting fallback if configured`);
    }
  }

  if (env.BREVO_API_KEY) {
    const fromEmail = opts.fromEmail ?? env.EMAIL_FALLBACK_FROM ?? opts.sender.email;
    return sendViaBrevoApi({ ...opts, fromEmail });
  }

  throw new Error(
    reachable
      ? 'Ethereal SMTP send failed and no Brevo fallback is configured'
      : 'Ethereal SMTP is unreachable from this host and no Brevo fallback is configured',
  );
}

async function sendViaEtherealSmtp(opts: {
  sender: SenderRow;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
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
    html: renderHtml(opts.body),
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
    fromEmail: string;
  },
  apiKey = env.BREVO_API_KEY!,
): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const body = {
    sender: { name: opts.fromEmail === opts.sender.email ? opts.sender.name : 'ReachInbox', email: opts.fromEmail },
    to: [{ email: opts.to }],
    subject: opts.subject,
    textContent: opts.body,
    htmlContent: renderHtml(opts.body),
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
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