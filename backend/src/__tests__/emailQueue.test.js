import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the email transport so nothing real is sent.
vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  dispatchEmail,
  runEmailJob,
  emailQueue,
  JOB_INVITE,
  JOB_USERNAME,
} from "../queues/emailQueue.js";
import { sendInviteEmail, sendUsernameConfirmEmail } from "../utils/email.js";

// REDIS_URL is unset in the test env, so we exercise the inline fallback path.
describe("email queue (fallback mode, no REDIS_URL)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has no queue instance when REDIS_URL is unset", () => {
    expect(emailQueue).toBeNull();
  });

  it("dispatchEmail sends an invite inline and reports not-queued", async () => {
    const payload = { toEmail: "a@b.com", inviterName: "X", tripName: "Trip" };
    const res = await dispatchEmail(JOB_INVITE, payload);
    expect(res.queued).toBe(false);
    expect(sendInviteEmail).toHaveBeenCalledWith(payload);
  });

  it("dispatchEmail sends a username-confirm inline", async () => {
    const payload = { toEmail: "a@b.com", name: "X", username: "abcdefghijkl" };
    await dispatchEmail(JOB_USERNAME, payload);
    expect(sendUsernameConfirmEmail).toHaveBeenCalledWith(payload);
  });

  it("runEmailJob routes each job name to the right sender", async () => {
    await runEmailJob(JOB_INVITE, { toEmail: "x@y.com" });
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);
    await runEmailJob(JOB_USERNAME, { toEmail: "x@y.com" });
    expect(sendUsernameConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("runEmailJob throws for an unknown job name", async () => {
    await expect(runEmailJob("bogus", {})).rejects.toThrow(/Unknown email job/);
  });
});
