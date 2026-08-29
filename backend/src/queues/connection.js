import IORedis from "ioredis";

// Shared factory for BullMQ Redis connections. BullMQ requires ioredis with
// maxRetriesPerRequest set to null. Each queue/worker gets its own connection.
export function createQueueConnection() {
  return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}
