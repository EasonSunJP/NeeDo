import {
  buildFormalTestAccountExportRow,
  orderFormalTestAccountExports,
  resolveFormalNeeDoSequence
} from "../src/simulation/formal-test-account-export";

describe("formal test account export", () => {
  const accounts = [
    {
      accountType: "customer",
      displayName: "望月 結菜",
      email: "customer@example.com",
      socialType: "user" as const,
      identityScopeId: 3,
      userId: 24
    },
    {
      accountType: "admin",
      displayName: "神谷 俊介",
      email: "admin@example.com",
      socialType: "user" as const,
      userId: 1
    },
    {
      accountType: "technician",
      displayName: "橘 ひかり",
      email: "technician@example.com",
      socialType: "technician" as const,
      identityScopeId: 8,
      userId: 18
    },
    {
      accountType: "merchant_owner",
      displayName: "青山プライベートケア Lino 公式受付",
      email: "merchant@example.com",
      socialType: "shop" as const,
      identityScopeId: 4,
      userId: 12
    }
  ];

  it("uses the canonical lowercase prefix plus ten-digit NeeDoID format", () => {
    const rows = accounts.map((account) =>
      buildFormalTestAccountExportRow(account, "needotest")
    );

    expect(rows.map((row) => row.needoId)).toEqual([
      "u0000000003",
      "u0000000001",
      "b0000000008",
      "s0000000004"
    ]);
    expect(rows.every((row) => /^[ubs]\d{10}$/.test(row.needoId))).toBe(true);
  });

  it("labels and places the operations super administrator first", () => {
    const rows = orderFormalTestAccountExports(
      accounts.map((account) => buildFormalTestAccountExportRow(account, "needotest"))
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        accountType: "运营后台超级管理员",
        email: "admin@example.com",
        password: "needotest"
      })
    );
  });

  it("uses a customer-profile identity for every account participating as a social user", () => {
    expect(
      resolveFormalNeeDoSequence("operator", "user", 33, [
        { scopeId: 112, scopeType: "customer_profile" },
        { scopeId: null, scopeType: "global" }
      ])
    ).toBe(112);
  });
});
