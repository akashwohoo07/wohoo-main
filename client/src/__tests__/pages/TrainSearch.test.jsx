import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const get = vi.fn();
vi.mock("../../api/axios", () => ({ default: { get: (...a) => get(...a) } }));

// Stub the station autocomplete so a station (with coords) can be picked in one click.
let stationSeq = 0;
vi.mock("../../components/StationInput", () => ({
  default: ({ onSelect, placeholder }) => (
    <button
      onClick={() =>
        onSelect(
          stationSeq++ % 2 === 0
            ? { name: "New Delhi", label: "New Delhi, Delhi", lat: 28.64, lng: 77.22 }
            : { name: "Bhopal", label: "Bhopal, MP", lat: 23.26, lng: 77.4 }
        )
      }
    >
      pick:{placeholder}
    </button>
  ),
}));

import { TrainSearchPanel } from "../../pages/trip/TransportSearch";

describe("TrainSearchPanel", () => {
  beforeEach(() => { get.mockReset(); stationSeq = 0; });

  it("manual mode adds a train with both station coords (so the track can draw)", async () => {
    const onFill = vi.fn();
    render(<TrainSearchPanel onFill={onFill} />);
    fireEvent.click(screen.getByRole("button", { name: /^Manual$/ }));

    // Add button disabled until both stations chosen.
    const addBtn = screen.getByRole("button", { name: /Add train/i });
    expect(addBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /pick:Search departure/i }));
    fireEvent.click(screen.getByRole("button", { name: /pick:Search arrival/i }));
    expect(addBtn).not.toBeDisabled();

    fireEvent.click(addBtn);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStation: "New Delhi, Delhi", toStation: "Bhopal, MP",
        fromLat: 28.64, fromLng: 77.22, toLat: 23.26, toLng: 77.4,
        title: "New Delhi → Bhopal",
      })
    );
  });

  it("PNR fill takes date & time from the ticket (no manual date), platform in notes", async () => {
    const onFill = vi.fn();
    get.mockImplementation((url) => {
      if (url.includes("/transport/pnr")) {
        return Promise.resolve({
          data: { pnr: {
            trainName: "Shatabdi", trainNum: "12001", from: "New Delhi", to: "Bhopal",
            date: "2026-10-01", departureTime: "06:00", arrivalTime: "14:30", platform: "3",
          } },
        });
      }
      if (url.includes("/transport/geocode")) {
        return Promise.resolve({ data: { result: { label: url.includes("Delhi") ? "New Delhi" : "Bhopal", lat: 1, lng: 2 } } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<TrainSearchPanel onFill={onFill} />);
    fireEvent.click(screen.getByRole("button", { name: /^PNR$/ }));
    // No travel-date input in PNR mode.
    expect(screen.queryByText(/Travel Date/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/10-digit PNR/i), { target: { value: "1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/i }));

    fireEvent.click(await screen.findByRole("button", { name: /Use this train/i }));
    await waitFor(() =>
      expect(onFill).toHaveBeenCalledWith(
        expect.objectContaining({ date: "2026-10-01", time: "06:00", endTime: "14:30" })
      )
    );
    expect(onFill.mock.calls[0][0].notes).toMatch(/Platform: 3/);
  });
});
