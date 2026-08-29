import { Worker } from "bullmq";
import { createQueueConnection } from "../queues/connection.js";
import { EMAIL_QUEUE_NAME, runEmailJob } from "../queues/emailQueue.js";

// Starts the email worker. Called by the worker runner (workers/index.js).
export function startEmailWorker() {
  const connection = createQueueConnection();
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => runEmailJob(job.name, job.data),
    { connection, concurrency: 5 }
  );

  worker.on("completed", (job) =>
    console.log(`✅ email job ${job.id} (${job.name}) sent`)
  );
  worker.on("failed", (job, err) =>
    console.error(`❌ email job ${job?.id} (${job?.name}) failed:`, err.message)
  );

  return { worker, connection };
}
