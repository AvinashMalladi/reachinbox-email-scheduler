import { knex } from '../db/knex';
import type { SlackConnectionRow } from '../types/db';

export type SlackAlertRow = {
  id: string;
  user_id: string;
  sender_email: string;
  limit: number;
  next_window_start: Date;
  channel: string | null;
  delivered_slack: boolean;
  created_at: Date;
};

async function recordAlert(data: {
  userId: string;
  senderEmail: string;
  limit: number;
  nextWindowStart: number;
  channel?: string | null;
  deliveredSlack: boolean;
}): Promise<void> {
  try {
    await knex('slack_alerts').insert({
      user_id: data.userId,
      sender_email: data.senderEmail,
      limit: data.limit,
      next_window_start: new Date(data.nextWindowStart),
      channel: data.channel ?? null,
      delivered_slack: data.deliveredSlack,
    });
  } catch (err) {
    console.error('[slack] failed to record alert:', err instanceof Error ? err.message : err);
  }
}

export async function getSlackConnection(userId: string): Promise<SlackConnectionRow | null> {
  return (await knex('slack_connections').where({ user_id: userId }).first()) ?? null;
}

export async function saveSlackConnection(userId: string, data: {
  teamId?: string;
  teamName?: string;
  accessToken: string;
  botUserId?: string;
  channelId?: string | null;
}): Promise<void> {
  await knex('slack_connections')
    .insert({
      user_id: userId,
      team_id: data.teamId ?? null,
      team_name: data.teamName ?? null,
      access_token: data.accessToken,
      bot_user_id: data.botUserId ?? null,
      channel_id: data.channelId ?? null,
    })
    .onConflict('user_id')
    .merge({
      updated_at: knex.fn.now(),
      team_id: data.teamId ?? null,
      team_name: data.teamName ?? null,
      access_token: data.accessToken,
      bot_user_id: data.botUserId ?? null,
      channel_id: data.channelId ?? null,
    });
}

export async function deleteSlackConnection(userId: string): Promise<void> {
  await knex('slack_connections').where({ user_id: userId }).delete();
}

export type SlackNotifyResult = { notified: boolean; reason?: string };

/**
 * Live Slack notification when a sender hits its hourly rate limit.
 * No-ops silently when the user hasn't connected Slack, and starts working
 * automatically as soon as they connect (the connection is read per hit).
 */
export async function notifyRateLimitHit(opts: {
  sender: { email: string };
  email: { user_id: string };
  limit: number;
  nextWindowStart: number;
}): Promise<SlackNotifyResult> {
  const conn = await getSlackConnection(opts.email.user_id);
  if (!conn) {
    console.log(`[slack] rate limit hit for ${opts.sender.email} but ${opts.email.user_id} is not connected to Slack — recorded as in-app alert`);
    await recordAlert({
      userId: opts.email.user_id,
      senderEmail: opts.sender.email,
      limit: opts.limit,
      nextWindowStart: opts.nextWindowStart,
      deliveredSlack: false,
    });
    return { notified: false, reason: 'not-connected' };
  }

  const channel = conn.channel_id ?? 'general';
  const text =
    `🚨 *ReachInbox rate limit reached*\n\n` +
    `Sender \`${opts.sender.email}\` hit its hourly send limit ` +
    `(\`${opts.limit}\` emails/hour).\n` +
    `Next queued emails will automatically be delayed to the next hour window ` +
    `starting *${new Date(opts.nextWindowStart).toISOString()}*.\n` +
    `No jobs were dropped and their order is preserved.`;

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conn.access_token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const body = (await response.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      console.error(`[slack] chat.postMessage error: ${body.error}`);
      await recordAlert({
        userId: opts.email.user_id,
        senderEmail: opts.sender.email,
        limit: opts.limit,
        nextWindowStart: opts.nextWindowStart,
        channel,
        deliveredSlack: false,
      });
      return { notified: false, reason: body.error };
    }
    console.log(`[slack] rate-limit notification posted to ${channel}`);
    await recordAlert({
      userId: opts.email.user_id,
      senderEmail: opts.sender.email,
      limit: opts.limit,
      nextWindowStart: opts.nextWindowStart,
      channel,
      deliveredSlack: true,
    });
    return { notified: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[slack] notify failed:', message);
    await recordAlert({
      userId: opts.email.user_id,
      senderEmail: opts.sender.email,
      limit: opts.limit,
      nextWindowStart: opts.nextWindowStart,
      channel,
      deliveredSlack: false,
    });
    return { notified: false, reason: message };
  }
}

export async function resolveGeneralChannelId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=200', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string; is_general?: boolean }>;
    };
    if (!body.ok || !body.channels) return null;
    const general = body.channels.find((c) => c.name === 'general' || c.is_general);
    return general?.id ?? body.channels[0]?.id ?? null;
  } catch {
    return null;
  }
}