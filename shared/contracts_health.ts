// 1:10 / health read surface (05DE vitrina). All numbers are PRODUCED by their owners; the UI only reads.
export interface HealthSummary {
  ratio: number | null; // operator leverage = units / human-touches (DERIVED; NULL until a human touches)
  freshness: string | null;
  seal: "no_signal" | "provisional" | "confirmed"; // efficiency = provisional; 2-gate business impact = confirmed
  units: number; // distinct affected restaurants the AI processed
  escalations: number; // problems that fell to a human (needs_human / blocked)
  dossiers: number;
  artifacts: number;
  reviews: number; // artifact decisions = human review touches
  humanMinutes: number; // touches × AHT knob
  ahtMinutes: number;
}
