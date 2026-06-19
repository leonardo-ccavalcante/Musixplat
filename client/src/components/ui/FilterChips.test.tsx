import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterChips, type ChipOption } from "./FilterChips";

const opts: ChipOption[] = [
  { key: "a", label: "alpha", count: 3 },
  { key: "b", label: "beta", count: 1 },
];

describe("FilterChips", () => {
  it("marks All as pressed when the active set is empty (= show everything)", () => {
    render(<FilterChips options={opts} active={new Set()} onToggle={vi.fn()} onClear={vi.fn()} ariaLabel="Filter" />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "alpha 3" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggling an option calls onToggle with its key; an active option is pressed", () => {
    const onToggle = vi.fn();
    render(<FilterChips options={opts} active={new Set(["a"])} onToggle={onToggle} onClear={vi.fn()} ariaLabel="Filter" />);
    expect(screen.getByRole("button", { name: "alpha 3" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "beta 1" }));
    expect(onToggle).toHaveBeenCalledWith("b");
  });

  it("clicking All calls onClear", () => {
    const onClear = vi.fn();
    render(<FilterChips options={opts} active={new Set(["a"])} onToggle={vi.fn()} onClear={onClear} ariaLabel="Filter" />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
