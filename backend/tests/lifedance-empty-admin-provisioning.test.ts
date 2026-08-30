import {
  LIFEDANCE_EMPTY_ADMIN_PLANS,
  LIFEDANCE_EMPTY_ADMIN_TEST_NDP,
  OPERATOR_U_IDENTIFIER_REPAIR,
  assertLocalEmptyAdminProvisioningTarget,
  getEmptyAdminWalletTopUpAmount,
  resolveSharedTestAccountPassword,
  selectEmptyAdminAccountCandidate
} from "../src/simulation/lifedance-empty-admin-provisioning";
import { TEST_USER_ACCOUNTS } from "../src/constants/test-login.constants";

describe("LifeDance empty admin test-account provisioning", () => {
  it("defines the three requested fixed company accounts without business fixtures", () => {
    expect(LIFEDANCE_EMPTY_ADMIN_PLANS).toEqual([
      {
        email: "adminb@lifedance.com",
        needoId: "needo0000000003",
        numberPart: "0000000003",
        displayName: "LifeDance 管理员 B"
      },
      {
        email: "adminc@lifedance.com",
        needoId: "needo0000000004",
        numberPart: "0000000004",
        displayName: "LifeDance 管理员 C"
      },
      {
        email: "admind@lifedance.com",
        needoId: "needo0000000005",
        numberPart: "0000000005",
        displayName: "LifeDance 管理员 D"
      }
    ]);
    expect(LIFEDANCE_EMPTY_ADMIN_TEST_NDP).toBe(100_000);
  });

  it("uses the shared test password and falls back to the local admin password", () => {
    expect(resolveSharedTestAccountPassword({ TEST_USER_DEFAULT_PASSWORD: " shared-pass " })).toBe(
      "shared-pass"
    );
    expect(
      resolveSharedTestAccountPassword({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ADMIN_DEFAULT_PASSWORD: " local-shared-pass "
      })
    ).toBe("local-shared-pass");
    expect(() =>
      resolveSharedTestAccountPassword({
        NODE_ENV: "production",
        DEPLOY_ENV: "staging",
        ADMIN_DEFAULT_PASSWORD: "admin-only-pass"
      })
    ).toThrow("TEST_USER_DEFAULT_PASSWORD is required");
    expect(() => resolveSharedTestAccountPassword({})).toThrow(
      "TEST_USER_DEFAULT_PASSWORD or local ADMIN_DEFAULT_PASSWORD is required"
    );
  });

  it("tops up to 100,000 TestNDP without duplicating balance on repeat runs", () => {
    expect(getEmptyAdminWalletTopUpAmount(0)).toBe(100_000);
    expect(getEmptyAdminWalletTopUpAmount(25_000)).toBe(75_000);
    expect(getEmptyAdminWalletTopUpAmount(100_000)).toBe(0);
    expect(getEmptyAdminWalletTopUpAmount(120_000)).toBe(0);
  });

  it("fails closed when an email or fixed identifier belongs to another account", () => {
    const plan = LIFEDANCE_EMPTY_ADMIN_PLANS[0];
    expect(selectEmptyAdminAccountCandidate(plan, [])).toBeNull();
    expect(
      selectEmptyAdminAccountCandidate(plan, [
        {
          id: 900,
          email: plan.email,
          needoId: plan.needoId,
          accountNo: plan.numberPart
        }
      ])
    ).toMatchObject({ id: 900 });
    expect(() =>
      selectEmptyAdminAccountCandidate(plan, [
        {
          id: 900,
          email: plan.email,
          needoId: "needo9999999999",
          accountNo: "9999999999"
        }
      ])
    ).toThrow("belongs to a different fixed account");
    expect(() =>
      selectEmptyAdminAccountCandidate(plan, [
        {
          id: 900,
          email: plan.email,
          needoId: plan.needoId,
          accountNo: plan.numberPart
        },
        {
          id: 901,
          email: "different@example.com",
          needoId: plan.needoId,
          accountNo: plan.numberPart
        }
      ])
    ).toThrow("email and identifier belong to different users");
  });

  it("repairs the operator account to the same-number U identifier", () => {
    expect(OPERATOR_U_IDENTIFIER_REPAIR).toEqual({
      email: "operator@example.com",
      numberPart: "7073340315",
      previousPublicId: "needo7073340315",
      publicId: "u7073340315"
    });
    expect(
      TEST_USER_ACCOUNTS.find((account) => account.email === "operator@example.com")
    ).toMatchObject({ primaryIdentifierKind: "U" });
    expect(
      TEST_USER_ACCOUNTS.find((account) => account.email === "admin@lifedance.com")
    ).toMatchObject({ primaryIdentifierKind: "NEEDO" });
  });

  it("allows mutations only against explicit local needo_dev MySQL", () => {
    expect(() =>
      assertLocalEmptyAdminProvisioningTarget({
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
      expect(() => assertLocalEmptyAdminProvisioningTarget(target)).toThrow("local needo_dev");
    }
  });
});
