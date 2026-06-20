// Pure planning logic for the migration runner — no DB, no env (so it unit-tests in isolation).
// The runner (apply-migrations.ts) and the unit test both depend on this single source of truth.

// Lexical sort gives a deterministic apply order because every migration file is timestamp-prefixed
// (YYYYMMDDHHMMSS_*.sql). Keep that naming or the order silently changes.
export function migrationOrder(allFiles: readonly string[]): string[] {
  return allFiles.filter((f) => f.endsWith(".sql")).sort();
}

// The migrations not yet recorded as applied, in apply order. Already-applied files are skipped —
// this is what makes the runner idempotent (safe to re-run every deploy).
export function pendingMigrations(allFiles: readonly string[], applied: Iterable<string>): string[] {
  const done = new Set(applied);
  return migrationOrder(allFiles).filter((f) => !done.has(f));
}
