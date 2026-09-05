import { describe, expect, it } from "vitest";
import {
  normalizeIntelligenceDraft,
  type IntelligenceComposerDraft
} from "./exchange-composer-model";

const validDraft: IntelligenceComposerDraft = {
  contentLocale: "zh-CN",
  title: "正式活动",
  detail: "正式服务说明",
  serviceRef: "technician:31",
  serviceStartDate: "2026-09-07",
  serviceStartTime: "10:00",
  serviceEndDate: "2026-09-07",
  serviceEndTime: "11:00",
  expiresDate: "2026-09-07",
  expiresTime: "11:00",
  campaignPriceJpy: "8800"
};

describe("Intelligence composer authority boundary", () => {
  it("submits only the selected formal service ref, campaign price, content, and time window", () => {
    const result = normalizeIntelligenceDraft(validDraft, 10_000);
    expect(result).toEqual({
      ok: true,
      value: {
        type: "intelligence",
        title: "正式活动",
        detail: "正式服务说明",
        contentLocale: "zh-CN",
        serviceRef: "technician:31",
        serviceStartAt: expect.any(String),
        serviceEndAt: expect.any(String),
        expiresAt: expect.any(String),
        campaignPriceJpy: 8800
      }
    });
    expect(result.ok && result.value).not.toEqual(
      expect.objectContaining({
        serviceMode: expect.anything(),
        areaLabel: expect.anything(),
        addressLabel: expect.anything(),
        serviceAreas: expect.anything(),
        originalPriceJpy: expect.anything()
      })
    );
  });

  it("requires a service and caps the campaign price at the selected catalog price", () => {
    expect(normalizeIntelligenceDraft({ ...validDraft, serviceRef: "" }, 10_000)).toEqual({
      ok: false,
      errorKey: "serviceRequired"
    });
    expect(normalizeIntelligenceDraft({ ...validDraft, campaignPriceJpy: "10001" }, 10_000)).toEqual({
      ok: false,
      errorKey: "invalidPrice"
    });
  });
});
