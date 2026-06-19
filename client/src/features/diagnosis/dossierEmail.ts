import type { DiagnosisListRow } from "@shared/contracts_05b";
import { memoText, type DossierData } from "./dossierMemo";

// A designed, on-brand HTML email (Musixmatch /Design: dark canvas, coral accent, system sans). Inline
// styles + a CSS bar visual of the cascade (silent vs spoke-up) and the R$ hero — no external image assets.
// Opened as a preview (what a real provider would send); the toolbar's Send uses a plain-text mailto today.
// No em-dashes (AI tell). Numbers come from the dossier; nothing invented.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const money = (v: unknown): string =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "n/a";

export function emailHtml(row: DiagnosisListRow, d: DossierData, today: string, appUrl: string): string {
  const f = d.fields ?? {};
  const how = isObj(f.f5_how_much) ? f.f5_how_much : {};
  const revenue = typeof how.revenue_lost === "number" ? how.revenue_lost : row.revenue_lost;
  const proactive = row.origin === "proactive";
  const affected = row.affected || 1;
  const silentPct = Math.max(4, Math.min(96, Math.round((row.silent / affected) * 100)));
  const spoke = Math.max(0, row.affected - row.silent);
  const headline = proactive
    ? "A silent payment problem, caught before a ticket"
    : "One ticket, a much bigger problem underneath";

  // brand tokens (mirror client/src/index.css): bg #131313 · card #1f1f1f · coral #fc532e · grey #757575/#bdbdbd/#9e9e9e
  return `<div style="margin:0;background:#0d0d0d;padding:24px 12px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#131313;border:1px solid #343434;border-radius:14px;overflow:hidden;">
    <div style="height:4px;background:#fc532e;"></div>
    <div style="padding:22px 28px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9e9e9e;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:#fc532e;vertical-align:middle;margin-right:7px;"></span>Musixmatch · Customer-Ops
      </div>
      <h1 style="margin:14px 0 4px;font-size:23px;font-weight:800;letter-spacing:-.3px;line-height:1.15;color:#ffffff;">${headline}</h1>
      <p style="margin:0;font-size:13px;color:#9e9e9e;">${row.restaurant_id} · ${proactive ? "proactive" : "reactive"} · ${today}</p>
    </div>

    <div style="padding:4px 28px 8px;">
      <div style="display:flex;gap:26px;flex-wrap:wrap;">
        <div><div style="font-size:34px;font-weight:800;line-height:1;color:#ffffff;">${row.affected}</div><div style="font-size:12px;color:#9e9e9e;margin-top:4px;">affected</div></div>
        <div><div style="font-size:34px;font-weight:800;line-height:1;color:#fc532e;">${row.silent}</div><div style="font-size:12px;color:#9e9e9e;margin-top:4px;">silent, never spoke</div></div>
        <div><div style="font-size:34px;font-weight:800;line-height:1;color:#ffffff;">R$ ${money(revenue)}</div><div style="font-size:12px;color:#9e9e9e;margin-top:4px;">at risk</div></div>
      </div>
      <div style="margin:18px 0 6px;height:14px;border-radius:9999px;background:#343434;overflow:hidden;display:flex;">
        <div style="width:${silentPct}%;background:#fc532e;"></div>
        <div style="flex:1;background:#757575;"></div>
      </div>
      <div style="font-size:11px;color:#9e9e9e;">
        <span style="color:#fc532e;">&#9632;</span> ${row.silent} silent &nbsp;&nbsp; <span style="color:#bdbdbd;">&#9632;</span> ${spoke} spoke up
      </div>
    </div>

    <div style="padding:18px 28px 6px;">
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#bdbdbd;">
        ${proactive
          ? `The payments monitor flagged a non-payment at ${row.restaurant_id} before anyone opened a ticket. Zooming out across the pool, ${row.affected} restaurants are hit and ${row.silent} never said a word.`
          : `${row.restaurant_id} opened a billing ticket. Zooming out, the same failure hits ${row.affected} restaurants and ${row.silent} of them never said a word.`}
      </p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#bdbdbd;">
        Recommended route: <strong style="color:#ffffff;">${row.suggested_route ?? "review"}</strong>. The full handoff dossier (root, evidence, impact, precedent, provenance) is one click away.
      </p>
      <a href="${appUrl}" style="display:inline-block;background:#fc532e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">Open the full dossier</a>
    </div>

    <div style="padding:18px 28px 24px;margin-top:10px;border-top:1px solid #343434;font-size:11px;color:#828282;">
      Confidential internal support diagnosis. Numbers produced by deterministic queries. [V] from raw data, [I] derived, [C] estimate.
    </div>
  </div>
</div>`;
}

/** Open the designed email as a preview (what a provider would send) with a Send action (mailto today). */
export function openEmailPreview(row: DiagnosisListRow, d: DossierData, today: string): void {
  const w = window.open("", "_blank", "width=680,height=900");
  if (!w) return;
  const appUrl = `${window.location.origin}/diagnosis`;
  const subject = `Support dossier: ${row.restaurant_id} (${row.affected} affected / ${row.silent} silent)`;
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(memoText(row, d, today))}`;
  // a thin toolbar (not part of the email) lets Leo dispatch via his mail client (plain-text body today).
  const toolbar = `<div style="position:sticky;top:0;background:#1f1f1f;border-bottom:1px solid #343434;padding:10px 16px;display:flex;gap:10px;align-items:center;font-family:ui-sans-serif,system-ui,sans-serif;">
    <span style="font-size:12px;color:#9e9e9e;flex:1;">Email preview · brand HTML (a provider would send this); Send uses your mail client</span>
    <a href="${mailto}" style="background:#fc532e;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;">Send via mail client</a>
  </div>`;
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
     <style>html{color-scheme:dark;}body{margin:0;background:#0d0d0d;}</style></head>
     <body>${toolbar}${emailHtml(row, d, today, appUrl)}</body></html>`,
  );
  w.document.close();
}
