import { PlatformSettingsRepository } from "../src/repositories/platform-settings.repository";

const now = new Date("2026-09-06T00:00:00.000Z");

const createHarness = () => {
  const rows = [
    {
      id: 1,
      publicId: "00000000-0000-4000-8000-000000000001",
      version: 1,
      activeKey: "active",
      siteEnabled: true,
      selfRegistrationEnabled: true,
      googleLoginEnabled: true,
      passwordLoginOtpEnabled: false,
      passwordLoginOtpRule: "FIRST_LOGIN",
      passwordLoginOtpOnNewIp: false,
      loginLogoMediaAssetId: null,
      requestButtonMediaAssetId: null,
      offlinePaymentEnabled: true,
      ndpPaymentEnabled: true,
      anytimeServiceTestEnabled: false,
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      loginLogoMediaAsset: null,
      requestButtonMediaAsset: null
    }
  ];
  const media = [
    {
      id: 11,
      checksumSha256: "a".repeat(64),
      url: "/media/content/logo.webp",
      mimeType: "image/webp",
      width: 240,
      height: 80,
      altText: "NeeDo"
    }
  ];
  const audits: Array<Record<string, unknown>> = [];
  const selectActive = () => rows.find((row) => row.activeKey === "active" && !row.deletedAt) ?? null;
  const tx = {
    $queryRaw: jest.fn(async () => (selectActive() ? [{ id: selectActive()!.id }] : [])),
    platformSettingVersion: {
      findFirst: jest.fn(async () => selectActive()),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const active = selectActive();
        if (!active || active.id !== where.id || active.version !== where.version) return { count: 0 };
        Object.assign(active, data);
        return { count: 1 };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const logo = media.find((item) => item.id === data.loginLogoMediaAssetId) ?? null;
        const created = {
          ...data,
          id: rows.length + 1,
          publicId: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          loginLogoMediaAsset: logo,
          requestButtonMediaAsset: null
        } as (typeof rows)[number];
        rows.push(created);
        return created;
      })
    },
    mediaAsset: {
      findFirst: jest.fn(async ({ where }: { where: { checksumSha256: string } }) =>
        media.find((item) => item.checksumSha256 === where.checksumSha256) ?? null
      )
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      })
    }
  };
  const client = {
    platformSettingVersion: tx.platformSettingVersion,
    $transaction: jest.fn(async (operation: (transaction: typeof tx) => unknown) => {
      const rowSnapshot = rows.map((row) => ({ ...row }));
      const auditSnapshot = audits.map((audit) => ({ ...audit }));
      try {
        return await operation(tx);
      } catch (error) {
        rows.splice(0, rows.length, ...rowSnapshot);
        audits.splice(0, audits.length, ...auditSnapshot);
        throw error;
      }
    })
  };
  return { repository: new PlatformSettingsRepository(client as never), rows, media, audits, tx };
};

const audit = {
  actorId: 7,
  action: "backoffice.platform_settings.basic_updated",
  targetType: "PlatformSettingVersion",
  targetId: null,
  ip: "127.0.0.1",
  userAgent: "repository-test",
  metadata: { changedFields: ["loginLogoMediaAssetId"] }
};

describe("PlatformSettingsRepository", () => {
  it("replaces the complete active version and validates public content media atomically", async () => {
    const harness = createHarness();
    const result = await harness.repository.replaceWithAudit({
      section: "basic",
      expectedVersion: 1,
      actorUserId: 7,
      changes: {
        siteEnabled: false,
        selfRegistrationEnabled: false,
        googleLoginEnabled: true,
        passwordLoginOtpEnabled: true,
        passwordLoginOtpRule: "every_login",
        passwordLoginOtpOnNewIp: true,
        anytimeServiceTestEnabled: true,
        loginLogoMediaPublicId: "a".repeat(64),
        requestButtonMediaPublicId: null
      },
      audit
    });

    expect(result).toMatchObject({
      kind: "updated",
      value: {
        version: 2,
        siteEnabled: false,
        loginLogoMediaAssetId: 11,
        offlinePaymentEnabled: true,
        ndpPaymentEnabled: true,
        anytimeServiceTestEnabled: true,
        loginLogo: { publicId: "a".repeat(64), url: "/media/content/logo.webp" }
      }
    });
    expect(harness.rows).toHaveLength(2);
    expect(harness.rows[0]).toMatchObject({ activeKey: null });
    expect(harness.rows[1]).toMatchObject({ activeKey: "active", createdByUserId: 7 });
    expect(harness.tx.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        checksumSha256: "a".repeat(64),
        entityType: "content_publication_upload",
        usageType: "content_publication_public",
        isActive: true,
        purgedAt: null,
        deletedAt: null
      }),
      select: expect.any(Object),
      orderBy: { id: "desc" }
    });
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      actorId: 7,
      targetId: 2,
      metadata: expect.objectContaining({ previousVersion: 1, nextVersion: 2 })
    });
  });

  it("returns conflicts and invalid media without changing the active version", async () => {
    const stale = createHarness();
    await expect(
      stale.repository.replaceWithAudit({
        section: "payment",
        expectedVersion: 8,
        actorUserId: 7,
        changes: { offlinePaymentEnabled: false, ndpPaymentEnabled: true },
        audit
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(stale.rows).toHaveLength(1);
    expect(stale.audits).toHaveLength(0);

    const missing = createHarness();
    await expect(
      missing.repository.replaceWithAudit({
        section: "basic",
        expectedVersion: 1,
        actorUserId: 7,
        changes: {
          siteEnabled: true,
          selfRegistrationEnabled: true,
          googleLoginEnabled: true,
          passwordLoginOtpEnabled: false,
          passwordLoginOtpRule: "first_login",
          passwordLoginOtpOnNewIp: false,
          anytimeServiceTestEnabled: false,
          loginLogoMediaPublicId: "f".repeat(64),
          requestButtonMediaPublicId: null
        },
        audit
      })
    ).resolves.toEqual({ kind: "media_not_found", field: "loginLogo" });
    expect(missing.rows).toHaveLength(1);
    expect(missing.rows[0]).toMatchObject({ activeKey: "active" });
    expect(missing.audits).toHaveLength(0);
  });
});
