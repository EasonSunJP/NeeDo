import {
  LIFEDANCE_ADMIN2_PLAN,
  assertLocalAdmin2ProvisioningTarget,
  selectAdmin2FriendTargets
} from "../src/simulation/lifedance-admin2-provisioning";

describe("LifeDance admin2 provisioning plan", () => {
  it("keeps the requested fixed account, NeeDo ID, shop, identities, and friend count", () => {
    expect(LIFEDANCE_ADMIN2_PLAN).toMatchObject({
      email: "admin2@lifedance.com",
      needoId: "needo0000000002",
      numberPart: "0000000002",
      shopName: "麻布十番超级按摩",
      friendCount: 20,
      identityTypes: [
        "platform",
        "customer",
        "technician",
        "merchant_owner",
        "merchant_organization",
        "scout"
      ],
      roleCodes: ["admin", "customer", "technician", "merchant_owner", "scout"]
    });
  });

  it("selects exactly 20 stable formal simulation accounts and excludes admin accounts", () => {
    const candidates = [
      { id: 99, email: "admin@lifedance.com", needoId: "needo0000000001" },
      { id: 100, email: "admin2@lifedance.com", needoId: "needo0000000002" },
      ...Array.from({ length: 24 }, (_, index) => ({
        id: index + 1,
        email: `sim.customer.${String(24 - index).padStart(3, "0")}@needo.local`,
        needoId: `u${String(index + 10).padStart(10, "0")}`
      })),
      { id: 200, email: "ordinary@example.com", needoId: "u9999999999" }
    ];

    const selected = selectAdmin2FriendTargets(candidates);

    expect(selected).toHaveLength(20);
    expect(selected.map((candidate) => candidate.email)).toEqual(
      Array.from({ length: 20 }, (_, index) =>
        `sim.customer.${String(index + 1).padStart(3, "0")}@needo.local`
      )
    );
  });

  it("fails closed when fewer than 20 formal simulation accounts exist", () => {
    expect(() =>
      selectAdmin2FriendTargets([
        { id: 1, email: "sim.customer.001@needo.local", needoId: "u0000000001" }
      ])
    ).toThrow("20 active formal simulation accounts");
  });

  it("allows only an explicit local needo_dev MySQL target", () => {
    expect(() =>
      assertLocalAdmin2ProvisioningTarget({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
      })
    ).not.toThrow();

    for (const target of [
      {
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        DATABASE_URL: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
      },
      {
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:secret@db.example.com:3306/needo_dev"
      },
      {
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:secret@127.0.0.1:3307/needo_prod"
      }
    ]) {
      expect(() => assertLocalAdmin2ProvisioningTarget(target)).toThrow(
        "local needo_dev"
      );
    }
  });
});
