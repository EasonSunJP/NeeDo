import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const benefitPanel = readFileSync(new URL("./CurrentMembershipBenefits.tsx", import.meta.url), "utf8");
const benefitApi = readFileSync(new URL("./currentMembershipBenefitsApi.ts", import.meta.url), "utf8");
const supportEntry = readFileSync(new URL("../im/MembershipSupportEntry.tsx", import.meta.url), "utf8");

describe("unavailable membership benefit frontend boundary", () => {
  it("contains no delivery mutation client or synthetic destination identifier", () => {
    const source = [benefitPanel, benefitApi, supportEntry].join("\n");
    for (const forbidden of [
      "sendMessage",
      "createContact",
      "ensureDirectConversation",
      "issueCoupon",
      "targetUserId",
      "serviceUserId",
      "conversationId",
      "couponId",
      'method: "POST"',
      'method: "PATCH"'
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps unavailable support presentation outside the IM entity store", () => {
    expect(supportEntry).not.toContain("useImStore");
    expect(supportEntry).not.toContain("usersById");
    expect(supportEntry).not.toContain("conversations");
  });
});
