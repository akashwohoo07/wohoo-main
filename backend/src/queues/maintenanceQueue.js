import { Queue } from "bullmq";
import { createQueueConnection } from "./connection.js";

export const MAINTENANCE_QUEUE_NAME = "maintenance";
export const JOB_SYNC_TRIP_STATUS = "sync-trip-status";
export const JOB_SYNC_FOLLOW_COUNTS = "sync-follow-counts";

// Producer. Null when REDIS_URL is unset (no scheduled jobs in that mode).
export const maintenanceQueue = process.env.REDIS_URL
  ? new Queue(MAINTENANCE_QUEUE_NAME, { connection: createQueueConnection() })
  : null;

// Register the repeatable jobs. BullMQ dedupes by jobId + repeat pattern, so
// calling this on every worker boot is idempotent.
export async function scheduleMaintenanceJobs() {
  if (!maintenanceQueue) return;
  await maintenanceQueue.add(
    JOB_SYNC_TRIP_STATUS,
    {},
    {
      repeat: { pattern: "*/15 * * * *" }, // every 15 minutes
      jobId: JOB_SYNC_TRIP_STATUS,
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
  // Self-healing safety net for the denormalized follower/following counters.
  // Transactions keep them correct in normal operation; this reconciles any
  // drift. Runs weekly off-peak (Sunday 04:00) since it scans the graph.
  await maintenanceQueue.add(
    JOB_SYNC_FOLLOW_COUNTS,
    {},
    {
      repeat: { pattern: "0 4 * * 0" },
      jobId: JOB_SYNC_FOLLOW_COUNTS,
      removeOnComplete: 20,
      removeOnFail: 20,
    }
  );
}

// The actual work — shared by the worker. Imported lazily so this module has no
// hard dependency on the DB layer (keeps it importable in any context).
export async function runMaintenanceJob(jobName) {
  switch (jobName) {
    case JOB_SYNC_TRIP_STATUS: {
      const Trip = (await import("../models/Trip.js")).default;
      return Trip.syncAllStatuses();
    }
    case JOB_SYNC_FOLLOW_COUNTS: {
      const { reconcileFollowCounts } = await import("../services/followCounts.js");
      return reconcileFollowCounts();
    }
    default:
      throw new Error(`Unknown maintenance job: ${jobName}`);
  }
}
