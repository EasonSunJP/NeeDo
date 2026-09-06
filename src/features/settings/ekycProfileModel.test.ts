import { expect, it } from "vitest";
import { emptyEkycProfile, normalizeEkycProfile, validateEkycProfile } from "./ekycProfileModel";
const complete = { ...emptyEkycProfile, familyName: "山田", givenName: "太郎", familyNameKana: "ヤマダ", givenNameKana: "タロウ", birthYear: "1992", birthMonth: "2", birthDay: "29", sex: "male", postalCode: "1600022", city: "東京都新宿区", street: "新宿1-1", occupation: "employee" };
it("requires personal identity fields without requiring excluded contact and bank details", () => {
  expect(validateEkycProfile(emptyEkycProfile)).toBe("请填写姓名");
  expect(validateEkycProfile(complete)).toBe("");
});
it("normalizes half-width kana and postal digits before validation", () => {
  const normalized = normalizeEkycProfile({ ...complete, familyNameKana: " ﾔﾏﾀﾞ ", postalCode: "１６０－００２２" });
  expect(normalized.familyNameKana).toBe("ヤマダ");
  expect(normalized.postalCode).toBe("1600022");
  expect(validateEkycProfile(normalized)).toBe("");
});
it("rejects invalid calendar dates and future birthdates", () => {
  expect(validateEkycProfile({ ...complete, birthYear: "1993" })).toBe("请选择有效的出生日期");
  expect(validateEkycProfile({ ...complete, birthYear: String(new Date().getFullYear() + 1) })).toBe("请选择有效的出生日期");
});
it("validates kana, postal code, and other occupation details", () => {
  expect(validateEkycProfile({ ...complete, givenNameKana: "太郎" })).toBe("姓名读音请使用全角片假名");
  expect(validateEkycProfile({ ...complete, postalCode: "123" })).toBe("请输入7位数字的邮政编码");
  expect(validateEkycProfile({ ...complete, occupation: "other" })).toBe("请填写其他职业");
  expect(validateEkycProfile({ ...complete, occupation: "other", otherOccupation: "作家" })).toBe("");
});
