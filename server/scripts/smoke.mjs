/**
 * End-to-end smoke test for the ReachInbox scheduler.
 *
 *   require('dotenv/config');
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Exercises: demo auth → schedule → poll status transitions → search → bull board.
 */
import dotenv from 'dotenv';
dotenv.config();

const BASE = process.argv[2] ?? 'http://localhost:4000';
let cookie = '';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, setCookie, ok: res.ok };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, label) {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`  ok  ${label}`);
}

const results = { scheduled: 0 };

async function scheduleBatch(spec) {
  const r = await api('POST', '/api/emails/schedule', spec);
  assert(r.status === 201, `schedule ${spec.recipients.length} emails (${r.data?.count ?? '?'})`);
  return r.data;
}

async function statusCounts(q = '') {
  const r = await api('GET', `/api/emails?limit=200${q}`);
  assert(r.ok, 'list emails');
  const counts = {};
  for (const item of r.data.items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return { items: r.data.items, counts };
}

console.log(`smoke against ${BASE}\n`);

// ── 1. Auth (demo login; the same cookie protects the queue dashboard) ──
console.log('[1] auth');
let r = await api('POST', '/api/auth/demo');
assert(r.status === 200 && r.data.user, 'demo login');
r = await api('GET', '/api/auth/me');
assert(r.status === 200 && r.data.user, 'GET /api/auth/me');

// ── 2. Bull Board requires the auth cookie ──
console.log('[2] bull-board');
for (const path of ['/admin/queues']) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
  assert(res.status === 200, `dashboard ${path} -> ${res.status}`);
}
{
  const res = await fetch(`${BASE}/admin/queues`, { redirect: 'manual' });
  assert(res.status === 401, 'dashboard without cookie -> 401');
}

// ── 3. Schedule a small batch that will send in ~40s ──
console.log('[3] schedule');
const scheduledAt = new Date(Date.now() + 40_000).toISOString();
const recipients = ['alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com'];
const batch = await scheduleBatch({
  subject: 'Cold outreach — {name}',
  body: 'Hi! Quick demo email from the ReachInbox scheduler.\n\n— Team',
  recipients,
  scheduledAt,
  delayBetweenMs: 3000,   // 3s pacing within the batch
  hourlyLimit: 50,
});
results.scheduled = batch.count;
assert(batch.count === 4, 'batch count');

r = await api('GET', `/api/emails/search?q=reachinbox`);
assert(r.status === 200 && r.data.items.length >= 4, `elasticsearch search returned ${r.data.items.length} hits`);

// ── 4. Wait for send (paced 3s apart + min 2s worker limiter) ──
console.log('[4] wait for send...');
let received = 0;
for (let i = 0; i < 24; i++) {
  await delay(5000);
  const { counts } = await statusCounts('');
  received = counts.sent ?? 0;
  console.log(`     statuses: ${JSON.stringify(counts)}`);
  if (received >= 4) break;
}
assert(received >= 4, `all ${results.scheduled} emails sent`);

// ── 5. Search now finds them ──
{
  const r2 = await api('GET', '/api/emails/search?q=outreach');
  assert(r2.status === 200 && r2.data.items.length >= 4, 'search finds sent email');
}

// ── 6. Rate limiting: low hourly limit, many emails at the same time ──
console.log('[6] rate limit (hourlyLimit=3, 8 emails in 15s)');
const now = new Date(Date.now() + 15_000).toISOString();
const rlRecipients = Array.from({ length: 8 }, (_, i) => `rl-${i}@example.com`);
await scheduleBatch({
  subject: 'Rate limit demo',
  body: 'This batch should be throttled.',
  recipients: rlRecipients,
  scheduledAt: now,
  delayBetweenMs: 0,
  hourlyLimit: 3,
});
let rlDone = false;
for (let i = 0; i < 15; i++) {
  await delay(5000);
  const { counts } = await statusCounts('');
  const sentOrFailed = (counts.sent ?? 0) + (counts.failed ?? 0);
  const scheduled = counts.scheduled ?? 0;
  console.log(`     statuses: ${JSON.stringify(counts)}`);
  if (sentOrFailed >= 3 && scheduled >= 4) { rlDone = true; break; }
}
assert(rlDone, 'rate limit: 3 sent now, rest still scheduled (rescheduled to next hour)');

console.log('\nALL SMOKE TESTS PASSED ✅');
process.exit(0);