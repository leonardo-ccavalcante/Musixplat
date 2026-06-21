import { describe, expect, it } from "vitest";
import { chunkCsvByRestaurant } from "./csvChunk";

const H = "tenant_id,restaurant_id,tier_base,segment";
const row = (rid: string, n: number) => `POOL-001,${rid},long_tail,long_tail#${n}`;

function build(perRest: Record<string, number>): string {
  const lines = [H];
  for (const [rid, n] of Object.entries(perRest)) for (let i = 0; i < n; i++) lines.push(row(rid, i));
  return lines.join("\n");
}

// total data rows across all chunks, and the set of (rid) appearing in each chunk
function rowsOf(chunk: string) {
  return chunk.split("\n").slice(1);
}
function ridsOf(chunk: string) {
  const idx = chunk.split("\n")[0]!.split(",").findIndex((h) => h.trim() === "restaurant_id");
  return new Set(rowsOf(chunk).map((l) => l.split(",")[idx]));
}

describe("chunkCsvByRestaurant", () => {
  it("every chunk starts with the header and preserves the total row count", () => {
    const text = build({ A: 5, B: 5, C: 5 });
    const chunks = chunkCsvByRestaurant(text, 6);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.split("\n")[0]).toBe(H);
    const total = chunks.reduce((n, c) => n + rowsOf(c).length, 0);
    expect(total).toBe(15);
  });

  it("never splits one restaurant across chunks (the core invariant)", () => {
    const text = build({ A: 4, B: 4, C: 4, D: 4 });
    const chunks = chunkCsvByRestaurant(text, 5); // 4 rows each → 1 restaurant per chunk
    const seen = new Map<string, number>();
    for (const c of chunks) for (const rid of ridsOf(c)) seen.set(rid!, (seen.get(rid!) ?? 0) + 1);
    for (const [, count] of seen) expect(count).toBe(1); // each rid lives in exactly one chunk
    expect(chunks.length).toBe(4);
  });

  it("keeps a single oversized restaurant whole in its own chunk", () => {
    const text = build({ BIG: 10, small: 1 });
    const chunks = chunkCsvByRestaurant(text, 3);
    const bigChunk = chunks.find((c) => ridsOf(c).has("BIG"))!;
    expect(rowsOf(bigChunk).length).toBe(10); // not split despite cap=3
    expect(ridsOf(bigChunk).size).toBe(1);
  });

  it("returns a single chunk when everything fits", () => {
    const text = build({ A: 2, B: 2 });
    expect(chunkCsvByRestaurant(text, 100)).toEqual([text]);
  });

  it("locates restaurant_id by header name, not a fixed position", () => {
    const text = ["a,b,restaurant_id,c", "1,2,RX,3", "1,2,RX,4", "1,2,RY,5"].join("\n");
    const chunks = chunkCsvByRestaurant(text, 2);
    expect(chunks.length).toBe(2);
    expect(ridsOf(chunks[0]!)).toEqual(new Set(["RX"]));
    expect(ridsOf(chunks[1]!)).toEqual(new Set(["RY"]));
  });

  it("missing restaurant_id column → returns the file untouched (server rejects with the real error)", () => {
    const text = "tenant_id,tier_base\nPOOL-001,long_tail";
    expect(chunkCsvByRestaurant(text, 1)).toEqual([text]);
  });

  it("tolerates CRLF and blank lines", () => {
    const text = `${H}\r\n${row("A", 0)}\r\n\r\n${row("A", 1)}\r\n${row("B", 0)}\r\n`;
    const chunks = chunkCsvByRestaurant(text, 100);
    expect(rowsOf(chunks[0]!).length).toBe(3); // 2×A + 1×B, blank dropped
  });
});
