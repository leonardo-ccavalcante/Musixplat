import { describe, expect, it } from "vitest";
import { migrationOrder, pendingMigrations } from "../../scripts/migrate-plan";

describe("migrate-plan", () => {
  it("orders by filename (timestamp prefix) and drops non-.sql", () => {
    const files = ["20260620000010_z.sql", "README.md", "20260617000001_a.sql"];
    expect(migrationOrder(files)).toEqual(["20260617000001_a.sql", "20260620000010_z.sql"]);
  });

  it("returns only un-applied migrations, in order (idempotency: applied files are skipped)", () => {
    const files = ["20260617000001_a.sql", "20260620000001_b.sql", "20260620000010_c.sql"];
    const applied = ["20260617000001_a.sql", "20260620000001_b.sql"];
    expect(pendingMigrations(files, applied)).toEqual(["20260620000010_c.sql"]);
  });

  it("re-run on a fully-applied DB has nothing pending (no double-apply)", () => {
    const files = ["20260617000001_a.sql", "20260620000010_c.sql"];
    expect(pendingMigrations(files, files)).toEqual([]);
  });

  it("an applied entry no longer on disk does not resurrect or error", () => {
    const files = ["20260620000010_c.sql"];
    const applied = ["20260617000001_a.sql", "20260620000010_c.sql"];
    expect(pendingMigrations(files, applied)).toEqual([]);
  });
});
