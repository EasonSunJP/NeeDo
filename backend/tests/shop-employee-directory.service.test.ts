import { ERROR_CODES } from "../src/constants/error-codes";
import {
  ShopEmployeeDirectoryService,
  type ShopEmployeeDirectoryItem,
  type ShopEmployeeDirectoryRepositoryPort
} from "../src/services/shop-employee-directory.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actorForShop = (
  shopId: number,
  overrides: Partial<AuthenticatedAccessContext> = {}
): AuthenticatedAccessContext => ({
  userId: 86,
  email: "merchant@example.com",
  accessTokenJti: "merchant-directory-token",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 12,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: shopId,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:employee-affiliation:read"],
  ...overrides
});

const directoryItem = (): ShopEmployeeDirectoryItem => ({
  needoId: "u0000000047",
  displayName: "斋藤 花子",
  avatarUrl: null,
  email: "staff@example.com",
  phone: null,
  status: "active",
  startsAt: "2026-08-28T00:00:00.000Z",
  endsAt: null,
  roles: [
    {
      code: "TECHNICIAN",
      names: {
        zhHans: "技师",
        zhHant: "技師",
        ja: "技術者",
        en: "Technician",
        ko: "기술자"
      },
      isTechnicianRole: true
    }
  ],
  technician: {
    needoId: "s0000000047",
    relationshipType: "partner",
    workStatus: "active"
  }
});

const setup = () => {
  const repository: jest.Mocked<ShopEmployeeDirectoryRepositoryPort> = {
    listCurrentShopEmployees: jest.fn().mockResolvedValue({
      list: [directoryItem()],
      total: 1,
      page: 2,
      page_size: 30
    })
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    audit,
    repository,
    service: new ShopEmployeeDirectoryService(repository, audit)
  };
};

describe("ShopEmployeeDirectoryService", () => {
  const context = { ip: "127.0.0.1", userAgent: "jest" };

  it("uses only the authenticated shop scope and records a privacy-safe audit", async () => {
    const { audit, repository, service } = setup();
    const input = {
      page: 2,
      pageSize: 30,
      keyword: "斋藤",
      status: "active" as const,
      roleCode: "TECHNICIAN"
    };

    await expect(
      service.listCurrentShopEmployees(actorForShop(16), context, input)
    ).resolves.toEqual({
      list: [directoryItem()],
      total: 1,
      page: 2,
      page_size: 30
    });

    expect(repository.listCurrentShopEmployees).toHaveBeenCalledWith({ shopId: 16, ...input });
    expect(audit.record).toHaveBeenCalledWith({
      actor: actorForShop(16),
      action: "merchant_admin.employee_directory.list",
      targetType: "shop_employee",
      context,
      metadata: { shopId: 16 }
    });
  });

  it("rejects an identity without a selected shop before repository access", async () => {
    const { audit, repository, service } = setup();

    await expect(
      service.listCurrentShopEmployees(
        actorForShop(16, {
          currentIdentityScopeType: "global",
          currentIdentityScopeId: null
        }),
        context,
        {}
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });

    expect(repository.listCurrentShopEmployees).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
