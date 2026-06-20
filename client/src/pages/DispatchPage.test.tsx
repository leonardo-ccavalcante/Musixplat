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
    action: "Propose promo/bonus",
    cohort: "long_tail · 0-3m",
    root: "price percentile high",
    path: "price_pctile: 82 → 60",
    how: "human releases the money",
  },
};

describe("02:1a DispatchView", () => {
  it("shows reach + artifact kind + a single Send primary, and 'and N more'", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Reaches/)).toHaveTextContent("17");
    expect(screen.getByText(/Email offer/)).toBeInTheDocument();
    expect(screen.getByText(/and 16 more/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to all 17 restaurants/ })).toBeInTheDocument();
  });

  it("Send fires onSend; sending state disables + relabels", () => {
    const onSend = vi.fn();
    const { rerender } = render(<DispatchView detail={detail} sending={false} onSend={onSend} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Send to all 17 restaurants/ }));
    expect(onSend).toHaveBeenCalled();
    rerender(<DispatchView detail={detail} sending={true} onSend={onSend} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /Sending…/ })).toBeDisabled();
  });

  it("the Experiment button is present but disabled (1b placeholder)", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /Experiment/ })).toBeDisabled();
  });
});
