import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Dashboard fetches on mount and reads auth context — mock both.
vi.mock("../../api/axios", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { _id: "u1", name: "Test User", username: "testuser1234" },
    logout: vi.fn(),
  }),
}));

import Dashboard from "../../pages/Dashboard";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard navbar logo", () => {
  it("renders the Wohoo.in text logo", () => {
    renderDashboard();
    expect(screen.getByText("Wohoo")).toBeInTheDocument();
    expect(screen.getByText(".in")).toBeInTheDocument();
  });

  it("exposes the logo as an accessible home button", () => {
    renderDashboard();
    expect(
      screen.getByRole("button", { name: /wohoo\.in home/i })
    ).toBeInTheDocument();
  });

  it("uses the serif brand font for the logo", () => {
    renderDashboard();
    expect(screen.getByText("Wohoo").className).toContain("font-serif");
  });
});
