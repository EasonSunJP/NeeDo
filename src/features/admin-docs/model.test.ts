import { describe, expect, it } from "vitest";
import {
  apiDocItems,
  defaultApiDocVisibility,
  getVisibleApiDocItems,
  normalizeApiDocItems,
  normalizeApiDocVisibility,
  operationDocSections
} from "./model";

describe("admin docs model", () => {
  it("keeps operation docs shared across all admin surfaces", () => {
    expect(operationDocSections.length).toBeGreaterThan(0);
    expect(operationDocSections.every((section) => section.steps.length > 0 && section.checks.length > 0)).toBe(true);
  });

  it("always exposes all API docs to ops admin", () => {
    expect(getVisibleApiDocItems("ops", defaultApiDocVisibility)).toHaveLength(apiDocItems.length);
  });

  it("filters merchant and afirieito API docs by ops visibility settings", () => {
    const hidden = normalizeApiDocVisibility({
      "merchant-store": { merchant: false, afirieito: false },
      "afirieito-links": { merchant: false, afirieito: true }
    });

    expect(getVisibleApiDocItems("merchant", hidden).some((item) => item.id === "merchant-store")).toBe(false);
    expect(getVisibleApiDocItems("afirieito", hidden).some((item) => item.id === "afirieito-links")).toBe(true);
  });

  it("normalizes edited API docs while preserving stable API category ids", () => {
    const edited = normalizeApiDocItems([
      {
        id: "platform-bootstrap",
        title: "Edited platform API",
        group: "Edited group",
        summary: "Edited summary",
        methods: [{ method: "POST", path: "/api/edited", purpose: "Edited purpose" }],
        auth: "Edited auth",
        fields: ["editedField"]
      }
    ]);

    expect(edited).toHaveLength(apiDocItems.length);
    expect(edited[0]).toMatchObject({
      id: "platform-bootstrap",
      title: "Edited platform API",
      methods: [{ method: "POST", path: "/api/edited", purpose: "Edited purpose" }]
    });
  });
});
