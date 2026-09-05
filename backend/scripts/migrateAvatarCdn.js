// One-off migration: rewrite avatar/cover URLs from the old r2.dev public URL to
// the new cdn.wohoo.in custom domain. The objects are the SAME (same bucket/key)
// — only the host changes — so this is lossless. Run on the server where
// MONGODB_URI is set:  fly ssh console -a <app> -C "node scripts/migrateAvatarCdn.js"
import mongoose from "mongoose";

const OLD = "https://pub-0a8c342fefe841ad9bb46fd3066da40d.r2.dev";
const NEW = "https://cdn.wohoo.in";
const uri = process.env.MONGODB_URI || process.env.MONGO_URL;

if (!uri) {
  console.error("No MONGODB_URI / MONGO_URL in env");
  process.exit(1);
}

await mongoose.connect(uri);
const users = mongoose.connection.collection("users");
const rx = "pub-0a8c342fefe841ad9bb46fd3066da40d\\.r2\\.dev";
const q = { $or: [{ avatar: { $regex: rx } }, { cover: { $regex: rx } }] };

const matched = await users.countDocuments(q);
const r = await users.updateMany(q, [
  {
    $set: {
      avatar: { $replaceOne: { input: { $ifNull: ["$avatar", ""] }, find: OLD, replacement: NEW } },
      cover: { $replaceOne: { input: { $ifNull: ["$cover", ""] }, find: OLD, replacement: NEW } },
    },
  },
]);
console.log(`avatar/cover CDN migration → matched ${matched}, modified ${r.modifiedCount}`);
await mongoose.disconnect();
process.exit(0);
