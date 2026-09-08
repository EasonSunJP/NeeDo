import {
  ekycProfileSchema,
  approveEkycBodySchema
} from "../src/validators/ekyc-application.validator";
const profile = {
  familyName: "山本",
  givenName: "太郎",
  familyNameKana: "ﾔﾏﾓﾄ",
  givenNameKana: "タロウ",
  birthYear: "1990",
  birthMonth: "2",
  birthDay: "28",
  sex: "male",
  postalCode: "１００-０００１",
  city: "東京都",
  street: "千代田1",
  building: "",
  occupation: "employee",
  otherOccupation: ""
};
describe("manual eKYC validation", () => {
  it("normalizes the complete profile", () =>
    expect(ekycProfileSchema.parse(profile)).toMatchObject({
      familyNameKana: "ヤマモト",
      postalCode: "1000001"
    }));
  it.each([
    { birthDay: "30" },
    { birthYear: "2099" },
    { familyNameKana: "やまもと" },
    { sex: "unknown" },
    { postalCode: "123" },
    { occupation: "other" },
    { city: "" },
    { street: "a".repeat(501) },
    { passportNumber: "private" }
  ])("rejects invalid or excluded fields %o", (change) =>
    expect(ekycProfileSchema.safeParse({ ...profile, ...change }).success).toBe(false)
  );
  it("requires explicit confirmation and a reasoned review note", () => {
    expect(
      approveEkycBodySchema.safeParse({ expectedVersion: 1, reviewNote: "checked" }).success
    ).toBe(false);
    expect(
      approveEkycBodySchema.safeParse({
        expectedVersion: 1,
        reviewNote: " ",
        identityConfirmed: true
      }).success
    ).toBe(false);
  });
});
