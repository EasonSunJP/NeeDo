import { describe, expect, it } from "vitest";
import type { AuthSession } from "../../auth/rbac";
import appSource from "../../App.tsx?raw";
import apiSource from "./accountComplianceApi.ts?raw";
import pageSource from "./AccountCompliancePage.tsx?raw";
import {
  getAccountComplianceRedirect,
  isAccountComplianceAllowedPath
} from "./AccountComplianceGate";
import {
  accountComplianceCopyByLanguage,
  sanitizeComplianceReturnTo
} from "./AccountCompliancePage";

const limitedSession = {
  complianceRequirements: ["phone_binding_required"],
  compliancePolicyVersionPublicId: "policy-v2"
} as AuthSession;

describe("account compliance flow", () => {
  it("redirects a limited session and preserves the requested protected route", () => {
    expect(getAccountComplianceRedirect(limitedSession, "/messages", "?tab=unread")).toBe(
      "/account-compliance?returnTo=%2Fmessages%3Ftab%3Dunread"
    );
    expect(getAccountComplianceRedirect(limitedSession, "/account-compliance")).toBeNull();
    expect(isAccountComplianceAllowedPath("/me/settings/help")).toBe(true);
  });

  it("rejects external and recursive return targets", () => {
    expect(sanitizeComplianceReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeComplianceReturnTo("//evil.example")).toBe("/");
    expect(sanitizeComplianceReturnTo("/account-compliance?returnTo=/messages")).toBe("/");
    expect(sanitizeComplianceReturnTo("/messages/42")).toBe("/messages/42");
  });

  it("ships complete five-language compliance copy", () => {
    expect(Object.keys(accountComplianceCopyByLanguage)).toEqual(["zh", "zh-Hant", "ja", "en", "ko"]);
    for (const languageCopy of Object.values(accountComplianceCopyByLanguage)) {
      expect(languageCopy.title).toBeTruthy();
      expect(languageCopy.phoneBody).toBeTruthy();
      expect(languageCopy.emailBody).toBeTruthy();
      expect(languageCopy.ekycBody).toBeTruthy();
    }
  });

  it("uses only formal server actions and never claims unavailable verification", () => {
    expect(apiSource).toContain('/auth/account-compliance/phone');
    expect(pageSource).toContain("accountComplianceApi.bindPhone");
    expect(pageSource).toContain("refreshSession(session.portal)");
    expect(pageSource).toContain("不代表已经通过短信验证");
    expect(pageSource).toContain("尚未接入可完成 eKYC 的正式服务商流程");
    expect(pageSource).toContain("MobileFullscreenHeader");
    expect(appSource).toContain("<AccountComplianceGate>");
    expect(appSource).toContain('path="/account-compliance"');
  });
});
