import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Client SPA (mobile-first, dark-only). API served by Express tRPC on PORT (default 3000).
// Port + API proxy target are env-overridable so a second instance can run alongside another
// worktree without port collisions (VITE_PORT / VITE_API_TARGET); defaults keep 5173 → :3000.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3000";
export default defineConfig({
  root: "client",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./client/src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/trpc": { target: apiTarget, changeOrigin: true },
      "/auth": { target: apiTarget, changeOrigin: true },
      "/healthz": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
