import { describe, expect, it } from "vitest";
import source from "./UnifiedSocialUi.tsx?raw";

describe("UnifiedSocialUi technician store booking links", () => {
  it("routes user-side store technicians into the store booking page", () => {
    expect(source).toContain("buildStoreBookingRoute");
    expect(source).toContain('scope === "user" && mainStoreEntry');
    expect(source).toContain('scope === "user" && hasMainStoreEntry');
    expect(source).toContain("technicianId: profile.id");
  });
});
