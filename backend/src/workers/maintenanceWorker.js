import { Worker } from "bullmq";
import { createQueueConnection } from "../queues/connection.js";
import { MAINTENANCE_QUEUE_NAME, runMaintenanceJob } from "../queues/maintenanceQueue.js";

// Starts the maintenance worker (trip status sync, etc.).
export function startMaintenanceWorker() {
  const connection = createQueueConnection();
  const worker = new Worker(
    MAINTENANCE_QUEUE_NAME,
    async (job) => runMaintenanceJob(job.name),
    { connection }
  );

  worker.on("completed", (job, result) =>
    console.log(`✅ maintenance ${job.name} done`, result)
  );
  worker.on("failed", (job, err) =>
    console.error(`❌ maintenance ${job?.name} failed:`, err.message)
  );

  return { worker, connection };
}
