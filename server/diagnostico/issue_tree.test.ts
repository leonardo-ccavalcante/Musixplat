import { describe, it, expect } from "vitest";
import {
  lazyFetchPath,
  resolveSource,
  assertSingleFetch,
  type IssueTree,
} from "./issue_tree.js";

// Piece 05B:US-B2.3.1 — lazy fetch (BR-B2): only the ACTIVE path's single source is
// consulted; never sweep all sources. Deterministic, no LLM, fail-closed. (04 §14)

function makeTree(): IssueTree {
  return {
    paths: [
      { path_id: 1, hypothesis: "reembolso financiero pendiente", probability: null, source_consulted: null, result: "open" },
      { path_id: 2, hypothesis: "baja adopción del producto", probability: null, source_consulted: null, result: "open" },
      { path_id: 3, hypothesis: "queja genérica del usuario", probability: null, source_consulted: null, result: "open" },
    ],
  };
}

describe("lazyFetchPath — 05B:US-B2.3.1 (deterministic, fail-closed, single-source)", () => {
  it("sets source_consulted ONLY on the active path; others stay null (no sweep)", () => {
    const tree = makeTree();
    const active = lazyFetchPath(tree, 2);

    expect(active.source_consulted).toBe("tenant.Usage_Event"); // product hypothesis
    // every OTHER path in the original tree is untouched.
    for (const p of tree.paths) {
      expect(p.source_consulted).toBeNull();
    }
  });

  it("does not mutate the input tree (pure)", () => {
    const tree = makeTree();
    lazyFetchPath(tree, 1);
    expect(tree.paths.find((p) => p.path_id === 1)?.source_consulted).toBeNull();
  });

  it("maps a finance hypothesis to tenant.Order", () => {
    expect(lazyFetchPath(makeTree(), 1).source_consulted).toBe("tenant.Order");
  });

  it("defaults an un-typed hypothesis to tenant.Conversation_Episode", () => {
    expect(lazyFetchPath(makeTree(), 3).source_consulted).toBe("tenant.Conversation_Episode");
  });

  it("throws on an unknown path_id (fail-closed, never fetch a fabricated path)", () => {
    expect(() => lazyFetchPath(makeTree(), 99)).toThrow(/unknown path_id/);
  });
});

describe("resolveSource — deterministic hypothesis→source map (BR-B2)", () => {
  it("finance → Order, product → Usage_Event, default → Conversation_Episode", () => {
    expect(resolveSource("pago no procesado")).toBe("tenant.Order");
    expect(resolveSource("feature sin uso")).toBe("tenant.Usage_Event");
    expect(resolveSource("algo ambiguo")).toBe("tenant.Conversation_Episode");
  });
});

describe("assertSingleFetch — BR-B2 bulk-block guard", () => {
  it("allows exactly one path", () => {
    expect(() => assertSingleFetch([7])).not.toThrow();
  });

  it("blocks a bulk (>1) request", () => {
    expect(() => assertSingleFetch([1, 2])).toThrow("bulk fetch blocked");
  });

  it("blocks an empty (0) request (fail-closed, never sweep)", () => {
    expect(() => assertSingleFetch([])).toThrow("bulk fetch blocked");
  });
});
