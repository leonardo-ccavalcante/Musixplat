import { describe, it, expect } from "vitest";
import {
  deterministicEmbedder,
  resolveEmbedder,
  EMBED_DIM,
  embedWithRetry,
  isTransientEmbedError,
  type Embedder,
} from "./embedder.js";

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
