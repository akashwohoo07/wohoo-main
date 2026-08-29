import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet;

export async function setup() {
  // Replica set is required for MongoDB transactions (used by followController)
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_TEST_URI = replSet.getUri();
}

export async function teardown() {
  await replSet.stop();
}
