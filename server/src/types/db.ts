export type UserRow = {
  id: string;
  email: string;
  google_id: string | null;
  name: string | null;
  avatar: string | null;
  google_profile: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type SenderRow = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  secure?: boolean;
  is_ethereal: boolean;
  created_at: Date;
  updated_at: Date;
};

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export type EmailJobRow = {
  id: string;
  user_id: string;
  sender_id: string | null;
  batch_id: string | null;
  recipient: string;
  subject: string;
  body: string;
  scheduled_at: Date;
  delay_between_ms: number;
  hourly_limit: number | null;
  status: EmailStatus;
  attempts: number;
  sent_at: Date | null;
  message_id: string | null;
  preview_url: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SlackConnectionRow = {
  user_id: string;
  team_id: string | null;
  team_name: string | null;
  access_token: string;
  bot_user_id: string | null;
  channel_id: string | null;
  connected_at: Date;
  updated_at: Date;
};