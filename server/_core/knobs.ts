import { query } from "../db/pool.js";

// Read a Config_Knobs threshold BY NAME (§3.8). knob_required_num is fail-closed in SQL (RAISES if the
// knob is missing), so a typo or an unseeded knob surfaces immediately instead of silently defaulting.
export async function knobNum(key: string): Promise<number> {
  const r = await query<{ v: number }>(`select catalog.knob_required_num($1) as v`, [key]);
  return Number(r[0]!.v);
}
