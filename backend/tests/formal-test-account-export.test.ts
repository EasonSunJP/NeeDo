import {
  buildFormalTestAccountExportRow,
  orderFormalTestAccountExports
} from "../src/simulation/formal-test-account-export";

describe("formal test account export", () => {
  const accounts = [
    {
      accountType: "customer",
      displayName: "望月 結菜",
      email: "customer@example.com",
      needoId: "n0000000024"
    },
    {
      accountType: "admin",
      displayName: "LifeDance 管理员",
      email: "admin@lifedance.com",
      needoId: "n0000000001"
    },
    {
      accountType: "technician",
      displayName: "橘 ひかり",
      email: "technician@example.com",
      needoId: "n0000000018"
    },
    {
      accountType: "merchant_owner",
      displayName: "青山プライベートケア Lino 公式受付",
      email: "merchant@example.com",
      needoId: "n0000000012"
    }
  ];

  it("exports the persisted immutable NeeDo ID", () => {
    const rows = accounts.map((account) =>
      buildFormalTestAccountExportRow(account, "ExportFixturePassword-2026!")
    );

    expect(rows.map((row) => row.needoId)).toEqual([
      "n0000000024",
      "n0000000001",
      "n0000000018",
      "n0000000012"
    ]);
    expect(rows.every((row) => /^n\d{10}$/.test(row.needoId))).toBe(true);
  });

  it("rejects a non-immutable NeeDo ID instead of exporting a legacy formatter value", () => {
    expect(() =>
      buildFormalTestAccountExportRow(
        {
          ...accounts[0],
          needoId: "u0000000003"
        },
        "ExportFixturePassword-2026!"
      )
    ).toThrow("NeeDo ID must match n plus ten digits");
  });

  it("labels and places the operations super administrator first", () => {
    const rows = orderFormalTestAccountExports(
      accounts.map((account) => buildFormalTestAccountExportRow(account, "ExportFixturePassword-2026!"))
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        accountType: "运营后台超级管理员",
        email: "admin@lifedance.com",
        password: "ExportFixturePassword-2026!"
      })
    );
  });
});
