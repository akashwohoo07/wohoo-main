import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock("../../api/axios", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a) },
}));

import NotificationBell from "../../components/NotificationBell";

const invite = (over = {}) => ({
  _id: "n1", type: "trip_invite", actor: { name: "Alice" },
  trip: { _id: "t1", name: "Goa" }, community: null, request: null,
  invitation: "inv1", token: "tok1", message: "Alice invited you to join \"Goa\"",
  status: "pending", actionable: true, outcome: null, read: false,
  createdAt: new Date().toISOString(), ...over,
});

function routeCount(c) { return (url) => {
  if (url.includes("unread-count")) return Promise.resolve({ data: { count: c } });
  return Promise.resolve({ data: { notifications: [] } });
}; }

function renderBell() { return render(<MemoryRouter><NotificationBell /></MemoryRouter>); }

describe("NotificationBell action-state", () => {
  beforeEach(() => {
    get.mockReset(); post.mockReset(); patch.mockReset();
    post.mockResolvedValue({ data: { success: true } });
    patch.mockResolvedValue({ data: { success: true } });
  });

  it("shows Accept/Decline for a live (actionable) invite", async () => {
    get.mockImplementation((url) =>
      url.includes("unread-count") ? Promise.resolve({ data: { count: 1 } })
        : Promise.resolve({ data: { notifications: [invite()] } }));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("shows a 'Joined trip' chip (not buttons) for a resolved accepted invite", async () => {
    get.mockImplementation((url) =>
      url.includes("unread-count") ? Promise.resolve({ data: { count: 0 } })
        : Promise.resolve({ data: { notifications: [invite({ actionable: false, outcome: "accepted", status: "accepted", read: true })] } }));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByText("Joined trip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it("shows 'Invite cancelled' for a cancelled invite (kept in sync)", async () => {
    get.mockImplementation((url) =>
      url.includes("unread-count") ? Promise.resolve({ data: { count: 0 } })
        : Promise.resolve({ data: { notifications: [invite({ actionable: false, outcome: "cancelled", status: "cancelled", read: true })] } }));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    expect(await screen.findByText("Invite cancelled")).toBeInTheDocument();
  });

  it("declining flips the row to a 'Declined' chip in place (no removal)", async () => {
    get.mockImplementation((url) =>
      url.includes("unread-count") ? Promise.resolve({ data: { count: 1 } })
        : Promise.resolve({ data: { notifications: [invite()] } }));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByRole("button", { name: /decline/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/trips/invitations/tok1/respond", { action: "decline" }));
    // Row persists (the message is still there), now showing the resolved chip.
    expect(await screen.findByText("Declined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /decline/i })).not.toBeInTheDocument();
  });

  it("re-syncs (re-fetches) if the action fails because it was already resolved elsewhere", async () => {
    get.mockImplementation((url) =>
      url.includes("unread-count") ? Promise.resolve({ data: { count: 1 } })
        : Promise.resolve({ data: { notifications: [invite()] } }));
    post.mockRejectedValueOnce(new Error("404"));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    const listCallsBefore = get.mock.calls.filter((c) => c[0].includes("/notifications?")).length;
    fireEvent.click(await screen.findByRole("button", { name: /accept/i }));
    await waitFor(() =>
      expect(get.mock.calls.filter((c) => c[0].includes("/notifications?")).length).toBeGreaterThan(listCallsBefore)
    );
  });
});
