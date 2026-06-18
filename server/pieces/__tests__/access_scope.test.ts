import { describe, it, expect } from "vitest";
import { resolveAccessScope } from "../access_scope.js";
import type { Credencial } from "../access_scope.js";

const cred: Credencial = {
  status: "activa",
  role: "agente",
  rbac_matriz: {
    LIBERAR: { level_max_liberable: "HIGH", requiere_2_ojos: false, origen_permitido: ["conversation"] },
    ESCALAR: { level_max_liberable: "LOW", requiere_2_ojos: true, origen_permitido: ["nba"] },
  },
};

describe("resolveAccessScope — 05A:A.2.0 (access scope resolver, fail-closed, 04 §7)", () => {
  it("activa + action present + level_max HIGH, tetoTier MEDIUM ⇒ allowed, levelMax MEDIUM (capped by teto)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", "MEDIUM");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("MEDIUM");
    expect(r.requiere2Ojos).toBe(false);
    expect(r.origenPermitido).toEqual(["conversation"]);
  });

  it("activa + level_max LOW, tetoTier HIGH ⇒ levelMax LOW (cap is no-op, rbac wins)", () => {
    const r = resolveAccessScope(cred, "ESCALAR", "HIGH");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("activa + level_max HIGH, tetoTier HIGH ⇒ levelMax HIGH (equal, no cap reduction)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", "HIGH");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("HIGH");
  });

  it("activa + level_max MEDIUM, tetoTier LOW ⇒ levelMax LOW (teto is lower cap)", () => {
    const cred2: Credencial = {
      status: "activa",
      role: "agente",
      rbac_matriz: {
        PROPONER: { level_max_liberable: "MEDIUM", requiere_2_ojos: false, origen_permitido: ["nba"] },
      },
    };
    const r = resolveAccessScope(cred2, "PROPONER", "LOW");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("status 'suspendida' ⇒ fail-closed regardless of rbac", () => {
    const suspended: Credencial = { ...cred, status: "suspendida" };
    const r = resolveAccessScope(suspended, "LIBERAR", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requiere2Ojos).toBe(true);
    expect(r.origenPermitido).toEqual([]);
  });

  it("status 'revocada' ⇒ fail-closed", () => {
    const revoked: Credencial = { ...cred, status: "revocada" };
    const r = resolveAccessScope(revoked, "LIBERAR", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
  });

  it("action missing from rbac_matriz ⇒ fail-closed", () => {
    const r = resolveAccessScope(cred, "ACCION_DESCONOCIDA", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requiere2Ojos).toBe(true);
  });

  it("null cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(null, "LIBERAR", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requiere2Ojos).toBe(true);
    expect(r.origenPermitido).toEqual([]);
  });

  it("undefined cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(undefined, "LIBERAR", "MEDIUM");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
  });

  it("null tetoTier ⇒ LOW cap (fail-closed on unknown ceiling)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", null);
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("undefined tetoTier ⇒ LOW cap (fail-closed)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", undefined);
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("requiere2Ojos passthrough from rbac entry", () => {
    const r = resolveAccessScope(cred, "ESCALAR", "HIGH");
    expect(r.requiere2Ojos).toBe(true);
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(resolveAccessScope(cred, "LIBERAR", "MEDIUM")).toEqual(
      resolveAccessScope(cred, "LIBERAR", "MEDIUM"),
    );
  });
});
