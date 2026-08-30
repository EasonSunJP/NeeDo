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
      visibility: "network"
    })).toMatchObject({ displayName: "田中 彩", visibility: "network" });
  });

  it.each([
    {},
    { unexpected: true },
    { age: 151 },
    { heightCm: 299 },
    { languages: [] },
    { serviceAreas: [] },
    { bidBudgetMinJpy: 20_000, bidBudgetMaxJpy: 10_000 },
    { paymentMethods: ["crypto"] },
    { visibility: "friends" },
    { avatarDataUrl: "data:text/plain;base64,SGVsbG8=" }
  ])("rejects an invalid self-edit payload: %o", (body) => {
    expect(() => technicianProfileUpdateBodySchema.parse(body)).toThrow();
  });
});
