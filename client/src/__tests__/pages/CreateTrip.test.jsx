import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/axios", () => ({ default: { post: vi.fn() } }));
// Stub the user search so we can add a known person with one click.
vi.mock("../../components/UserSearchSelect", () => ({
  default: ({ onSelect }) => (
    <button onClick={() => onSelect({ _id: "u1", username: "bob", name: "Bob" })}>mock-add-user</button>
  ),
}));

import CreateTrip from "../../pages/CreateTrip";

function renderPage() {
  return render(<MemoryRouter><CreateTrip /></MemoryRouter>);
}

// Walk the wizard from the destination step to the Invite step (step 3).
async function gotoInviteStep() {
  fireEvent.change(screen.getByPlaceholderText(/Search city, state or country/i), { target: { value: "Goa" } });
  fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));      // → name
  fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));      // → dates
  fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));      // → invite
  await screen.findByText(/Invite your friends/i);
}

describe("CreateTrip — invite step member management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
  });

  it("adds a person and can change their role instantly (viewer ⇄ editor)", async () => {
    renderPage();
    await gotoInviteStep();

    fireEvent.click(screen.getByText("mock-add-user"));
    expect(await screen.findByText("Bob")).toBeInTheDocument();

    const group = screen.getByRole("group", { name: /Role for Bob/i });
    const viewBtn = within(group).getByRole("button", { name: /View/i });
    const editBtn = within(group).getByRole("button", { name: /Edit/i });

    // Defaults to viewer (the selected access level).
    expect(viewBtn).toHaveAttribute("aria-pressed", "true");
    expect(editBtn).toHaveAttribute("aria-pressed", "false");

    // Flip to editor instantly.
    fireEvent.click(editBtn);
    expect(editBtn).toHaveAttribute("aria-pressed", "true");
    expect(viewBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("removes a wrongly-added person from the list instantly", async () => {
    renderPage();
    await gotoInviteStep();
    fireEvent.click(screen.getByText("mock-add-user"));
    await screen.findByText("Bob");

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    await waitFor(() => expect(screen.queryByText("Bob")).not.toBeInTheDocument());
  });

  it("explains the selected default role", async () => {
    renderPage();
    await gotoInviteStep();
    // Default is viewer → shows the viewer capability copy.
    expect(screen.getByText(/can't edit the plan/i)).toBeInTheDocument();
    // Switch default to editor.
    fireEvent.click(screen.getByRole("button", { name: /Can edit/i }));
    expect(screen.getByText(/only the owner changes roles/i)).toBeInTheDocument();
  });
});
