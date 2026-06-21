import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DispatchView } from "./DispatchPage";
import type { CockpitDispatchDetail } from "@shared/contracts";

const detail: CockpitDispatchDetail = {
  nba_id: "n1",
  action_type: "A3",
  action_label: "Propose promo/bonus",
  cohort_id: "long_tail · 0-3m",
  effective_level: "LOW",
  reach_count: 17,
  reach_preview: [{ restaurant_id: "R1", tier_base: "long_tail" }],
  artifact_kind: "email_offer",
  content: {
    title: "Propose promo/bonus · long_tail · 0-3m",
    evidence: "Price percentile vs peers 82 pctile vs 60 pctile standard · gap +22 pts",
    body: "Re: Propose promo/bonus — cohort long_tail · 0-3m.\n\nWhat we measured: …\n\nRecommended next steps:\n…",
  },
};

describe("02:1a DispatchView", () => {
  it("shows reach, the read-only measured evidence, and the editable message body", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Reaches/)).toHaveTextContent("17");
    expect(screen.getByText(/and 16 more/)).toBeInTheDocument();
    expect(screen.getByText(/82 pctile vs 60 pctile/)).toBeInTheDocument();
    expect(screen.getByLabelText(/The message/)).toHaveValue(detail.content.body);
    expect(screen.getByRole("button", { name: /Send to all 17 restaurants/ })).toBeInTheDocument();
  });

  it("Send fires onSend with the (edited) body; sending state disables + relabels", () => {
    const onSend = vi.fn();
    const { rerender } = render(<DispatchView detail={detail} sending={false} onSend={onSend} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/The message/), { target: { value: "Edited message body" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to all 17 restaurants/ }));
    expect(onSend).toHaveBeenCalledWith("Edited message body");
    rerender(<DispatchView detail={detail} sending={true} onSend={onSend} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /Sending…/ })).toBeDisabled();
  });

  it("Send is disabled when the message is emptied (never send a blank artifact)", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/The message/), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Send to all 17 restaurants/ })).toBeDisabled();
  });

  it("the Experiment button is present but disabled (1b placeholder)", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /Experiment/ })).toBeDisabled();
  });
});
