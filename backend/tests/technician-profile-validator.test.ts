import { technicianProfileUpdateBodySchema } from "../src/validators/technician-profile.validator";

describe("technician profile self-edit validation", () => {
  it("accepts the complete public self-edit payload", () => {
    expect(technicianProfileUpdateBodySchema.parse({
      displayName: "田中 彩",
      age: 28,
      heightCm: 164,
      languages: ["日本語", "中文"],
      bio: "肩颈护理与睡眠放松。",
      serviceAreas: ["銀座", "新宿"],
      profileTags: ["肩颈调理", "深层舒缓"],
      canServeForeigners: true,
      bidBudgetMinJpy: 12_000,
      bidBudgetMaxJpy: 28_000,
      paymentMethods: ["platform", "offline", "cash", "paypay"],
      serviceBase: { latitude: 35.6762, longitude: 139.6503 },
      visibility: "network"
    })).toMatchObject({ displayName: "田中 彩", visibility: "network" });
  });

  it("accepts a complete service-base coordinate pair or an explicit clear", () => {
    expect(
      technicianProfileUpdateBodySchema.parse({
        serviceBase: { latitude: -90, longitude: 180 }
      })
    ).toEqual({ serviceBase: { latitude: -90, longitude: 180 } });
    expect(technicianProfileUpdateBodySchema.parse({ serviceBase: null })).toEqual({
      serviceBase: null
    });
  });

  it("accepts intentionally cleared optional list fields", () => {
    expect(technicianProfileUpdateBodySchema.parse({
      languages: [],
      serviceAreas: [],
      profileTags: [],
      paymentMethods: []
    })).toEqual({
      languages: [],
      serviceAreas: [],
      profileTags: [],
      paymentMethods: []
    });
  });

  it.each([
    {},
    { unexpected: true },
    { age: 151 },
    { heightCm: 299 },
    { bidBudgetMinJpy: 20_000, bidBudgetMaxJpy: 10_000 },
    { paymentMethods: ["crypto"] },
    { visibility: "friends" },
    { avatarDataUrl: "data:text/plain;base64,SGVsbG8=" },
    { serviceBase: { latitude: 35.6762 } },
    { serviceBase: { longitude: 139.6503 } },
    { serviceBase: { latitude: 90.0001, longitude: 139.6503 } },
    { serviceBase: { latitude: 35.6762, longitude: -180.0001 } }
  ])("rejects an invalid self-edit payload: %o", (body) => {
    expect(() => technicianProfileUpdateBodySchema.parse(body)).toThrow();
  });
});
