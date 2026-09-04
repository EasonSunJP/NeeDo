import {
  LIFEDANCE_ADMIN2_PLAN,
  assertLocalAdmin2ProvisioningTarget,
  buildLifeDanceAdmin2BookingSlotStarts,
  buildLifeDanceAdmin2UserData,
  calibrateLifeDanceAdmin2TestNdp,
  resolveLifeDanceAdmin2Password,
  selectAdmin2AccountCandidate,
  selectAdmin2FriendTargets
} from "../src/simulation/lifedance-admin2-provisioning";

describe("LifeDance admin2 provisioning plan", () => {
  it("keeps the requested fixed account, NeeDo ID, shop, identities, and friend count", () => {
    expect(LIFEDANCE_ADMIN2_PLAN).toMatchObject({
      email: "admina@lifedance.com",
      legacyEmails: ["admin2@lifedance.com"],
      needoId: "needo0000000002",
      numberPart: "0000000002",
      shopName: "麻布十番超级按摩",
      bookingService: {
        categoryCode: "wellness",
        name: "麻布十番ボディケア 60分",
        priceAmount: "8800.00",
        durationMinutes: 60
      },
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

  it("builds a deterministic seven-day JST booking horizon with two slots per day", () => {
    const slots = buildLifeDanceAdmin2BookingSlotStarts(new Date("2026-09-02T09:00:00.000Z"));

    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({
      startsAt: new Date("2026-09-03T01:00:00.000Z"),
      endsAt: new Date("2026-09-03T02:00:00.000Z")
    });
    expect(slots[1]).toEqual({
      startsAt: new Date("2026-09-03T05:00:00.000Z"),
      endsAt: new Date("2026-09-03T06:00:00.000Z")
    });
    expect(slots[13]).toEqual({
      startsAt: new Date("2026-09-09T05:00:00.000Z"),
      endsAt: new Date("2026-09-09T06:00:00.000Z")
    });
  });

  it("marks the local account as test and calibrates it once after provisioning", async () => {
    expect(buildLifeDanceAdmin2UserData("password-hash", 4)).toMatchObject({
      isTestAccount: true,
      passwordHash: "password-hash",
      sessionGeneration: 4
    });
    const service = { calibrateUser: jest.fn(async () => ({ status: "applied" })) };

    await calibrateLifeDanceAdmin2TestNdp(787, service as never);

    expect(service.calibrateUser).toHaveBeenCalledTimes(1);
    expect(service.calibrateUser).toHaveBeenCalledWith(787);
  });

  it("selects the legacy email account for an in-place canonical rename", () => {
    expect(
      selectAdmin2AccountCandidate([
        {
          id: 787,
          email: "admin2@lifedance.com",
          needoId: "needo0000000002",
          accountNo: "0000000002",
          sessionGeneration: 0
        }
      ])
    ).toEqual({
      id: 787,
      email: "admin2@lifedance.com",
      needoId: "needo0000000002",
      accountNo: "0000000002",
      sessionGeneration: 0
    });
  });

  it("fails closed when canonical and legacy emails belong to different users", () => {
    expect(() =>
      selectAdmin2AccountCandidate([
        {
          id: 787,
          email: "admin2@lifedance.com",
          needoId: "needo0000000002",
          accountNo: "0000000002",
          sessionGeneration: 0
        },
        {
          id: 900,
          email: "admina@lifedance.com",
          needoId: "needo0000000900",
          accountNo: "0000000900",
          sessionGeneration: 0
        }
      ])
    ).toThrow("canonical and legacy emails belong to different users");
  });

  it("fails closed when the canonical email belongs to a different fixed account", () => {
    expect(() =>
      selectAdmin2AccountCandidate([
        {
          id: 900,
          email: "admina@lifedance.com",
          needoId: "needo0000000900",
          accountNo: "0000000900",
          sessionGeneration: 0
        }
      ])
    ).toThrow("email belongs to a different fixed account");
  });

  it("requires the dedicated admin2 password without falling back to shared test credentials", () => {
    expect(
      resolveLifeDanceAdmin2Password({
        LIFEDANCE_ADMIN2_PASSWORD: " Dedicated.Admin2.Password.2026! ",
        TEST_USER_DEFAULT_PASSWORD: "Shared.Password.2026!"
      })
    ).toBe("Dedicated.Admin2.Password.2026!");

    expect(() =>
      resolveLifeDanceAdmin2Password({ TEST_USER_DEFAULT_PASSWORD: "Shared.Password.2026!" })
    ).toThrow("LIFEDANCE_ADMIN2_PASSWORD is required");
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
      Array.from(
        { length: 20 },
        (_, index) => `sim.customer.${String(index + 1).padStart(3, "0")}@needo.local`
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
      expect(() => assertLocalAdmin2ProvisioningTarget(target)).toThrow("local needo_dev");
    }
  });
});
