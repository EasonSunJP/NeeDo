import { merchantProfileUpdateBodySchema } from "../src/validators/merchant-profile.validator";

describe("merchant profile validator", () => {
  it("accepts the user-card fields and intentionally empty language lists", () => {
    expect(merchantProfileUpdateBodySchema.parse({
      displayName: "Misaki",
      gender: "female",
      age: 29,
      heightCm: 163,
      languages: [],
      bio: "店铺负责人",
      visibility: "network"
    })).toMatchObject({ languages: [], visibility: "network" });
  });

  it("rejects an empty patch and unknown shop fields", () => {
    expect(() => merchantProfileUpdateBodySchema.parse({})).toThrow();
    expect(() => merchantProfileUpdateBodySchema.parse({ shopName: "不可写入个人卡" })).toThrow();
  });
});
