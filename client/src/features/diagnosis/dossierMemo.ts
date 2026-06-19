import type { DiagnosisListRow } from "@shared/contracts_05b";

// The handoff dossier as an Amazon-style narrative memo (problem-solving structure: Situation, Problem,
// Structure, Evidence, Root hypothesis, Impact, Recommendation, Limits). Terse prose, no bullet-slop and
// NO em-dashes (an AI tell — Leo). Rendered on-brand (Musixmatch dark + coral, /Design) as a print-ready
// HTML doc (Save as PDF) and as plain text (mailto). Every number comes from the producers' dossier.

export interface DossierData {
  emitted: boolean;
  gaps: string[];
  fields: Record<string, unknown> | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown, dash = "n/a"): string => (v == null || v === "" ? dash : String(v));
const money = (v: unknown): string =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "n/a";

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
    ? tree.map((p) => (isObj(p) ? `${s(p.hypothesis)} (p≈${s(p.probability)})` : "")).filter(Boolean).join("; ")
    : "no ranked paths";
  const provLine = Object.entries(prov).map(([k, v]) => `${k} ${s(v)}`).join(", ") || "n/a";

  return {
    title: "Support Diagnosis: Handoff Dossier #8",
    meta: `${row.restaurant_id} · ${proactive ? "proactive, caught before a ticket" : "reactive, from a ticket"} · ${today}`,
    sections: [
      {
        h: "Situation",
        p: proactive
          ? `The payments monitor flagged a non-payment at ${row.restaurant_id} before anyone opened a ticket.`
          : `${row.restaurant_id} opened a billing ticket about a payment that did not arrive.`,
      },
      {
        h: "Problem",
        p: `Zooming out across the pool, ${affected} restaurants have a failed payment in the window. Of those, ${silent} never opened a ticket. They are the silent ones a reactive queue never sees. Exposure is R$ ${money(how.revenue_lost)}.`,
      },
      { h: "Structure (issue tree)", p: `Hypotheses, most likely first: ${treeLine}.` },
      {
        h: "Evidence",
        p: `The silent-hunt anti-join (failed Orders minus complainants) returns ${affected} affected and ${silent} silent. ${
          conc ? `Concentration: ${s(conc.dim)} = ${s(conc.value)} (${s(conc.n)} cases).` : "No single concentration cut."
        }`,
      },
      {
        h: "Root hypothesis",
        p: `${s(f1.hypothesis_root)}. Confidence ${s(f1.confidence)} [C], grounded against ${similar.length} prior case(s).`,
      },
      {
        h: "Impact",
        p: `R$ ${money(how.revenue_lost)} at risk [I]. Churn is not measured this run (no pre-churn producer), so the figure is a floor, not a ceiling. The dossier says so rather than inventing it.`,
      },
      {
        h: "Recommendation",
        p: `Route: ${s(row.suggested_route)}. ${
          proactive
            ? "Resolve proactively. A communication policy decides notify vs. fix-silently, never exposing internals to the client."
            : "Resolve and confirm with the customer who reported it. The silent ones are corrected in the same pass."
        }`,
      },
      {
        h: "Provenance and limits",
        p: `Per field: ${provLine}. The dossier is ${
          d.emitted ? "complete (11/11) and cleared for handoff." : `partial. Gaps: ${d.gaps.join(", ")}. Fail-closed, it is not handed off until complete.`
        }`,
      },
    ],
  };
}

export function memoText(row: DiagnosisListRow, d: DossierData, today: string): string {
  const m = model(row, d, today);
  return [m.title.toUpperCase(), m.meta, "", ...m.sections.flatMap((sec) => [sec.h.toUpperCase(), sec.p, ""])].join("\n");
}

export function memoHtml(row: DiagnosisListRow, d: DossierData, today: string): string {
  const m = model(row, d, today);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = m.sections.map((sec) => `<section><h2>${esc(sec.h)}</h2><p>${esc(sec.p)}</p></section>`).join("\n");
  // On-brand (Musixmatch /Design): dark canvas, coral accents, system sans, sentence-case headings,
  // ALL-CAPS section labels. print-color-adjust keeps the dark surface in the PDF.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>
  @page { margin: 16mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 15px/1.62 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #131313; color: #ffffff; max-width: 7.3in; margin: 0 auto; padding: 10mm;
         text-align: justify; text-justify: inter-word; hyphens: auto; }
  .brand { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 2px;
           text-transform: uppercase; color: #9e9e9e; }
  .dot { width: 9px; height: 9px; border-radius: 9999px; background: #fc532e; }
  header { border-bottom: 1px solid #343434; padding-bottom: 16px; margin-bottom: 26px; text-align: left; }
  h1 { font-size: 25px; font-weight: 800; letter-spacing: -.3px; line-height: 1.12; color: #fff;
       margin: 14px 0 6px; text-align: left; text-wrap: balance; }
  .meta { font-size: 12.5px; color: #9e9e9e; text-align: left; }
  section { margin: 0 0 17px; }
  h2 { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #fc532e;
       margin: 0 0 5px; text-align: left; }
  p { margin: 0; color: #bdbdbd; text-wrap: pretty; }
  footer { margin-top: 28px; border-top: 1px solid #343434; padding-top: 10px; font-size: 10.5px; color: #828282; text-align: left; }
</style></head><body>
<header>
  <div class="brand"><span class="dot"></span>Musixmatch · Customer-Ops</div>
  <h1>${esc(m.title)}</h1>
  <div class="meta">${esc(m.meta)}</div>
</header>
${body}
<footer>Confidential internal support diagnosis. Numbers produced by deterministic queries. [V] from raw data · [I] derived · [C] estimate.</footer>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}

/** Open the memo in a print window (Save as PDF: zero-dependency, on-brand, high fidelity). */
export function printDossierMemo(row: DiagnosisListRow, d: DossierData, today: string): void {
  const w = window.open("", "_blank", "width=860,height=1040");
  if (!w) return;
  w.document.write(memoHtml(row, d, today));
  w.document.close();
}

/** mailto: URL with the plain-text memo as the body (the dispatch path; the server send is a stub). */
export function mailtoDossier(row: DiagnosisListRow, d: DossierData, today: string, to = ""): string {
  const subject = `Support dossier: ${row.restaurant_id} (${row.affected} affected / ${row.silent} silent)`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(memoText(row, d, today))}`;
}
