import { describe, expect, it } from "vitest";
import {
  adminLoginQrTokens,
  buildAdminLoginScanRedirect,
  getAdminLoginPortalScope,
  parseAdminLoginQrToken
} from "./adminLogin";

describe("admin login portal routing", () => {
  it("maps the NDA backend login portal to the Afirieito business scope", () => {
    expect(getAdminLoginPortalScope("afirieito-admin")).toBe("business");
  });

  it("recognizes NDA backend QR and legacy scan links", () => {
    expect(parseAdminLoginQrToken(adminLoginQrTokens["afirieito-admin"])).toBe("afirieito-admin");
    expect(parseAdminLoginQrToken("needo://admin-login/afirieito-admin")).toBe("afirieito-admin");
    expect(parseAdminLoginQrToken("/login/NDA-admin?scan=approved")).toBe("afirieito-admin");
  });

  it("builds scan redirects for the NDA backend login page", () => {
    expect(buildAdminLoginScanRedirect("needo://admin-login/afirieito-admin", "/NDA-admin")).toBe(
      `/login/afirieito-admin?scan=approved&qr=${encodeURIComponent(adminLoginQrTokens["afirieito-admin"])}&redirect=%2FNDA-admin`
    );
  });
});
