import { createHash } from "node:crypto";

export const EMBED_DIM = 1536;
export interface Embedder { embed(texts: string[]): Promise<number[][]>; }

// Deterministic, key-free embedder for CI/anti-fake/tests. Hash → seeded pseudo-vector → unit-normalized.
// NOT semantic; only guarantees stable, dimension-correct vectors so the pipeline + pgvector SQL run end-to-end.
export const deterministicEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((t) => {
      const v = new Array<number>(EMBED_DIM);
      let seed = createHash("sha256").update(t).digest();
      for (let i = 0; i < EMBED_DIM; i++) {
        if (i % 32 === 0) seed = createHash("sha256").update(seed).digest();
        v[i] = (seed[i % 32]! / 255) * 2 - 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  },
};

// OpenAI caps a single embeddings request at 2048 inputs (and a total token budget). A large document
// chunks into thousands of pieces, so send them in bounded batches — 256 × ~300 tok/chunk stays well
// under both limits — and concatenate IN ORDER. Without this a big doc would hit a terminal 400 and
// fail closed forever ("index_failed" that never recovers). API mechanics, not a business knob → const.
export const MAX_EMBED_BATCH = 256;

export function openaiEmbedder(
  client: { embeddings: { create(a: { model: string; input: string[] }): Promise<{ data: { embedding: number[] }[] }> } },
  model = "text-embedding-3-small",
): Embedder {
  return {
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_EMBED_BATCH) {
        const batch = texts.slice(i, i + MAX_EMBED_BATCH);
        const res = await client.embeddings.create({ model, input: batch });
        out.push(...res.data.map((d) => d.embedding));
      }
      return out;
    },
  };
}

// Transient = worth retrying (rate-limit 429, 5xx, a network blip). Terminal (auth 401/403,
// quota-as-4xx, bad input 400) is NOT retried — retrying a bad key just wastes time; surface it so
// the human fixes the cause and re-uploads. `e` is an unknown thrown value, so probe defensively.
export function isTransientEmbedError(e: unknown): boolean {
  const err = e as { status?: number; code?: string; name?: string };
  if (typeof err?.status === "number") {
    return err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500;
  }
  const netCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"]);
  if (typeof err?.code === "string" && netCodes.has(err.code)) return true;
  return err?.name === "APIConnectionError" || err?.name === "APIConnectionTimeoutError";
}

type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Embed with bounded exponential backoff on transient errors only. Either returns every vector or
// throws — there is no partial result, so the caller can write atomically (no half-indexed doc).
export async function embedWithRetry(
  emb: Embedder,
  texts: string[],
  opts: { attempts?: number; baseDelayMs?: number; sleep?: Sleep } = {},
): Promise<number[][]> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await emb.embed(texts);
    } catch (e) {
      lastErr = e;
      if (!isTransientEmbedError(e) || i === attempts - 1) throw e; // terminal, or out of tries
      await sleep(baseDelayMs * 2 ** i); // 300ms → 600ms → 1200ms …
    }
  }
  throw lastErr; // unreachable (loop either returns or throws), satisfies the type checker
}

// Factory — prod uses OpenAI when OPENAI_API_KEY is present, else deterministic fallback.
// Under the test runner (Vitest sets VITEST=true) we ALWAYS use the deterministic embedder so the
// whole suite stays hermetic/free/fast regardless of the key being present (plan §9). Tests that need
// semantic behaviour inject an embedder explicitly; nothing here ever makes a live call under test.
export async function resolveEmbedder(): Promise<Embedder> {
  if (process.env.VITEST || !process.env.OPENAI_API_KEY) return deterministicEmbedder;
  const { default: OpenAI } = await import("openai");
  return openaiEmbedder(new OpenAI() as never);
}
