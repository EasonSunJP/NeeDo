import { describe, expect, it } from "vitest";
import { isBackendAccountForAnotherPortal, resolveAdminDefaultCredentials, resolveAdminTestLoginCredentials, resolveBackendLoginTarget } from "./AdminLoginPage";
import { getPostLoginRoute, getPublicTestLoginPortal, resolveLoginErrorMessage, resolveLoginFeedbackMessage, type LoginErrorCopy, type LoginFeedbackCopy, type LoginFeedbackState } from "./LoginPage";
import appSource from "../../App.tsx?raw";
import adminLoginPageSource from "./AdminLoginPage.tsx?raw";
import loginPageSource from "./LoginPage.tsx?raw";
import userManagementSource from "../admin/UserManagementWorkspace.tsx?raw";
import cpsAccountManagementSource from "../cps-admin/CpsAccountManagementPage.tsx?raw";

const zhCopy = {
  accountError: "账号错误",
  captchaLoadError: "验证码加载失败",
  captchaRequiredError: "请填写验证码",
  createNotice: "创建提示",
  googleLoginUnavailable: "无法发起 Google 登录",
  requiredError: "请填写信息"
} satisfies LoginFeedbackCopy;

const jaCopy = {
  accountError: "アカウントエラー",
  captchaLoadError: "認証コードを読み込めません",
  captchaRequiredError: "認証コードを入力してください",
  createNotice: "作成案内",
  googleLoginUnavailable: "Google ログインを開始できません",
  requiredError: "入力してください"
} satisfies LoginFeedbackCopy;

const zhLoginErrorCopy = {
  accountError: "账号错误",
  dependencyUnavailableError: "登录服务依赖未启动",
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
    expect(resolveLoginErrorMessage("error.dependency.redis_unavailable", zhLoginErrorCopy)).toBe("登录服务依赖未启动");
    expect(resolveLoginErrorMessage("Internal Server Error", zhLoginErrorCopy)).toBe("登录服务依赖未启动");
    expect(resolveLoginErrorMessage("error.resource_not_found", zhLoginErrorCopy)).toBe("接口不存在");
    expect(resolveLoginErrorMessage("error.cors_forbidden", zhLoginErrorCopy)).toBe("接口不存在");
    expect(resolveLoginErrorMessage("token不能为空", zhLoginErrorCopy)).toBe("token不能为空");
    expect(resolveLoginErrorMessage("图形验证码不能为空", zhLoginErrorCopy)).toBe("图形验证码不能为空");
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
    expect(loginPageSource).toContain("authApi.fetchCaptcha");
    expect(loginPageSource).toContain("captchaCode");
    expect(loginPageSource).toContain("captchaRequiredError");
    expect(loginPageSource).toContain("isLoginPending");
    expect(loginPageSource).toContain("copy.loginPending");
  });

  it("does not expose a passwordless test-login shortcut", () => {
    expect(loginPageSource).not.toContain("handleTestLogin");
    expect(loginPageSource).not.toContain("testLogin");
    expect(loginPageSource).not.toContain("/auth/test-login");
    expect(loginPageSource).not.toContain("demoAuthAccount.password");
  });

  it("labels the public test credential action as skip verification login", () => {
    expect(loginPageSource).toContain('testCredentialLogin: "跳过验证登录"');
  });

  it("lets the public test credential action bypass the captcha requirement", () => {
    const testCredentialAction = loginPageSource.match(/const continueWithTestCredentials = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

    expect(testCredentialAction).toContain("await login(getPublicTestLoginPortal(activePortal), testCredentials.email, testCredentials.password)");
    expect(testCredentialAction).not.toContain("captchaRequiredError");
    expect(testCredentialAction).not.toContain("normalizedCaptchaCode");
  });

  it("does not point production login failures back to the formal /api/v1 backend path", () => {
    expect(loginPageSource).toContain("登录 / 注册路径");
    expect(loginPageSource).not.toContain("真实 /api/v1 后端");
    expect(loginPageSource).not.toContain("real NeeDo /api/v1 backend");
  });

  it("uses the shared password reveal control on visible password fields", () => {
    expect(loginPageSource).toContain("PasswordInput");
    expect(adminLoginPageSource).toContain("PasswordInput");
    expect(userManagementSource).toContain("PasswordInput");
    expect(cpsAccountManagementSource).toContain("PasswordInput");
    expect(loginPageSource).not.toContain('type="password"');
    expect(adminLoginPageSource).not.toContain('type="password"');
  });

  it("offers a remember-account switch on account password login forms", () => {
    expect(loginPageSource).toContain("rememberCredentials");
    expect(loginPageSource).toContain("readRememberedCredentials");
    expect(adminLoginPageSource).toContain("rememberCredentials");
    expect(adminLoginPageSource).toContain("writeRememberedCredentials");
  });

  it("routes NDA backend login aliases through the shared backend login page", () => {
    expect(appSource).toContain('<Route path="/login/afirieito-admin" element={<AdminLoginPage portal="afirieito-admin" />} />');
    expect(appSource).toContain('<Route path="/login/NDA-admin" element={<AdminLoginPage portal="afirieito-admin" />} />');
    expect(appSource).toContain('portal === "business"');
    expect(appSource).toContain('"/login/afirieito-admin"');
  });

  it("offers real test-account login on backend login screens", () => {
    expect(adminLoginPageSource).toContain("resolveAdminTestLoginCredentials");
    expect(adminLoginPageSource).toContain("continueWithTestCredentials");
    expect(adminLoginPageSource).toContain("testCredentialLogin");
    expect(adminLoginPageSource).toContain("VITE_TEST_LOGIN_BUSINESS_EMAIL");
    expect(adminLoginPageSource).toContain('"afirieito-admin"');
  });

  it("uses formal password login on backend login screens", () => {
    expect(adminLoginPageSource).toContain("loginWithFormalPassword");
    expect(adminLoginPageSource).not.toContain("login(config.authPortal");
  });

  it("keeps backend login pages scoped to the selected backend", () => {
    expect(resolveBackendLoginTarget("merchant", "merchant", "/merchant-admin")).toBe("/merchant-admin");
    expect(resolveBackendLoginTarget("admin", "merchant", "/merchant-admin")).toBeNull();
    expect(adminLoginPageSource).toContain("portalMismatchError");
    expect(adminLoginPageSource).not.toContain('nextPath : "/admin"');
  });

  it("prefills operations admin login fields from configured test credentials", () => {
    expect(
      resolveAdminDefaultCredentials(
        {
          VITE_TEST_LOGIN_ADMIN_EMAIL: "admin",
          VITE_TEST_LOGIN_ADMIN_PASSWORD: "Admin.2026"
        },
        "admin",
        "admin@example.com"
      )
    ).toEqual({
      email: "admin",
      password: "Admin.2026"
    });
  });

  it("keeps backend test credentials portal-specific even when env files still contain the shared admin account", () => {
    const staleSharedEnv = {
      VITE_TEST_LOGIN_EMAIL: "admin",
      VITE_TEST_LOGIN_PASSWORD: "Admin.2026",
      VITE_TEST_LOGIN_MERCHANT_EMAIL: "admin",
      VITE_TEST_LOGIN_MERCHANT_PASSWORD: "Admin.2026",
      VITE_TEST_LOGIN_BUSINESS_EMAIL: "admin",
      VITE_TEST_LOGIN_BUSINESS_PASSWORD: "Admin.2026"
    };

    expect(resolveAdminTestLoginCredentials(staleSharedEnv, "merchant-admin")).toEqual({
      email: "merchant@example.com",
      password: "Admin.2026"
    });
    expect(resolveAdminTestLoginCredentials(staleSharedEnv, "afirieito-admin")).toEqual({
      email: "affiliate@example.com",
      password: "Admin.2026"
    });
    expect(resolveAdminDefaultCredentials(staleSharedEnv, "merchant-admin", "merchant-owner@example.com")).toEqual({
      email: "merchant@example.com",
      password: "Admin.2026"
    });
  });

  it("honors explicitly configured portal credentials and rejects remembered accounts from another backend", () => {
    expect(
      resolveAdminTestLoginCredentials(
        {
          VITE_TEST_LOGIN_MERCHANT_EMAIL: "custom-merchant@example.com",
          VITE_TEST_LOGIN_MERCHANT_PASSWORD: "Merchant.2026"
        },
        "merchant-admin"
      )
    ).toEqual({
      email: "custom-merchant@example.com",
      password: "Merchant.2026"
    });
    expect(isBackendAccountForAnotherPortal("merchant-admin", "admin")).toBe(true);
    expect(isBackendAccountForAnotherPortal("merchant-admin", "admin@example.com")).toBe(true);
    expect(isBackendAccountForAnotherPortal("merchant-admin", "merchant@example.com")).toBe(false);
    expect(isBackendAccountForAnotherPortal("admin", "merchant@example.com")).toBe(true);
  });

  it("ignores redirects that belong to a different portal after login", () => {
    expect(getPostLoginRoute("admin", "/merchant")).toBe("/admin");
    expect(getPostLoginRoute("merchant", "/merchant/orders")).toBe("/merchant/orders");
    expect(getPostLoginRoute("business", "/NDA-admin")).toBe("/NDA-admin");
    expect(getPostLoginRoute("user", "/orders")).toBe("/orders");
    expect(getPostLoginRoute("admin", "/login/merchant?redirect=%2Fmerchant")).toBe("/admin");
  });

  it("keeps the public test-account shortcut inside the current frontend portal", () => {
    expect(getPublicTestLoginPortal("user")).toBe("user");
    expect(getPublicTestLoginPortal("business")).toBe("business");
    expect(loginPageSource).toContain("login(getPublicTestLoginPortal(activePortal)");
  });

  it("skips the account form when an existing user session can enter another frontend portal", () => {
    expect(loginPageSource).toContain("canEnterPortal(activePortal)");
    expect(loginPageSource).toContain("hasActiveAccess");
    expect(loginPageSource).toContain("enterPortal();");
  });
});
