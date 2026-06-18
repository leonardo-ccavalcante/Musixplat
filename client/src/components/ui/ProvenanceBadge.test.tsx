import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProvenanceBadge } from "./ProvenanceBadge";

describe("ProvenanceBadge (read-only attribution §3.10)", () => {
  it("renders the bracketed code as TEXT (not color only) with a meaning title", () => {
    render(<ProvenanceBadge prov="[C]" />);
    const el = screen.getByText("[C]");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("title");
    expect(el).toHaveAttribute("aria-label", "provenance [C]");
  });

  it("renders nothing when prov is absent (no fabricated provenance)", () => {
    const { container } = render(<ProvenanceBadge prov={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
