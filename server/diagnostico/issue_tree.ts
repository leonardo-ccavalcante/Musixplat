// EPIC-B2 fetch perezoso (deterministic, no LLM). Piece:
//   US-B2.3.1   — lazyFetchPath: fetch ONLY the source of the active path; block bulk fetch.
// BR-B2: never barre todas las fuentes (Occam → anti-alucinación + performance).

export interface IssuePath {
  path_id: number;
  hipotese: string;
  probabilidad: number | null;
  fonte_consultada: string | null;
  resultado: "true" | "false" | "abierto";
}

export interface IssueTree {
  paths: IssuePath[];
}

/** The three deterministic fontes a hypothesis can resolve to (single-source, BR-B2). */
export type Fonte = "tenant.Orden" | "tenant.Evento_Uso" | "tenant.Conversa_Episodio";

// Hypothesis-type → fonte map. Keyed by a substring scanned in the hipotese text so the
// resolution is deterministic and auditable (no LLM, no ranking). Order = priority: the
// first matching family wins; anything unmatched falls back to the conversa source.
const FONTE_BY_FAMILY: ReadonlyArray<readonly [RegExp, Fonte]> = [
  [/financ|finanz|cobr|pago|reembols|saldo|orden/i, "tenant.Orden"],
  [/produc|uso|feature|adop|evento_uso/i, "tenant.Evento_Uso"],
];

/** US-B2.3.1 — resolve the single source for one hypothesis (deterministic, default conservative). */
export function resolveFonte(hipotese: string): Fonte {
  for (const [pattern, fonte] of FONTE_BY_FAMILY) {
    if (pattern.test(hipotese)) return fonte;
  }
  return "tenant.Conversa_Episodio"; // default — never barre todas las fuentes (BR-B2).
}

/**
 * BR-B2 bulk-block guard. A lazy fetch resolves EXACTLY ONE source: any attempt to fetch
 * more than one path in a single call is a hard-no (Occam / anti-barrido). Fail-closed:
 * a zero or non-singleton request throws rather than silently fetching everything.
 */
export function assertSingleFetch(pathIds: readonly number[]): void {
  if (pathIds.length !== 1) {
    throw new Error("bulk fetch blocked");
  }
}

/**
 * US-B2.3.1 — lazy fetch perezoso. Resolves and consults ONLY the active path's single
 * source; every other path in the tree is returned untouched (fonte_consultada stays null).
 * Fail-closed: an unknown activePathId throws (never fetch a fabricated path). Pure: the
 * input tree is not mutated — a fresh IssuePath is returned with fonte_consultada set.
 */
export function lazyFetchPath(tree: IssueTree, activePathId: number): IssuePath {
  assertSingleFetch([activePathId]); // single-source contract (BR-B2).
  const active = tree.paths.find((p) => p.path_id === activePathId);
  if (active === undefined) {
    throw new Error(`unknown path_id: ${activePathId}`); // fail-closed (BR-B2).
  }
  return { ...active, fonte_consultada: resolveFonte(active.hipotese) };
}
