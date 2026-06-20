import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchTester } from "./SearchTester";
import type { SearchHit } from "@shared/contracts_knowledge";

// P06 — the search tester is the visible proof that "we run it against the base to see if we hold this
// shape". A hit shows filename, docType, similarity and a snippet — the retrieval, in view (§5).
const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  chunkId: "c1",
  docId: "d1",
  filename: "refund-policy.pdf",
  docType: "Policy",
  content: "Refunds are issued within 14 days of a failed delivery.",
  similarity: 0.87,
  ...over,
});

describe("P06 SearchTester", () => {
  it("submitting the query fires onSearch with the typed text", () => {
    const onSearch = vi.fn();
    render(<SearchTester hits={[]} hasSearched={false} isLoading={false} isError={false} onSearch={onSearch} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "refund window" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).toHaveBeenCalledWith("refund window");
  });

  it("does not fire onSearch for an empty query (fail-closed — no blank search)", () => {
    const onSearch = vi.fn();
    render(<SearchTester hits={[]} hasSearched={false} isLoading={false} isError={false} onSearch={onSearch} />);
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("loading ⇒ explicit loading state", () => {
    render(<SearchTester hits={[]} hasSearched isLoading isError={false} onSearch={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/searching/i);
  });

  it("error ⇒ explicit error state (never a fabricated hit, §3.7)", () => {
    render(<SearchTester hits={[]} hasSearched isLoading={false} isError onSearch={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("searched with no hits ⇒ explicit no-match state (not a green-fake)", () => {
    render(<SearchTester hits={[]} hasSearched isLoading={false} isError={false} onSearch={() => {}} />);
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });

  it("renders each hit: filename, docType, similarity and snippet", () => {
    render(<SearchTester hits={[hit()]} hasSearched isLoading={false} isError={false} onSearch={() => {}} />);
    const list = screen.getByRole("list", { name: /results/i });
    expect(within(list).getByText("refund-policy.pdf")).toBeInTheDocument();
    expect(within(list).getByText("Policy")).toBeInTheDocument();
    expect(within(list).getByText(/0\.87|87%/)).toBeInTheDocument();
    expect(within(list).getByText(/Refunds are issued within 14 days/)).toBeInTheDocument();
  });
});
