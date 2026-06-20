import { describe, it, expect } from "vitest";
import {
  deterministicEmbedder,
  resolveEmbedder,
  EMBED_DIM,
  embedWithRetry,
  isTransientEmbedError,
  openaiEmbedder,
  MAX_EMBED_BATCH,
  type Embedder,
} from "./embedder.js";
import type { TokenUsage } from "../_core/llm.js";

// Records each request's input size; echoes one 1-D vector per input ([index]) so order is checkable.
function recordingClient(): {
  client: { embeddings: { create(a: { model: string; input: string[] }): Promise<{ data: { embedding: number[] }[] }> } };
  calls: () => number[];
} {
  const sizes: number[] = [];
  return {
    client: {
      embeddings: {
        async create({ input }) {
          sizes.push(input.length);
          return { data: input.map((t) => ({ embedding: [Number(t)] })) };
        },
      },
    },
    calls: () => sizes,
  };
}

// A fake embedder that throws `err` on its first `failTimes` calls, then returns a 1-D vector per text.
function flaky(failTimes: number, err: unknown): { emb: Embedder; calls: () => number } {
  let n = 0;
  return {
    emb: {
      async embed(texts) {
        n += 1;
        if (n <= failTimes) throw err;
        return texts.map(() => [1]);
      },
    },
    calls: () => n,
  };
}
const noSleep = async (): Promise<void> => {}; // tests never wait on real backoff

describe("deterministicEmbedder", () => {
  it("returns EMBED_DIM (1536) unit-normalized vectors, stable per input", async () => {
    const [a] = await deterministicEmbedder.embed(["refund policy"]);
    const [b] = await deterministicEmbedder.embed(["refund policy"]);
    expect(a).toHaveLength(EMBED_DIM);
    expect(EMBED_DIM).toBe(1536);
    expect(a).toEqual(b);
    const norm = Math.hypot(...a!);
    expect(norm).toBeCloseTo(1, 5);
  });
  it("different inputs give different vectors", async () => {
    const [a] = await deterministicEmbedder.embed(["alpha"]);
    const [b] = await deterministicEmbedder.embed(["beta"]);
    expect(a).not.toEqual(b);
  });

  // Hermetic gate: under the test runner the factory NEVER returns a live (OpenAI) embedder, so ingest
  // and the internal spine/artifact retrieval share ONE vector space — no paid API, no flake (plan §9).
  it("resolveEmbedder() returns the deterministic embedder under vitest (process.env.VITEST set)", async () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(await resolveEmbedder()).toBe(deterministicEmbedder);
  });
});

describe("isTransientEmbedError", () => {
  it("treats rate-limit (429) and 5xx and network blips as transient (retryable)", () => {
    expect(isTransientEmbedError({ status: 429 })).toBe(true);
    expect(isTransientEmbedError({ status: 503 })).toBe(true);
    expect(isTransientEmbedError({ status: 500 })).toBe(true);
    expect(isTransientEmbedError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientEmbedError({ name: "APIConnectionTimeoutError" })).toBe(true);
  });
  it("treats auth/quota/bad-input (4xx) as terminal (not retryable)", () => {
    expect(isTransientEmbedError({ status: 401 })).toBe(false); // bad key
    expect(isTransientEmbedError({ status: 403 })).toBe(false); // quota / forbidden
    expect(isTransientEmbedError({ status: 400 })).toBe(false); // bad input
    expect(isTransientEmbedError(new Error("nope"))).toBe(false);
  });
});

describe("openaiEmbedder batching (large docs must not exceed OpenAI's per-request input cap)", () => {
  it("splits more than MAX_EMBED_BATCH inputs across requests, preserving order", async () => {
    const { client, calls } = recordingClient();
    const n = MAX_EMBED_BATCH * 2 + 88; // 2 full batches + a remainder
    const texts = Array.from({ length: n }, (_, i) => String(i));
    const out = await openaiEmbedder(client as never).embed(texts);
    expect(out).toHaveLength(n);
    expect(out.map((v) => v[0])).toEqual(texts.map(Number)); // order preserved across batches
    expect(Math.max(...calls())).toBeLessThanOrEqual(MAX_EMBED_BATCH); // never a request over the cap
    expect(calls()).toEqual([MAX_EMBED_BATCH, MAX_EMBED_BATCH, 88]);
  });

  it("sends a single request when inputs fit in one batch", async () => {
    const { client, calls } = recordingClient();
    await openaiEmbedder(client as never).embed(["a", "b", "c"]);
    expect(calls()).toEqual([3]);
  });

  it("reports summed input-token usage to onUsage across batches (embeddings have no output tokens)", async () => {
    // client bills 1 prompt token per input; across 2 batches the sink must see the TOTAL.
    const client = {
      embeddings: {
        async create({ input }: { input: string[] }) {
          return { data: input.map((t) => ({ embedding: [Number(t)] })), usage: { prompt_tokens: input.length } };
        },
      },
    };
    let seen: TokenUsage | null = null;
    const texts = Array.from({ length: MAX_EMBED_BATCH + 5 }, (_, i) => String(i)); // forces 2 batches
    await openaiEmbedder(client as never, undefined, (u) => (seen = u)).embed(texts);
    expect(seen).toEqual({ inputTokens: MAX_EMBED_BATCH + 5, outputTokens: 0 });
  });
});

describe("embedWithRetry", () => {
  it("retries a transient failure and then succeeds", async () => {
    const { emb, calls } = flaky(2, { status: 429 }); // fails twice, succeeds on the 3rd
    const out = await embedWithRetry(emb, ["x"], { attempts: 3, sleep: noSleep });
    expect(out).toEqual([[1]]);
    expect(calls()).toBe(3);
  });

  it("does NOT retry a terminal error — surfaces it immediately (fail-closed)", async () => {
    const { emb, calls } = flaky(99, { status: 401 });
    await expect(embedWithRetry(emb, ["x"], { attempts: 3, sleep: noSleep })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls()).toBe(1); // tried once, gave up — no wasted retries on a bad key
  });

  it("gives up after `attempts` on a persistent transient failure", async () => {
    const { emb, calls } = flaky(99, { status: 503 });
    await expect(embedWithRetry(emb, ["x"], { attempts: 3, sleep: noSleep })).rejects.toMatchObject({
      status: 503,
    });
    expect(calls()).toBe(3); // bounded — never loops forever
  });
});
