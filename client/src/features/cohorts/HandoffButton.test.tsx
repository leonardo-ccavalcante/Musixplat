import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HandoffActions } from "./HandoffButton";

// F-5.2 — the presentational handoff actions: the Send button + (on success) the VISIBLE record (evento_id)
// and the link that focuses the handed-off cohort in the cockpit. Split from the trpc wiring so it's testable.
describe("F-5.2 HandoffActions", () => {
  it("idle ⇒ 'Send to NBA', enabled, no link and no record yet", () => {
    render(<HandoffActions cohortId="cX" status="idle" onSend={() => {}} />);
    expect(screen.getByRole("button", { name: "Send to NBA" })).toBeEnabled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("pending ⇒ 'Sending…' disabled", () => {
    render(<HandoffActions cohortId="cX" status="pending" onSend={() => {}} />);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });

  it("success ⇒ 'Sent ✓', the evento_id record is now VISIBLE, and the link focuses the cohort (not the whole cockpit)", () => {
    render(<HandoffActions cohortId="pizza_centro" status="success" eventoId="abc123def456" onSend={() => {}} />);
    expect(screen.getByRole("button", { name: "Sent ✓" })).toBeDisabled();
    // the record was thrown away before — now the operator can see it
    expect(screen.getByText(/abc123de/)).toBeInTheDocument();
    // the link points at the focused cohort, not the bare cockpit
    expect(screen.getByRole("link", { name: /View cohort in Cockpit/ })).toHaveAttribute(
      "href",
      "/cockpit?focus=pizza_centro",
    );
  });

  it("success ⇒ a cohort id needing url-encoding is encoded in the focus link", () => {
    render(<HandoffActions cohortId="a b/c" status="success" eventoId="x" onSend={() => {}} />);
    expect(screen.getByRole("link", { name: /View cohort/ })).toHaveAttribute("href", "/cockpit?focus=a%20b%2Fc");
  });

  it("error ⇒ the message is surfaced via role=alert", () => {
    render(<HandoffActions cohortId="cX" status="error" errorMsg="cross-pool handoff blocked" onSend={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("cross-pool handoff blocked");
  });

  it("clicking Send fires onSend", () => {
    const onSend = vi.fn();
    render(<HandoffActions cohortId="cX" status="idle" onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to NBA" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
