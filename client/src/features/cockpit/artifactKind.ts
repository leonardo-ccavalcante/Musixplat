// 02:1a — display-only labels for the dispatch artifact kinds (the server decides the kind; this maps it
// to human copy). Keys mirror server/cockpit/renderArtifact.ts ARTIFACT_KIND values.
export const ARTIFACT_KIND_LABEL: Record<string, string> = {
  email_offer: "Email offer",
  price_rec: "Price recommendation",
  ops_memo: "Ops memo",
  ops_ticket: "Ops ticket",
  growth_brief: "Growth brief",
  risk_escalation: "Risk escalation",
};
