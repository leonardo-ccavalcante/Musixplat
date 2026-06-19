import { useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { parseTicketCsv, parseConversationCsv } from "./situationCsv";
import type { IntakeResult } from "@shared/contracts_intake";

// 05B Situation Room — the operator uploads REAL data (a ticket CSV or an n8n conversation export) and the
// WHOLE spine runs on it: numbers are PRODUCED from the file, never the fixed 47/35 (Leo: "se não vou estar
// fakeando"). Two modes; each ships its own downloadable template so the format is unambiguous.
const TICKET_TEMPLATE = `restaurant_id,zone,payment_status,opened_ticket,intent,criticality,message
R-001,Centro,failed,true,billing,critical,"My payout for last week never arrived. Customers paid but I see nothing on my side."
R-002,Centro,failed,false,,,
R-003,Norte,failed,false,,,
R-004,Norte,ok,false,,,
`;
const CONVERSATION_TEMPLATE = `id,session_id,message,created_at
1,5699,"{""type"": ""human"", ""content"": ""Hola, mi pago de la semana no llego""}",2025-08-18 14:57:35+00
2,5699,"{""type"": ""ai"", ""content"": ""Lo reviso ahora mismo. Cual es tu restaurante?""}",2025-08-18 14:58:00+00
3,5700,"{""type"": ""human"", ""content"": ""Mi pedido aparece cancelado pero el cliente pago""}",2025-08-18 15:10:00+00
`;

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type UploadState = { status: "idle" | "running" | "done" | "error"; result?: IntakeResult; error?: string };

function UploadCard({
  title,
  hint,
  templateName,
  template,
  onFile,
  state,
}: {
  title: string;
  hint: ReactNode;
  templateName: string;
  template: string;
  onFile: (file: File) => void;
  state: UploadState;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const r = state.result;
  return (
    <div className="rounded-mxm border border-mxm-border p-4">
      <h3 className="text-sm font-semibold text-mxm-content">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-mxm-content-secondary">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => download(templateName, template)}>
          Download template
        </Button>
        <Button className="text-mxm-content-inverted" disabled={state.status === "running"} onClick={() => ref.current?.click()}>
          {state.status === "running" ? "Running…" : "Choose CSV"}
        </Button>
        <input
          ref={ref}
          type="file"
          accept=".csv,text/csv"
          aria-label={`${title} — choose a CSV file`}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = ""; // allow re-uploading the same file
          }}
        />
      </div>
      <p
        aria-live="polite"
        className={`mt-2 text-xs ${state.status === "error" ? "text-mxm-red" : "text-mxm-content-secondary"}`}
      >
        {state.status === "running" && "Staging your rows → running the spine…"}
        {state.status === "error" && `Fail-closed: ${state.error}`}
        {state.status === "done" && r && (
          <>
            Ran on your file · <span className="text-mxm-content">{r.staged}</span> staged ·{" "}
            <span className="text-mxm-content">{r.affected}</span> affected ·{" "}
            <span className="text-mxm-brand">{r.silent}</span> silent · €{" "}
            <span className="text-mxm-content">{r.revenue_lost}</span> · {r.note}
          </>
        )}
      </p>
    </div>
  );
}

export function SituationRoom({ onDone }: { onDone: () => void }) {
  const uploadTickets = trpc.intake.uploadTickets.useMutation();
  const uploadConversations = trpc.intake.uploadConversations.useMutation();
  const [tState, setTState] = useState<UploadState>({ status: "idle" });
  const [cState, setCState] = useState<UploadState>({ status: "idle" });

  async function handleTickets(file: File): Promise<void> {
    setTState({ status: "running" });
    try {
      const rows = parseTicketCsv(await file.text());
      if (rows.length === 0) throw new Error("no rows with a restaurant_id found");
      const result = await uploadTickets.mutateAsync({ rows });
      setTState({ status: "done", result });
      onDone();
    } catch (e) {
      setTState({ status: "error", error: e instanceof Error ? e.message : "upload failed" });
    }
  }

  async function handleConversations(file: File): Promise<void> {
    setCState({ status: "running" });
    try {
      const conversations = parseConversationCsv(await file.text());
      if (conversations.length === 0) throw new Error("no conversations found (need session_id + message)");
      const result = await uploadConversations.mutateAsync({ conversations });
      setCState({ status: "done", result });
      onDone();
    } catch (e) {
      setCState({ status: "error", error: e instanceof Error ? e.message : "upload failed" });
    }
  }

  return (
    <section aria-label="Situation Room" className="mt-4 rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.5rem)]">
      <h2 className="text-sm font-semibold text-mxm-content">Situation Room · run the spine on your data</h2>
      <p className="mt-1 max-w-[70ch] text-xs text-mxm-content-secondary">
        Upload real tickets or conversations. The diagnosis, impact, dossier and artifact are PRODUCED from
        what you upload — not a fixed scenario. (Replaces this pool's board; <code>prototype:reset</code> restores the demo.)
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <UploadCard
          title="Upload tickets (CSV)"
          hint={<>One row per restaurant. <code>payment_status=failed</code> + <code>opened_ticket=false</code> = a silent one. <code>message</code> = what they wrote.</>}
          templateName="situation-tickets-template.csv"
          template={TICKET_TEMPLATE}
          onFile={(f) => void handleTickets(f)}
          state={tState}
        />
        <UploadCard
          title="Upload conversations (CSV)"
          hint={<>n8n chat-history export (<code>id,session_id,message,created_at</code>). Ingested into the conversation store, then diagnosed.</>}
          templateName="situation-conversations-template.csv"
          template={CONVERSATION_TEMPLATE}
          onFile={(f) => void handleConversations(f)}
          state={cState}
        />
      </div>
    </section>
  );
}
