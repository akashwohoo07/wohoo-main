import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const del = vi.fn();
vi.mock("../../api/axios", () => ({
  default: { get: (...a) => get(...a), delete: (...a) => del(...a), post: vi.fn() },
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Test User", username: "tester" }, logout: vi.fn() }),
}));

import Wishlist from "../../pages/Wishlist";

const ITEMS = [
  { _id: "w1", kind: "trip", refId: "t1", trip: "t1", title: "Goa Getaway", subtitle: "Goa, India", image: "" },
  { _id: "w2", kind: "hotel", refId: "h1", title: "Taj Palace", subtitle: "Mumbai", rating: 4.6, image: "" },
];

function renderPage() {
  return render(<MemoryRouter><Wishlist /></MemoryRouter>);
}

describe("Wishlist page", () => {
  beforeEach(() => {
    get.mockReset(); del.mockReset();
    get.mockImplementation((url) => {
      if (url.includes("/discover/wishlist")) {
        const kind = new URL("http://x/" + url).searchParams.get("kind");
        const items = kind ? ITEMS.filter((i) => i.kind === kind) : ITEMS;
        return Promise.resolve({ data: { items, hasMore: false, nextCursor: null } });
      }
      return Promise.resolve({ data: {} });
    });
    del.mockResolvedValue({ data: { success: true } });
  });

  it("lists saved items", async () => {
    renderPage();
    expect(await screen.findByText("Goa Getaway")).toBeInTheDocument();
    expect(screen.getByText("Taj Palace")).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();
  });

  it("filters by kind when a chip is selected", async () => {
    renderPage();
    await screen.findByText("Goa Getaway");
    fireEvent.click(screen.getByRole("button", { name: "Hotels" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("kind=hotel")));
    await waitFor(() => expect(screen.queryByText("Goa Getaway")).not.toBeInTheDocument());
    expect(screen.getByText("Taj Palace")).toBeInTheDocument();
  });

  it("removes an item optimistically and calls the delete API", async () => {
    renderPage();
    await screen.findByText("Goa Getaway");
    const removeButtons = screen.getAllByRole("button", { name: /remove from wishlist/i });
    fireEvent.click(removeButtons[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith("/discover/wishlist/w1"));
    expect(screen.queryByText("Goa Getaway")).not.toBeInTheDocument();
  });

  it("shows an empty state with a Discover CTA", async () => {
    get.mockImplementation((url) => {
      if (url.includes("/discover/wishlist")) return Promise.resolve({ data: { items: [], hasMore: false, nextCursor: null } });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discover trips/i })).toBeInTheDocument();
  });
});
