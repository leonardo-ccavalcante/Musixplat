// 1:10 / health read surface (05DE vitrina). All numbers are PRODUCED by their owners; the UI only reads.
export interface HealthSummary {
  ratio: number | null; // team-equivalent capacity, capped at the explicit baseline team size
  unitsPerTouch: number | null; // separate throughput signal; never mislabeled as headcount leverage
  freshness: string | null;
  seal: "no_signal" | "provisional" | "confirmed"; // efficiency = provisional; 2-gate business impact = confirmed
  units: number; // distinct affected restaurants the AI processed
  ticketsPerDay: number | null;
  relationshipsCovered: number;
  slaHours: number | null;
  escalationRate: number | null;
  projectedHumanMinutes: number | null;
  baselineTeamSize: number | null;
  escalations: number; // problems that fell to a human (needs_human / blocked)
  dossiers: number; // explicitly emitted complete dossiers
  artifacts: number;
  reviews: number; // artifact decisions = human review touches
  humanMinutes: number; // touches × AHT knob
  ahtMinutes: number;
}
