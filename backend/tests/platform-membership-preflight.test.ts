import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLegacyMembershipPreflightReport,
  classifyLegacyMembership
} from "../scripts/preflight-platform-membership-values";

describe("platform membership legacy-value preflight", () => {
  it.each([
    ["standard", "free"],
    ["free", "free"],
    ["SILVER", "silver"],
    ["gold", "gold"],
    ["black", "black_diamond"],
    ["黑卡", "black_diamond"],
    ["黑钻", "black_diamond"]
  ] as const)("classifies %s as %s", (value, tierCode) => {
    expect(classifyLegacyMembership(value)).toEqual({ status: "known", tierCode });
  });

  it("retains a safe unknown value so migration can be blocked", () => {
    expect(classifyLegacyMembership(" vip-plus ")).toEqual({
      status: "unknown",
      value: "vip-plus"
    });
  });

  it("reports only public NeeDo identifiers and unknown membership values", () => {
    expect(
      buildLegacyMembershipPreflightReport([
        { publicUserId: "u0000000001", membershipLevel: "gold" },
        { publicUserId: "u0000000002", membershipLevel: "vip-plus" }
      ])
    ).toEqual({
      ready: false,
      scannedCount: 2,
      unknownValues: [{ publicUserId: "u0000000002", value: "vip-plus" }]
    });
  });

  it("exposes a read-only preflight command", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["membership:preflight"]).toBe(
      "tsx scripts/preflight-platform-membership-values.ts"
    );
  });
});
