import { describe, expect, it } from "@jest/globals";
import { customerProfileUpdateBodySchema } from "../src/validators/customer-profile.validator";

describe("customer profile self-edit validation", () => {
  it("accepts the complete editable card payload", () => {
    expect(
      customerProfileUpdateBodySchema.parse({
        displayName: "松尾 雄大",
        gender: "private",
        age: 36,
        heightCm: 171,
        languages: ["日本語", "English"],
        bio: "日々の暮らしで見つけたお気に入りを紹介します。",
        visibility: "network"
      })
    ).toMatchObject({ displayName: "松尾 雄大", visibility: "network" });
  });

  it.each([
    { age: 151 },
    { heightCm: 299 },
    { languages: [] },
    { visibility: "friends" },
    { avatarDataUrl: "data:text/plain;base64,SGVsbG8=" }
  ])("rejects an invalid editable field: %o", (body) => {
    expect(() => customerProfileUpdateBodySchema.parse(body)).toThrow();
  });
});
