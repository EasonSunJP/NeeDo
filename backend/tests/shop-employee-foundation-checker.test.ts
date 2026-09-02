import {
  checkShopEmployeeFoundation,
  type ShopEmployeeFoundationCheckRepository,
  type ShopEmployeeFoundationCounts
} from "../scripts/check-shop-employee-foundation";

const counts = (
  overrides: Partial<ShopEmployeeFoundationCounts> = {}
): ShopEmployeeFoundationCounts => ({
  missingSystemRoles: 0,
  ownersWithoutEmployee: 0,
  techniciansWithoutEmployee: 0,
  invalidTechnicianAssignments: 0,
  orphanActiveEmployees: 0,
  ...overrides
});

const repository = (result: ShopEmployeeFoundationCounts): ShopEmployeeFoundationCheckRepository => ({
  countIssues: jest.fn().mockResolvedValue(result)
});

describe("shop employee foundation checker", () => {
  it("is ready only when every issue count is zero", async () => {
    await expect(checkShopEmployeeFoundation(repository(counts()))).resolves.toEqual({
      ready: true,
      counts: counts()
    });

    await expect(
      checkShopEmployeeFoundation(repository(counts({ techniciansWithoutEmployee: 2 })))
    ).resolves.toEqual({
      ready: false,
      counts: counts({ techniciansWithoutEmployee: 2 })
    });
  });

  it("rejects negative or non-integer repository counts", async () => {
    await expect(
      checkShopEmployeeFoundation(repository(counts({ orphanActiveEmployees: -1 })))
    ).rejects.toThrow("orphanActiveEmployees");

    await expect(
      checkShopEmployeeFoundation(repository(counts({ missingSystemRoles: 0.5 })))
    ).rejects.toThrow("missingSystemRoles");
  });

  it("returns aggregate counts without user or employee payloads", async () => {
    const report = await checkShopEmployeeFoundation(
      repository(counts({ ownersWithoutEmployee: 1, invalidTechnicianAssignments: 3 }))
    );
    const serialized = JSON.stringify(report);

    expect(Object.keys(report)).toEqual(["ready", "counts"]);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("username");
    expect(serialized).not.toContain("employees");
    expect(serialized).not.toContain("@needo");
  });
});
