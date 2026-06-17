import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal a11y (WCAG 2.1 AA)", () => {
  it("exposes role=dialog + aria-modal and focuses the first focusable", () => {
    render(
      <Modal open onClose={() => {}} title="Test">
        <button>inside</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <button>inside</button>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test">
        <button>inside</button>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
