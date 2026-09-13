import { BackofficeService } from "../src/services/backoffice.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const actor = {
  userId: 1,
  email: "admin@example.com",
  accessTokenJti: "finance-filter",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityType: "platform_admin",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["admin"],
  permissions: ["backoffice:finance:list"]
};

describe("BackofficeService finance filters", () => {
  it("resolves the current Tokyo week before querying the repository", async () => {
    const listFinanceSettlements = jest.fn(async () => ({
      list: [], total: 0, page: 1, page_size: 20
    }));
    const service = new BackofficeService(
      { listFinanceSettlements } as never,
      { record: jest.fn(async () => undefined) } as never,
      createDirectShopContextRepository(),
      () => new Date("2026-09-13T03:00:00.000Z")
    );

    await service.listPlatformFinance(
      actor,
      { ip: "127.0.0.1", userAgent: "jest" },
      {
        page: 1,
        pageSize: 20,
        keyword: "51",
        status: "ready_for_payroll",
        period: "week",
        city: "東京都"
      } as never
    );

    expect(listFinanceSettlements).toHaveBeenCalledWith({
      scope: "platform",
      page: 1,
      pageSize: 20,
      keyword: "51",
      status: "ready_for_payroll",
      city: "東京都",
      from: new Date("2026-09-06T15:00:00.000Z"),
      to: new Date("2026-09-13T14:59:59.999Z")
    });
  });
});
