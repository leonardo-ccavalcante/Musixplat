// Minimal RFC-4180 CSV parser for the Situation Room intake. Robust to the n8n chat-history export, whose
// `message` column is a quoted JSON object containing commas, colons, and "" escaped quotes. No dependency:
// a naive split(",") would shred those rows. Returns rows of raw string cells (the caller maps by header).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // an escaped quote ("")
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++; // swallow CR; the LF closes the row (CRLF)
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush the final field/row when the file does not end in a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const blank = (cells: string[]): boolean => cells.every((c) => c.trim() === "");

/** Header-keyed records (header trimmed). Fully blank lines are skipped (trailing/interstitial). */
export function csvToRecords(text: string): Record<string, string>[] {
  const grid = parseCsv(text);
  if (grid.length === 0) return [];
  const header = grid[0]!.map((h) => h.trim());
  return grid
    .slice(1)
    .filter((cells) => !blank(cells))
    .map((cells) => {
      const rec: Record<string, string> = {};
      header.forEach((key, idx) => {
        rec[key] = (cells[idx] ?? "").trim();
      });
      return rec;
    });
}
