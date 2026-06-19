import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactModal } from "./ArtifactModal";
import type { ArtifactRow } from "@shared/contracts_05c";

// 05C — the artifact must be VISIBLE before the human decides on it (Leo: "hoje eu não vejo nenhum
// artefato"). The modal opens the PERSISTED content: the email it would send, WHO is impacted (the list),
// the € impact, the KB-grounded HOW, and the route. Every field is READ from content (produced), never faked.
const artifact = (over: Partial<ArtifactRow> = {}): ArtifactRow => ({
  artifact_id: "a1",
  problem_id: "p1",
  artifact_type: "email_content",
  target_metric: "recover_failed_payment_value",
  status: "pending_review",
  content: {
    kind: "internal_email",
    subject: "Action — finance issue, concentrated Centro",
    body: {
      root: { hypothesis_root: "payment was not executed", confidence: 0.6 },
      who_affected: [
        { restaurant_id: "R-PAY-001", complained: true, silent: false },
        { restaurant_id: "R-PAY-002", complained: false, silent: true },
        { restaurant_id: "R-PAY-003", complained: false, silent: true },
      ],
      impact: { revenue_lost: 3760, churn_risk: null, cost_to_resolve: 705, value_gained: 2256 },
      how: "gateway retry + manual reissue",
      route: "fix_internal",
    },
  },
  decision_trace_id: null,
  created_at: "2026-06-19T00:00:00Z",
  ...over,
});

describe("05C ArtifactModal", () => {
  it("closed when no artifact is selected", () => {
    render(<ArtifactModal artifact={null} onClose={() => {}} onDecide={() => {}} busyId={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the artifact: the email it would send + the metric it is accountable to", () => {
    render(<ArtifactModal artifact={artifact()} onClose={() => {}} onDecide={() => {}} busyId={null} />);
    expect(screen.getByText(/Action — finance issue, concentrated Centro/)).toBeInTheDocument();
    expect(screen.getByText(/recover_failed_payment_value/)).toBeInTheDocument();
  });

  it("shows WHO is impacted — the real list with the silent ones marked (not just a count)", () => {
    render(<ArtifactModal artifact={artifact()} onClose={() => {}} onDecide={() => {}} busyId={null} />);
    const who = screen.getByRole("region", { name: /who is affected/i });
    expect(within(who).getByText("R-PAY-001")).toBeInTheDocument();
    expect(within(who).getByText("R-PAY-002")).toBeInTheDocument();
    // 2 of the 3 are silent — surfaced, never green-faked to zero.
    expect(within(who).getAllByText(/silent/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the produced impact €, the KB-grounded HOW, and the route", () => {
    render(<ArtifactModal artifact={artifact()} onClose={() => {}} onDecide={() => {}} busyId={null} />);
    expect(screen.getByText(/3,?760/)).toBeInTheDocument();
    expect(screen.getByText(/gateway retry \+ manual reissue/)).toBeInTheDocument();
    expect(screen.getByText(/fix_internal/)).toBeInTheDocument();
  });

  it("pending_review ⇒ Approve fires onDecide(id, 'approve') (the human gate, in view)", () => {
    const onDecide = vi.fn();
    render(<ArtifactModal artifact={artifact()} onClose={() => {}} onDecide={onDecide} busyId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));
    expect(onDecide).toHaveBeenCalledWith("a1", "approve");
  });

  it("decided ⇒ shows the 4-eyes trace, no decision buttons (no action without trace)", () => {
    render(
      <ArtifactModal
        artifact={artifact({ status: "approved", decision_trace_id: "trace-1234abcd" })}
        onClose={() => {}}
        onDecide={() => {}}
        busyId={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/trace/i)).toBeInTheDocument();
  });
});
