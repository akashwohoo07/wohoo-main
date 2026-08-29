import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import { startEmailWorker } from "./emailWorker.js";
import { startMaintenanceWorker } from "./maintenanceWorker.js";
import { scheduleMaintenanceJobs } from "../queues/maintenanceQueue.js";

// Single worker process that hosts all background queue processors. Runs
// separately from the API (`npm run worker`) so background work never competes
// with request handling.
if (!process.env.REDIS_URL) {
  console.error("❌ REDIS_URL is required to run workers. Exiting.");
  process.exit(1);
}

// Maintenance jobs touch MongoDB, so the worker process needs a DB connection.
await connectDB();

const email = startEmailWorker();
const maintenance = startMaintenanceWorker();
await scheduleMaintenanceJobs();

console.log("👷 Workers started: email, maintenance");

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.allSettled([
    email.worker.close(),
    maintenance.worker.close(),
  ]);
  await Promise.allSettled([
    email.connection.quit(),
    maintenance.connection.quit(),
  ]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
