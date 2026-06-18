import { describe, it, expect } from "vitest";
import { resolveAccessScope } from "../access_scope.js";
import type { Credencial } from "../access_scope.js";

const cred: Credencial = {
  estado: "activa",
  rol: "agente",
  rbac_matriz: {
    LIBERAR: { nivel_max_liberable: "ALTA", requiere_2_ojos: false, origen_permitido: ["conversa"] },
    ESCALAR: { nivel_max_liberable: "BAJA", requiere_2_ojos: true, origen_permitido: ["nba"] },
  },
};

describe("resolveAccessScope — 05A:A.2.0 (access scope resolver, fail-closed, 04 §7)", () => {
  it("activa + action present + nivel_max ALTA, tetoTier MEDIA ⇒ allowed, nivelMax MEDIA (capped by teto)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", "MEDIA");
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("MEDIA");
    expect(r.requiere2Ojos).toBe(false);
    expect(r.origenPermitido).toEqual(["conversa"]);
  });

  it("activa + nivel_max BAJA, tetoTier ALTA ⇒ nivelMax BAJA (cap is no-op, rbac wins)", () => {
    const r = resolveAccessScope(cred, "ESCALAR", "ALTA");
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("activa + nivel_max ALTA, tetoTier ALTA ⇒ nivelMax ALTA (equal, no cap reduction)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", "ALTA");
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("ALTA");
  });

  it("activa + nivel_max MEDIA, tetoTier BAJA ⇒ nivelMax BAJA (teto is lower cap)", () => {
    const cred2: Credencial = {
      estado: "activa",
      rol: "agente",
      rbac_matriz: {
        PROPONER: { nivel_max_liberable: "MEDIA", requiere_2_ojos: false, origen_permitido: ["nba"] },
      },
    };
    const r = resolveAccessScope(cred2, "PROPONER", "BAJA");
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("estado 'suspendida' ⇒ fail-closed regardless of rbac", () => {
    const suspended: Credencial = { ...cred, estado: "suspendida" };
    const r = resolveAccessScope(suspended, "LIBERAR", "ALTA");
    expect(r.allowed).toBe(false);
    expect(r.nivelMax).toBe("BAJA");
    expect(r.requiere2Ojos).toBe(true);
    expect(r.origenPermitido).toEqual([]);
  });

  it("estado 'revocada' ⇒ fail-closed", () => {
    const revoked: Credencial = { ...cred, estado: "revocada" };
    const r = resolveAccessScope(revoked, "LIBERAR", "ALTA");
    expect(r.allowed).toBe(false);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("action missing from rbac_matriz ⇒ fail-closed", () => {
    const r = resolveAccessScope(cred, "ACCION_DESCONOCIDA", "ALTA");
    expect(r.allowed).toBe(false);
    expect(r.nivelMax).toBe("BAJA");
    expect(r.requiere2Ojos).toBe(true);
  });

  it("null cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(null, "LIBERAR", "ALTA");
    expect(r.allowed).toBe(false);
    expect(r.nivelMax).toBe("BAJA");
    expect(r.requiere2Ojos).toBe(true);
    expect(r.origenPermitido).toEqual([]);
  });

  it("undefined cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(undefined, "LIBERAR", "MEDIA");
    expect(r.allowed).toBe(false);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("null tetoTier ⇒ BAJA cap (fail-closed on unknown ceiling)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", null);
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("undefined tetoTier ⇒ BAJA cap (fail-closed)", () => {
    const r = resolveAccessScope(cred, "LIBERAR", undefined);
    expect(r.allowed).toBe(true);
    expect(r.nivelMax).toBe("BAJA");
  });

  it("requiere2Ojos passthrough from rbac entry", () => {
    const r = resolveAccessScope(cred, "ESCALAR", "ALTA");
    expect(r.requiere2Ojos).toBe(true);
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(resolveAccessScope(cred, "LIBERAR", "MEDIA")).toEqual(
      resolveAccessScope(cred, "LIBERAR", "MEDIA"),
    );
  });
});
