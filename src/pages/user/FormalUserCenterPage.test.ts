import { describe, expect, it } from "vitest";
import formalSource from "./FormalUserCenterPage.tsx?raw";
import centerSource from "./UserCenterPage.tsx?raw";

describe("formal customer center", () => {
  it("routes authenticated customer identities into the API-backed center", () => {
    expect(centerSource).toContain("<FormalUserCenterPage customerProfileId={session.currentIdentity.scopeId}");
    expect(formalSource).toContain("coreReadApi.getCustomerProfile(customerProfileId)");
    expect(formalSource).toContain("walletApi.getMyWallet()");
    expect(formalSource).not.toContain("../../data/mock");
    expect(formalSource).not.toContain("entityStore");
  });

  it("derives each reservation count from a status-filtered paginated API total", () => {
    expect(formalSource).toContain("bookingApi.listOrders({ page: 1, pageSize: 1, status })");
    expect(formalSource).toContain('"pending"');
    expect(formalSource).toContain('"confirmed"');
    expect(formalSource).toContain('"inService"');
    expect(formalSource).toContain('"completed"');
    expect(formalSource).toContain('"cancelled"');
  });

  it("has explicit loading, retry, profile, wallet, and order states", () => {
    expect(formalSource).toContain("正在加载我的正式数据");
    expect(formalSource).toContain("重新加载我的数据");
    expect(formalSource).toContain("NDP 可用余额");
    expect(formalSource).toContain("冻结余额");
    expect(formalSource).toContain("我的正式预约");
  });
});
