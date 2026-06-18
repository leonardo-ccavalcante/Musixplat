import { describe, it, expect } from "vitest";
import { redactTranscript } from "../transcript_pii.js";

// Piece 05A:A.6.2 — 2nd-pass transcript PII redaction + retention gate. (04 §7)

describe("redactTranscript — 05A:A.6.2", () => {
  it("(a) clean text + valid retencion ⇒ safeToPersist:true, retainUntilDays set, tipos:[]", () => {
    const result = redactTranscript("El pedido llego frio y tarde.", 14);
    expect(result.safeToPersist).toBe(true);
    expect(result.retainUntilDays).toBe(14);
    expect(result.tipos).toEqual([]);
    expect(result.texto).toBe("El pedido llego frio y tarde.");
  });

  it("(b) text with email → redacted tokens in texto, tipos populated, safeToPersist:true", () => {
    const result = redactTranscript("Contacto: jose@uber.com por favor.", 30);
    expect(result.texto).toContain("[REDACTED:email]");
    expect(result.texto).not.toMatch(/jose@uber\.com/);
    expect(result.tipos).toContain("email");
    expect(result.safeToPersist).toBe(true);
    expect(result.retainUntilDays).toBe(30);
  });

  it("(c) text with phone → redacted, tipos includes phone, safeToPersist:true", () => {
    const result = redactTranscript("Llama al +34 612 345 678 ahora.", 7);
    expect(result.texto).toContain("[REDACTED:phone]");
    expect(result.tipos).toContain("phone");
    expect(result.safeToPersist).toBe(true);
  });

  it("(d) text where residualPII survives ⇒ safeToPersist:false (fail-closed)", () => {
    // slash-separated card bypasses detectors but trips the independent residual net
    const result = redactTranscript("num 1111/1111/1111/1111 fin", 14);
    expect(result.safeToPersist).toBe(false);
  });

  it("(e) null transcript ⇒ fail-closed: safeToPersist:false, texto:''", () => {
    const result = redactTranscript(null, 14);
    expect(result.safeToPersist).toBe(false);
    expect(result.texto).toBe("");
    expect(result.retainUntilDays).toBeNull();
  });

  it("(f) undefined transcript ⇒ fail-closed: safeToPersist:false, texto:''", () => {
    const result = redactTranscript(undefined, 14);
    expect(result.safeToPersist).toBe(false);
    expect(result.texto).toBe("");
  });

  it("(g) empty string transcript ⇒ safeToPersist:true, texto:'', tipos:[]", () => {
    const result = redactTranscript("", 14);
    expect(result.safeToPersist).toBe(true);
    expect(result.texto).toBe("");
    expect(result.tipos).toEqual([]);
    expect(result.retainUntilDays).toBe(14);
  });

  it("(h) invalid retencion NaN ⇒ retainUntilDays:null, still redacts, safeToPersist from residual", () => {
    const result = redactTranscript("El pedido llego tarde.", NaN);
    expect(result.retainUntilDays).toBeNull();
    expect(result.safeToPersist).toBe(true); // clean text, no residual
    expect(result.texto).toBe("El pedido llego tarde.");
  });

  it("(i) invalid retencion negative ⇒ retainUntilDays:null", () => {
    const result = redactTranscript("El pedido llego tarde.", -1);
    expect(result.retainUntilDays).toBeNull();
  });

  it("(j) invalid retencion zero ⇒ retainUntilDays:null", () => {
    const result = redactTranscript("texto limpio", 0);
    expect(result.retainUntilDays).toBeNull();
  });

  it("(k) deterministic: same input twice ⇒ identical output", () => {
    const t = "Contacto: jose@uber.com, tel +34 612 345 678.";
    expect(redactTranscript(t, 14)).toEqual(redactTranscript(t, 14));
  });

  it("(l) multi-type PII: all tipos reported, texto fully redacted", () => {
    const t = "Email: a@b.com IBAN ES91 2100 0418 4502 0005 1332 card 4111111111111111";
    const result = redactTranscript(t, 60);
    expect(result.tipos).toContain("email");
    expect(result.tipos).toContain("iban");
    expect(result.tipos).toContain("card");
    expect(result.safeToPersist).toBe(true);
    expect(result.retainUntilDays).toBe(60);
  });
});
