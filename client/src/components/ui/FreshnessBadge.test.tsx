import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessBadge } from "./FreshnessBadge";

describe("FreshnessBadge (BR-12 staleness)", () => {
  it("shows a stale warning via TEXT when stale", () => {
    render(<FreshnessBadge freshness="2026-01-01T00:00:00Z" stale={true} />);
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });

  it("fails closed to stale when staleness is unknown", () => {
    render(<FreshnessBadge freshness={null} stale={null} />);
    expect(screen.getByText(/stale/)).toBeInTheDocument();
    expect(screen.getByText(/no date/)).toBeInTheDocument();
  });

  it("shows fresh + the date when fresh", () => {
    render(<FreshnessBadge freshness="2026-06-18T10:00:00Z" stale={false} />);
    expect(screen.getByText(/fresh/)).toBeInTheDocument();
    expect(screen.getByText("2026-06-18")).toBeInTheDocument();
  });
});
