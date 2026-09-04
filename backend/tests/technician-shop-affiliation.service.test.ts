import { ERROR_CODES } from "../src/constants/error-codes";
import {
  TechnicianShopAffiliationService,
  type MerchantEmployeePayload,
  type TechnicianShopAffiliationRepositoryPort
} from "../src/services/technician-shop-affiliation.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { PublicIdentifierRecord } from "../src/services/public-identifier.service";

const actorForShop = (
  shopId: number,
  overrides: Partial<AuthenticatedAccessContext> = {}
): AuthenticatedAccessContext => ({
  userId: 86,
  email: "merchant@example.com",
  accessTokenJti: "merchant-token",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 12,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: shopId,
  roles: ["merchant_owner"],
  permissions: [
    "merchant-admin:employee-affiliation:read",
    "merchant-admin:employee-affiliation:write"
  ],
  ...overrides
});

const identifier = (overrides: Partial<PublicIdentifierRecord> = {}): PublicIdentifierRecord => ({
  id: 90,
  publicId: "s0000000047",
  numberPart: "0000000047",
  kind: "S",
  loginAllowed: true,
  searchable: true,
  status: "ACTIVE",
  userIdentityId: 77,
  shopId: null,
  merchantAccountId: null,
  customerSupportAccountId: null,
  ...overrides
});

const employee = (overrides: Partial<MerchantEmployeePayload> = {}): MerchantEmployeePayload => ({
  needoId: "s0000000047",
  displayName: "山本 太郎",
  avatarUrl: null,
  email: "technician@example.com",
  phone: "+81-90-0000-0047",
  profileStatus: "published",
  verifiedAt: "2026-08-01T00:00:00.000Z",
  profile: {
    bio: "整体与放松护理",
    city: "东京都涩谷区",
    serviceArea: "涩谷区、新宿区",
    yearsExperience: 9,
    updatedAt: "2026-08-28T00:00:00.000Z"
  },
  account: {
    isActive: true,
    lastLoginAt: "2026-08-27T12:00:00.000Z"
  },
  affiliation: {
    id: 31,
    relationshipType: "partner",
    workStatus: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: null,
    shop: { id: 16, publicId: "shop0000000016", name: "LifeDance" }
  },
  ...overrides
});

const setup = () => {
  const repository: jest.Mocked<TechnicianShopAffiliationRepositoryPort> = {
    listCurrentShopEmployees: jest.fn().mockResolvedValue({
      list: [employee()],
      total: 1,
      page: 1,
      page_size: 20
    }),
    findCurrentShopEmployee: jest.fn().mockResolvedValue(employee()),
    listCurrentShopEmployeeTimeline: jest.fn().mockResolvedValue({
      list: [
        {
          id: "audit-501",
          at: "2026-08-28T15:43:00.000Z",
          actorName: "LifeDance 管理员",
          actorAvatarUrl: "/admin-avatar.png",
          actorRole: "基本资料",
          message: "更新了姓名、城市",
          tone: "accent" as const
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    }),
    listCurrentShopEmployeeSchedule: jest.fn().mockResolvedValue([
      {
        projectionId: "busy-redacted:2026-08-29T13:00:00.000Z:2026-08-29T15:00:00.000Z",
        kind: "busy_redacted",
        visibility: "busy_redacted",
        status: "busy",
        startsAt: "2026-08-29T13:00:00.000Z",
        endsAt: "2026-08-29T15:00:00.000Z",
        title: "其他店铺已有确认安排",
        isClickable: false,
        isEditable: false
      }
    ]),
    updateCurrentShopEmployeeProfile: jest.fn().mockResolvedValue(employee()),
    upsertCurrentAffiliation: jest.fn().mockResolvedValue(employee())
  };
  const identifierResolver = { resolve: jest.fn().mockResolvedValue(identifier()) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TechnicianShopAffiliationService(repository, identifierResolver, audit);
  return { service, repository, identifierResolver, audit };
};

describe("TechnicianShopAffiliationService", () => {
  const context = { ip: "127.0.0.1", userAgent: "jest" };

  it("lists only the authenticated shop and keeps filters out of audit metadata", async () => {
    const { service, repository, audit } = setup();

    await expect(
      service.listCurrentShopEmployees(actorForShop(16), context, {
        page: 1,
        pageSize: 20,
        keyword: "山本",
        relationshipType: "partner",
        workStatus: "active"
      })
    ).resolves.toMatchObject({ total: 1 });

    expect(repository.listCurrentShopEmployees).toHaveBeenCalledWith({
      shopId: 16,
      page: 1,
      pageSize: 20,
      keyword: "山本",
      relationshipType: "partner",
      workStatus: "active"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_affiliation.list",
        metadata: { shopId: 16 }
      })
    );
  });

  it("rejects identities that are not scoped to one shop", async () => {
    const { service, repository } = setup();

    await expect(
      service.listCurrentShopEmployees(
        actorForShop(16, {
          currentIdentityScopeType: "global",
          currentIdentityScopeId: null
        }),
        context,
        {}
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403
    });
    expect(repository.listCurrentShopEmployees).not.toHaveBeenCalled();
  });

  it("resolves detail through the canonical technician public identifier", async () => {
    const { service, repository, identifierResolver } = setup();

    await expect(
      service.getCurrentShopEmployee(actorForShop(16), context, "s0000000047")
    ).resolves.toMatchObject({ needoId: "s0000000047" });

    expect(identifierResolver.resolve).toHaveBeenCalledWith("s0000000047");
    expect(repository.findCurrentShopEmployee).toHaveBeenCalledWith(16, 77);
  });

  it("returns a NeeDoID-scoped schedule projection without cross-shop details", async () => {
    const { service, repository, identifierResolver, audit } = setup();
    const input = {
      from: new Date("2026-08-25T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
      view: "week" as const
    };

    await expect(
      service.getCurrentShopEmployeeSchedule(actorForShop(16), context, "s0000000047", input)
    ).resolves.toEqual({
      employee: {
        needoId: "s0000000047",
        displayName: "山本 太郎",
        avatarUrl: null,
        relationshipType: "partner",
        workStatus: "active"
      },
      range: {
        from: "2026-08-25T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        view: "week"
      },
      events: [
        expect.objectContaining({
          kind: "busy_redacted",
          title: "其他店铺已有确认安排",
          isClickable: false,
          isEditable: false
        })
      ]
    });
    expect(identifierResolver.resolve).toHaveBeenCalledWith("s0000000047");
    expect(repository.listCurrentShopEmployeeSchedule).toHaveBeenCalledWith({
      shopId: 16,
      technicianIdentityId: 77,
      ...input
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_schedule.read",
        metadata: { eventCount: 1, shopId: 16 }
      })
    );
  });

  it("returns only the current shop employee result timeline without writing a read audit", async () => {
    const { service, repository, audit } = setup();

    await expect(
      service.getCurrentShopEmployeeTimeline(actorForShop(16), "s0000000047", {
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [{ actorRole: "基本资料", message: "更新了姓名、城市" }],
      total: 1
    });

    expect(repository.listCurrentShopEmployeeTimeline).toHaveBeenCalledWith({
      affiliationId: 31,
      page: 1,
      pageSize: 20,
      shopId: 16
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("persists an employee timeline comment as a scoped audit event", async () => {
    const { service, audit } = setup();

    await expect(
      service.addCurrentShopEmployeeTimelineComment(
        actorForShop(16),
        context,
        "s0000000047",
        "已与员工确认本月现金结算。"
      )
    ).resolves.toEqual({ created: true });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_timeline.comment",
        targetType: "technician_shop_affiliation",
        targetId: 31,
        metadata: { message: "已与员工确认本月现金结算。", shopId: 16 }
      })
    );
  });

  it("uses the same safe 404 for a wrong identifier kind or out-of-shop employee", async () => {
    const wrongKind = setup();
    wrongKind.identifierResolver.resolve.mockResolvedValue(
      identifier({ kind: "U", publicId: "u0000000047" })
    );
    const outOfShop = setup();
    outOfShop.repository.findCurrentShopEmployee.mockResolvedValue(null);

    await expect(
      wrongKind.service.getCurrentShopEmployee(actorForShop(16), context, "u0000000047")
    ).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      message: "error.technician_affiliation.not_found",
      statusCode: 404
    });
    await expect(
      outOfShop.service.getCurrentShopEmployee(actorForShop(16), context, "s0000000047")
    ).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      statusCode: 404
    });
  });

  it("updates the current shop relationship and writes non-sensitive audit evidence", async () => {
    const { service, repository, audit } = setup();
    const input = {
      relationshipType: "partner" as const,
      workStatus: "active" as const,
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: null
    };

    await expect(
      service.upsertCurrentShopAffiliation(actorForShop(16), context, "s0000000047", input)
    ).resolves.toMatchObject({ affiliation: { id: 31 } });

    expect(repository.upsertCurrentAffiliation).toHaveBeenCalledWith({
      shopId: 16,
      technicianIdentityId: 77,
      actorUserId: 86,
      ...input
    });
    const auditInput = audit.record.mock.calls[0][0];
    expect(auditInput).toMatchObject({
      action: "merchant_admin.employee_affiliation.update",
      targetType: "technician_shop_affiliation",
      targetId: 31,
      metadata: {
        shopId: 16,
        relationshipType: "partner",
        workStatus: "active"
      }
    });
    expect(JSON.stringify(auditInput.metadata)).not.toContain("s0000000047");
    expect(JSON.stringify(auditInput.metadata)).not.toContain("山本");
  });

  it("updates the scoped employee profile and audits only changed field names", async () => {
    const { service, repository, audit, identifierResolver } = setup();
    const input = {
      displayName: "斋藤 健太",
      bio: "整体与放松护理",
      city: "东京都涩谷区",
      serviceArea: "涩谷区、新宿区",
      yearsExperience: 9
    };

    await expect(
      service.updateCurrentShopEmployeeProfile(actorForShop(16), context, "s0000000047", input)
    ).resolves.toMatchObject({ needoId: "s0000000047" });

    expect(identifierResolver.resolve).toHaveBeenCalledWith("s0000000047");
    expect(repository.updateCurrentShopEmployeeProfile).toHaveBeenCalledWith({
      shopId: 16,
      technicianIdentityId: 77,
      actorUserId: 86,
      profile: input
    });
    const auditInput = audit.record.mock.calls[0][0];
    expect(auditInput).toMatchObject({
      action: "merchant_admin.employee_profile.update",
      targetType: "technician_shop_affiliation",
      targetId: 31,
      metadata: {
        shopId: 16,
        changedFields: ["bio", "city", "displayName", "serviceArea", "yearsExperience"]
      }
    });
    expect(JSON.stringify(auditInput.metadata)).not.toContain("斋藤");
    expect(JSON.stringify(auditInput.metadata)).not.toContain("涩谷");
  });

  it("returns the safe employee 404 when a scoped profile update cannot find the affiliation", async () => {
    const { service, repository } = setup();
    repository.updateCurrentShopEmployeeProfile.mockResolvedValue(null);

    await expect(
      service.updateCurrentShopEmployeeProfile(actorForShop(16), context, "s0000000047", {
        city: "东京都港区"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      statusCode: 404
    });
  });

  it("maps repository conflicts to one non-leaking 409", async () => {
    const { service, repository } = setup();
    repository.upsertCurrentAffiliation.mockResolvedValue("exclusive_conflict");

    await expect(
      service.upsertCurrentShopAffiliation(actorForShop(16), context, "s0000000047", {
        relationshipType: "exclusive",
        workStatus: "active",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: null
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_CONFLICT,
      message: "error.technician_affiliation.exclusive_conflict",
      statusCode: 409
    });
  });

  it("forbids writes from a read-only merchant preview", async () => {
    const { service, repository } = setup();

    await expect(
      service.upsertCurrentShopAffiliation(
        actorForShop(16, {
          isReadOnlyMerchantPreview: true,
          merchantPreviewShopId: 16
        }),
        context,
        "s0000000047",
        {
          relationshipType: "partner",
          workStatus: "active",
          startsAt: new Date("2026-08-01T00:00:00.000Z"),
          endsAt: null
        }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repository.upsertCurrentAffiliation).not.toHaveBeenCalled();

    await expect(
      service.updateCurrentShopEmployeeProfile(
        actorForShop(16, {
          isReadOnlyMerchantPreview: true,
          merchantPreviewShopId: 16
        }),
        context,
        "s0000000047",
        { city: "东京都港区" }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repository.updateCurrentShopEmployeeProfile).not.toHaveBeenCalled();
  });
});
