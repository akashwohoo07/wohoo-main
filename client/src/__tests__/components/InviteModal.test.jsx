import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InviteModal from "../../components/InviteModal";

// Mock the axios instance used by the component (post for invite, get for user search)
vi.mock("../../api/axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: { users: [] } }),
  },
}));

import api from "../../api/axios";

describe("InviteModal", () => {
  const defaultProps = {
    tripId: "trip-123",
    onClose: vi.fn(),
    onInvited: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The modal defaults to the Username tab; these tests exercise the Email flow.
  const switchToEmail = async () => {
    await userEvent.click(screen.getByRole("button", { name: /^email$/i }));
  };

  it("renders with a username/email toggle and access levels", () => {
    render(<InviteModal {...defaultProps} />);
    expect(screen.getByText("Invite to trip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^username$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^email$/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search people by username/i)).toBeInTheDocument();
  });

  it("shows the email form after switching to the Email tab", async () => {
    render(<InviteModal {...defaultProps} />);
    await switchToEmail();
    expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByText("Send Invite & Email")).toBeInTheDocument();
  });

  it("does not call the API when the email is empty (button disabled)", async () => {
    render(<InviteModal {...defaultProps} />);
    await switchToEmail();
    fireEvent.click(screen.getByText("Send Invite & Email"));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows an inline error for an invalid email (no @)", async () => {
    render(<InviteModal {...defaultProps} />);
    await switchToEmail();
    const emailInput = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(emailInput, "notanemail");
    fireEvent.submit(emailInput.closest("form"));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("calls the API and shows a success message on a valid email submit", async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    render(<InviteModal {...defaultProps} />);
    await switchToEmail();
    await userEvent.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/trips/trip-123/invite", {
        email: "friend@example.com",
        role: "viewer",
      });
    });
    expect(await screen.findByText("Invite sent to friend@example.com")).toBeInTheDocument();
    expect(defaultProps.onInvited).toHaveBeenCalled();
  });

  it("shows the API error message on failure", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { message: "User is already a member" } } });
    render(<InviteModal {...defaultProps} />);
    await switchToEmail();
    await userEvent.type(screen.getByPlaceholderText("friend@example.com"), "member@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText("User is already a member")).toBeInTheDocument();
  });

  it("calls onClose when the X button is clicked", async () => {
    render(<InviteModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invites with the editor role when editor is selected", async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    render(<InviteModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    await switchToEmail();
    await userEvent.type(screen.getByPlaceholderText("friend@example.com"), "editor@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/trips/trip-123/invite", {
        email: "editor@example.com",
        role: "editor",
      });
    });
  });
});
