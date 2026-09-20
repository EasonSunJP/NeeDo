import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import type { TechnicianAutomationProcessor } from "../src/services/technician-automation-processor";
import type { ExchangeClaimService } from "../src/services/exchange-claim.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";

const enabled = process.env.RUN_REQUEST_AUTOMATION_INTEGRATION === "true";
const integration = enabled ? describe : describe.skip;

integration("Request automation with real MySQL claims", () => {
  let client: PrismaClient;
  let processor: TechnicianAutomationProcessor;
  let claimService: ExchangeClaimService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  const rules = {
    ...defaultTechnicianAutomationRules("request"),
    minLeadMinutes: 0,
    bufferMinutes: 0 as const,
    maxDistanceKm: null,
    requestStartWindow: "any" as const,
    requireMatchingTags: false
  };

  beforeAll(async () => {
    const file = process.env.ENV_FILE;
    if (!file) throw new Error("Explicit local scratch ENV_FILE required");
    const loaded = loadDotenv({ path: file, override: true });
    const url = new URL(loaded.parsed?.DATABASE_URL ?? "");
    if (
      url.protocol !== "mysql:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !/^\/needo_request_auto_test_[a-z0-9_]+$/u.test(url.pathname) ||
      loaded.parsed?.DEPLOY_ENV !== "local"
    )
      throw new Error("Isolated local Request test database required");
    const [
      { createPrismaClient },
      { createExchangeRequestAutomationProcessor },
      { ExchangeClaimRepository },
      { ExchangePostRepository },
      { ExchangeClaimService }
    ] = await Promise.all([
      import("../src/prisma/client"),
      import("../src/routes/exchange.routes"),
      import("../src/repositories/exchange-claim.repository"),
      import("../src/repositories/exchange.repository"),
      import("../src/services/exchange-claim.service")
    ]);
    client = createPrismaClient();
    // Guard the actual client too: importing application configuration must not redirect writes.
    const target = await client.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
    expect(target[0].name).toBe(url.pathname.slice(1));
    claimService = new ExchangeClaimService(
      new ExchangeClaimRepository(client),
      new ExchangePostRepository(client)
    );
    processor = createExchangeRequestAutomationProcessor(claimService);
  }, 60_000);

  async function createFixture() {
    const marker = randomUUID().replaceAll("-", "").slice(0, 12);
    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    startsAt.setMilliseconds(0);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);
    const customer = await client.user.create({
      data: {
        needoId: `rac-${marker}`,
        email: `rac-${marker}@needo.test`,
        username: marker,
        isTestAccount: true
      }
    });
    const technician = await client.user.create({
      data: {
        needoId: `rat-${marker}`,
        email: `rat-${marker}@needo.test`,
        username: marker,
        isTestAccount: true
      }
    });
    const shop = await client.shop.create({
      data: {
        name: marker,
        city: "Tokyo",
        address: "Tokyo",
        status: "published",
        pricingMode: "TECHNICIAN"
      }
    });
    const profile = await client.technicianProfile.create({
      data: {
        userId: technician.id,
        shopId: shop.id,
        displayName: marker,
        city: "Tokyo",
        status: "published",
        verifiedAt: new Date()
      }
    });
    const owner = await client.userIdentity.create({
      data: {
        userId: customer.id,
        type: "customer",
        activeKey: `rac:${marker}`,
        displayName: marker
      }
    });
    const identity = await client.userIdentity.create({
      data: {
        userId: technician.id,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: profile.id,
        activeKey: `rat:${marker}`,
        displayName: marker
      }
    });
    const digits = String(Number.parseInt(marker.slice(0, 8), 16)).padStart(10, "0");
    const publicId = `s${digits}`;
    await client.publicIdentifier.create({
      data: {
        userIdentityId: identity.id,
        publicId,
        numberPart: digits,
        kind: "S",
        status: "ACTIVE"
      }
    });
    await client.technicianShopAffiliation.create({
      data: {
        technicianProfileId: profile.id,
        shopId: shop.id,
        relationshipType: "PARTNER",
        workStatus: "ACTIVE",
        startsAt: new Date(Date.now() - 86_400_000),
        activeKey: `ra:${marker}`
      }
    });
    await client.technicianWorkState.create({
      data: { technicianProfileId: profile.id, status: "on_duty" }
    });
    const setting = await client.technicianAutomationSetting.create({
      data: { technicianProfileId: profile.id, kind: "REQUEST", enabled: true, version: 2, rules }
    });
    const category = await client.category.create({ data: { code: marker, name: marker } });
    const service = await client.service.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: marker,
        city: "Tokyo",
        priceAmount: 8_800,
        durationMinutes: 60,
        status: "published"
      }
    });
    const technicianService = await client.technicianService.create({
      data: {
        shopId: shop.id,
        technicianId: profile.id,
        categoryId: category.id,
        name: marker,
        priceAmount: 8_800,
        durationMinutes: 60
      }
    });
    const availability = await client.availability.create({
      data: {
        shopId: shop.id,
        technicianProfileId: profile.id,
        startsAt,
        endsAt,
        isScheduleControlWindow: true
      }
    });
    const slotData = {
      shopId: shop.id,
      technicianProfileId: profile.id,
      availabilityId: availability.id,
      startsAt,
      endsAt
    };
    // A previous pricing mode leaves a published shop service slot with a smaller ID.
    const legacySlot = await client.scheduleSlot.create({
      data: { ...slotData, serviceId: service.id }
    });
    const slot = await client.scheduleSlot.create({
      data: { ...slotData, technicianServiceId: technicianService.id }
    });
    const post = await client.exchangePost.create({
      data: {
        authorUserId: customer.id,
        authorIdentityId: owner.id,
        ownerIdentityId: owner.id,
        publisherPublicId: `u${digits}`,
        publisherIdentityType: "customer",
        publisherDisplayName: marker,
        type: "DEMAND",
        status: "PUBLISHED",
        title: marker,
        detail: marker,
        contentLocale: "JA",
        areaLabel: "東京都渋谷区",
        serviceStartAt: startsAt,
        serviceEndAt: endsAt,
        expiresAt: new Date(endsAt.getTime() + 3_600_000),
        idempotencyKey: `ra-post:${marker}`,
        payloadFingerprint: "a".repeat(64),
        demand: {
          create: {
            matchMode: "SELECTIVE",
            budgetMode: "TOTAL",
            budgetMinJpy: 8_000,
            budgetMaxJpy: 8_800,
            addressLine1: "東京都渋谷区",
            serviceMode: "STORE"
          }
        },
        matching: {
          create: { status: "OPEN", effectiveTargetProviderCount: 1, effectiveBudgetMaxJpy: 8_800 }
        }
      }
    });
    const access: AuthenticatedAccessContext = {
      userId: technician.id,
      email: technician.email,
      roles: ["technician"],
      permissions: ["exchange:claims:create"],
      currentIdentityId: identity.id,
      currentPublicId: publicId,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: profile.id,
      accessTokenJti: marker,
      accessTokenExpiresAt: 0
    };
    return {
      customer,
      technician,
      shop,
      profile,
      owner,
      identity,
      setting,
      category,
      service,
      technicianService,
      availability,
      legacySlot,
      slot,
      post,
      access,
      postIds: [post.id]
    };
  }

  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    if (!fixture) return;
    const f = fixture;
    await client.notification.deleteMany({ where: { recipientUserId: f.technician.id } });
    await client.auditLog.deleteMany({
      where: { actorId: { in: [f.technician.id, f.customer.id] } }
    });
    await client.technicianAutomationDecisionLog.deleteMany({
      where: { technicianProfileId: f.profile.id }
    });
    await client.exchangeMatchEvent.deleteMany({
      where: { matching: { exchangePostId: { in: f.postIds } } }
    });
    await client.exchangeClaim.deleteMany({ where: { exchangePostId: { in: f.postIds } } });
    await client.exchangeRequestMatching.deleteMany({
      where: { exchangePostId: { in: f.postIds } }
    });
    await client.exchangeDemand.deleteMany({ where: { postId: { in: f.postIds } } });
    await client.exchangePost.deleteMany({ where: { id: { in: f.postIds } } });
    await client.scheduleSlot.deleteMany({ where: { technicianProfileId: f.profile.id } });
    await client.availability.deleteMany({ where: { technicianProfileId: f.profile.id } });
    await client.technicianService.deleteMany({ where: { technicianId: f.profile.id } });
    await client.service.delete({ where: { id: f.service.id } });
    await client.category.delete({ where: { id: f.category.id } });
    await client.technicianAutomationSetting.delete({ where: { id: f.setting.id } });
    await client.technicianWorkState.deleteMany({ where: { technicianProfileId: f.profile.id } });
    await client.technicianShopAffiliation.deleteMany({
      where: { technicianProfileId: f.profile.id }
    });
    await client.publicIdentifier.deleteMany({ where: { userIdentityId: f.identity.id } });
    await client.userIdentity.deleteMany({ where: { id: { in: [f.identity.id, f.owner.id] } } });
    await client.technicianProfile.delete({ where: { id: f.profile.id } });
    await client.shop.delete({ where: { id: f.shop.id } });
    await client.user.deleteMany({ where: { id: { in: [f.technician.id, f.customer.id] } } });
  });
  afterAll(async () => {
    await client?.$disconnect();
    if (enabled) await (await import("../src/prisma/client")).disconnectPrisma();
  });

  it("skips an obsolete pricing-mode slot and automatically claims the valid technician service", async () => {
    await processor.processRequest(fixture.post.id);
    expect(
      await client.exchangeClaim.findMany({ where: { exchangePostId: fixture.post.id } })
    ).toEqual([
      expect.objectContaining({
        scheduleSlotId: fixture.slot.id,
        quoteAmountJpy: 8_800,
        status: "ACTIVE"
      })
    ]);
  });

  it("checks later service options instead of reserving a non-matching first option", async () => {
    const other = await client.technicianService.create({
      data: {
        shopId: fixture.shop.id,
        technicianId: fixture.profile.id,
        categoryId: fixture.category.id,
        name: "Different service",
        priceAmount: 8_800,
        durationMinutes: 60
      }
    });
    await client.scheduleSlot.update({
      where: { id: fixture.legacySlot.id },
      data: { serviceId: null, technicianServiceId: other.id }
    });
    await client.technicianAutomationSetting.update({
      where: { id: fixture.setting.id },
      data: { rules: { ...rules, serviceIds: [fixture.technicianService.id] } }
    });
    await processor.processRequest(fixture.post.id);
    expect(
      await client.exchangeClaim.findFirst({ where: { exchangePostId: fixture.post.id } })
    ).toMatchObject({ scheduleSlotId: fixture.slot.id });
  });

  it("accepts an active affiliation with a future end date", async () => {
    await client.scheduleSlot.delete({ where: { id: fixture.legacySlot.id } });
    await client.technicianShopAffiliation.updateMany({
      where: { technicianProfileId: fixture.profile.id },
      data: { endsAt: new Date(fixture.slot.endsAt.getTime() + 86_400_000) }
    });
    await processor.processRequest(fixture.post.id);
    expect(await client.exchangeClaim.count({ where: { exchangePostId: fixture.post.id } })).toBe(
      1
    );
  });

  it("reproduces Request 14 rules and applies while the technician is offline", async () => {
    const f = fixture;
    await client.exchangePost.update({
      where: { id: f.post.id },
      data: { title: "StagingTest 自动抢单集成测试" }
    });
    await client.exchangeDemand.update({
      where: { postId: f.post.id },
      data: {
        matchMode: "QUICK",
        budgetMinJpy: 8_000,
        budgetMaxJpy: 12_000,
        serviceMode: "STORE"
      }
    });
    await client.technicianWorkState.update({
      where: { technicianProfileId: f.profile.id },
      data: { status: "off_duty" }
    });
    await client.technicianAutomationSetting.update({
      where: { id: f.setting.id },
      data: {
        rules: {
          ...rules,
          onlyOnline: false,
          minOrderAmountJpy: null,
          minNetAmountJpy: null,
          acceptNewCustomers: true,
          minCompletedOrders: 0,
          requireEkyc: false,
          source: { mode: "any", contactIdentityIds: [] },
          customerType: "all",
          partyTypes: ["single"],
          serviceModes: ["store", "home"],
          paymentMethods: ["onsite", "card", "ndp", "bank_transfer", "other"]
        }
      }
    });

    await processor.processRequest(f.post.id);

    expect(
      await client.exchangeClaim.findFirst({ where: { exchangePostId: f.post.id } })
    ).toMatchObject({
      scheduleSlotId: f.slot.id,
      quoteAmountJpy: 12_000,
      status: "ACTIVE"
    });
    expect(
      await client.technicianAutomationDecisionLog.findUnique({
        where: { idempotencyKey: `request:${f.post.id}:${f.profile.id}:apply_request` }
      })
    ).toMatchObject({ outcome: "EXECUTED", failedReasons: [] });
  });

  it("keeps an offline online-only rule unmatched with an auditable reason", async () => {
    const f = fixture;
    await client.technicianWorkState.update({
      where: { technicianProfileId: f.profile.id },
      data: { status: "off_duty" }
    });

    await processor.processRequest(f.post.id);

    expect(await client.exchangeClaim.count({ where: { exchangePostId: f.post.id } })).toBe(0);
    expect(
      await client.technicianAutomationDecisionLog.findUnique({
        where: { idempotencyKey: `request:${f.post.id}:${f.profile.id}:apply_request` }
      })
    ).toMatchObject({
      outcome: "NOT_MATCHED",
      failedReasons: expect.arrayContaining(["online:offline"])
    });
  });

  it("skips a full earlier slot even if its status has not yet changed", async () => {
    await client.scheduleSlot.update({
      where: { id: fixture.legacySlot.id },
      data: { serviceId: null, technicianServiceId: fixture.technicianService.id, bookedCount: 1 }
    });
    await processor.processRequest(fixture.post.id);
    expect(
      await client.exchangeClaim.findFirst({ where: { exchangePostId: fixture.post.id } })
    ).toMatchObject({ scheduleSlotId: fixture.slot.id });
  });

  it("finds an allowed service beyond the first candidate page", async () => {
    await client.scheduleSlot.deleteMany({ where: { technicianProfileId: fixture.profile.id } });
    const other = await client.technicianService.create({
      data: {
        shopId: fixture.shop.id,
        technicianId: fixture.profile.id,
        categoryId: fixture.category.id,
        name: "Unselected service",
        priceAmount: 8_800,
        durationMinutes: 60
      }
    });
    const slotData = {
      shopId: fixture.shop.id,
      technicianProfileId: fixture.profile.id,
      availabilityId: fixture.availability.id,
      startsAt: fixture.slot.startsAt,
      endsAt: fixture.slot.endsAt
    };
    await client.scheduleSlot.createMany({
      data: Array.from({ length: 200 }, () => ({ ...slotData, technicianServiceId: other.id }))
    });
    fixture.slot = await client.scheduleSlot.create({
      data: { ...slotData, technicianServiceId: fixture.technicianService.id }
    });
    await client.technicianAutomationSetting.update({
      where: { id: fixture.setting.id },
      data: { rules: { ...rules, serviceIds: [fixture.technicianService.id] } }
    });
    await processor.processRequest(fixture.post.id);
    expect(
      await client.exchangeClaim.findFirst({ where: { exchangePostId: fixture.post.id } })
    ).toMatchObject({ scheduleSlotId: fixture.slot.id });
  });

  it.each([
    ["lead time", { minLeadMinutes: 10_080 }],
    ["daily time window", { timeWindows: [{ weekday: 0, startMinute: 0, endMinute: 1 }] }],
    ["start window", { requestStartWindow: "within_1_hour" }],
    ["service selection", { serviceIds: [2_000_000_000] }],
    ["price threshold", { minOrderAmountJpy: 8_801 }],
    ["new customer restriction", { acceptNewCustomers: false }],
    ["contact relationship", { source: { mode: "existing_contacts", contactIdentityIds: [] } }],
    ["service mode", { serviceModes: ["home"] }]
  ])("does not apply when %s does not match", async (_name, patch) => {
    await client.technicianAutomationSetting.update({
      where: { id: fixture.setting.id },
      data: { rules: { ...rules, ...patch } }
    });
    await processor.processRequest(fixture.post.id);
    expect(await client.exchangeClaim.count({ where: { exchangePostId: fixture.post.id } })).toBe(
      0
    );
    expect(
      await client.notification.count({ where: { recipientUserId: fixture.technician.id } })
    ).toBe(0);
    expect(
      await client.technicianAutomationDecisionLog.findFirst({
        where: { targetId: fixture.post.id, technicianProfileId: fixture.profile.id }
      })
    ).toMatchObject({ outcome: "NOT_MATCHED" });
  });

  it.each([
    "no availability",
    "outside request",
    "unbookable",
    "inactive affiliation",
    "disabled setting",
    "inactive identity"
  ])("does not apply with %s", async (condition) => {
    const f = fixture;
    if (condition === "no availability")
      await client.availability.update({
        where: { id: f.availability.id },
        data: { isActive: false }
      });
    if (condition === "outside request")
      await client.exchangePost.update({
        where: { id: f.post.id },
        data: {
          serviceStartAt: f.slot.endsAt,
          serviceEndAt: new Date(f.slot.endsAt.getTime() + 3_600_000)
        }
      });
    if (condition === "unbookable")
      await client.technicianService.update({
        where: { id: f.technicianService.id },
        data: { isBookable: false }
      });
    if (condition === "inactive affiliation")
      await client.technicianShopAffiliation.updateMany({
        where: { technicianProfileId: f.profile.id },
        data: { workStatus: "ENDED", activeKey: null }
      });
    if (condition === "disabled setting")
      await client.technicianAutomationSetting.update({
        where: { id: f.setting.id },
        data: { enabled: false }
      });
    if (condition === "inactive identity")
      await client.userIdentity.update({ where: { id: f.identity.id }, data: { isActive: false } });
    await processor.processRequest(f.post.id);
    expect(await client.exchangeClaim.count({ where: { exchangePostId: f.post.id } })).toBe(0);
    expect(await client.notification.count({ where: { recipientUserId: f.technician.id } })).toBe(
      0
    );
  });

  it("creates only one claim/event/notification under concurrent repeated triggers and keeps matching manual", async () => {
    await client.scheduleSlot.delete({ where: { id: fixture.legacySlot.id } });
    await Promise.all([
      processor.processRequest(fixture.post.id),
      processor.processRequest(fixture.post.id)
    ]);
    await processor.processRequest(fixture.post.id);
    expect(await client.exchangeClaim.count({ where: { exchangePostId: fixture.post.id } })).toBe(
      1
    );
    expect(
      await client.exchangeMatchEvent.count({
        where: { matching: { exchangePostId: fixture.post.id }, type: "CLAIM_ADDED" }
      })
    ).toBe(1);
    expect(
      await client.notification.count({ where: { recipientUserId: fixture.technician.id } })
    ).toBe(1);
    expect(
      await client.bookingOrder.count({ where: { technicianProfileId: fixture.profile.id } })
    ).toBe(0);
    expect(await client.exchangePost.findUnique({ where: { id: fixture.post.id } })).toMatchObject({
      status: "PUBLISHED"
    });
    expect(
      await client.exchangeRequestMatching.findUnique({
        where: { exchangePostId: fixture.post.id }
      })
    ).toMatchObject({ status: "OPEN", version: 2 });
    expect(await client.scheduleSlot.findUnique({ where: { id: fixture.slot.id } })).toMatchObject({
      bookedCount: 0
    });
    expect(
      await client.walletHold.count({ where: { exchangePostId: fixture.post.id } })
    ).toBe(0);
  });

  it("retries a failed transaction once after contention clears using the same decision key", async () => {
    const f = fixture;
    const decisionKey = `request:${f.post.id}:${f.profile.id}:apply_request`;
    await client.technicianAutomationDecisionLog.create({
      data: {
        settingId: f.setting.id,
        technicianProfileId: f.profile.id,
        kind: "REQUEST",
        targetType: "exchange_request",
        targetId: f.post.id,
        actionType: "apply_request",
        ruleVersion: 2,
        idempotencyKey: decisionKey,
        outcome: "ACTION_FAILED",
        matchedConditions: [],
        failedReasons: ["action:transaction_conflict"]
      }
    });
    await Promise.all([processor.processRequest(f.post.id), processor.processRequest(f.post.id)]);
    expect(
      await client.exchangeClaim.count({ where: { exchangePostId: f.post.id, status: "ACTIVE" } })
    ).toBe(1);
    expect(
      await client.technicianAutomationDecisionLog.count({ where: { idempotencyKey: decisionKey } })
    ).toBe(1);
    expect(
      await client.technicianAutomationDecisionLog.findUnique({
        where: { idempotencyKey: decisionKey }
      })
    ).toMatchObject({ outcome: "EXECUTED" });
  });

  it("chooses a later free slot when another Request claim occupies the earliest slot", async () => {
    const f = fixture;
    const endsAt = new Date(f.slot.endsAt.getTime() + 2 * 3_600_000);
    await client.exchangePost.update({
      where: { id: f.post.id },
      data: { serviceEndAt: endsAt, expiresAt: new Date(endsAt.getTime() + 3_600_000) }
    });
    await client.availability.update({ where: { id: f.availability.id }, data: { endsAt } });
    const later = await client.scheduleSlot.create({
      data: {
        shopId: f.shop.id,
        technicianProfileId: f.profile.id,
        technicianServiceId: f.technicianService.id,
        availabilityId: f.availability.id,
        startsAt: new Date(f.slot.endsAt.getTime() + 3_600_000),
        endsAt
      }
    });
    const blocker = await client.exchangePost.create({
      data: {
        authorUserId: f.customer.id,
        authorIdentityId: f.owner.id,
        ownerIdentityId: f.owner.id,
        publisherPublicId: f.post.publisherPublicId,
        publisherIdentityType: "customer",
        publisherDisplayName: "Concurrent Request",
        type: "DEMAND",
        status: "PUBLISHED",
        title: "Concurrent Request",
        detail: "Concurrent Request",
        contentLocale: "JA",
        areaLabel: "Tokyo",
        serviceStartAt: f.slot.startsAt,
        serviceEndAt: f.slot.endsAt,
        expiresAt: f.post.expiresAt,
        idempotencyKey: `request-blocker:${f.post.id}`,
        payloadFingerprint: "b".repeat(64),
        demand: {
          create: {
            matchMode: "SELECTIVE",
            budgetMaxJpy: 8_800,
            addressLine1: "Tokyo",
            serviceMode: "STORE"
          }
        },
        matching: {
          create: { status: "OPEN", effectiveTargetProviderCount: 1, effectiveBudgetMaxJpy: 8_800 }
        }
      }
    });
    f.postIds.push(blocker.id);
    await claimService.createClaim(
      f.access,
      blocker.id,
      { scheduleSlotId: f.slot.id, quoteAmountJpy: 8_800, message: "Occupied" },
      `request-blocker-claim:${f.post.id}`,
      { ip: "127.0.0.1", userAgent: "request-automation-integration" }
    );
    await processor.processRequest(f.post.id);
    expect(
      await client.exchangeClaim.findFirst({ where: { exchangePostId: f.post.id } })
    ).toMatchObject({ scheduleSlotId: later.id });
  });
});
