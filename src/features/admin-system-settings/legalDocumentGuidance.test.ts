import { describe, expect, it } from "vitest";
import {
  createDraftFromLegalTemplate,
  legalDisplayLocationOptions,
  legalDocumentTemplates,
  legalInternalRouteOptions
} from "./legalDocumentGuidance";

describe("legal document guidance", () => {
  it("offers every required policy with stable formal metadata", () => {
    expect(legalDocumentTemplates.map((template) => template.slug)).toEqual([
      "terms-of-use",
      "privacy-policy",
      "merchant-agreement",
      "affiliate-agreement",
      "technician-agreement",
      "ekyc-consent",
      "cancellation-refund-policy",
      "ndp-rules",
      "community-guidelines",
      "specified-commercial-transactions-disclosure"
    ]);
    for (const template of legalDocumentTemplates) {
      expect(template.internalPath).toMatch(/^\/(?!\/)/u);
      expect(template.displayLocations.length).toBeGreaterThan(0);
      expect(new Set(template.displayLocations).size).toBe(template.displayLocations.length);
    }
  });

  it("returns an isolated disabled create draft from a recommended template", () => {
    const first = createDraftFromLegalTemplate("ekyc-consent");
    const second = createDraftFromLegalTemplate("ekyc-consent");
    expect(first).toEqual({
      slug: "ekyc-consent",
      name: "NeeDo eKYC Consent and Identity Data Handling Notice",
      internalPath: "/me/settings/verification",
      displayLocations: ["ekyc", "merchant-application", "technician-application", "withdrawal"],
      isEnabled: false
    });
    first.displayLocations.push("settings");
    expect(second.displayLocations).not.toContain("settings");
  });

  it("only recommends known application routes and explains every display code", () => {
    const routeValues = new Set(legalInternalRouteOptions.map((option) => option.value));
    const locationValues = new Set(legalDisplayLocationOptions.map((option) => option.value));
    for (const template of legalDocumentTemplates) {
      expect(routeValues.has(template.internalPath)).toBe(true);
      for (const location of template.displayLocations) expect(locationValues.has(location)).toBe(true);
    }
  });
});
