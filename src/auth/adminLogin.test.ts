import { describe, expect, it } from "vitest";
import {
  buildAdminLoginScanRedirect,
  getAdminLoginPortalScope
} from "./adminLogin";

describe("admin login portal routing", () => {
  it("maps the NDA backend login portal to the Afirieito business scope", () => {
    expect(getAdminLoginPortalScope("afirieito-admin")).toBe("business");
  });

  it("does not accept a client-generated backend login approval", () => {
    expect(buildAdminLoginScanRedirect("needo://admin-login/afirieito-admin", "/NDA-admin")).toBeNull();
    expect(buildAdminLoginScanRedirect("/login/NDA-admin?scan=approved", "/NDA-admin")).toBeNull();
  });
});
