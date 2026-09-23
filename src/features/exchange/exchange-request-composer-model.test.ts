import { describe, expect, it } from "vitest";
import { applyRequestDraftPatch, normalizeRequestDraft, type RequestComposerDraft } from "./exchange-composer-model";
import type { ExchangeRequestPublicationContext } from "./types";

const draft: RequestComposerDraft = {
  contentLocale: "zh-CN",
  title: "上门服务",
  detail: "请提前联系",
  serviceStartDate: "2026-09-23",
  serviceStartTime: "10:00",
  serviceEndDate: "2026-09-23",
  serviceEndTime: "11:00",
  expiresDate: "2026-09-23",
  expiresTime: "09:30",
  targetProviderCount: "1",
  serviceMode: "home",
  matchMode: "quick",
  budgetMode: "total",
  budgetMinJpy: "",
  budgetMaxJpy: "10000",
  addressLine1: "东京都",
  addressLine2: "",
  addressLine3: "",
  addressLine2Public: false,
  addressLine3Public: false,
  publisherIdentityPublic: false
};

const context = {
  canPublish: true,
  capacitySource: "customer_membership" as const,
  membershipLevel: "gold",
  maxTargetProviderCount: 3,
  publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
} satisfies ExchangeRequestPublicationContext;

describe("Request composer application deadline", () => {
  it("accepts a half-hour application deadline strictly before service starts", () => {
    expect(normalizeRequestDraft(draft, context)).toEqual({ ok: true, value: expect.objectContaining({ expiresAt: expect.any(String) }) });
    for (const expiresTime of ["10:00", "10:30", "11:30", "09:45"]) {
      expect(normalizeRequestDraft({ ...draft, expiresTime }, context)).toEqual({ ok: false, errorKey: "invalidRequestWindow" });
    }
  });

  it("defaults the application deadline to thirty minutes before service starts", () => {
    const emptyDeadline = { ...draft, expiresDate: "", expiresTime: "" };
    expect(applyRequestDraftPatch(emptyDeadline, { serviceStartTime: "10:00" })).toMatchObject({
      expiresDate: "2026-09-23",
      expiresTime: "09:30"
    });
    expect(applyRequestDraftPatch({ ...emptyDeadline, serviceStartTime: "00:00" }, { serviceStartDate: "2026-09-24" })).toMatchObject({
      expiresDate: "2026-09-23",
      expiresTime: "23:30"
    });
  });

  it("updates only an unchanged automatic deadline when service start changes", () => {
    expect(applyRequestDraftPatch(draft, { serviceStartTime: "11:00" })).toMatchObject({
      expiresDate: "2026-09-23",
      expiresTime: "10:30"
    });
    expect(applyRequestDraftPatch({ ...draft, expiresTime: "08:30" }, { serviceStartTime: "11:00" })).toMatchObject({
      expiresDate: "2026-09-23",
      expiresTime: "08:30"
    });
  });
});
