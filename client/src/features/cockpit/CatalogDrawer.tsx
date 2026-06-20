import { Link } from "wouter";
import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import { NBA_CATALOG } from "./nbaCatalog";

// 02 — "What are these actions?": the closed A1–A8 catalog made legible so the operator can READ the NBAs
// and understand what they are (Leo). Reuses the WCAG Modal. The static rows carry the human description;
// live usage (proposals + on-target rate) is read from nba.catalog so the operator sees which actions are
// actually in play — and an action with no proposals shows an honest "not used yet" instead of a dead-end
// link to an empty track record (§14).
export function CatalogDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const usage = trpc.nba.catalog.useQuery(undefined, { enabled: open });
  const byCode = Object.fromEntries((usage.data ?? []).map((u) => [u.code, u]));

  return (
    <Modal open={open} onClose={onClose} title="What are these actions?">
      <p className="mb-3 text-xs text-mxm-content-secondary">
        The closed set of best-actions the AI can propose (A1–A8), and how each is doing company-wide.
      </p>
      <ul className="space-y-3">
        {NBA_CATALOG.map((c) => {
          const u = byCode[c.code];
          const used = u != null && u.run_count > 0;
          const rate =
            u?.acerto_rate == null ? "not enough confirmed runs" : `${Math.round(u.acerto_rate * 100)}% on-target`;
          return (
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
              {used ? (
                <p className="mt-1.5 text-xs text-mxm-content-secondary">
                  <span className="tabnum font-medium text-mxm-content">{u.run_count}</span> proposal
                  {u.run_count === 1 ? "" : "s"} · <span className="text-mxm-content">{rate}</span> ·{" "}
                  <Link href={`/cockpit/action/${c.code}`} className="text-mxm-brand hover:underline">
                    track record →
                  </Link>
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-mxm-content-tertiary">Not proposed in the current data — nothing to show yet.</p>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
