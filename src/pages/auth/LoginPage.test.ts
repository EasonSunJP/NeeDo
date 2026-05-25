import { describe, expect, it } from "vitest";
import { resolveLoginFeedbackMessage, type LoginFeedbackCopy, type LoginFeedbackState } from "./LoginPage";
import loginPageSource from "./LoginPage.tsx?raw";

const zhCopy = {
  accountError: "账号错误",
  createNotice: "创建提示",
  googleLoginUnavailable: "无法发起 Google 登录",
  requiredError: "请填写信息"
} satisfies LoginFeedbackCopy;

const jaCopy = {
  accountError: "アカウントエラー",
  createNotice: "作成案内",
  googleLoginUnavailable: "Google ログインを開始できません",
  requiredError: "入力してください"
} satisfies LoginFeedbackCopy;

describe("LoginPage feedback localization", () => {
  it("resolves stored feedback keys against the current language copy", () => {
    const feedback = {
      key: "googleLoginUnavailable",
      tone: "error",
      type: "localized"
    } satisfies LoginFeedbackState;

    expect(resolveLoginFeedbackMessage(feedback, zhCopy)).toBe("无法发起 Google 登录");
    expect(resolveLoginFeedbackMessage(feedback, jaCopy)).toBe("Google ログインを開始できません");
  });

  it("preserves custom backend messages that do not have localized copies", () => {
    expect(resolveLoginFeedbackMessage({ message: "Backend unavailable", tone: "error", type: "custom" }, zhCopy)).toBe("Backend unavailable");
  });
});

describe("LoginPage real-account login", () => {
  it("does not expose a passwordless test-login shortcut", () => {
    expect(loginPageSource).not.toContain("handleTestLogin");
    expect(loginPageSource).not.toContain("testLogin");
    expect(loginPageSource).not.toContain("/auth/test-login");
    expect(loginPageSource).not.toContain("demoAuthAccount.password");
  });
});
