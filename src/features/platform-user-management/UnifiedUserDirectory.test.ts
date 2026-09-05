import { describe, expect, it } from "vitest";
import { canonicalTopFilterQuery, userDirectoryQuery } from "./UnifiedUserDirectory";

describe("unified user directory query", () => {
  it("keeps registered date filters and normalizes legacy single filters", () => {
    const query = userDirectoryQuery(new URLSearchParams([
      ["tier", "gold"],
      ["identityType", "customer"],
      ["state", "active"],
      ["ekyc", "verified"],
      ["registeredFrom", "2026-09-01T00:00:00.000Z"],
      ["registeredTo", "2026-09-30T23:59:59.999Z"]
    ]));

    expect(query).toMatchObject({
      tiers: ["gold"],
      identityTypes: ["customer"],
      states: ["active"],
      ekycStates: ["verified"],
      registeredFrom: "2026-09-01T00:00:00.000Z",
      registeredTo: "2026-09-30T23:59:59.999Z"
    });
    expect(query).not.toHaveProperty("tier");
    expect(query).not.toHaveProperty("identityType");
    expect(query).not.toHaveProperty("state");
    expect(query).not.toHaveProperty("ekyc");
  });

  it("maps top filters onto the same multi-value fields as table headers", () => {
    expect(canonicalTopFilterQuery(
      { page: 4, tiers: ["silver"], states: ["inactive"] },
      { keyword: " Mia ", tier: "gold", identityType: "customer", state: "active", ekyc: "verified" }
    )).toMatchObject({
      page: 1,
      keyword: "Mia",
      tiers: ["gold"],
      identityTypes: ["customer"],
      states: ["active"],
      ekycStates: ["verified"]
    });
  });
});
