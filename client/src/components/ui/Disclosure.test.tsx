import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("renders title, count pill and children", () => {
    render(
      <Disclosure title="lower quality" count={3}>
        <p>body content</p>
      </Disclosure>,
    );
    expect(screen.getByText("lower quality")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("respects defaultOpen on the native <details> (free a11y toggle)", () => {
    const { container, rerender } = render(<Disclosure title="t">x</Disclosure>);
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    rerender(
      <Disclosure title="t" defaultOpen>
        x
      </Disclosure>,
    );
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("omits the count pill when count is not provided", () => {
    render(<Disclosure title="solo">x</Disclosure>);
    expect(screen.getByText("solo")).toBeInTheDocument();
  });

  it("controlled mode reflects the `open` prop, not internal state", () => {
    const { container, rerender } = render(
      <Disclosure title="t" open={false} onOpenChange={() => {}}>
        x
      </Disclosure>,
    );
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    rerender(
      <Disclosure title="t" open onOpenChange={() => {}}>
        x
      </Disclosure>,
    );
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("controlled mode reports a changed open state via onOpenChange", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <Disclosure title="t" open={false} onOpenChange={onOpenChange}>
        x
      </Disclosure>,
    );
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders a trailing slot beside the title", () => {
    render(
      <Disclosure title="t" trailing={<span>status pill</span>}>
        x
      </Disclosure>,
    );
    expect(screen.getByText("status pill")).toBeInTheDocument();
  });
});
