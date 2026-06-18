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

    expect(active.fonte_consultada).toBe("tenant.Evento_Uso"); // producto hypothesis
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

  it("maps a finanzas hypothesis to tenant.Orden", () => {
    expect(lazyFetchPath(makeTree(), 1).fonte_consultada).toBe("tenant.Orden");
  });

  it("defaults an un-typed hypothesis to tenant.Conversa_Episodio", () => {
    expect(lazyFetchPath(makeTree(), 3).fonte_consultada).toBe("tenant.Conversa_Episodio");
  });

  it("throws on an unknown path_id (fail-closed, never fetch a fabricated path)", () => {
    expect(() => lazyFetchPath(makeTree(), 99)).toThrow(/unknown path_id/);
  });
});

describe("resolveFonte — deterministic hypothesis→source map (BR-B2)", () => {
  it("finanzas → Orden, producto → Evento_Uso, default → Conversa_Episodio", () => {
    expect(resolveFonte("pago no procesado")).toBe("tenant.Orden");
    expect(resolveFonte("feature sin uso")).toBe("tenant.Evento_Uso");
    expect(resolveFonte("algo ambiguo")).toBe("tenant.Conversa_Episodio");
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
