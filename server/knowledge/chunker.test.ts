import { describe, it, expect } from "vitest";
import { chunk } from "./chunker.js";

describe("chunk", () => {
  it("splits with overlap and preserves order", () => {
    const text = "a".repeat(2500);
    const parts = chunk(text, { size: 1200, overlap: 150 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toHaveLength(1200);
    // overlap: end of chunk0 reappears at start of chunk1
    expect(parts[1]!.startsWith(parts[0]!.slice(-150))).toBe(true);
  });

  it("preserves global order — concatenated chunks (overlap removed) rebuild the text", () => {
    const text = Array.from({ length: 2500 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const size = 1000;
    const overlap = 100;
    const parts = chunk(text, { size, overlap });
    let rebuilt = parts[0]!;
    for (let i = 1; i < parts.length; i++) rebuilt += parts[i]!.slice(overlap);
    expect(rebuilt).toBe(text);
  });

  it("returns single chunk when text fits", () => {
    expect(chunk("short", { size: 1200, overlap: 150 })).toEqual(["short"]);
  });

  it("returns single chunk when text length equals size", () => {
    const text = "a".repeat(1200);
    expect(chunk(text, { size: 1200, overlap: 150 })).toEqual([text]);
  });
});
