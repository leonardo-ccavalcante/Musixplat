import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CockpitBoard, groupRows, focusGroupKeys } from "./CockpitBoard";
import type { RowState } from "./CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

const row = (over: Partial<NbaCockpitRow>): NbaCockpitRow => ({
  nba_id: "n1",
  cohort_id: "c1",
  action_type: "A1",
  root_cause: "connection below standard",
  financial_class: "none",
  effective_level: "LOW",
  auto_releasable: true,
  before_after_expected: null,
  status: "auto",
  reason: null,
  cohort_rule_version: "v1",
  ...over,
});

// render the board with every group expanded so rows are assertable
function renderBoard(rows: NbaCockpitRow[], opts: { onAction?: () => void; actionState?: Record<string, RowState | undefined> } = {}) {
  const groups = groupRows(rows, "why");
  const openGroups = Object.fromEntries(groups.map((g) => [g.key, true]));
  return render(
    <CockpitBoard groups={groups} openGroups={openGroups} onToggle={() => {}} onAction={opts.onAction ?? (() => {})} actionState={opts.actionState ?? {}} />,
  );
}

describe("02:F-1.1 groupRows — group the queue by the chosen axis (pure, §14: reads, never recomputes)", () => {
  const rows = [
    row({ nba_id: "m", status: "needs_human", reason: "money", financial_class: "direct", auto_releasable: false, effective_level: "MEDIUM", action_type: "A3" }),
    row({ nba_id: "l", status: "needs_human", reason: "level", auto_releasable: false, effective_level: "MEDIUM", action_type: "A2" }),
    row({ nba_id: "g", status: "needs_human", reason: "gates", auto_releasable: false, effective_level: null, action_type: "A1" }),
    row({ nba_id: "a", status: "auto", action_type: "A4", effective_level: "LOW" }),
  ];

  it("by 'why' ⇒ money/level/gates queue groups first, auto last", () => {
    const g = groupRows(rows, "why");
    expect(g.map((x) => x.key)).toEqual(["money", "level", "gates", "auto"]);
    expect(g.find((x) => x.key === "money")!.isQueue).toBe(true);
    expect(g.find((x) => x.key === "auto")!.isQueue).toBe(false);
    expect(g.find((x) => x.key === "auto")!.defaultOpen).toBe(false); // calm list folds by default
  });

  it("by 'level' ⇒ grouped by the produced effective_level, null ⇒ 'Not computed yet'", () => {
    const g = groupRows(rows, "level");
    expect(g.map((x) => x.key)).toEqual(["MEDIUM", "LOW", "uncomputed"]);
    expect(g.find((x) => x.key === "uncomputed")!.rows[0]!.nba_id).toBe("g");
  });

  it("by 'action' ⇒ one band per catalog code with the human label", () => {
    const g = groupRows(rows, "action");
    expect(g.map((x) => x.key)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(g.find((x) => x.key === "A3")!.title).toMatch(/Propose promo/);
  });

  it("empty ⇒ no groups", () => {
    expect(groupRows([], "why")).toEqual([]);
  });
});

describe("02:F-1.1 CockpitBoard — grouped, foldable, honest", () => {
  it("empty ⇒ explicit empty state (never green-fake)", () => {
    renderBoard([]);
    expect(screen.getByText(/proposed no actions/i)).toBeInTheDocument();
  });

  it("a money row lands in 'Touches money' with a Release; auto rows have no Release; every row can be paused", () => {
    renderBoard([
      row({ nba_id: "a1", cohort_id: "co_alpha", status: "auto" }),
      row({ nba_id: "h1", cohort_id: "co_beta", status: "needs_human", reason: "money", financial_class: "direct", auto_releasable: false, effective_level: "MEDIUM" }),
      row({ nba_id: "a2", cohort_id: "co_gamma", status: "auto" }),
    ]);
    const money = screen.getByText("Touches money — you decide").closest("details")!;
    const auto = screen.getByText("Auto-handled by the AI").closest("details")!;
    expect(within(money).getByText("co_beta")).toBeInTheDocument();
    expect(within(money).getByRole("button", { name: "Release" })).toBeInTheDocument();
    expect(within(auto).getByText("co_alpha")).toBeInTheDocument();
    expect(within(auto).queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(3);
  });

  it("Release fires onAction(row, RELEASE)", () => {
    const onAction = vi.fn();
    renderBoard([row({ nba_id: "h1", status: "needs_human", reason: "gates", auto_releasable: false, effective_level: "LOW" })], { onAction });
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ nba_id: "h1" }), "RELEASE");
  });

  it("done state hides actions and shows the recorded trace", () => {
    renderBoard([row({ nba_id: "h1", status: "needs_human", reason: "gates", auto_releasable: false, effective_level: "LOW" })], {
      actionState: { h1: { status: "done", msg: "Released ✓ trace abcd1234" } },
    });
    expect(screen.getByText(/Released ✓/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  });
});

describe("02:CP focus — guide the eye to the handed-off cohort (Alt 1, no filter)", () => {
  const renderFocus = (rows: NbaCockpitRow[], focusCohort?: string) => {
    const groups = groupRows(rows, "why");
    const openGroups = Object.fromEntries(groups.map((g) => [g.key, true]));
    return render(
      <CockpitBoard
        groups={groups}
        openGroups={openGroups}
        onToggle={() => {}}
        onAction={() => {}}
        actionState={{}}
        focusCohort={focusCohort}
      />,
    );
  };

  it("marks the focused cohort's rows with data-focused; the board is NOT narrowed (other rows still render)", () => {
    const { container } = renderFocus(
      [row({ nba_id: "a1", cohort_id: "cX", status: "auto" }), row({ nba_id: "a2", cohort_id: "cY", status: "auto" })],
      "cX",
    );
    const focused = container.querySelectorAll('[data-focused="true"]');
    expect(focused).toHaveLength(1);
    expect(focused[0]).toHaveTextContent("cX");
    expect(screen.getByText("cY")).toBeInTheDocument(); // unfocused row is still on the board (guide, don't filter)
  });

  it("no focusCohort ⇒ nothing marked (regression: unfocused board unchanged)", () => {
    const { container } = renderFocus([row({ nba_id: "a1", cohort_id: "cX", status: "auto" })]);
    expect(container.querySelectorAll('[data-focused="true"]')).toHaveLength(0);
  });
});

describe("02:CP focusGroupKeys — open EVERY group holding the focused cohort (Codex P2)", () => {
  it("returns ALL group keys containing the cohort when its proposals span groups", () => {
    const rows = [
      row({ nba_id: "m", cohort_id: "cX", status: "needs_human", reason: "money", financial_class: "direct", auto_releasable: false, effective_level: "MEDIUM" }),
      row({ nba_id: "g", cohort_id: "cX", status: "needs_human", reason: "gates", auto_releasable: false, effective_level: null }),
      row({ nba_id: "o", cohort_id: "cY", status: "auto" }),
    ];
    expect(focusGroupKeys(groupRows(rows, "why"), "cX").sort()).toEqual(["gates", "money"]);
  });

  it("no focus ⇒ [] (regression)", () => {
    expect(focusGroupKeys(groupRows([row({ cohort_id: "cX" })], "why"), undefined)).toEqual([]);
  });
});
