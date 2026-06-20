import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import {
  docType,
  type DocType,
  type UploadInput,
  type UploadResult,
  type ConfirmTypeInput,
} from "@shared/contracts_knowledge";

// The 6 MECE doc types (mirrors server/knowledge/classify.ts; the shared Zod enum is the single source).
const TYPES: ReadonlyArray<DocType> = docType.options;

// Humanize the classifier signal — a [C]-class cue, never a loud raw float (DESIGN-STANDARD §3).
function confidenceLabel(c: number): string {
  if (c >= 0.75) return "high confidence";
  if (c >= 0.5) return "medium confidence";
  return "low confidence";
}

// base64 of the raw bytes — FileReader keeps it browser-native (no Buffer in the client).
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res !== "string") return reject(new Error("read failed"));
      resolve(res.slice(res.indexOf(",") + 1)); // strip the data: URL prefix
    };
    reader.readAsDataURL(file);
  });
}

type Phase =
  | { kind: "pick" }
  | { kind: "uploading" }
  | { kind: "confirm"; result: UploadResult; chosen: DocType }
  | { kind: "failed"; reason: string } // could not parse the file (bad/empty content)
  | { kind: "index_failed"; reason: string } // embed failed after retries — nothing stored, retryable
  | { kind: "error"; reason: string };

// P06 — upload then the AI PROPOSES a doc-type ([I], text only — never a number, §3.6); the human
// confirms or overrides it ([V]) before it counts. parse_failed surfaces the reason — no silent
// success (§3.7). Reuses the WCAG Modal primitive (aria-modal + focus-trap + Esc + focus-return).
export function UploadModal({
  open,
  onClose,
  onUpload,
  onConfirm,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (input: UploadInput) => Promise<UploadResult>;
  onConfirm: (input: ConfirmTypeInput) => Promise<void>;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [confirming, setConfirming] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null); // retained so "Try again" can re-upload

  function close(): void {
    setPhase({ kind: "pick" }); // reset so a re-open starts clean
    setLastFile(null);
    onClose();
  }

  // Upload one file → the AI proposes a type. Two fail-closed outcomes surface their reason and store
  // nothing usable: parse_failed (bad file) and index_failed (embed failed after retries — retryable).
  async function runUpload(file: File): Promise<void> {
    setPhase({ kind: "uploading" });
    try {
      const contentBase64 = await toBase64(file);
      const result = await onUpload({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        contentBase64,
      });
      if (result.status === "parse_failed") {
        setPhase({ kind: "failed", reason: result.reason ?? "could not parse this file" });
      } else if (result.status === "index_failed") {
        setPhase({ kind: "index_failed", reason: result.reason ?? "could not index this file right now" });
      } else {
        setPhase({ kind: "confirm", result, chosen: result.proposedType });
      }
    } catch (err) {
      setPhase({ kind: "error", reason: err instanceof Error ? err.message : "upload failed" });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastFile(file);
    void runUpload(file);
  }

  async function confirm(): Promise<void> {
    if (phase.kind !== "confirm" || !phase.result.docId) return; // docId is always set in "confirm"
    setConfirming(true);
    try {
      await onConfirm({ docId: phase.result.docId, docType: phase.chosen });
      onDone();
      close();
    } catch (err) {
      setPhase({ kind: "error", reason: err instanceof Error ? err.message : "confirm failed" });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add a document to the knowledge base">
      <div className="space-y-4">
        <div>
          <label htmlFor="kb-file" className="block text-sm font-medium text-mxm-content">
            File (PDF, Markdown or text)
          </label>
          <input
            id="kb-file"
            type="file"
            accept=".pdf,.md,.markdown,.txt"
            onChange={onFile}
            disabled={phase.kind === "uploading"}
            className="mt-1.5 block w-full text-sm text-mxm-content-secondary file:mr-3 file:rounded-mxm file:border file:border-mxm-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
          />
          <p className="mt-1.5 text-xs text-mxm-content-tertiary">
            The AI proposes a type ([I]); you confirm or override it ([V]) before it joins the base.
          </p>
        </div>

        {phase.kind === "uploading" && (
          <p role="status" aria-live="polite" className="text-sm text-mxm-content-secondary">
            Parsing and classifying…
          </p>
        )}

        {phase.kind === "failed" && (
          <p role="alert" className="rounded-mxm border border-mxm-red px-3 py-2 text-sm text-mxm-red">
            Could not add this file: {phase.reason}. Nothing was stored as usable — try another file.
          </p>
        )}

        {phase.kind === "index_failed" && (
          <div role="alert" className="space-y-2 rounded-mxm border border-mxm-red px-3 py-2 text-sm text-mxm-red">
            <p>
              Could not index this file: {phase.reason}. Nothing was stored — your base is unchanged, so
              you can safely try again.
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => lastFile && void runUpload(lastFile)}
              disabled={!lastFile}
            >
              Try again
            </Button>
          </div>
        )}

        {phase.kind === "error" && (
          <p role="alert" className="rounded-mxm border border-mxm-red px-3 py-2 text-sm text-mxm-red">
            {phase.reason}
          </p>
        )}

        {phase.kind === "confirm" && (
          <div className="space-y-3 rounded-mxm border border-mxm-border px-3 py-3">
            <p className="text-sm text-mxm-content-secondary">
              This looks like a{" "}
              <span className="inline-flex items-center gap-1 font-medium text-mxm-content">
                {phase.result.proposedType}
                <ProvenanceBadge prov="[I]" />
              </span>
              <span
                className="text-mxm-content-tertiary"
                title={`classifier confidence ${(phase.result.confidence * 100).toFixed(0)}%`}
              >
                {" "}
                · {confidenceLabel(phase.result.confidence)}
              </span>
              . Confirm it, or change the type:
            </p>
            <label htmlFor="kb-type" className="block text-xs text-mxm-content-secondary">
              Document type
            </label>
            <select
              id="kb-type"
              value={phase.chosen}
              onChange={(e) => setPhase({ ...phase, chosen: e.target.value as DocType })}
              className="w-full rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-sm text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={confirming}>
                Cancel
              </Button>
              <Button onClick={() => void confirm()} disabled={confirming}>
                {confirming ? "Confirming…" : "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
