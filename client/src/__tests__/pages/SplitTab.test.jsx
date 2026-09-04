import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../../api/axios", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a), delete: (...a) => del(...a) },
}));

import SplitTab from "../../pages/trip/SplitTab";

const owner = { _id: "u1", name: "Alice" };
const editor = { _id: "u2", name: "Bob" };
const viewerU = { _id: "u3", name: "Cara" };
const trip = {
  _id: "t1",
  members: [
    { user: owner, role: "owner" },
    { user: editor, role: "editor" },
    { user: viewerU, role: "viewer" },
  ],
};

const expense = {
  _id: "e1",
  title: "Dinner",
  description: "",
  amount: 90,
  currency: "INR",
  paidBy: owner,
  splitMethod: "equal",
  participants: [{ user: owner, owed: 30 }, { user: editor, owed: 30 }, { user: viewerU, owed: 30 }],
};

const balances = {
  total: 90,
  currency: "INR",
  balances: [
    { user: owner, former: false, paid: 90, owed: 30, net: 60 },
    { user: editor, former: false, paid: 0, owed: 30, net: -30 },
    { user: viewerU, former: true, paid: 0, owed: 30, net: -30 },
  ],
  settlements: [{ from: "u2", to: "u1", amount: 30 }],
};

function routeGet(url) {
  if (url.includes("/balances")) return Promise.resolve({ data: balances });
  if (url.includes("/expenses")) return Promise.resolve({ data: { expenses: [expense], hasMore: false, nextCursor: null } });
  return Promise.resolve({ data: {} });
}

function renderTab(props = {}) {
  return render(<SplitTab trip={trip} canEdit isMember currentUser={owner} {...props} />);
}

describe("SplitTab — expenses & splits", () => {
  beforeEach(() => {
    get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
    get.mockImplementation(routeGet);
    post.mockResolvedValue({ data: { expense } });
    put.mockResolvedValue({ data: { expense } });
    del.mockResolvedValue({ data: { success: true } });
  });

  it("shows Add for editors; hides all edit controls for viewers", async () => {
    const { rerender } = renderTab();
    expect(await screen.findByText("Dinner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add expense/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit expense/i })).toBeInTheDocument();

    rerender(<SplitTab trip={trip} canEdit={false} isMember currentUser={viewerU} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /add expense/i })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /edit expense/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete expense/i })).not.toBeInTheDocument();
  });

  it("opens the Add modal with every trip member selectable to split", async () => {
    renderTab();
    await screen.findByText("Dinner");
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    const dialogTitle = await screen.findByText("Add an expense");
    const modal = dialogTitle.closest("div.bg-white");
    // All three members appear as split candidates + payer options.
    ["Alice", "Bob", "Cara"].forEach((n) => expect(within(modal).getAllByText(new RegExp(n)).length).toBeGreaterThan(0));
  });

  it("edits an existing expense via PUT (pre-filled edit modal)", async () => {
    renderTab();
    await screen.findByText("Dinner");
    fireEvent.click(screen.getByRole("button", { name: /edit expense/i }));

    expect(await screen.findByText("Edit expense")).toBeInTheDocument();
    // Pre-filled from the saved expense.
    expect(screen.getByDisplayValue("Dinner")).toBeInTheDocument();
    expect(screen.getByDisplayValue("90")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/trips/t1/expenses/e1", expect.objectContaining({ title: "Dinner", amount: 90 }))
    );
  });

  it("marks a former member's balance with a 'Left trip' badge", async () => {
    renderTab();
    await screen.findByText("Dinner");
    fireEvent.click(screen.getByRole("button", { name: /splits/i }));
    expect(await screen.findByText("Left trip")).toBeInTheDocument();
  });
});
