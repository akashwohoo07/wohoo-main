import { Queue } from "bullmq";
import { createQueueConnection } from "./connection.js";
import { sendInviteEmail, sendUsernameConfirmEmail } from "../utils/email.js";

// Job names — shared by producer (this file) and worker.
export const JOB_INVITE = "invite";
export const JOB_USERNAME = "username-confirm";

export const EMAIL_QUEUE_NAME = "email";

// Producer queue. Off by default: async email (BullMQ) is a scale feature that
// keeps a Redis connection polling 24/7. It's only enabled when BOTH REDIS_URL
// is set AND ENABLE_QUEUES="true" (i.e. you're also running the worker). Without
// it, callers fall back to sending inline — correct and cheap at low volume.
export const emailQueue = (process.env.REDIS_URL && process.env.ENABLE_QUEUES === "true")
  ? new Queue(EMAIL_QUEUE_NAME, { connection: createQueueConnection() })
  : null;

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000, // keep last 1000 completed for observability
  removeOnFail: 5000,
};

// Dispatch an email. When a queue exists the send is offloaded to the worker
// process and this returns immediately. Without Redis it runs inline so the
// feature still works — the tradeoff is that the request waits for the send.
export async function dispatchEmail(jobName, payload) {
  if (emailQueue) {
    await emailQueue.add(jobName, payload, DEFAULT_JOB_OPTS);
    return { queued: true };
  }
  await runEmailJob(jobName, payload);
  return { queued: false };
}

// The actual work — shared by the inline fallback and the worker process.
export async function runEmailJob(jobName, payload) {
  switch (jobName) {
    case JOB_INVITE:
      return sendInviteEmail(payload);
    case JOB_USERNAME:
      return sendUsernameConfirmEmail(payload);
    default:
      throw new Error(`Unknown email job: ${jobName}`);
  }
}
