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

// Dev login: mints a server-signed session cookie for a real Usuario row (tenant_id from DB,
// never from the client). Stands in for Manus OAuth locally. Disabled in production.
app.post("/auth/dev-login", async (req, res) => {
  if (env.NODE_ENV === "production") return res.status(404).end();
  const usuarioId = String(req.body?.usuario_id ?? "");
  const rows = await query<{ usuario_id: string; tenant_id: string; nivel_org: string }>(
    `select usuario_id, tenant_id, nivel_org from gov."Usuario" where usuario_id = $1`,
    [usuarioId],
  );
  const u = rows[0];
  if (!u) return res.status(401).json({ error: "unknown usuario_id" });
  const token = signSession({ usuario_id: u.usuario_id, tenant_id: u.tenant_id, nivel_org: u.nivel_org });
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
  res.json({ ok: true, usuario_id: u.usuario_id });
});

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({ router: appRouter, createContext }),
);

app.listen(env.PORT, () => {
  console.warn(`server on :${env.PORT}`);
});
