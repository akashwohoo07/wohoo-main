import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Accept either name: MONGODB_URI (deploys/.env.example) or MONGO_URL (legacy local .env)
    const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
    if (!uri) throw new Error("MONGODB_URI/MONGO_URL is not set");
    console.log("⏳ Connecting to MongoDB...");
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000, // fail fast instead of hanging silently
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  }
};

export default connectDB;