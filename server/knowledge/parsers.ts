// P06 — raw text extraction from uploaded files (PDF / MD / TXT).
// Fail-closed: unsupported or empty files return { ok: false } — never a fake success (§3.7).

export type ParseResult = { ok: true; text: string } | { ok: false; reason: string };

const TEXT_MIMES = new Set(["text/markdown", "text/plain", "text/x-markdown"]);

export async function extractText(
  bytes: Buffer,
  mime: string,
  filename: string,
): Promise<ParseResult> {
  try {
    if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      // unpdf v1.x: extractText accepts raw data directly; { mergePages: true } → text: string.
      const { extractText: pdfExtract } = await import("unpdf");
      const { text } = await pdfExtract(new Uint8Array(bytes), { mergePages: true });
      if (!text.trim()) return { ok: false, reason: "empty_pdf" };
      return { ok: true, text };
    }
    if (TEXT_MIMES.has(mime) || /\.(md|markdown|txt)$/i.test(filename)) {
      const text = bytes.toString("utf-8");
      if (!text.trim()) return { ok: false, reason: "empty_text" };
      return { ok: true, text };
    }
    return { ok: false, reason: `unsupported_mime:${mime}` };
  } catch (e) {
    return { ok: false, reason: `parse_error:${(e as Error).message}` };
  }
}
