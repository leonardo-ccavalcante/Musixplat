import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { cockpitConfigInput, type ConfigField } from "@shared/contracts_cockpit_config";

// 02:CP — "Prepare cockpit": the in-app setup that makes a fresh pool's cockpit WORK without the terminal.
// (1) Prepare runs the producer chain (cohorts if absent + governance floor + propose) so the board fills.
// (2) Config lets the operator download a ready-to-edit template of the OWNED governance (Policy_Tier + named
// knobs), edit it, and upload it — validated client- AND server-side (fail-closed) so a bad file can't break
// production. §14-safe: only INPUTS are uploadable; every number is produced by the engine, never seeded.
export function CockpitSetup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const provision = trpc.cockpit.provision.useMutation();
  const tpl = trpc.cockpit.configTemplate.useQuery(undefined, { enabled: open });
  const upload = trpc.cockpit.uploadConfig.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [prepErr, setPrepErr] = useState<string | null>(null);
  const [up, setUp] = useState<string | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);

  const onPrepare = () => {
    setPrep(null);
    setPrepErr(null);
    provision.mutate(undefined, {
      onSuccess: (r) => {
        if (r.needsBase) {
          setPrepErr("No business base yet — upload a CSV or generate an example base on the Cohorts screen first.");
          return;
        }
        if (r.alreadyPrepared) {
          setPrep("Already prepared ✓ — your pool already has proposals. Clear the base on the Cohorts screen to reset, then prepare again.");
        } else {
          setPrep(`Done ✓ ${r.cohorts} cohorts · ${r.proposed} proposals (${r.auto_acted} cleared by the AI alone, ${r.escalated} for you).`);
        }
        void utils.cockpit.list.invalidate();
        void utils.cockpit.weekSummary.invalidate();
        void utils.cockpit.autoActions.invalidate();
      },
      onError: (e) => setPrepErr(e.message),
    });
  };

  const onDownload = () => {
    if (!tpl.data) return;
    const url = URL.createObjectURL(new Blob([tpl.data.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cockpit-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setUp(null);
    setUpErr(null);
    let parsed: ReturnType<typeof cockpitConfigInput.parse>;
    try {
      parsed = cockpitConfigInput.parse(JSON.parse(await file.text())); // validate locally first (instant feedback)
    } catch (e) {
      setUpErr(e instanceof Error ? `Invalid config file: ${e.message}` : "Invalid config file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    upload.mutate(parsed, {
      onSuccess: (r) => {
        setUp(`Saved ✓ ${r.knobs} knob(s) · ${r.policy_tiers} policy tier(s).`);
        void utils.cockpit.list.invalidate();
      },
      onError: (e) => setUpErr(e.message),
    });
    if (fileRef.current) fileRef.current.value = ""; // allow re-uploading the same filename
  };

  return (
    <Modal open={open} onClose={onClose} title="Prepare cockpit">
      <section aria-labelledby="cs-prep">
        <h3 id="cs-prep" className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">1 · Prepare the cockpit</h3>
        <p className="mt-1 max-w-[60ch] text-xs text-mxm-content-secondary">
          Runs the engine over your pool — builds cohorts (if needed), the governance floor, and the AI&apos;s
          proposals. Safe to click again: it won&apos;t duplicate, it only fills an empty cockpit.
        </p>
        <Button onClick={onPrepare} disabled={provision.isPending} className="mt-2">
          {provision.isPending ? "Preparing…" : "Prepare cockpit"}
        </Button>
        {prep && (
          <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-mxm-green"><span aria-hidden>✓</span>{prep}</p>
        )}
        {prepErr && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-mxm-red"><span aria-hidden>✕</span>{prepErr}</p>
        )}
      </section>

      <section aria-labelledby="cs-cfg" className="mt-6 border-t border-mxm-border pt-5">
        <h3 id="cs-cfg" className="text-[0.7rem] uppercase tracking-wide text-mxm-content-tertiary">2 · Your governance (optional)</h3>
        <p className="mt-1 max-w-[60ch] text-xs text-mxm-content-secondary">
          The autonomy range you approve (per-tier ceiling + allowed actions) and named thresholds. Download the
          template, edit it, upload it — validated before it lands, so a bad file is rejected whole, never
          half-applied.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onDownload} disabled={!tpl.data}>Download template</Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload config"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Upload cockpit config JSON"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
        {up && (
          <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-mxm-green"><span aria-hidden>✓</span>{up}</p>
        )}
        {upErr && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-mxm-red"><span aria-hidden>✕</span>{upErr}</p>
        )}
        {tpl.data && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-mxm-content-secondary hover:text-mxm-content">What goes in the file?</summary>
            <div className="mt-2 space-y-3">
              <Legend title="knobs" fields={tpl.data.knobs} />
              <Legend title="policy_tiers" fields={tpl.data.policy_tiers} />
            </div>
          </details>
        )}
      </section>
    </Modal>
  );
}

function Legend({ title, fields }: { title: string; fields: ConfigField[] }) {
  return (
    <div>
      <p className="font-mono text-[0.68rem] text-mxm-content-tertiary">{title}</p>
      <ul className="mt-1 space-y-1">
        {fields.map((f) => (
          <li key={f.name} className="text-mxm-content-secondary">
            <span className="font-mono text-mxm-content">{f.name}</span>
            <span className="text-mxm-content-tertiary"> · {f.type}</span> — {f.desc}{" "}
            <span className="text-mxm-content-tertiary">(e.g. {f.example})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
