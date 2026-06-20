import { useEffect, useState } from "react";

// Single-source media-query hook. Defaults to FALSE (desktop) on SSR/jsdom (no matchMedia), so unit
// tests render the desktop path and exercise one DOM — never both layouts at once.
export function useIsMobile(query = "(max-width: 640px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return isMobile;
}
