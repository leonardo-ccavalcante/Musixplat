import type { DiagnosisListRow } from "@shared/contracts_05b";

// Builds the handoff dossier as an Amazon-style narrative memo (problem-solving structure: Situation →
// Problem → Structure → Evidence → Root hypothesis → Impact → Precedent → Recommendation → Limits).
// Terse prose, no bullet-slop. Rendered as a print-ready HTML doc (Save as PDF) and as plain text (mailto).
// Every number comes from the dossier the producers computed — the memo never invents one.

export interface DossierData {
  emitted: boolean;
  gaps: string[];
  fields: Record<string, unknown> | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown, dash = "—"): string => (v == null || v === "" ? dash : String(v));
const money = (v: unknown): string =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

interface MemoModel {
  title: string;
  meta: string;
  sections: { h: string; p: string }[];
}

function model(row: DiagnosisListRow, d: DossierData, today: string): MemoModel {
  const f = d.fields ?? {};
  const who = Array.isArray(f.f3_who) ? f.f3_who : [];
  const silent = who.filter((a) => isObj(a) && a.silent).length || row.silent;
  const affected = who.length || row.affected;
  const tree = isObj(f.f2_evidence) && Array.isArray(f.f2_evidence.paths) ? f.f2_evidence.paths : [];
  const conc = isObj(f.f4_where_concentrated) ? f.f4_where_concentrated : null;
  const how = isObj(f.f5_how_much) ? f.f5_how_much : {};
  const f1 = isObj(f.f1_tipo_raiz) ? f.f1_tipo_raiz : {};
  const prov = isObj(f.f11_provenance) ? f.f11_provenance : {};
  const similar = Array.isArray(f.f7_similar_cases) ? f.f7_similar_cases : [];
  const proactive = row.origin === "proactive";

  const treeLine = tree.length
    ? tree
        .map((p) => (isObj(p) ? `${s(p.hypothesis)} (p≈${s(p.probability)})` : ""))
        .filter(Boolean)
        .join("; ")
    : "no ranked paths";
  const provLine =
    Object.entries(prov)
      .map(([k, v]) => `${k} ${s(v)}`)
      .join(", ") || "—";

  return {
    title: "Support Diagnosis — Handoff Dossier #8",
    meta: `${row.restaurant_id} · ${proactive ? "proactive (caught before a ticket)" : "reactive (from a ticket)"} · ${today}`,
    sections: [
      {
        h: "Situation",
        p: proactive
          ? `The payments monitor flagged a non-payment at ${row.restaurant_id} before anyone opened a ticket.`
          : `${row.restaurant_id} opened a billing ticket about a payment that did not arrive.`,
      },
      {
        h: "Problem",
        p: `Zooming out across the pool, ${affected} restaurants have a failed payment in the window; ${silent} of them never opened a ticket — the silent ones a reactive queue never sees. Exposure is R$ ${money(how.revenue_lost)}.`,
      },
      { h: "Structure (issue tree)", p: `Hypotheses, most-likely first: ${treeLine}.` },
      {
        h: "Evidence",
        p: `The silent-hunt anti-join (failed Orders minus complainants) returns ${affected} affected and ${silent} silent. ${
          conc ? `Concentration: ${s(conc.dim)} = ${s(conc.value)} (${s(conc.n)} cases).` : "No single concentration cut."
        }`,
      },
      {
        h: "Root hypothesis",
        p: `${s(f1.hypothesis_root)} — confidence ${s(f1.confidence)} [C], grounded against ${similar.length} prior case(s).`,
      },
      {
        h: "Impact",
        p: `R$ ${money(how.revenue_lost)} at risk [I]. Churn is not measured this run (no pre-churn producer), so the figure is a floor, not a ceiling — the dossier says so rather than inventing it.`,
      },
      {
        h: "Recommendation",
        p: `Route: ${s(row.suggested_route)}. ${
          proactive
            ? "Resolve proactively; a communication policy decides notify vs. fix-silently — internals are never exposed to the client."
            : "Resolve and confirm with the customer who reported it; the silent ones are corrected in the same pass."
        }`,
      },
      {
        h: "Provenance & limits",
        p: `Per field: ${provLine}. The dossier is ${
          d.emitted ? "complete (11/11) and cleared for handoff" : `partial — gaps: ${d.gaps.join(", ")}; fail-closed, it is not handed off until complete`
        }.`,
      },
    ],
  };
}

export function memoText(row: DiagnosisListRow, d: DossierData, today: string): string {
  const m = model(row, d, today);
  return [
    m.title.toUpperCase(),
    m.meta,
    "",
    ...m.sections.flatMap((sec) => [sec.h.toUpperCase(), sec.p, ""]),
  ].join("\n");
}

export function memoHtml(row: DiagnosisListRow, d: DossierData, today: string): string {
  const m = model(row, d, today);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = m.sections
    .map((sec) => `<section><h2>${esc(sec.h)}</h2><p>${esc(sec.p)}</p></section>`)
    .join("\n");
  // Awarded-memo print aesthetic: serif, justified with hyphenation, generous measure + rhythm.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>
  @page { margin: 24mm 22mm; }
  html { -webkit-print-color-adjust: exact; }
  body { font: 16px/1.6 Georgia, "Times New Roman", serif; color: #111; max-width: 7.2in; margin: 0 auto; padding: 8mm 0;
         text-align: justify; text-justify: inter-word; hyphens: auto; }
  header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 22px; text-align: left; }
  h1 { font-size: 21px; letter-spacing: .2px; margin: 0 0 4px; text-align: left; }
  .meta { font-size: 12.5px; color: #555; text-transform: none; text-align: left; }
  section { margin: 0 0 16px; }
  h2 { font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; color: #333; margin: 0 0 5px; text-align: left; }
  p { margin: 0; text-wrap: pretty; }
  footer { margin-top: 26px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #888; text-align: left; }
</style></head><body>
<header><h1>${esc(m.title)}</h1><div class="meta">${esc(m.meta)}</div></header>
${body}
<footer>Confidential — internal support diagnosis. Numbers produced by deterministic queries; [V] from raw data · [I] derived · [C] estimate.</footer>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}

/** Open the memo in a print window (Save as PDF — zero-dependency, high typographic fidelity). */
export function printDossierMemo(row: DiagnosisListRow, d: DossierData, today: string): void {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return; // popup blocked — caller may fall back to download/mailto
  w.document.write(memoHtml(row, d, today));
  w.document.close();
}

/** mailto: URL with the memo as the body (the working email path today; the server send is a stub). */
export function mailtoDossier(row: DiagnosisListRow, d: DossierData, today: string, to = ""): string {
  const subject = `Support dossier — ${row.restaurant_id} (${row.affected} affected / ${row.silent} silent)`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(memoText(row, d, today))}`;
}
