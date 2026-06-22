import { useEffect, useRef, useState } from "react";

// Page-level "Expand all / Collapse all" broadcast. The page bumps `n` on every click so repeated clicks
// of the same action still re-fire; each tier reacts to the command and opens/closes all of its rows,
// while individual row toggles stay intact between broadcasts.
//
// `keys` MUST be a stable-identity array (memoize it on the query data) — the effect depends on it so an
// "Expand all" clicked while a tier is still loading is re-applied to the rows when they finally arrive
// (otherwise the command would be silently lost). A no-op refetch returns the same key identity, so it
// does not disturb the open set.
export type ExpandCmd = { open: boolean; n: number };

export function useExpandGroup(cmd: ExpandCmd | null, keys: string[]) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const appliedRef = useRef<ExpandCmd | null>(null);

  useEffect(() => {
    if (!cmd) return;
    const newBroadcast = cmd !== appliedRef.current;
    appliedRef.current = cmd;
    setOpenIds((prev) => {
      // Expand: open every current row (a new click and a late data arrival both top up the set).
      if (cmd.open) return new Set([...prev, ...keys]);
      // Collapse: only the click itself closes everything; a later key change leaves manual toggles and
      // lets newly-arrived rows stay closed by default (they are simply absent from the set).
      return newBroadcast ? new Set() : prev;
    });
  }, [cmd, keys]);

  return {
    isOpen: (k: string) => openIds.has(k),
    setOpen: (k: string, open: boolean) =>
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (open) next.add(k);
        else next.delete(k);
        return next;
      }),
  };
}
