export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
}

export interface EmailItem {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string | null;
  previewUrl: string | null;
  lastError: string | null;
  batchId: string | null;
  createdAt: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  scheduledAt: string;
  delayBetweenMs: number;
  hourlyLimit?: number | null;
}

export interface ScheduleResponse {
  batchId: string;
  count: number;
  scheduledAt: string;
  delayBetweenMs: number;
}

export interface SearchResult {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: number | null;
  sentAt: number | null;
}

export interface SearchResponse {
  items: SearchResult[];
}

export interface SlackStatus {
  connected: boolean;
  configured: boolean;
  team?: string | null;
  channelId?: string | null;
  teamDomain?: string | null;
}

export interface SlackAlert {
  id: string;
  sender_email: string;
  limit: number;
  next_window_start: string;
  channel: string | null;
  delivered_slack: boolean;
  created_at: string;
}

export interface AuthConfig {
  googleConfigured: boolean;
  demoLogin: boolean;
}

export interface EmailStats {
  scheduled: number;
  sending: number;
  sent: number;
  failed: number;
  cancelled: number;
  total: number;
  senders: number;
  sentToday: number;
}

export type MailerMode = 'ethereal' | 'brevo-fallback' | 'smtp-relay' | 'unconfigured';

export interface SystemStatus {
  queues: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
    paused: number;
  } | null;
  mailer: {
    mode: MailerMode;
    etherealProbed: boolean;
    etherealReachable: boolean | null;
    hasBrevoFallback: boolean;
    hasSmtpRelay: boolean;
    etherealPort: number;
  };
  elasticsearch: {
    enabled: boolean;
    reachable: boolean;
    index: string;
  };
  slack: {
    configured: boolean;
    connected: boolean;
  };
  senders: number;
  adminUrl: string;
}