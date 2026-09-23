import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STAGING_TEST_CHIBA_SERVICES,
  buildNightlyShiftRanges,
  parseStagingTestChibaShopConfig
} from "../src/staging/staging-test-chiba-shop-provisioning";

describe("StagingTest Chiba shop provisioning gate", () => {
  const valid = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_TEST_CHIBA_PROVISIONING: "true",
    STAGING_TEST_CHIBA_SCHEDULE_START_DATE: "2026-09-21"
  };

  it("binds the fixture to akiratest and at least three calendar months", () => {
    expect(parseStagingTestChibaShopConfig(valid)).toEqual({
      ownerEmail: "akiratest@lifedance.com",
      startDate: "2026-09-21",
      endDate: "2026-12-21"
    });
  });

  it("accepts an explicit exclusive end date through January", () => {
    expect(parseStagingTestChibaShopConfig({
      ...valid,
      STAGING_TEST_CHIBA_SCHEDULE_END_DATE: "2027-02-01"
    })).toEqual({
      ownerEmail: "akiratest@lifedance.com",
      startDate: "2026-09-21",
      endDate: "2027-02-01"
    });
  });

  it("rejects an explicit end date that is not after the start", () => {
    expect(() => parseStagingTestChibaShopConfig({
      ...valid,
      STAGING_TEST_CHIBA_SCHEDULE_END_DATE: "2026-09-21"
    })).toThrow("STAGING_TEST_CHIBA_SCHEDULE_PERIOD_INVALID");
  });

  it.each([
    ["NODE_ENV", "development"],
    ["DEPLOY_ENV", "production"],
    ["ALLOW_STAGING_TEST_CHIBA_PROVISIONING", "false"]
  ])("rejects an unsafe %s boundary", (key, value) => {
    expect(() => parseStagingTestChibaShopConfig({ ...valid, [key]: value })).toThrow();
  });

  it("creates one 17:00 to next-day 01:00 shop shift per technician per day", () => {
    const ranges = buildNightlyShiftRanges({
      startDate: "2026-09-21",
      endDate: "2026-09-23",
      technicianProfileIds: [7, 8]
    });

    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toEqual({
      technicianProfileId: 7,
      startsAt: new Date("2026-09-21T08:00:00.000Z"),
      endsAt: new Date("2026-09-21T16:00:00.000Z")
    });
    expect(ranges[1]).toEqual({
      technicianProfileId: 7,
      startsAt: new Date("2026-09-22T08:00:00.000Z"),
      endsAt: new Date("2026-09-22T16:00:00.000Z")
    });
  });

  it("defines exactly three massages, two options and one extension with Japanese tax-inclusive pricing", () => {
    expect(STAGING_TEST_CHIBA_SERVICES).toHaveLength(6);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "massage")).toHaveLength(3);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "option")).toHaveLength(2);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "extension")).toHaveLength(1);
    expect(STAGING_TEST_CHIBA_SERVICES.every((service) => service.currency === "JPY" && service.priceAmountJpy > 0)).toBe(true);
  });

  it("leaves the shop taxonomy active key to the database generated column", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-chiba-shop-provisioning.ts"),
      "utf8"
    );
    const taxonomyWriteBlock = source.match(
      /const taxonomySelection =[\s\S]*?const services:/u
    )?.[0];

    expect(taxonomyWriteBlock).toBeDefined();
    expect(taxonomyWriteBlock).not.toContain("activeKey");
  });

  it("keeps the shop unpublished until resumable provisioning is complete", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-chiba-shop-provisioning.ts"),
      "utf8"
    );

    expect(source).not.toContain("return this.client.$transaction(async (tx)");
    expect(source).toContain('status: wasPublished ? "published" : "draft"');
    expect(source).toContain('visibility: wasPublished ? "public" : "privateAll"');
    expect(source).toContain("const [finalShop] = await this.client.$transaction([");
    expect(source).toMatch(
      /data: \{ status: "published", visibility: "public" \},[\s\S]*?tx\.auditLog\.create/u
    );
  });

  it("keeps continuous availability authoritative and does not pre-create service slots", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-chiba-shop-provisioning.ts"),
      "utf8"
    );

    expect(source).toContain("dynamicAvailability: true");
    expect(source).toContain("startIntervalMinutes: 5");
    expect(source).toContain("postBufferMinutes: 30");
    expect(source).not.toContain("scheduleSlot.createMany");
  });

  it("enables permissive booking and request automation for every affiliated technician", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-chiba-shop-provisioning.ts"),
      "utf8"
    );

    expect(source).toContain("TechnicianAutomationKind.BOOKING");
    expect(source).toContain("TechnicianAutomationKind.REQUEST");
    expect(source).toContain("technicianAutomationSetting.upsert");
    expect(source).toContain("enabled: true");
  });

  it("gives the Chiba owner a selectable merchant-account identity", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-chiba-shop-provisioning.ts"),
      "utf8"
    );

    expect(source).toContain('type: "merchant_organization"');
    expect(source).toContain('scopeType: "merchant_account"');
    expect(source).toContain('kind: "O"');
  });
});
