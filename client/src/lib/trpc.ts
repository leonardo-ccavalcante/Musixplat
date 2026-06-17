import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

export function trpcClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: "/trpc",
        transformer: superjson,
        fetch(url, options) {
          // Send the session cookie; tenant_id is resolved server-side from it.
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  };
}
