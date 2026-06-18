import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyPanel } from "./MoneyPanel";

describe("F-3.1/F-3.2 MoneyPanel", () => {
  it("renders the server seal contract", () => {
    render(<MoneyPanel summary={{ hasSignal: true, value: "120.00", seal: "confirmed", freshness: "2026-06-18" }} />);

    expect(screen.getByText(/seal: confirmed/i)).toBeInTheDocument();
  });

  it("renders no-signal as unreliable without a fabricated value", () => {
    render(<MoneyPanel summary={{ hasSignal: false, value: null, seal: "unreliable", freshness: null }} />);

    expect(screen.getByText(/no signal: unreliable/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
