import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./_core/context.js";
import { env, assertProdSecrets } from "./_core/env.js";
import { signSession, SESSION_COOKIE } from "./_core/auth.js";
import { query, pool } from "./db/pool.js";

assertProdSecrets();

// Last-resort visibility. The prod crash-loop had NO app stack — a silent ELIFECYCLE. Any uncaught
// exception / unhandled rejection still exits the process (fail-closed §3.7 — never swallow and limp on
// with corrupted state; Railway restarts), but log the full error + stack FIRST so the next incident is
// diagnosable instead of a stackless mystery. (The pg idle-client drop is handled at the pool; this is the
// net for everything else.)
process.on("uncaughtException", (err) => {
  console.error("FATAL uncaughtException — exiting non-zero:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("FATAL unhandledRejection — exiting non-zero:", reason);
  process.exit(1);
});

const app = express();
// 25mb body limit (default is 100kb): the cohort CSV onboarding uploads a base64-encoded CSV that can
// reach a few MB for a full base (~10k rows ≈ 1.5MB base64). Without this the upload 413s and the client
// gets an HTML error page ("Unexpected token '<'") instead of a tRPC response.
app.use(express.json({ limit: "25mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Dev login: mints a server-signed session cookie for a real User row (tenant_id from DB,
// never from the client). Stands in for Manus OAuth locally. In production it stays disabled
// UNLESS DEMO_LOGIN=1 is set (public demo deploy), so the showcase can auto-authenticate.
app.post("/auth/dev-login", async (req, res) => {
  if (env.NODE_ENV === "production" && process.env.DEMO_LOGIN !== "1") return res.status(404).end();
  const usuarioId = String(req.body?.user_id ?? "");
  const rows = await query<{ user_id: string; tenant_id: string; org_level: string }>(
    `select user_id, tenant_id, org_level from gov."User" where user_id = $1`,
    [usuarioId],
  );
  const u = rows[0];
  if (!u) return res.status(401).json({ error: "unknown user_id" });
  const token = signSession({ user_id: u.user_id, tenant_id: u.tenant_id, org_level: u.org_level });
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`,
  );
  res.json({ ok: true, user_id: u.user_id });
});

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({ router: appRouter, createContext }),
);

// Single-service deploy (Railway): serve the built SPA from the same origin so the client's
// relative `/trpc` calls work with no CORS. API routes above are matched first; any other GET
// falls back to index.html for client-side routing (wouter).
const clientDir = path.join(process.cwd(), "dist/client");
// Read the SPA shell ONCE at boot and serve it from memory — no per-request file-system access
// (avoids the unbounded-fs-read DoS vector CodeQL flags), and a touch faster. The path is fixed
// (never user-derived), so there is no path-traversal surface.
const indexHtml = readFileSync(path.join(clientDir, "index.html"), "utf8");
app.use(express.static(clientDir));
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/trpc") || req.path.startsWith("/auth") || req.path === "/healthz") {
    return next();
  }
  res.type("html").send(indexHtml);
});

const server = app.listen(env.PORT, () => {
  console.warn(`server on :${env.PORT}`);
});

// Graceful shutdown. Railway sends SIGTERM on every deploy / restart / scale. With no handler Node exits
// 143 and pnpm reports `ELIFECYCLE Command failed` — which under restartPolicy=ON_FAILURE reads as a crash
// and feeds the restart loop. Stop accepting connections, drop idle HTTP keep-alive sockets (Railway's edge
// proxy holds them open, so without this server.close() would hang and its callback never fire), close the
// pg pool, then exit 0 so a normal stop is a clean stop. The unref'd 10s timer is the hard backstop.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    console.warn(`${sig} received — draining and shutting down`);
    server.close(() => void pool.end().finally(() => process.exit(0)));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
