import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";

// Task 8 — CSV upload modal. Reuses <Modal> for all a11y (focus-trap, Esc, focus-return, aria-modal).
// TRIGGER-IN: uploadOpen=true  DATA-OUT: restaurants+orders counts  TRIGGERS: onUploaded→invalidateAll
export function CsvUploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const template = trpc.cohorts.csvTemplate.useQuery(undefined, { enabled: open });
  const upload = trpc.cohorts.uploadCsv.useMutation();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ restaurants: number; orders: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    if (!template.data) return;
    const blob = new Blob([template.data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cohort_base_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await upload.mutateAsync({ filename: file.name, contentBase64 });
      setResult(r);
      onUploaded();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed (fail-closed)");
    } finally {
      setBusy(false);
      // reset so the same file can be re-picked after an error
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload cohort base (CSV)">
      <div className="space-y-4">
        <p className="text-sm text-mxm-content-secondary">
          One row per order; each row carries its restaurant's attributes. Download the template to
          see every expected field + type.
        </p>

        {/* Download template */}
        <Button
          type="button"
          variant="primary"
          disabled={!template.data}
          onClick={downloadTemplate}
        >
          {template.isLoading ? "Loading template…" : "Download template (.csv)"}
        </Button>

        {/* Column legend */}
        {template.data && (
          <div
            className="max-h-56 overflow-y-auto rounded-mxm border border-mxm-border p-3"
            aria-label="Column type legend"
          >
            <p className="mb-2 text-xs font-semibold text-mxm-content-secondary">
              Column legend
            </p>
            <dl className="mt-4 text-xs">
              {template.data.columns.map((c) => (
                <div key={c.name} className="grid grid-cols-[10rem_1fr] gap-2 py-1 border-b border-mxm-border last:border-0">
                  <dt className="font-mono text-mxm-content">{c.name}</dt>
                  <dd className="text-mxm-content-secondary">
                    <span>{c.type} — {c.desc}</span>
                    <span className="mt-0.5 block text-mxm-content-tertiary">e.g. <span className="font-mono">{c.example || "(blank)"}</span></span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* File upload */}
        <label className="block text-sm font-medium text-mxm-content">
          Select filled CSV
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm text-mxm-content-secondary file:mr-3 file:rounded-mxm file:border file:border-mxm-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-mxm-content"
            disabled={busy}
            onChange={(e) => void onFileChange(e)}
          />
        </label>

        {/* Busy state */}
        <div aria-live="polite" className="text-sm text-mxm-content-secondary">
          {busy && "Uploading + validating…"}
          {result && `Imported · ${result.restaurants} restaurants · ${result.orders} orders`}
        </div>

        {/* Error state — text + icon, not color alone */}
        {err && (
          <div role="alert" className="flex items-start gap-2 text-sm text-mxm-red">
            <span aria-hidden="true">⚠</span>
            <span>Rejected: {err}</span>
          </div>
        )}

        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
