import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export type RuleVersion = {
  version_id: string;
  effective_date: string;
  what_changed: string;
  baseline_effect: string | null;
  provenance: string;
};

// F-4.2 — ML changelog timeline (read-only, ordered by effective_date). Semantic list, navigable.
export function ChangelogTimeline({ versions }: { versions: RuleVersion[] }) {
  return (
    <Card ariaLabel="Changelog de versiones de regla">
      <CardTitle>Changelog ML (cohort_rule_version)</CardTitle>
      {versions.length === 0 ? (
        <EmptyState>Sin versiones de regla.</EmptyState>
      ) : (
        <ol className="space-y-2">
          {versions.map((v) => (
            <li key={v.version_id} className="border-l-2 border-mxm-border pl-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-mxm-content">{v.version_id}</span>
                <span className="tabnum text-xs text-mxm-content-tertiary">{v.effective_date}</span>
                <span className="text-xs text-mxm-content-tertiary">{v.provenance}</span>
              </div>
              <p className="text-xs text-mxm-content-secondary">{v.what_changed}</p>
              {v.baseline_effect && (
                <p className="text-xs text-mxm-content-tertiary">→ {v.baseline_effect}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
