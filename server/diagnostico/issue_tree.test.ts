import { describe, it, expect } from "vitest";
import {
  lazyFetchPath,
  resolveFonte,
  assertSingleFetch,
  type IssueTree,
} from "./issue_tree.js";

// Piece 05B:US-B2.3.1 — fetch perezoso (BR-B2): only the ACTIVE path's single source is
// consulted; never barre todas las fuentes. Deterministic, no LLM, fail-closed. (04 §14)

function makeTree(): IssueTree {
  return {
    paths: [
      { path_id: 1, hipotese: "reembolso financiero pendiente", probabilidad: null, fonte_consultada: null, resultado: "abierto" },
      { path_id: 2, hipotese: "baja adopción del producto", probabilidad: null, fonte_consultada: null, resultado: "abierto" },
      { path_id: 3, hipotese: "queja genérica del usuario", probabilidad: null, fonte_consultada: null, resultado: "abierto" },
    ],
  };
}

describe("lazyFetchPath — 05B:US-B2.3.1 (deterministic, fail-closed, single-source)", () => {
  it("sets fonte_consultada ONLY on the active path; others stay null (no barrido)", () => {
    const tree = makeTree();
    const active = lazyFetchPath(tree, 2);

    expect(active.fonte_consultada).toBe("tenant.Usage_Event"); // producto hypothesis
    // every OTHER path in the original tree is untouched.
    for (const p of tree.paths) {
      expect(p.fonte_consultada).toBeNull();
    }
  });

  it("does not mutate the input tree (pure)", () => {
    const tree = makeTree();
    lazyFetchPath(tree, 1);
    expect(tree.paths.find((p) => p.path_id === 1)?.fonte_consultada).toBeNull();
  });

  it("maps a finanzas hypothesis to tenant.Order", () => {
    expect(lazyFetchPath(makeTree(), 1).fonte_consultada).toBe("tenant.Order");
  });

  it("defaults an un-typed hypothesis to tenant.Conversation_Episode", () => {
    expect(lazyFetchPath(makeTree(), 3).fonte_consultada).toBe("tenant.Conversation_Episode");
  });

  it("throws on an unknown path_id (fail-closed, never fetch a fabricated path)", () => {
    expect(() => lazyFetchPath(makeTree(), 99)).toThrow(/unknown path_id/);
  });
});

describe("resolveFonte — deterministic hypothesis→source map (BR-B2)", () => {
  it("finanzas → Order, producto → Usage_Event, default → Conversation_Episode", () => {
    expect(resolveFonte("pago no procesado")).toBe("tenant.Order");
    expect(resolveFonte("feature sin uso")).toBe("tenant.Usage_Event");
    expect(resolveFonte("algo ambiguo")).toBe("tenant.Conversation_Episode");
  });
});

describe("assertSingleFetch — BR-B2 bulk-block guard", () => {
  it("allows exactly one path", () => {
    expect(() => assertSingleFetch([7])).not.toThrow();
  });

  it("blocks a bulk (>1) request", () => {
    expect(() => assertSingleFetch([1, 2])).toThrow("bulk fetch blocked");
  });

  it("blocks an empty (0) request (fail-closed, never barre)", () => {
    expect(() => assertSingleFetch([])).toThrow("bulk fetch blocked");
  });
});
