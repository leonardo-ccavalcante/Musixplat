import { Link } from "wouter";
import { Modal } from "@/components/ui/Modal";
import { NBA_CATALOG } from "./nbaCatalog";

// 02 — "What are these actions?": the closed A1–A8 catalog made legible so the operator can READ the NBAs
// and understand what they are (Leo). Reuses the WCAG Modal (focus-trap + Esc + focus-return). Reference
// data only (§14) — the live per-action catalog + track record opens on /cockpit/action/:code.
export function CatalogDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="What are these actions?">
      <p className="mb-3 text-xs text-mxm-content-secondary">
        The closed set of best-actions the AI can propose (A1–A8). Reference, not a result.
      </p>
      <ul className="space-y-3">
        {NBA_CATALOG.map((c) => (
          <li key={c.code} className="border-b border-mxm-border pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-baseline gap-2">
              <span className="tabnum text-xs text-mxm-content-tertiary">{c.code}</span>
              <span className="font-semibold text-mxm-content">{c.name}</span>
              {c.money && (
                <span className="ml-auto rounded-full border border-mxm-border px-2 py-0.5 text-[0.68rem] text-mxm-red">
                  touches money
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-mxm-content-secondary">{c.desc}</p>
            <p className="mt-1 text-xs text-mxm-content-tertiary">funnel stage · {c.stage}</p>
            <Link href={`/cockpit/action/${c.code}`} className="mt-1 inline-block text-xs text-mxm-brand hover:underline">
              See {c.code}&apos;s track record →
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
