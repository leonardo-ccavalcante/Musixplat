import { describe, it, expect } from "vitest";
import { buildExecRequest } from "../idempotency.js";
import type { ExecRequestInput } from "../idempotency.js";

const base: ExecRequestInput = {
  conversationId: "conv-001",
  nbaId: "nba-42",
  policyVersion: "v1.0",
  pedido: { action: "discount", value: 10 },
};

describe("buildExecRequest — 05A:A.5.1 (pedido_ejecucion + deterministic idempotency_key)", () => {
  it("determinism: same input twice ⇒ identical idempotency_key (THE core property)", () => {
    const a = buildExecRequest(base);
    const b = buildExecRequest(base);
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.idempotency_key).not.toBeNull();
  });

  it("key is a non-empty stable string (not empty, not undefined)", () => {
    const { idempotency_key } = buildExecRequest(base);
    expect(typeof idempotency_key).toBe("string");
    expect((idempotency_key as string).length).toBeGreaterThan(0);
  });

  it("changing nbaId ⇒ different key", () => {
    const a = buildExecRequest(base);
    const b = buildExecRequest({ ...base, nbaId: "nba-99" });
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  it("changing policyVersion ⇒ different key (anti-mix §3.5)", () => {
    const a = buildExecRequest(base);
    const b = buildExecRequest({ ...base, policyVersion: "v2.0" });
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  it("changing conversationId ⇒ different key", () => {
    const a = buildExecRequest(base);
    const b = buildExecRequest({ ...base, conversationId: "conv-999" });
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  it("pedido_ejecucion contains the sealed policy_version (anti-mix §3.5)", () => {
    const { pedido_ejecucion } = buildExecRequest(base);
    expect(pedido_ejecucion["policy_version"]).toBe(base.policyVersion);
  });

  it("pedido_ejecucion preserves the original pedido fields", () => {
    const { pedido_ejecucion } = buildExecRequest(base);
    expect(pedido_ejecucion["action"]).toBe("discount");
    expect(pedido_ejecucion["value"]).toBe(10);
  });

  it("null input ⇒ fail-closed: {idempotency_key: null}", () => {
    const r = buildExecRequest(null);
    expect(r.idempotency_key).toBeNull();
  });

  it("undefined input ⇒ fail-closed: {idempotency_key: null}", () => {
    const r = buildExecRequest(undefined);
    expect(r.idempotency_key).toBeNull();
  });

  it("missing conversationId (empty string) ⇒ fail-closed: {idempotency_key: null}", () => {
    const r = buildExecRequest({ ...base, conversationId: "" });
    expect(r.idempotency_key).toBeNull();
  });

  it("missing nbaId (empty string) ⇒ fail-closed: {idempotency_key: null}", () => {
    const r = buildExecRequest({ ...base, nbaId: "" });
    expect(r.idempotency_key).toBeNull();
  });

  it("missing policyVersion (empty string) ⇒ fail-closed: {idempotency_key: null}", () => {
    const r = buildExecRequest({ ...base, policyVersion: "" });
    expect(r.idempotency_key).toBeNull();
  });

  it("pedido contents do NOT affect idempotency_key (key depends only on conversationId|nbaId|policyVersion)", () => {
    const a = buildExecRequest(base);
    const b = buildExecRequest({ ...base, pedido: { action: "refund", value: 99 } });
    expect(a.idempotency_key).toBe(b.idempotency_key);
  });
});
