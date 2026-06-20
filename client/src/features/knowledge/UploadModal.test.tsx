import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadModal } from "./UploadModal";
import type { UploadInput, UploadResult } from "@shared/contracts_knowledge";

// P06 — upload then the AI PROPOSES a type ([I]); the human confirms/overrides it ([V]) before it
// counts. parse_failed surfaces the reason — never a silent success (§3.7). The modal reuses the WCAG
// primitive (aria-modal + focus-trap + Esc + focus-return).
function file(name: string, type: string, body = "hello"): File {
  return new File([body], name, { type });
}

describe("P06 UploadModal", () => {
  it("closed ⇒ no dialog", () => {
    render(<UploadModal open={false} onClose={() => {}} onUpload={vi.fn()} onConfirm={vi.fn()} onDone={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("open ⇒ aria-modal dialog with a file input accepting the 4 formats", () => {
    render(<UploadModal open onClose={() => {}} onUpload={vi.fn()} onConfirm={vi.fn()} onDone={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    const input = screen.getByLabelText(/file/i) as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.md,.markdown,.txt");
  });

  it("selecting a file calls onUpload with base64 + mime, then shows the AI-proposed type", async () => {
    const onUpload = vi.fn(
      async (_input: UploadInput): Promise<UploadResult> => ({
        docId: "d1",
        proposedType: "Policy",
        confidence: 0.9,
        status: "proposed",
        reason: null,
      }),
    );
    render(<UploadModal open onClose={() => {}} onUpload={onUpload} onConfirm={vi.fn()} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [file("p.md", "text/markdown")] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const arg = onUpload.mock.calls[0]![0] as { filename: string; mime: string; contentBase64: string };
    expect(arg.filename).toBe("p.md");
    expect(arg.contentBase64.length).toBeGreaterThan(0);
    // confirm step: a select defaulting to the proposed type + a Confirm button
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("Policy");
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("Confirm calls onConfirm with the (possibly overridden) docType, then onDone", async () => {
    const onUpload = vi.fn(
      async (_input: UploadInput): Promise<UploadResult> => ({
        docId: "d1",
        proposedType: "Policy",
        confidence: 0.9,
        status: "proposed",
        reason: null,
      }),
    );
    const onConfirm = vi.fn(async () => {});
    const onDone = vi.fn();
    render(<UploadModal open onClose={() => {}} onUpload={onUpload} onConfirm={onConfirm} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [file("p.md", "text/markdown")] } });

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Terms" } }); // human overrides the AI proposal
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ docId: "d1", docType: "Terms" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("parse_failed ⇒ shows the reason and NO confirm step (no silent success, §3.7)", async () => {
    const onUpload = vi.fn(
      async (_input: UploadInput): Promise<UploadResult> => ({
        docId: "d2",
        proposedType: "Other",
        confidence: 0,
        status: "parse_failed",
        reason: "unsupported file type",
      }),
    );
    render(<UploadModal open onClose={() => {}} onUpload={onUpload} onConfirm={vi.fn()} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [file("x.bin", "application/octet-stream")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/unsupported file type/i);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("index_failed ⇒ retryable reason + a Try again button that re-uploads the SAME file", async () => {
    // First attempt fails to index (e.g. AI rate-limit); nothing stored. "Try again" re-runs the same
    // file and the second attempt succeeds → the confirm step appears (the operator's retry-without-lixo).
    let n = 0;
    const results: UploadResult[] = [
      {
        docId: null,
        proposedType: "Other",
        confidence: 0,
        status: "index_failed",
        reason: "the AI service is rate-limiting right now",
      },
      { docId: "d3", proposedType: "Policy", confidence: 0.8, status: "proposed", reason: null },
    ];
    const onUpload = vi.fn(async (_input: UploadInput): Promise<UploadResult> => results[Math.min(n++, 1)]!);
    render(<UploadModal open onClose={() => {}} onUpload={onUpload} onConfirm={vi.fn()} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [file("p.md", "text/markdown")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate-limiting/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    const first = onUpload.mock.calls[0]![0] as UploadInput;
    const second = onUpload.mock.calls[1]![0] as UploadInput;
    expect(second.filename).toBe(first.filename); // re-uploaded the SAME file
    expect(await screen.findByRole("combobox")).toBeInTheDocument(); // retry succeeded ⇒ confirm step
  });
});
