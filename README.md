# ReachInbox — Full-stack Email Job Scheduler

A production-grade **email scheduling + sending service** with a React dashboard — a tiny slice of what
ReachInbox does under the hood.

> Schedules emails with **BullMQ delayed jobs** (no cron anywhere), sends through **Ethereal Email**
> (fake SMTP), persists everything in **PostgreSQL + Redis**, indexes mail in **Elasticsearch** for
> search, throttles per-sender equally across instances, survives restarts without losing or
> re-sending jobs, notifies **Slack** when an hourly rate limit is hit, and logs users in with
> **real Google OAuth**.

---

## ⚡ Quickstart for reviewers (5 minutes)

```bash
# 1. Copy the backend env file
cp server/.env.example server/.env

# 2. Enable the one-click demo login (no Google/Slack credentials needed)
#    → open server/.env and set:
#      ENABLE_DEMO_LOGIN=true          (login without Google OAuth)

# 3. Install dependencies (backend + frontend)
npm --prefix server install
npm --prefix web install

# 4. Start Redis + PostgreSQL + Elasticsearch, then migrate
docker compose up -d
npm --prefix server run migrate

# 5. Run everything (API + BullMQ worker + dashboard)
npm run dev
```

Then open **<http://localhost:5173>** → **Demo Login** → you're in.

- No SMTP config needed — Ethereal senders are **auto-provisioned at boot**.
- Elasticsearch is optional — search falls back to PostgreSQL `ILIKE` if ES isn't running.
- Live queue dashboard: **<http://localhost:4000/admin/queues>** · Health: **<http://localhost:4000/api/health>**
- (Optional) live Slack rate-limit alerts: see [Slack notifications](#slack-notifications-real) below.

---

## 🌐 Hosted deployment (Render — free tier)

One web service runs the **API + BullMQ worker + built React SPA** on the same origin
(`render.yaml` at the repo root deploys it from this repo — no code changes needed).

**Architecture (all free tiers):**

| Piece | Provider | What it is |
|---|---|---|
| **Web service** | Render | `render.yaml` blueprint; runs API + worker (worker starts in-process) |
| **PostgreSQL** | Neon | Free serverless Postgres (14GB) — copy its *connection string* |
| **Redis** | Upstash | Free Redis (TLS) — copy its `REDIS_URL` |
| **Elasticsearch** | — (optional) | Set `ES_ENABLED=false`; search falls back to Postgres `ILIKE`. The demo video shows live ES queries from the local setup. |
| **Ethereal SMTP** | ethereal.email | Senders auto-provisioned at boot — no secrets needed |
| **Google/Slack OAuth** | Google Cloud + api.slack.com | Fill the env vars below (both already configured for localhost). |

**Deploy steps (≈10 min):**
1. Push this repo to GitHub (it already is). Create free accounts: [Render](https://render.com), [Neon](https://neon.tech), [Upstash](https://upstash.com).
2. **Neon**: new project → copy the **connection string** (`postgres://...`).
3. **Upstash**: new Redis database → copy `REDIS_URL` (`rediss://default:...`).
4. **Render** → *New +* → *Blueprint* → connect this repo → name it → **Create**. Render reads `render.yaml`, deploys, runs migrations automatically.
5. In the Render service → **Environment** → fill the `sync: false` vars and save (it restarts):
   - `DATABASE_URL` ← Neon string
   - `REDIS_URL` ← Upstash string
   - `JWT_SECRET` ← any long random string
   - `FRONTEND_URL` ← `https://<your-service>.onrender.com`
   - `GOOGLE_REDIRECT_URI` ← `https://<your-service>.onrender.com/api/auth/google/callback`
   - `SLACK_REDIRECT_URI` ← `https://<your-service>.onrender.com/api/slack/callback`
   - add `https://<your-service>.onrender.com/api/auth/google/callback` to your Google OAuth client's **Authorized redirect URIs**
   - add `https://<your-service>.onrender.com/api/slack/callback` under **Redirect URLs** in your Slack app (api.slack.com → OAuth) and **Save URLs**
6. That's it — open the link, click **Demo Login**, and the whole stack (queue dashboard at `/admin/queues`, scheduling, Ethereal + Slack live calls) works.

> Harden it later: replace the demo login with your Google OAuth, tighten `MAX_EMAILS_PER_HOUR_*`, add a paid Postgres/Redis tier. For a student assessment the free stack above is enough and the assignment is fully verifiable through the live link.

---

## ✨ Features

### Backend
| Area | What's implemented |
|---|---|
| **Scheduler** | `POST /api/emails/schedule` bulk-creates email rows, assigns senders round-robin, enqueues one **delayed BullMQ job per email** (`delay = baseDelay + index × delayBetweenMs`). No cron. |
| **Persistence** | Every email is a row in Postgres = source of truth. BullMQ keeps the delayed jobs in Redis. A `recoverPendingJobs()` pass runs on boot and re-adds any `scheduled`/stale `sending` rows with **stable jobIds** — nothing is sent twice and nothing is forgotten. |
| **Multi-sender** | Sender accounts are provisioned into the `senders` table (Ethereal API accounts or explicit `ETHEREAL_SENDERS=user:pass,…` list). Emails are assigned to senders at schedule time. |
| **Concurrency** | Worker `concurrency` is configurable (`WORKER_CONCURRENCY`, default 5). Multiple workers/instances are safe because rate counters live in Redis. |
| **Delay between emails** | BullMQ worker **limiter `{ max: 1, duration: MIN_DELAY_BETWEEN_SENDS_MS }`** (default 2000 ms) — at most one send starts per window **across all workers**. Plus the UI-set `delayBetweenMs` paces each batch. |
| **Hourly rate limit** | Redis counters keyed `rl:sender:{senderId}:{hourWindow}` and `rl:global:{hourWindow}`. Configurable via env (`MAX_EMAILS_PER_HOUR_PER_SENDER`, `MAX_EMAILS_PER_HOUR_GLOBAL`) and per-batch via `hourlyLimit`. When hit, jobs are **delayed into the next hour window** — never dropped, never failed. |
| **Slack notifications** | Real **"Connect Slack" OAuth flow** (scope `chat:write,channels:read`). The moment a sender hits its hourly limit we call `chat.postMessage` (exactly one message per sender+hour). No connection → no crash, just a skip; connecting later starts notifications automatically. |
| **Search** | Emails are indexed into Elasticsearch (`reachinbox-emails`) on create and status changes. `GET /api/emails/search?q=` searches recipient/subject/body; **falls back to SQL `ILIKE`** if ES is down. |
| **Live queue dashboard** | Bull Board mounted at **<http://localhost:4000/admin/queues>** (behind the same login cookie). |
| **Auth** | Real **Google OAuth** code flow → JWTs in a httpOnly cookie. Dev-only demo login behind `ENABLE_DEMO_LOGIN=true`. |
| **Idempotency** | Stable BullMQ `jobId = email-<id>` **+** DB status guard in the worker (`only send if status === 'scheduled'`). No duplicate sends even if a job is requeued. |

### Frontend (React + TS + Tailwind)
- **Login page** with real Google OAuth button (+ optional demo button)
- **Header**: avatar, name, email, Logout, and **Connect Slack** status pill
- **Dashboard**: tabs for **Scheduled Emails** / **Sent Emails**
- **Compose New Email** modal: subject, body, **CSV/TXT upload** (live count of detected emails + skipped invalid rows), start time, delay between emails, hourly limit
- Tables with **loading skeletons**, **empty states**, per-status badges, Ethereal **preview links**, **retry** / **cancel** actions
- **Live search** (debounced) powered by the Elasticsearch endpoint
- 5 s auto-refresh, toasts, clean reusable UI kit + TypeScript types everywhere

---

## 🏗 Architecture

```
┌────────────┐  HTTPS    ┌──────────────────── Express + TS ────────────────────┐
│  React app │ ────────▶ │  /api/auth/*      Google OAuth + JWT cookie          │
│ (Vite/Tail)│           │  /api/emails/*    schedule, list, search, retry,cancel│
└────────────┘           │  /api/senders/*   list senders                       │
                         │  /api/slack/*     Slack OAuth + status               │
                         │  /admin/queues    Bull Board (live queue UI)         │
                         └───────────┬──────────────────────────────────────────┘
                                     │ scheduleEmails()
                                     ▼
                 ┌──────────────────────────┐        ┌──────────────────────┐
                 │ PostgreSQL  (source of   │        │ Redis + BullMQ       │
                 │  truth: email_jobs,      │        │  delayed jobs, rate   │
                 │  senders, users, slack)  │        │  counters, sender RR  │
                 └────────────┬─────────────┘        └───────────┬──────────┘
                              │                                  │
                              │         ┌────────────worker───────┤
                              ▼         ▼                        ▼
                       Elasticsearch   Worker:  guard → rate check → nodemailer
                       (index/search)  (concurrency,  limiter)  → Ethereum SMTP
                                                              (status → sent/failed)
```

**Scheduling flow**
1. `scheduleEmails()` persists all recipients as `email_jobs` rows (`status = scheduled`), picks a
   sender per row, and adds one delayed job per row with a **stable `jobId`**.
2. The worker (runs in the same process; scale-out safe) does, per job:
   - **Guard**: does a row exist and is its status still `scheduled`? (idempotency)
   - **Rate check**: `INCR` the hourly Redis counters for this sender + global; if a limit is exceeded
     it `DECR`s back and moves the job to the **next hour window** with `job.moveToDelayed()` + sends a
     single **Slack** alert. Order is preserved (they land at the next window boundary and are picked
     up FIFO, still paced by the limiter).
   - **Send**: marks `sending`, calls nodemailer → Ethereal SMTP, then `sent`/`failed` (+ preview URL,
     messageId) and mirrors status into Elasticsearch.

**Why restarts are safe**
- Delayed jobs live in Redis (BullMQ persistence).
- On boot, `recoverPendingJobs()` reconciles against Postgres: rows stuck in `sending` for > 2 min are
  reset to `scheduled`, and every `scheduled` row is re-added with its stable `jobId` (BullMQ ignores
  duplicates; the worker re-checks the DB anyway). Emails are never re-sent or started from day one.

**Rate limiting design (and trade-offs)**
- Counters are Redis `INCR` per `hourWindow + sender`. `INCR` then `DECR` on overflow keeps the counter
  equal to *accepted* jobs and is race-free across instances.
- Jobs that hit the cap are **delayed, not failed or dropped** — they move to the next hour boundary.
- Trade-off *vs* the built-in BullMQ limiter: BullMQ's limiter is per `max jobs / duration` and **cannot
  reschedule past a window**, so hourly caps use our Redis counter + `moveToDelayed`. The **min-delay
  between sends** *does* use BullMQ's limiter (perfect fit).
- Net effect under a 1000-email burst: the worker paces sends ≥ min-delay apart, and each hour only
  `hourlyLimit` per sender gets through; the rest roll into following hours preserving order.

---

## 🚀 Quick start

### 1. Infra (Docker)

```bash
docker compose up -d      # redis:6379, postgres (host 55432), elasticsearch:9200
```

> **Port notes:** a local PostgreSQL was found occupying host `5432`, so the container maps to **55432**.
> If you have conflicting services, change the mapping in `docker-compose.yml` and the URL in
> `server/.env`.

### 2. Backend

```bash
cd server
cp .env.example .env        # then edit secrets (see below)
npm install
npm run migrate             # create tables
npm run dev                 # starts API + BullMQ worker (tsx --watch)
```

Health check: <http://localhost:4000/api/health>
Live queue dashboard: <http://localhost:4000/admin/queues> (login first)
Google OAuth start: <http://localhost:4000/api/auth/google>
Slack connect: <http://localhost:4000/api/slack/connect>

### 3. Frontend

```bash
cd web
npm install
npm run dev                 # <http://localhost:5173> (web app)
```

`npm run dev` at the repo root runs backend + frontend together (via `concurrently`).

### Local URLs (after `npm run dev`)

| Service | URL |
|---|---|
| Web app (React dashboard) | <http://localhost:5173> |
| API health check | <http://localhost:4000/api/health> |
| BullMQ live queue dashboard | <http://localhost:4000/admin/queues> |
| Google OAuth login | <http://localhost:4000/api/auth/google> |
| Demo login (POST) | <http://localhost:4000/api/auth/demo> |
| Slack connect | <http://localhost:4000/api/slack/connect> |
| Elasticsearch (index `reachinbox-emails`) | <http://localhost:9200> |

---

## 🔑 OAuth setup

### Google Login (real)
1. Console → Create an **OAuth 2.0 Client ID** (Web application) at
   `https://console.cloud.google.com/apis/credentials`.
2. Authorized redirect URI → `http://localhost:4000/api/auth/google/callback`.
3. Set in `server/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
   FRONTEND_URL=http://localhost:5173
   ```
4. Restart. The login screen now enables **Continue with Google**.

> **Dev-only:** set `ENABLE_DEMO_LOGIN=true` to get a one-click demo user without Google creds (for
> local grading/tests; leave `false` in production).

### Slack notifications (real)
1. Create an app at `https://api.slack.com/apps` → add scopes **`chat:write`** and **`channels:read`**
   → install to a workspace → under OAuth settings set redirect URL
   `http://localhost:4000/api/slack/callback`.
2. Set in `server/.env`:
   ```
   SLACK_CLIENT_ID=...
   SLACK_CLIENT_SECRET=...
   SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback
   ```
3. Click **Connect Slack** in the dashboard header → authorize → done.
4. Schedule a batch with a low `hourlyLimit` (e.g. 3 for 8 emails): when the limit is hit the workspace
   receives a message. If Slack isn't connected, hits are simply silent (and start working once you
   connect — no redeploy).

### Ethereal Email
- **Recommended (multi-sender):** create N throwaway accounts at `https://ethereal.email` and set
  `ETHEREAL_SENDERS=user1:pass1,user2:pass2`.
- Or a single account via `ETHEREAL_USER` / `ETHEREAL_PASSWORD`.
- Or nothing — the app auto-provisions accounts at boot via the Ethereal API.
- Every sent message shows an **Ethereal preview URL** in the Sent table (and in the DB `preview_url`
  column) so you can "read" the fake email.

---

## ⚙️ Key env knobs (`server/.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | Min gap between any two sends (worker limiter) |
| `WORKER_CONCURRENCY` | `5` | Concurrent jobs per worker |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Per-sender hourly cap (env-level default) |
| `MAX_EMAILS_PER_HOUR_GLOBAL` | `200` | Global hourly cap |
| `ETHEREAL_SENDERS` / `ETHEREAL_USER`+`_PASSWORD` / `ETHEREAL_SENDERS_COUNT` | — | Sender provisioning |
| `ES_ENABLED` | `true` | Elasticsearch on/off (falls back to SQL search) |
| `PORT`, `DATABASE_URL`, `REDIS_*`, `JWT_SECRET`, `FRONTEND_URL` | — | Core wiring |

---

## 📡 API surface (all behind auth cookie except `/api/health`, `/api/auth/*` login routes)

| Method | URL (served from `http://localhost:4000`) | Purpose |
|---|---|---|
| `GET` | http://localhost:4000/api/auth/google · http://localhost:4000/api/auth/google/callback | Google OAuth |
| `GET` | http://localhost:4000/api/auth/me · http://localhost:4000/api/auth/config | Session / config check |
| `POST` | http://localhost:4000/api/auth/logout · http://localhost:4000/api/auth/demo | Logout / dev demo login |
| `POST` | http://localhost:4000/api/emails/schedule | `{subject, body, recipients[], scheduledAt, delayBetweenMs, hourlyLimit}` |
| `GET` | http://localhost:4000/api/emails?status=&q=&limit=&offset= | List (SQL filters) |
| `GET` | http://localhost:4000/api/emails/search?q= | Full-text search (Elasticsearch / SQL fallback) |
| `POST` | http://localhost:4000/api/emails/:id/retry · http://localhost:4000/api/emails/:id/cancel | Retry a failed email / cancel a scheduled one |
| `GET` | http://localhost:4000/api/senders | Sender accounts |
| `GET` | http://localhost:4000/api/slack/connect · http://localhost:4000/api/slack/callback · http://localhost:4000/api/slack/status · http://localhost:4000/api/slack/disconnect | Slack OAuth + state |
| `GET` | http://localhost:4000/admin/queues | Live BullMQ dashboard |

---

## 🧪 Verify end-to-end

```bash
# infra + backend running → sets up Ethereal senders, sends 4 emails, then tests rate limiting
cd server && npm run migrate && node scripts/smoke.mjs
```

---

## ✅ Requirements checklist

- [x] Email scheduling via API, stored in a relational DB
- [x] BullMQ + Redis **delayed jobs** (zero cron — no OS cron, no node-cron/agenda)
- [x] Sends via **Ethereal** SMTP from **multiple senders**
- [x] Survives restarts: future emails still fire at the right time; no re-sends (idempotent)
- [x] Searchable via **Elasticsearch** indexing
- [x] Live **BullMQ dashboard**
- [x] Configurable **worker concurrency** + **min delay between sends** (all workers)
- [x] **Hourly rate limit** — Redis counters, configurable, reschedules to next window (never drops)
- [x] **Slack notification** on rate-limit hit (real OAuth + live `chat.postMessage`)
- [x] Google OAuth login (real), header user info, logout
- [x] Dashboard (Scheduled/Sent tabs, tables, loading, empty states)
- [x] Compose modal (subject, body, CSV/TXT upload with count, start time, delay, hourly limit)
- [x] TypeScript + Tailwind + reusable components + env-driven config

---

## Assumptions / trade-offs / shortcuts

1. **Ethereal accounts**: `nodemailer.createTestAccount()` can return *duplicate* accounts when called
   rapidly — prefer the explicit `ETHEREAL_SENDERS` list for a true multi-sender demo.
2. **Ethereal is fake**: we rely on preview URLs (and DB rows) to "verify" sends; latencies and SMTP
   failures here are not representative of production providers.
3. **Rate limit rescheduling is approximate FIFO**: jobs that hit the cap all land at the next hour
   boundary, then are re-picked FIFO by BullMQ, so order is preserved *per window*, not strictly across
   windows.
4. **Redis flush = jobs lost until recovery**: our boot-time reconciliation re-adds everything from
   Postgres, so even a full Redis wipe cannot lose or duplicate emails.
5. **Crash mid-send**: a process dying after SMTP accepted the message but before the DB `sent` write
   could, on recovery, resend that one message (we reset stale `sending` rows). It's the classic
   exactly-once gap; mitigated by the DB status guard but not eliminated without SMTP dedupe headers.
6. **ES fallback**: if Elasticsearch is unreachable we log once, disable indexing, and serve SQL `ILIKE`
   search — the feature never hard-fails.
7. **The stock Figma link** in the brief was empty, so the UI is a clean, matching-styled implementation
   of the described screens (header, tabs, compose modal, tables).
8. **Single-process worker** by default; scale-out is supported (Redis-backed counters/limiter) but the
   compose setup runs one API+worker instance.

---

## License

For the ReachInbox SDE intern assignment. Not affiliated with ReachInbox.ai / Outbox Labs.