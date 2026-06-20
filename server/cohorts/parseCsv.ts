import Papa from "papaparse";
import { TRPCError } from "@trpc/server";
import { CSV_COLUMNS, REST_KEYS, csvRowSchema, type CsvRow } from "./csvSchema.js";

function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export function parseCsv(text: string): CsvRow[] {
  const out = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const headers = out.meta.fields ?? [];
  const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) bad(`CSV missing required column(s): ${missing.join(", ")}`);
  if (!out.data.length) bad("CSV has no data rows");

  const rows: CsvRow[] = [];
  out.data.forEach((raw, i) => {
    const line = i + 2;
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      bad(`row ${line}, column "${issue.path.join(".")}": ${issue.message}`);
    }
    rows.push(parsed.data);
  });

  const seen = new Map<string, { line: number; row: CsvRow }>();
  rows.forEach((row, i) => {
    const line = i + 2;
    const prev = seen.get(row.restaurant_id);
    if (!prev) { seen.set(row.restaurant_id, { line, row }); return; }
    for (const k of REST_KEYS) {
      if (String(prev.row[k]) !== String(row[k])) {
        bad(`restaurant_id "${row.restaurant_id}" has conflicting "${k}" between row ${prev.line} and row ${line}`);
      }
    }
  });
  return rows;
}
