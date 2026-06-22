import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalStatusBadge } from "./EvalStatusBadge";

describe("EvalStatusBadge — never fakes a measured pass", () => {
  it("green + [I] provenance reads as inferred floor, NOT measured", () => {
    render(<EvalStatusBadge status="green" prov="[I]" />);
    expect(screen.getByText(/inferred floor/i)).toBeInTheDocument();
    expect(screen.queryByText(/measured/i)).toBeNull();
  });
  it("green + [V] provenance reads as a measured pass", () => {
    render(<EvalStatusBadge status="green" prov="[V]" />);
    expect(screen.getByText(/measured/i)).toBeInTheDocument();
  });
  it("null status reads as not yet evaluated", () => {
    render(<EvalStatusBadge status={null} prov={undefined} />);
    expect(screen.getByText(/not yet/i)).toBeInTheDocument();
  });
  it("non-null status with NO provenance is not asserted as a verdict (§3.10)", () => {
    render(<EvalStatusBadge status="green" prov={undefined} />);
    expect(screen.getByText(/no provenance/i)).toBeInTheDocument();
    expect(screen.queryByText(/measured pass/i)).toBeNull();
  });
});
