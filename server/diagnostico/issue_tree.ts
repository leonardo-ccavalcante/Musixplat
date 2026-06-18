// EPIC-B2 lazy fetch (deterministic, no LLM). Piece:
//   US-B2.3.1   — lazyFetchPath: fetch ONLY the source of the active path; block bulk fetch.
// BR-B2: never sweep all sources (Occam → anti-hallucination + performance).

export interface IssuePath {
  path_id: number;
  hypothesis: string;
  probability: number | null;
  source_consulted: string | null;
  result: "true" | "false" | "open";
}

export interface IssueTree {
  paths: IssuePath[];
}

/** The three deterministic sources a hypothesis can resolve to (single-source, BR-B2). */
export type Source = "tenant.Order" | "tenant.Usage_Event" | "tenant.Conversation_Episode";

// Hypothesis-type → source map. Keyed by a substring scanned in the hypothesis text so the
// resolution is deterministic and auditable (no LLM, no ranking). Order = priority: the
// first matching family wins; anything unmatched falls back to the conversation source.
const SOURCE_BY_FAMILY: ReadonlyArray<readonly [RegExp, Source]> = [
  [/financ|finanz|cobr|pago|reembols|saldo|order/i, "tenant.Order"],
  [/produc|uso|feature|adop|evento_uso/i, "tenant.Usage_Event"],
];

/** US-B2.3.1 — resolve the single source for one hypothesis (deterministic, default conservative). */
export function resolveSource(hypothesis: string): Source {
  for (const [pattern, source] of SOURCE_BY_FAMILY) {
    if (pattern.test(hypothesis)) return source;
  }
  return "tenant.Conversation_Episode"; // default — never sweep all sources (BR-B2).
}

/**
 * BR-B2 bulk-block guard. A lazy fetch resolves EXACTLY ONE source: any attempt to fetch
 * more than one path in a single call is a hard-no (Occam / anti-sweep). Fail-closed:
 * a zero or non-singleton request throws rather than silently fetching everything.
 */
export function assertSingleFetch(pathIds: readonly number[]): void {
  if (pathIds.length !== 1) {
    throw new Error("bulk fetch blocked");
  }
}

/**
 * US-B2.3.1 — lazy fetch. Resolves and consults ONLY the active path's single source;
 * every other path in the tree is returned untouched (source_consulted stays null).
 * Fail-closed: an unknown activePathId throws (never fetch a fabricated path). Pure: the
 * input tree is not mutated — a fresh IssuePath is returned with source_consulted set.
 */
export function lazyFetchPath(tree: IssueTree, activePathId: number): IssuePath {
  assertSingleFetch([activePathId]); // single-source contract (BR-B2).
  const active = tree.paths.find((p) => p.path_id === activePathId);
  if (active === undefined) {
    throw new Error(`unknown path_id: ${activePathId}`); // fail-closed (BR-B2).
  }
  return { ...active, source_consulted: resolveSource(active.hypothesis) };
}
