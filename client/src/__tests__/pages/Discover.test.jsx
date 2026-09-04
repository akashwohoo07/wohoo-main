import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../../api/axios", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), delete: (...a) => del(...a) },
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Test User", username: "tester" }, logout: vi.fn() }),
}));

import Discover from "../../pages/Discover";

const TRIP = {
  _id: "t1",
  name: "Goa Getaway",
  destination: { name: "Goa", fullLabel: "Goa, India" },
  coverPhoto: "",
  membersCount: 2,
  owner: { name: "Alice", username: "alice" },
};

function route(url) {
  if (url.includes("/discover/wishlist/keys")) return Promise.resolve({ data: { refIds: [] } });
  if (url.includes("/discover/trips")) return Promise.resolve({ data: { trips: [TRIP], hasMore: false, nextCursor: null } });
  return Promise.resolve({ data: {} }); // notifications etc.
}

function renderPage() {
  return render(<MemoryRouter><Discover /></MemoryRouter>);
}

describe("Discover page", () => {
  beforeEach(() => {
    get.mockReset(); post.mockReset(); del.mockReset();
    get.mockImplementation(route);
    post.mockResolvedValue({ data: { success: true, item: { _id: "w1" } } });
    del.mockResolvedValue({ data: { success: true } });
  });

  it("renders public trips fetched from the discover API", async () => {
    renderPage();
    expect(await screen.findByText("Goa Getaway")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(expect.stringContaining("/discover/trips"));
  });

  it("saves a trip to the wishlist when the heart is clicked", async () => {
    renderPage();
    await screen.findByText("Goa Getaway");
    fireEvent.click(screen.getByRole("button", { name: /save to wishlist/i }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/discover/wishlist", expect.objectContaining({ kind: "trip", refId: "t1", title: "Goa Getaway" }))
    );
    // Heart flips to the "remove" state optimistically.
    expect(await screen.findByRole("button", { name: /remove from wishlist/i })).toBeInTheDocument();
  });

  it("shows filled hearts for already-saved trips", async () => {
    get.mockImplementation((url) => {
      if (url.includes("/discover/wishlist/keys")) return Promise.resolve({ data: { refIds: ["t1"] } });
      return route(url);
    });
    renderPage();
    expect(await screen.findByRole("button", { name: /remove from wishlist/i })).toBeInTheDocument();
  });

  it("types a query and re-fetches with the q param (debounced)", async () => {
    renderPage();
    await screen.findByText("Goa Getaway");
    fireEvent.change(screen.getByRole("textbox", { name: /search public trips/i }), { target: { value: "goa" } });
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("q=goa")));
  });

  it("shows an empty state when there are no trips", async () => {
    get.mockImplementation((url) => {
      if (url.includes("/discover/wishlist/keys")) return Promise.resolve({ data: { refIds: [] } });
      if (url.includes("/discover/trips")) return Promise.resolve({ data: { trips: [], hasMore: false, nextCursor: null } });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    expect(await screen.findByText(/no public trips yet/i)).toBeInTheDocument();
  });
});
