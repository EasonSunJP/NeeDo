import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";

describe("user center validation translations", () => {
  it.each([
    ["年龄必须是 0 到 150 之间的整数", "Age must be a whole number between 0 and 150."],
    ["身高必须是 30 到 250 之间的数字", "Height must be a number between 30 and 250."],
    ["资料格式不正确，请检查后重试", "Some profile fields are invalid. Check them and try again."]
  ])("translates %s into natural English", (source, expected) => {
    expect(translateText(source, "en")).toBe(expected);
  });

  it("uses a private gender label instead of a public label", () => {
    expect(translateText("不公开", "ja")).toBe("非公開");
    expect(translateText("不公开", "en")).toBe("Private");
  });
});
