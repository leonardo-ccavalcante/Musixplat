import { useEffect, useState } from "react";

// dev-login mints the local operator session (stands in for Manus OAuth); tenant_id is resolved
// server-side. Shared by the cockpit and the action-detail screen so the effect lives in ONE place.
export function useDevLogin(userId = "U-OP-001"): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: userId }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return ready;
}
