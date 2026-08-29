import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthHero from "../../components/AuthHero";

describe("AuthHero", () => {
  it("renders both Log In and Sign Up tabs", () => {
    render(<AuthHero initialTab="login" />);
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
  });

  it("shows the login Google link by default", () => {
    render(<AuthHero initialTab="login" />);
    const link = screen.getByRole("link", { name: /continue with google/i });
    expect(link.getAttribute("href")).toContain("mode=login");
  });

  it("defaults to the signup tab when initialTab is signup", () => {
    render(<AuthHero initialTab="signup" />);
    const link = screen.getByRole("link", { name: /sign up with google/i });
    expect(link.getAttribute("href")).toContain("mode=signup");
    // Signup helper note is shown
    expect(screen.getByText(/no\s+duplicate accounts/i)).toBeInTheDocument();
  });

  it("switches from login to signup when the Sign Up tab is clicked", async () => {
    render(<AuthHero initialTab="login" />);
    expect(
      screen.getByRole("link", { name: /continue with google/i }).getAttribute("href")
    ).toContain("mode=login");

    await userEvent.click(screen.getByRole("button", { name: "Sign Up" }));

    const link = screen.getByRole("link", { name: /sign up with google/i });
    expect(link.getAttribute("href")).toContain("mode=signup");
  });

  it("renders the Wohoo.in brand logo", () => {
    render(<AuthHero initialTab="login" />);
    expect(screen.getByText("Wohoo")).toBeInTheDocument();
    expect(screen.getByText(".in")).toBeInTheDocument();
  });

  it("has a back button linking to the home route", () => {
    render(<AuthHero initialTab="login" />);
    const back = screen.getByRole("link", { name: /back to home/i });
    expect(back.getAttribute("href")).toBe("/");
  });
});
