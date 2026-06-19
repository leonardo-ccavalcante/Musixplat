import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProvenanceLegend } from "./ProvenanceLegend";

describe("ProvenanceLegend (decodes [V]/[C]/[I] in plain language)", () => {
  it("renders each code with its plain-language word so a reader needn't know the acronyms", () => {
    render(<ProvenanceLegend />);
    expect(screen.getByText("[V]")).toBeInTheDocument();
    expect(screen.getByText("[I]")).toBeInTheDocument();
    expect(screen.getByText("[C]")).toBeInTheDocument();
    expect(screen.getByText(/measured/)).toBeInTheDocument();
    expect(screen.getByText(/inferred/)).toBeInTheDocument();
    expect(screen.getByText(/projected/)).toBeInTheDocument();
  });
});
