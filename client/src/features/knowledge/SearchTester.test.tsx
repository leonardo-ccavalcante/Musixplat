import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchTester } from "./SearchTester";
import type { AskResult } from "@shared/contracts_knowledge";

// P06 — "Ask the base": the Q&A chatbot. A grounded answer CITES its source docs; the supporting passages
// are the visible "why" (DESIGN-STANDARD §3). No relevant passage ⇒ honest "not in the base" (§3.7/§4).
const ask = (over: Partial<AskResult> = {}): AskResult => ({
  grounded: true,
  answer: "Refunds are issued within 14 days (refund-policy.pdf).",
  sources: [{ filename: "refund-policy.pdf", docType: "Policy" }],
  hits: [
    {
      chunkId: "c1",
      docId: "d1",
      filename: "refund-policy.pdf",
      docType: "Policy",
      content: "Refunds are issued within 14 days of a failed delivery.",
      similarity: 0.87,
    },
  ],
  ...over,
});

describe("P06 SearchTester (Ask the base)", () => {
  it("submitting the question fires onSearch with the typed text", () => {
    const onSearch = vi.fn();
    render(<SearchTester result={null} hasSearched={false} isLoading={false} isError={false} onSearch={onSearch} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "refund window" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).toHaveBeenCalledWith("refund window");
  });

  it("does not fire onSearch for an empty question (fail-closed — no blank ask)", () => {
    const onSearch = vi.fn();
    render(<SearchTester result={null} hasSearched={false} isLoading={false} isError={false} onSearch={onSearch} />);
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("loading ⇒ explicit loading state", () => {
    render(<SearchTester result={null} hasSearched isLoading isError={false} onSearch={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/reading the base/i);
  });

  it("error ⇒ explicit error state (never a fabricated answer, §3.7)", () => {
    render(<SearchTester result={null} hasSearched isLoading={false} isError onSearch={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("not grounded ⇒ explicit 'not in the base' (not a green-fake)", () => {
    render(
      <SearchTester
        result={ask({ grounded: false, answer: null, sources: [], hits: [] })}
        hasSearched
        isLoading={false}
        isError={false}
        onSearch={() => {}}
      />,
    );
    expect(screen.getByText(/not covered by the base/i)).toBeInTheDocument();
  });

  it("grounded ⇒ renders the answer and cites the source doc", () => {
    render(<SearchTester result={ask()} hasSearched isLoading={false} isError={false} onSearch={() => {}} />);
    expect(screen.getByText(/14 days \(refund-policy\.pdf\)/)).toBeInTheDocument(); // the synthesized answer
    expect(screen.getAllByText(/refund-policy\.pdf/).length).toBeGreaterThan(0); // source cited (≥1 place)
  });

  it("exposes the supporting passages (the 'why') behind the answer", () => {
    render(<SearchTester result={ask()} hasSearched isLoading={false} isError={false} onSearch={() => {}} />);
    const passages = screen.getByRole("list", { name: /supporting passages/i });
    expect(within(passages).getByText(/Refunds are issued within 14 days of a failed delivery/)).toBeInTheDocument();
  });
});
