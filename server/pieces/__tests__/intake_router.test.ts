import { describe, it, expect } from "vitest";
import { routeIntake } from "../intake_router.js";

describe("routeIntake — 05A:A.1.3 (deterministic has-image branch, fail-closed)", () => {
  it("(a) mime image/png ⇒ route A.1.4, hasImage true", () => {
    const result = routeIntake({ adjuntos: [{ mime: "image/png" }] });
    expect(result).toEqual({ route: "A.1.4", hasImage: true });
  });

  it("(b) mime image/jpeg ⇒ route A.1.4, hasImage true", () => {
    const result = routeIntake({ adjuntos: [{ mime: "image/jpeg" }] });
    expect(result).toEqual({ route: "A.1.4", hasImage: true });
  });

  it("(c) kind 'image' ⇒ route A.1.4, hasImage true", () => {
    const result = routeIntake({ adjuntos: [{ kind: "image" }] });
    expect(result).toEqual({ route: "A.1.4", hasImage: true });
  });

  it("(d) kind 'imagen' (ES variant) ⇒ route A.1.4, hasImage true", () => {
    const result = routeIntake({ adjuntos: [{ kind: "imagen" }] });
    expect(result).toEqual({ route: "A.1.4", hasImage: true });
  });

  it("(e) no adjuntos field ⇒ route A.1.5, hasImage false", () => {
    const result = routeIntake({});
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(f) empty adjuntos array ⇒ route A.1.5, hasImage false", () => {
    const result = routeIntake({ adjuntos: [] });
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(g) null turno ⇒ fail-closed: route A.1.5, hasImage false", () => {
    const result = routeIntake(null);
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(h) undefined turno ⇒ fail-closed: route A.1.5, hasImage false", () => {
    const result = routeIntake(undefined);
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(i) non-image attachment (mime application/pdf) ⇒ route A.1.5, hasImage false", () => {
    const result = routeIntake({ adjuntos: [{ mime: "application/pdf" }] });
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(j) non-image attachment (kind 'document') ⇒ route A.1.5, hasImage false", () => {
    const result = routeIntake({ adjuntos: [{ kind: "document" }] });
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(k) mixed attachments with one image ⇒ route A.1.4, hasImage true", () => {
    const result = routeIntake({
      adjuntos: [{ mime: "application/pdf" }, { mime: "image/webp" }],
    });
    expect(result).toEqual({ route: "A.1.4", hasImage: true });
  });

  it("(l) attachment with neither kind nor mime ⇒ route A.1.5, hasImage false", () => {
    const result = routeIntake({ adjuntos: [{}] });
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });

  it("(m) determinism: f(x) === f(x) for image input", () => {
    const turno = { adjuntos: [{ mime: "image/gif" }] };
    expect(routeIntake(turno)).toEqual(routeIntake(turno));
  });

  it("(n) determinism: f(x) === f(x) for non-image input", () => {
    const turno = { adjuntos: [{ mime: "text/plain" }] };
    expect(routeIntake(turno)).toEqual(routeIntake(turno));
  });

  it("(o) adjuntos item with kind undefined, mime undefined ⇒ route A.1.5", () => {
    const result = routeIntake({ adjuntos: [{ kind: undefined, mime: undefined }] });
    expect(result).toEqual({ route: "A.1.5", hasImage: false });
  });
});
