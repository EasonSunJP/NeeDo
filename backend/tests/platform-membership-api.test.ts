import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

const now = new Date("2026-09-01T12:00:00.000Z");
const theme = {
  detailAccentColor: "#F4C967",
  detailSurfaceColor: "#302818",
  detailItemSurfaceColor: "#201A10",
  detailOuterBorderColor: "#A98645",
  detailItemBorderColor: "#66552F",
  detailAvatarBorderColor: "#D0A857",
  simpleTopColor: "#382C13",
  simpleBottomColor: "#241E12"
};
const benefits = [
  ["ndp_experience", true, { extraThresholdNdp: 100, extraAwardExpUnits: 1 }],
  ["member_sign_in", true, {}],
  ["priority_request", false, {}],
  ["support_service", false, {}],
  ["exclusive_discount", false, {}],
  ["member_day", false, {}],
  ["birthday_gift", false, {}],
  ["traceless_recall", true, {}]
].map(([code, isEnabled, configuration]) => ({ code, isEnabled, configuration }));
const version = {
  tierCode: "gold" as const,
  tierVersionPublicId: "tier-gold-v2",
  version: 2,
  status: "draft" as const,
  lockVersion: 1,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: 5,
  description: "Gold membership",
  effectiveFrom: now,
  effectiveTo: null,
  publishedAt: null,
  theme,
  benefits
};
const draftBody = {
  expectedVersion: 2,
  expectedLockVersion: 1,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: 5,
  description: "Gold membership",
  theme,
  benefits
};

const createService = () => ({
  listTiersForAdministration: jest.fn(async () => [
    { tierCode: "free", sortOrder: 0, publishedVersion: null, draftVersion: null },
    { tierCode: "silver", sortOrder: 1, publishedVersion: null, draftVersion: null },
    { tierCode: "gold", sortOrder: 2, publishedVersion: null, draftVersion: version },
    { tierCode: "black_diamond", sortOrder: 3, publishedVersion: null, draftVersion: null }
  ]),
  getTierDraft: jest.fn(async () => version),
  saveTierDraft: jest.fn(async () => version),
  publishTierVersion: jest.fn(async () => ({
    ...version,
    status: "published" as const,
    lockVersion: 2,
    publishedAt: now
  })),
  listBenefitsForAdministration: jest.fn(async () => [
    {
      code: "ndp_experience" as const,
      sortOrder: 0,
      isGloballyEnabled: true,
      nameTranslations: {
        zh: "NDP消费经验",
        "zh-Hant": "NDP消費經驗",
        ja: "NDP利用経験値",
        en: "NDP experience",
        ko: "NDP 사용 경험치"
      },
      descriptionTranslations: {
        zh: "说明",
        "zh-Hant": "說明",
        ja: "説明",
        en: "Description",
        ko: "설명"
      },
      lockVersion: 1
    }
  ]),
  updateBenefit: jest.fn(async () => ({
    code: "ndp_experience" as const,
    sortOrder: 0,
    isGloballyEnabled: false,
    nameTranslations: {
      zh: "NDP消费经验",
      "zh-Hant": "NDP消費經驗",
      ja: "NDP利用経験値",
      en: "NDP experience",
      ko: "NDP 사용 경험치"
    },
    descriptionTranslations: {
      zh: "说明",
      "zh-Hant": "說明",
      ja: "説明",
      en: "Description",
      ko: "설명"
    },
    lockVersion: 2
  })),
  changeEntitlement: jest.fn(async () => ({
    kind: "grant" as const,
    tierCode: "gold" as const,
    tierVersionPublicId: "tier-gold-v1",
    entitlementPublicId: "entitlement-gold-1",
    startsAt: now,
    expiresAt: new Date("2026-10-01T12:00:00.000Z"),
    experienceValueNdp: 1_999,
    idempotent: false
  }))
});

const grantMembershipPermissions = (fixture: Awaited<ReturnType<typeof createStep06Fixture>>) => {
  const codes = [
    "backoffice:membership-tier:read",
    "backoffice:membership-tier:publish",
    "backoffice:membership-benefit:read",
    "backoffice:membership-benefit:write",
    "backoffice:user-membership:write"
  ];
  fixture.roles[0].rolePermissions.push(
    ...codes.map((code, index) => ({
      id: 9_100 + index,
      roleId: fixture.roles[0].id,
      permissionId: 9_100 + index,
      deletedAt: null,
      permission: {
        id: 9_100 + index,
        name: code,
        code,
        type: "api" as const,
        module: "backoffice",
        description: code,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      }
    }))
  );
};

describe("platform membership administration API", () => {
  it("returns the fixed tier order and complete benefit response envelope", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    grantMembershipPermissions(fixture);
    const token = await fixture.loginAsAdmin();

    const tiers = await request(fixture.app)
      .get("/api/v1/backoffice/membership-tiers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(tiers.body.data.map((item: { tierCode: string }) => item.tierCode)).toEqual([
      "free",
      "silver",
      "gold",
      "black_diamond"
    ]);

    const catalog = await request(fixture.app)
      .get("/api/v1/backoffice/membership-benefits")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(catalog.body).toMatchObject({ code: 0, message: "success" });
    expect(catalog.body.data[0]).toMatchObject({ code: "ndp_experience" });
  });

  it("validates and forwards tier, benefit and entitlement mutations", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    grantMembershipPermissions(fixture);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/membership-tiers/gold/draft")
      .set("Authorization", `Bearer ${token}`)
      .send(draftBody)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/membership-tiers/gold/publish")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedVersion: 2, expectedLockVersion: 1 })
      .expect(200);
    await request(fixture.app)
      .patch("/api/v1/backoffice/membership-benefits/ndp_experience")
      .set("Authorization", `Bearer ${token}`)
      .send({
        isGloballyEnabled: false,
        sortOrder: 0,
        nameTranslations: {
          zh: "NDP消费经验",
          "zh-Hant": "NDP消費經驗",
          ja: "NDP利用経験値",
          en: "NDP experience",
          ko: "NDP 사용 경험치"
        },
        descriptionTranslations: {
          zh: "说明",
          "zh-Hant": "說明",
          ja: "説明",
          en: "Description",
          ko: "설명"
        },
        expectedLockVersion: 1
      })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/users/42/platform-membership")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "grant",
        targetTierCode: "gold",
        billingCycle: "monthly",
        source: "operations",
        sourceReference: "ops:user:42:membership:1",
        expectedCurrentLockVersion: null
      })
      .expect(200);

    expect(service.saveTierDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "gold",
      expect.objectContaining({ monthlyValueNdp: 1_999 })
    );
    expect(service.updateBenefit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "ndp_experience",
      {
        isGloballyEnabled: false,
        sortOrder: 0,
        nameTranslations: {
          zh: "NDP消费经验",
          "zh-Hant": "NDP消費經驗",
          ja: "NDP利用経験値",
          en: "NDP experience",
          ko: "NDP 사용 경험치"
        },
        descriptionTranslations: {
          zh: "说明",
          "zh-Hant": "說明",
          ja: "説明",
          en: "Description",
          ko: "설명"
        },
        expectedLockVersion: 1
      }
    );
    expect(service.changeEntitlement).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      42,
      expect.objectContaining({ kind: "grant", targetTierCode: "gold" })
    );
  });

  it("rejects malformed colors before the service is called", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    grantMembershipPermissions(fixture);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/membership-tiers/gold/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...draftBody, theme: { ...theme, detailAccentColor: "green" } })
      .expect(400);
    expect(service.saveTierDraft).not.toHaveBeenCalled();
  });
});
