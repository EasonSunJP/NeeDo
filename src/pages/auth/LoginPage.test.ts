import { describe, expect, it } from "vitest";
import { isBackendAccountForAnotherPortal, resolveBackendLoginTarget } from "./AdminLoginPage";
import { getPostLoginRoute, requiresFormalFrontendLogin, resolveLoginErrorMessage, resolveLoginFeedbackMessage, type LoginErrorCopy, type LoginFeedbackCopy, type LoginFeedbackState } from "./LoginPage";
import appSource from "../../App.tsx?raw";
import adminLoginPageSource from "./AdminLoginPage.tsx?raw";
import loginPageSource from "./LoginPage.tsx?raw";
import userManagementSource from "../admin/UserManagementWorkspace.tsx?raw";
import cpsAccountManagementSource from "../cps-admin/CpsAccountManagementPage.tsx?raw";
import developmentEnvExampleSource from "../../../.env.development.example?raw";
import translationsSource from "../../i18n/translations.ts?raw";

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
    expect(resolveLoginErrorMessage("error.auth.invalid_credentials", zhLoginErrorCopy)).toBe("账号错误");
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
  it("does not bundle or render frontend test credential shortcuts", () => {
    [loginPageSource, adminLoginPageSource, developmentEnvExampleSource].forEach((source) => {
      expect(source).not.toContain("VITE_TEST_LOGIN_");
    });
    expect(loginPageSource).not.toContain("fillTestCredentials");
    expect(loginPageSource).not.toContain("continueWithTestCredentials");
    expect(loginPageSource).not.toContain("testCredentialFill");
    expect(loginPageSource).not.toContain("testCredentialLogin");
    expect(adminLoginPageSource).not.toContain("continueWithTestCredentials");
    expect(adminLoginPageSource).not.toContain("testCredentialLogin");
    const removedShortcutLabels = ["测试账号登录", "測試帳號登入", "填入测试账号", "填入測試帳號"];
    expect(removedShortcutLabels.filter((label) => translationsSource.includes(label))).toEqual([]);
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

  it("offers formal customer and technician registration without exposing merchant or admin self-registration", () => {
    expect(loginPageSource).toContain('type LoginPanelMode = "welcome" | "account" | "register"');
    expect(loginPageSource).toContain('activePortal === "technician" ? "technician" : "customer"');
    expect(loginPageSource).toContain('activePortal === "user" || activePortal === "technician"');
    expect(loginPageSource).toContain("await authApi.register");
    expect(loginPageSource).toContain('panelMode === "register"');
    expect(loginPageSource).toContain("registrationCity");
    expect(loginPageSource).not.toContain('accountType: "merchant"');
    expect(loginPageSource).not.toContain('accountType: "admin"');
  });

  it("uses formal password login for technician payroll redirects instead of frontend bypass", () => {
    expect(loginPageSource).toContain("const requiresFormalLogin = requiresFormalFrontendLogin(activePortal, redirectPath);");
    expect(loginPageSource).toContain("const shouldBypassFrontendLogin = !requiresFormalLogin && isFrontendAuthBypassEnabled(import.meta.env as FrontendLoginEnv);");
    expect(loginPageSource).toContain("const hasBlockedFormalFrontendBypass = requiresFormalLogin && isFrontendBypassSession(session);");
    expect(loginPageSource).toContain("const hasActiveAccess = (isAuthenticated && canAccess(activePortal) && !hasBlockedFormalFrontendBypass) || hasRememberedActivePortal;");
    expect(loginPageSource).toContain("{requiresFormalLogin ? null : captchaControl}");
    expect(loginPageSource).toContain("await loginWithFormalPassword(activePortal, normalizedUsername, normalizedPassword)");
  });

  it("keeps the explicit static-demo bypass automatic and invisible", () => {
    expect(loginPageSource).toContain("isFrontendAuthBypassEnabled(import.meta.env as FrontendLoginEnv)");
    expect(loginPageSource).toContain("void continueWithFrontendBypass();");
    expect(loginPageSource).toContain("await enterFrontendWithoutAuthentication(activePortal)");
    expect(loginPageSource).not.toContain("canUseTestCredentialAction");
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

  it("keeps backend login screens on manual formal credentials", () => {
    expect(adminLoginPageSource).not.toContain("resolveAdminTestLoginCredentials");
    expect(adminLoginPageSource).not.toContain("continueWithTestCredentials");
    expect(adminLoginPageSource).not.toContain("testCredentialLogin");
    expect(adminLoginPageSource).not.toContain("VITE_TEST_LOGIN_");
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

  it("does not treat temporary frontend sessions as backend login sessions", () => {
    expect(adminLoginPageSource).toContain("isFrontendBypassSession");
    expect(adminLoginPageSource).toContain("!isFrontendBypassSession(session)");
  });

  it("starts backend login with the portal email and a blank password", () => {
    expect(adminLoginPageSource).toContain("useState<string>(config.defaultEmail)");
    expect(adminLoginPageSource).toContain('useState<string>("")');
    expect(adminLoginPageSource).not.toContain("defaultCredentials");
  });

  it("rejects remembered accounts from another backend", () => {
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

  it("requires formal login by default and keeps route exceptions only in an explicit static demo", () => {
    expect(requiresFormalFrontendLogin("technician", "/technician/payroll")).toBe(true);
    expect(requiresFormalFrontendLogin("technician", "/technician/payroll?period=2026-06")).toBe(true);
    expect(requiresFormalFrontendLogin("technician", "/technician/schedule")).toBe(true);
    expect(requiresFormalFrontendLogin("merchant", "/merchant/schedule?tab=appointments")).toBe(true);
    expect(requiresFormalFrontendLogin("merchant", "/merchant/orders")).toBe(true);
    expect(requiresFormalFrontendLogin("technician", "/technician")).toBe(true);
    expect(requiresFormalFrontendLogin("merchant", "/technician/payroll")).toBe(true);
    expect(requiresFormalFrontendLogin("technician", "/technician", false, true)).toBe(false);
    expect(requiresFormalFrontendLogin("merchant", "/technician/payroll", false, true)).toBe(false);
  });

  it("shows continue when the current session or remembered authorization has the requested portal identity", () => {
    expect(loginPageSource).toContain("canAccess(activePortal)");
    expect(loginPageSource).toContain("hasRememberedPortalAuthorization(activePortal)");
    expect(loginPageSource).toContain("hasActiveAccess");
    expect(loginPageSource).toContain("void enterPortal();");
    expect(loginPageSource).not.toContain("canEnterPortal(activePortal)");
  });
});
