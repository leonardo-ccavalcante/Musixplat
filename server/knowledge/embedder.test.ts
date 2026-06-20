import { describe, it, expect } from "vitest";
import { deterministicEmbedder, EMBED_DIM } from "./embedder.js";

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
});
