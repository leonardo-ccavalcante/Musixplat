import { describe, expect, it } from "vitest";
import { parseCsv, csvToRecords } from "./csv";

// The Situation Room ingests operator-supplied CSV (real data, never a fixed scenario). The n8n chat-history
// export quotes a JSON object in the `message` column — with commas, colons, and "" escaped quotes — so the
// parser must be RFC-4180 correct (quoted commas, escaped quotes, newlines-in-quotes), not a naive split.
describe("parseCsv", () => {
  it("parses a simple grid", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('x,"a,b",y')).toEqual([["x", "a,b", "y"]]);
  });

  it('unescapes doubled "" quotes', () => {
    expect(parseCsv('"she said ""hi"""')).toEqual([['she said "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",b')).toEqual([["line1\nline2", "b"]]);
  });

  it("handles CRLF and ignores a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("parses a real n8n chat-history row (JSON in the message column)", () => {
    const line =
      '1159,56995726208,"{""type"": ""human"", ""content"": ""hola, cómo estás?""}",2025-08-18 14:57:35+00';
    expect(parseCsv(line)).toEqual([
      ["1159", "56995726208", '{"type": "human", "content": "hola, cómo estás?"}', "2025-08-18 14:57:35+00"],
    ]);
  });
});

describe("csvToRecords", () => {
  it("maps each row to a header-keyed record, trimming header whitespace", () => {
    const recs = csvToRecords("restaurant_id, payment_status\nR-1,failed\nR-2,ok");
    expect(recs).toEqual([
      { restaurant_id: "R-1", payment_status: "failed" },
      { restaurant_id: "R-2", payment_status: "ok" },
    ]);
  });

  it("skips fully blank lines", () => {
    expect(csvToRecords("a\n1\n\n2")).toEqual([{ a: "1" }, { a: "2" }]);
  });
});
