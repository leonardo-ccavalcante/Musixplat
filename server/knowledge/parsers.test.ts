import { describe, it, expect } from "vitest";
import { extractText } from "./parsers.js";

describe("extractText", () => {
  it("passes through markdown/plain text", async () => {
    const buf = Buffer.from("# Refund Policy\nRefunds within 30 days.", "utf-8");
    const r = await extractText(buf, "text/markdown", "policy.md");
    expect(r.ok).toBe(true);
    expect(r.ok && r.text).toContain("Refund Policy");
  });
  it("fail-closed on unsupported mime", async () => {
    const r = await extractText(Buffer.from("x"), "image/png", "x.png");
    expect(r.ok).toBe(false);
  });
  it("fail-closed on empty text", async () => {
    const r = await extractText(Buffer.from("   "), "text/plain", "blank.txt");
    expect(r.ok).toBe(false);
  });
});
