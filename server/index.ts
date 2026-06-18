import express from "express";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./_core/context.js";
import { env, assertProdSecrets } from "./_core/env.js";
import { signSession, SESSION_COOKIE } from "./_core/auth.js";
import { query } from "./db/pool.js";

assertProdSecrets();

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Dev login: mints a server-signed session cookie for a real User row (tenant_id from DB,
// never from the client). Stands in for Manus OAuth locally. Disabled in production.
app.post("/auth/dev-login", async (req, res) => {
  if (env.NODE_ENV === "production") return res.status(404).end();
  const usuarioId = String(req.body?.user_id ?? "");
  const rows = await query<{ user_id: string; tenant_id: string; org_level: string }>(
    `select user_id, tenant_id, org_level from gov."User" where user_id = $1`,
    [usuarioId],
  );
  const u = rows[0];
  if (!u) return res.status(401).json({ error: "unknown user_id" });
  const token = signSession({ user_id: u.user_id, tenant_id: u.tenant_id, org_level: u.org_level });
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
  res.json({ ok: true, user_id: u.user_id });
});

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({ router: appRouter, createContext }),
);

app.listen(env.PORT, () => {
  console.warn(`server on :${env.PORT}`);
});
