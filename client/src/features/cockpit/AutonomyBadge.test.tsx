import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutonomyBadge } from "./AutonomyBadge";

describe("AutonomyBadge — AUTO vs needs-human (text + icon, never color-only)", () => {
  it("auto ⇒ AUTO / AI acts alone", () => {
    const { container } = render(<AutonomyBadge status="auto" reason={null} />);
    expect(container.textContent).toMatch(/AUTO/);
    expect(container.textContent).toMatch(/AI acts alone/);
  });
  it("needs_human money ⇒ money reason", () => {
    const { container } = render(<AutonomyBadge status="needs_human" reason="money" />);
    expect(container.textContent).toMatch(/Needs human/);
    expect(container.textContent).toMatch(/money/);
  });
  it("needs_human level ⇒ escalated", () => {
    const { container } = render(<AutonomyBadge status="needs_human" reason="level" />);
    expect(container.textContent).toMatch(/escalated/);
  });
  it("needs_human gates ⇒ sample / policy", () => {
    const { container } = render(<AutonomyBadge status="needs_human" reason="gates" />);
    expect(container.textContent).toMatch(/sample/);
  });
});
