import { describe, expect, it } from "vitest";
import { resolveLoginErrorMessage, resolveLoginFeedbackMessage, type LoginErrorCopy, type LoginFeedbackCopy, type LoginFeedbackState } from "./LoginPage";
import adminLoginPageSource from "./AdminLoginPage.tsx?raw";
import loginPageSource from "./LoginPage.tsx?raw";
import userManagementSource from "../admin/UserManagementWorkspace.tsx?raw";
import cpsAccountManagementSource from "../cps-admin/CpsAccountManagementPage.tsx?raw";

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

const zhLoginErrorCopy = {
  accountError: "账号错误",
  networkTimeoutError: "后端没有响应",
  resourceNotFoundError: "接口不存在"
} satisfies LoginErrorCopy;

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

  it("maps low-level network and routing errors to readable login messages", () => {
    expect(resolveLoginErrorMessage("error.network.timeout", zhLoginErrorCopy)).toBe("后端没有响应");
    expect(resolveLoginErrorMessage("error.resource_not_found", zhLoginErrorCopy)).toBe("接口不存在");
    expect(resolveLoginErrorMessage("", zhLoginErrorCopy)).toBe("账号错误");
  });
});

describe("LoginPage real-account login", () => {
  it("offers an env-driven test credential autofill without calling a test login API", () => {
    expect(loginPageSource).toContain("VITE_TEST_LOGIN_EMAIL");
    expect(loginPageSource).toContain("VITE_TEST_LOGIN_PASSWORD");
    expect(loginPageSource).toContain("VITE_TEST_LOGIN_CUSTOMER_EMAIL");
    expect(loginPageSource).toContain("fillTestCredentials");
    expect(loginPageSource).toContain("continueWithTestCredentials");
    expect(loginPageSource).toContain("isLoginPending");
    expect(loginPageSource).toContain("copy.loginPending");
  });

  it("does not expose a passwordless test-login shortcut", () => {
    expect(loginPageSource).not.toContain("handleTestLogin");
    expect(loginPageSource).not.toContain("testLogin");
    expect(loginPageSource).not.toContain("/auth/test-login");
    expect(loginPageSource).not.toContain("demoAuthAccount.password");
  });

  it("uses the shared password reveal control on visible password fields", () => {
    expect(loginPageSource).toContain("PasswordInput");
    expect(adminLoginPageSource).toContain("PasswordInput");
    expect(userManagementSource).toContain("PasswordInput");
    expect(cpsAccountManagementSource).toContain("PasswordInput");
    expect(loginPageSource).not.toContain('type="password"');
    expect(adminLoginPageSource).not.toContain('type="password"');
  });
});
