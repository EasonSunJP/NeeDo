import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";
import techniciansSource from "./TechniciansPage.tsx?raw";
import usersSource from "./UsersPage.tsx?raw";
import merchantPeopleSource from "../merchant-admin/MerchantAdminPeoplePage.tsx?raw";

describe("formal detail mutation page refresh warnings", () => {
  it.each([
    ["operations technicians", techniciansSource],
    ["operations customers", usersSource],
    ["merchant technicians", merchantPeopleSource]
  ])("keeps successful writes distinct from failed post-write refreshes on %s", (_name, source) => {
    expect(source).toContain("hasFormalDetailRefreshFailure");
    expect(source).toContain('translateText("资料已保存，但刷新失败，请重试"');
    expect(source).toContain("loadOrThrow");
  });

  it.each([
    ["zh", "资料已保存，但刷新失败，请重试"],
    ["zh-Hant", "資料已儲存，但重新整理失敗，請重試"],
    ["ja", "情報は保存されましたが、更新に失敗しました。再試行してください"],
    ["en", "The profile was saved, but refresh failed. Please retry"],
    ["ko", "프로필이 저장되었지만 새로고침에 실패했습니다. 다시 시도하세요"]
  ] as Array<[Language, string]>)("localizes the successful-write refresh warning for %s", (language, expected) => {
    expect(translateText("资料已保存，但刷新失败，请重试", language)).toBe(expected);
  });
});
