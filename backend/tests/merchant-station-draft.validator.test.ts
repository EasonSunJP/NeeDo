import { createMerchantApplicationBodySchema, updateMerchantShowcaseBodySchema } from "../src/validators/identity-application.validator";

describe.each([
  ["create", createMerchantApplicationBodySchema.shape.showcaseDraft],
  ["update", updateMerchantShowcaseBodySchema.shape.showcaseDraft]
] as const)("%s merchant station draft", (_name, schema) => {
  it("normalizes station access while retaining existing showcase fields", () => {
    expect(schema.parse({ nearestStation: "  新宿駅 南口  ", stationAccess: "  徒歩5分  ", description: "店舗紹介" })).toEqual({
      nearestStation: "新宿駅 南口", stationAccess: "徒歩5分", description: "店舗紹介"
    });
    expect(schema.parse({ description: "旧草稿" })).toEqual({ description: "旧草稿" });
  });

  it.each([
    { stationTravelMinutes: -1 },
    { stationTravelMinutes: 1.5 },
    { stationTravelMinutes: "5" },
    { nearestStation: 42 },
    { nearestStation: "駅".repeat(161) },
    { stationAccess: {} },
    { stationAccess: "歩".repeat(256) }
  ])("rejects invalid station fields: %j", (draft) => {
    expect(schema.safeParse(draft).success).toBe(false);
  });
});
