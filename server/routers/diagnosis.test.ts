import { describe, it, expect } from "vitest";
import { firstPoolRestaurant, type Exec } from "./diagnosis.js";

// Fase 0 / Bug B — the "Run flow" entry must operate on a REAL restaurant from the caller's pool, never a
// hardcoded demo fixture (R-PAY-001 is absent in prod ⇒ the 400 fail-closed). Pure (DB-free) unit: the
// query is tenant-scoped server-side (§7) and fail-closed honest on an empty pool (no fixture fallback).
describe("firstPoolRestaurant (Run-flow real-restaurant entry, no fixture)", () => {
  it("returns one restaurant scoped to the caller's tenant", async () => {
    let seenTenant: unknown;
    const exec = ((_sql: string, params: readonly unknown[]) => {
      seenTenant = params[0];
      return Promise.resolve([{ restaurant_id: "R0007" }]);
    }) as Exec;
    expect(await firstPoolRestaurant("T-PAY", exec)).toEqual({ restaurantId: "R0007" });
    expect(seenTenant).toBe("T-PAY"); // server-side tenant scope, never the client body (§7)
  });

  it("returns null on an empty pool (honest fail-closed, no fixture fallback)", async () => {
    const exec = (() => Promise.resolve([])) as Exec;
    expect(await firstPoolRestaurant("T-PAY", exec)).toBeNull();
  });
});
