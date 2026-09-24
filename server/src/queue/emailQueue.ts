import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const EMAIL_QUEUE = 'email-queue';

export type SendEmailJobData = {
  emailId: string;
};

export const emailQueue = new Queue<SendEmailJobData>(EMAIL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 2000 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});