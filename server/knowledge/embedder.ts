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

export function openaiEmbedder(
  client: { embeddings: { create(a: { model: string; input: string[] }): Promise<{ data: { embedding: number[] }[] }> } },
  model = "text-embedding-3-small",
): Embedder {
  return {
    async embed(texts) {
      const res = await client.embeddings.create({ model, input: texts });
      return res.data.map((d) => d.embedding);
    },
  };
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
