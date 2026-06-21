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
        // Split long batches into multiple requests (02:CP2): the cockpit fans out one per-row knowledge
        // impact query per proposal, and as "Run NBA" grows the board these GET inputs overflow the request
        // header limit (HTTP 431). Capping the URL length makes tRPC split the batch instead of failing.
        maxURLLength: 14000,
        fetch(url, options) {
          // Send the session cookie; tenant_id is resolved server-side from it.
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  };
}
