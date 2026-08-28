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
  });
});
