// Split a cohort CSV (order-grain: one restaurant spread across many rows) into batches small enough
// to upload in a single fast request. A 100k-row file in ONE request takes ~20s+ on the server and
// trips the deploy gateway's request timeout (the client then sees a non-JSON proxy body →
// "Unable to transform response from server"). Uploading in batches keeps each request small and fast.
//
// INVARIANT: never split a restaurant across batches. The server dedups restaurants and synthesizes
// one Weekly_Connection set per restaurant per call; a restaurant whole in exactly one batch keeps
// that — and makes the per-batch {restaurants, orders} counts sum correctly (no double-count).
export function chunkCsvByRestaurant(text: string, maxRowsPerChunk: number): string[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = lines[0];
  if (!header) return [];
  const ridIdx = header.split(",").findIndex((h) => h.trim() === "restaurant_id");
  // Missing column → don't mangle; hand the whole file to the server so it rejects with the real error.
  if (ridIdx < 0) return [text];

  const dataLines = lines.slice(1).filter((l) => l.length > 0);
  // Group rows by restaurant, preserving first-seen order (stable, deterministic batches).
  const groups = new Map<string, string[]>();
  for (const line of dataLines) {
    const rid = line.split(",")[ridIdx]?.trim() ?? "";
    const g = groups.get(rid);
    if (g) g.push(line);
    else groups.set(rid, [line]);
  }

  const chunks: string[] = [];
  let cur: string[] = [];
  for (const rows of groups.values()) {
    // Flush before adding when this restaurant would overflow — but a single restaurant always stays
    // whole (if it alone exceeds the cap, it becomes its own oversized batch).
    if (cur.length > 0 && cur.length + rows.length > maxRowsPerChunk) {
      chunks.push([header, ...cur].join("\n"));
      cur = [];
    }
    cur.push(...rows);
  }
  if (cur.length > 0) chunks.push([header, ...cur].join("\n"));
  return chunks;
}
