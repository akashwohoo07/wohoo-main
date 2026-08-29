// Read-replica routing.
//
// Browse/display reads that tolerate a little replication lag can be served by a
// secondary, taking load off the primary. This is OPT-IN via USE_READ_REPLICA so
// the default (primary) is always correct — including read-after-write flows.
//
// `secondaryPreferred` reads from a secondary when one exists and falls back to
// the primary otherwise, so it is safe on single-node setups (dev/CI/tests).
//
// Only apply analyticsReadPreference() to reads where slight staleness is
// invisible (dashboards, search, public profiles, follower lists). Keep
// read-after-write-sensitive reads (a trip just created, auth checks, anything
// inside a write flow) on the primary.
export const SECONDARY_PREFERRED = "secondaryPreferred";
export const PRIMARY = "primary";

export function analyticsReadPreference() {
  return process.env.USE_READ_REPLICA === "true" ? SECONDARY_PREFERRED : PRIMARY;
}
