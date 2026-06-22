import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { cockpitConfigInput, type ConfigField } from "@shared/contracts_cockpit_config";

// Edit the autonomy CAP (Policy_Tier.tier_cap) + named knobs via the EXISTING governance template flow
// (cockpit.configTemplate read + cockpit.uploadConfig managerProcedure write). This is the read-only
// Observatory's ONLY write lever: a human-authored ceiling ([V]), never a faked Eval_Cell result (§14).
// Deliberately NOT CockpitSetup — that also runs "Prepare cockpit" (a producer + auto-dispatch), which
// would break the read-only contract; provisioning stays on the Cockpit.
export function CapEditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const tpl = trpc.cockpit.configTemplate.useQuery(undefined, { enabled: open });
  const upload = trpc.cockpit.uploadConfig.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onDownload = () => {
    if (!tpl.data) return;
    const url = URL.createObjectURL(new Blob([tpl.data.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "autonomy-limits.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setMsg(null);
    setErr(null);
    let parsed: ReturnType<typeof cockpitConfigInput.parse>;
    try {
      parsed = cockpitConfigInput.parse(JSON.parse(await file.text())); // validate locally first (instant feedback)
    } catch (e) {
      setErr(e instanceof Error ? `Invalid file: ${e.message}` : "Invalid file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    upload.mutate(parsed, {
      onSuccess: (r) => {
        setMsg(`Saved ✓ ${r.knobs} knob(s) · ${r.policy_tiers} tier(s).`);
        void utils.cockpit.list.invalidate();
      },
      onError: (e) => setErr(e.message),
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit autonomy limits">
      <p className="max-w-[60ch] text-xs text-mxm-content-secondary">
        The autonomy range you approve — the per-tier ceiling (cap) plus named thresholds. Download the
        template, edit it, upload it; it&apos;s validated before it lands, so a bad file is rejected whole.
        This sets a human ceiling (marked verified by you); it never writes the AI&apos;s measured grade.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onDownload} disabled={!tpl.data}>
          Download template
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload limits"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Upload autonomy limits JSON"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {msg && (
        <p role="status" className="mt-2 text-xs text-mxm-green">
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-2 text-xs text-mxm-red">
          ✕ {err}
        </p>
      )}
      {tpl.data && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-mxm-content-secondary hover:text-mxm-content">
            What goes in the file?
          </summary>
          <div className="mt-2 space-y-3">
            <Legend title="knobs" fields={tpl.data.knobs} />
            <Legend title="policy_tiers" fields={tpl.data.policy_tiers} />
          </div>
        </details>
      )}
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
            <span className="text-mxm-content-tertiary"> · {f.type}</span> — {f.desc}
          </li>
        ))}
      </ul>
    </div>
  );
}
