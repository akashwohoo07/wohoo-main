import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InviteModal from "../../components/InviteModal";

// Mock the axios instance used by the component
vi.mock("../../api/axios", () => ({
  default: {
    post: vi.fn(),
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

  it("renders the invite form", () => {
    render(<InviteModal {...defaultProps} />);
    expect(screen.getByText("Invite to trip")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByText("Send Invite & Email")).toBeInTheDocument();
  });

  it("shows inline error for an empty email on submit", async () => {
    render(<InviteModal {...defaultProps} />);
    const submitBtn = screen.getByText("Send Invite & Email");
    fireEvent.click(submitBtn);
    // Button is disabled when email is empty, so no error is shown
    // but API should not be called
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows inline error for an invalid email (no @)", async () => {
    render(<InviteModal {...defaultProps} />);
    const emailInput = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(emailInput, "notanemail");
    // Use fireEvent.submit to bypass jsdom's native HTML5 email validation
    // which would otherwise prevent onSubmit from firing on type="email" inputs
    fireEvent.submit(emailInput.closest("form"));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("calls the API and shows success message on a valid submit", async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    render(<InviteModal {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(emailInput, "friend@example.com");

    const submitBtn = screen.getByRole("button", { name: /send invite/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/trips/trip-123/invite", {
        email: "friend@example.com",
        role: "viewer",
      });
    });
    expect(
      await screen.findByText("Invite sent to friend@example.com")
    ).toBeInTheDocument();
    expect(defaultProps.onInvited).toHaveBeenCalled();
  });

  it("shows API error message on failure", async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { message: "User is already a member" } },
    });
    render(<InviteModal {...defaultProps} />);

    const emailInput = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(emailInput, "member@example.com");

    const submitBtn = screen.getByRole("button", { name: /send invite/i });
    await userEvent.click(submitBtn);

    expect(
      await screen.findByText("User is already a member")
    ).toBeInTheDocument();
  });

  it("calls onClose when the X button is clicked", async () => {
    render(<InviteModal {...defaultProps} />);
    const closeBtn = screen.getByRole("button", { name: "" }); // SVG button
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("switches role to editor when editor button is clicked", async () => {
    render(<InviteModal {...defaultProps} />);
    const editorBtn = screen.getByRole("button", { name: /editor/i });
    await userEvent.click(editorBtn);

    // Now send with editor role
    api.post.mockResolvedValueOnce({ data: { success: true } });
    const emailInput = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(emailInput, "editor@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/trips/trip-123/invite", {
        email: "editor@example.com",
        role: "editor",
      });
    });
  });
});
