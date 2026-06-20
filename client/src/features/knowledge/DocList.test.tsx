import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocList } from "./DocList";
import type { DocRow } from "@shared/contracts_knowledge";

// P06 — the doc list is the audit trail of the knowledge base. Provenance is per field (§3.10): a
// proposed type is [I] (AI inferred), a confirmed type is [V] (human verified). States are explicit —
// loading/empty/error are never green-faked (§4).
const row = (over: Partial<DocRow> = {}): DocRow => ({
  docId: "d1",
  filename: "refund-policy.pdf",
  docType: "Policy",
  status: "proposed",
  createdAt: "2026-06-20T00:00:00Z",
  ...over,
});

describe("P06 DocList", () => {
  it("loading ⇒ explicit loading state (never a green-fake empty)", () => {
    render(<DocList rows={[]} isLoading isError={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("error ⇒ explicit error state with role=alert", () => {
    render(<DocList rows={[]} isLoading={false} isError />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("no rows ⇒ explicit empty state (not a fabricated success)", () => {
    render(<DocList rows={[]} isLoading={false} isError={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no documents/i);
  });

  it("renders filename, type and status for each row", () => {
    render(<DocList rows={[row()]} isLoading={false} isError={false} />);
    expect(screen.getByText("refund-policy.pdf")).toBeInTheDocument();
    expect(screen.getByText("Policy")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText(/proposed/i)).toBeInTheDocument();
  });

  it("proposed type ⇒ [I] provenance badge (AI inferred, not yet human-verified)", () => {
    render(<DocList rows={[row({ status: "proposed" })]} isLoading={false} isError={false} />);
    expect(screen.getByText("[I]")).toBeInTheDocument();
    expect(screen.queryByText("[V]")).not.toBeInTheDocument();
  });

  it("confirmed type ⇒ [V] provenance badge (human verified)", () => {
    render(<DocList rows={[row({ status: "confirmed" })]} isLoading={false} isError={false} />);
    expect(screen.getByText("[V]")).toBeInTheDocument();
    expect(screen.queryByText("[I]")).not.toBeInTheDocument();
  });

  it("parse_failed ⇒ no provenance badge (no type was produced — §14 NULL pre-run)", () => {
    render(
      <DocList rows={[row({ status: "parse_failed", docType: null })]} isLoading={false} isError={false} />,
    );
    expect(screen.queryByText("[I]")).not.toBeInTheDocument();
    expect(screen.queryByText("[V]")).not.toBeInTheDocument();
    expect(screen.getByText(/parse_failed/i)).toBeInTheDocument();
  });
});
