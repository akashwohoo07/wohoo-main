import Follow from "../models/Follow.js";
import User from "../models/User.js";

// Reconcile the denormalized followersCount / followingCount on User against the
// source of truth (the Follow collection). Transactions keep these correct in
// normal operation; this is a self-healing safety net for any drift (crashes,
// manual edits, historical bugs).
//
// Efficiency: we only touch users that either currently have follow edges or
// have a stored non-zero count that may need zeroing — never a blind scan of
// every user. Writes are chunked bulkWrites.
export async function reconcileFollowCounts() {
  const [followerAgg, followingAgg] = await Promise.all([
    Follow.aggregate([{ $group: { _id: "$following", c: { $sum: 1 } } }]),
    Follow.aggregate([{ $group: { _id: "$follower", c: { $sum: 1 } } }]),
  ]);

  const followers = new Map(followerAgg.map((r) => [String(r._id), r.c]));
  const following = new Map(followingAgg.map((r) => [String(r._id), r.c]));

  // Union of everyone with edges, plus anyone whose stored count is non-zero
  // (so counts that should now be zero get corrected).
  const ids = new Set([...followers.keys(), ...following.keys()]);
  const staleNonZero = await User.find(
    { $or: [{ followersCount: { $gt: 0 } }, { followingCount: { $gt: 0 } }] },
    "_id"
  ).lean();
  staleNonZero.forEach((u) => ids.add(String(u._id)));

  const ops = [];
  for (const id of ids) {
    ops.push({
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            followersCount: followers.get(id) || 0,
            followingCount: following.get(id) || 0,
          },
        },
      },
    });
  }

  let corrected = 0;
  const CHUNK = 1000;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const res = await User.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
    corrected += res.modifiedCount || 0;
  }

  return { usersChecked: ids.size, corrected };
}
