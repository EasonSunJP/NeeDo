// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as AuthApiModule from "../../api/auth";
import type * as AuthProviderModule from "../../auth/AuthProvider";
import type * as BrowserPasswordSaveModule from "../../auth/browserPasswordSave";
import type * as GoogleIdentityModule from "../../auth/googleIdentity";
import type * as I18nProviderModule from "../../i18n/I18nProvider";
import type * as ClientThemeProviderModule from "../../theme/ClientThemeProvider";
import type * as ReactRouterDomModule from "react-router-dom";
import type { AuthSession } from "../../auth/rbac";
import {
  authTrustGatewayTranslations,
  translations,
  translateText,
  type Language
} from "../../i18n/translations";

const mocked = vi.hoisted(() => ({
  auth: {
    authenticateWithGoogleCredential: vi.fn(),
    canAccess: vi.fn(() => false),
    hasRememberedPortalAuthorization: vi.fn(() => false),
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    session: null as AuthSession | null,
    startRegistration: vi.fn(),
    switchPortal: vi.fn(),
    verifyGoogleRegistrationOrLink: vi.fn(),
    verifyRegistration: vi.fn()
  },
  authApi: {
    initializeGoogleLogin: vi.fn(),
    submitGoogleCredential: vi.fn()
  },
  navigateToPortal: vi.fn(),
  requestBrowserPasswordSave: vi.fn(async () => undefined),
  requestGoogleCredential: vi.fn()
}));

vi.mock("../../auth/AuthProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthProviderModule>();
  return { ...actual, useAuth: () => mocked.auth };
});

vi.mock("../../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthApiModule>();
  return { ...actual, authApi: { ...actual.authApi, ...mocked.authApi } };
});

vi.mock("../../auth/googleIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleIdentityModule>();
  return { ...actual, requestGoogleCredential: mocked.requestGoogleCredential };
});

vi.mock("../../auth/browserPasswordSave", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserPasswordSaveModule>();
  return {
    ...actual,
    requestBrowserPasswordSave: mocked.requestBrowserPasswordSave
  };
});

vi.mock("../../i18n/I18nProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof I18nProviderModule>();
  return {
    ...actual,
    useI18n: () => ({ language: "zh" as const, setLanguage: vi.fn() })
  };
});

vi.mock("../../theme/ClientThemeProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientThemeProviderModule>();
  return {
    ...actual,
    useClientTheme: () => ({ isNight: false, theme: "light-green" as const })
  };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>();
  return {
    ...actual,
    useParams: () => ({ portal: "user" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()]
  };
});

import {
  getPostLoginRoute,
  isGoogleAuthEnabled,
  LoginPage,
  requiresFormalFrontendLogin,
  resolveLoginErrorMessage
} from "./LoginPage";
import loginPageSource from "./LoginPage.tsx?raw";
import i18nAuditSource from "../../../scripts/i18n-audit.mjs?raw";

const challenge = {
  challengeId: "challenge-login-11",
  cooldownSeconds: 60,
  expiresIn: 600,
  maskedEmail: "n***@example.com"
};

const session = {
  email: "new@example.com",
  portal: "user"
} as AuthSession;

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setBrowserAutofilledValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LoginPage verified identity behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocked.auth.isAuthenticated = false;
    mocked.auth.session = null;
    mocked.auth.canAccess.mockReturnValue(false);
    mocked.auth.hasRememberedPortalAuthorization.mockReturnValue(false);
    mocked.auth.login.mockResolvedValue({
      message: "error.auth.invalid_credentials",
      ok: false
    });
    mocked.auth.startRegistration.mockResolvedValue({
      challenge,
      ok: true,
      status: "verification_required"
    });
    mocked.auth.verifyRegistration.mockResolvedValue({
      needoId: "NDO-2026-000011",
      ok: true,
      session,
      status: "authenticated"
    });
    mocked.auth.verifyGoogleRegistrationOrLink.mockResolvedValue({
      needoId: "NDO-2026-000012",
      ok: true,
      session,
      status: "authenticated"
    });
    mocked.authApi.initializeGoogleLogin.mockResolvedValue({
      clientId: "google-client-id.apps.googleusercontent.com",
      expiresIn: 300,
      nonce: "nonce-from-backend",
      nonceChallengeId: "nonce-challenge-11"
    });
    mocked.requestGoogleCredential.mockImplementation(() => new Promise<string>(() => undefined));
    mocked.auth.authenticateWithGoogleCredential.mockResolvedValue({
      challenge,
      ok: true,
      status: "verification_required"
    });
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) }
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }))
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("labels password login as Email or NeeDo ID and preserves password bytes", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );
    const identifier = container.querySelector<HTMLInputElement>(
      '[data-testid="login-identifier"]'
    )!;
    const password = container.querySelector<HTMLInputElement>('[data-testid="login-password"]')!;
    await act(async () => {
      setInput(identifier, "  NDO-2026-11  ");
      setInput(password, "  Strong.Password  ");
    });
    await act(async () =>
      container
        .querySelector<HTMLFormElement>('[data-testid="password-login-form"]')
        ?.requestSubmit()
    );

    expect(container.textContent).toContain("邮箱或 NeeDo ID");
    expect(mocked.auth.login).toHaveBeenCalledWith("user", "NDO-2026-11", "  Strong.Password  ");
  });

  it("keeps the desktop identity gateway constrained to 440px", () => {
    expect(container.querySelector("main")?.style.maxWidth).toBe("440px");
  });

  it("keeps Google auth default-on but hides it without initialization when explicitly disabled", async () => {
    expect(isGoogleAuthEnabled(undefined)).toBe(true);
    expect(isGoogleAuthEnabled("true")).toBe(true);
    expect(isGoogleAuthEnabled("false")).toBe(false);

    await act(async () => root.unmount());
    mocked.authApi.initializeGoogleLogin.mockClear();
    root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(LoginPage, {
          googleAuthEnabled: false,
          navigateToPortal: mocked.navigateToPortal
        })
      )
    );
    await flushUi();

    expect(container.querySelector('[data-testid="google-identity-button"]')).toBeNull();
    expect(mocked.authApi.initializeGoogleLogin).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="show-password-login"]')).not.toBeNull();
  });

  it("defaults browser password saving on and keeps native autofill metadata after opt-out", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );

    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="login-identifier"]')?.autocomplete
    ).toBe("username");
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="login-password"]')?.autocomplete
    ).toBe("current-password");

    await act(async () => toggle?.click());

    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem("needo.auth.browser-password-save.frontend:user")).toBe("false");
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="login-identifier"]')?.autocomplete
    ).toBe("username");
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="login-password"]')?.autocomplete
    ).toBe("current-password");
  });

  it("uses a native password-manager form without reading protected credentials in script", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );

    const form = container.querySelector<HTMLFormElement>('[data-testid="password-login-form"]');
    expect(form?.method).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/v1/auth/login");
    expect(loginPageSource).not.toContain("readBrowserSavedPassword");
  });

  it("exposes standard credential field names to the browser password manager", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );

    expect(
      container.querySelector<HTMLInputElement>('[data-testid="login-identifier"]')?.name
    ).toBe("username");
    expect(container.querySelector<HTMLInputElement>('[data-testid="login-password"]')?.name).toBe(
      "password"
    );
  });

  it("submits credentials filled by the browser without React input events", async () => {
    mocked.auth.login.mockResolvedValueOnce({ ok: true, session });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );

    const identifier = container.querySelector<HTMLInputElement>(
      '[data-testid="login-identifier"]'
    )!;
    const password = container.querySelector<HTMLInputElement>('[data-testid="login-password"]')!;
    setBrowserAutofilledValue(identifier, "autofill@example.com");
    setBrowserAutofilledValue(password, "Autofill.Password.2026");

    await act(async () =>
      container
        .querySelector<HTMLFormElement>('[data-testid="password-login-form"]')
        ?.requestSubmit()
    );

    expect(mocked.auth.login).toHaveBeenCalledWith(
      "user",
      "autofill@example.com",
      "Autofill.Password.2026"
    );
  });

  it("requests browser-managed password storage only after successful login", async () => {
    mocked.auth.login.mockResolvedValueOnce({ ok: true, session });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-password-login"]')?.click()
    );

    const identifier = container.querySelector<HTMLInputElement>(
      '[data-testid="login-identifier"]'
    )!;
    const password = container.querySelector<HTMLInputElement>('[data-testid="login-password"]')!;
    await act(async () => {
      setInput(identifier, "user@example.com");
      setInput(password, "Strong.Password.2026");
    });
    await act(async () =>
      container
        .querySelector<HTMLFormElement>('[data-testid="password-login-form"]')
        ?.requestSubmit()
    );

    expect(mocked.requestBrowserPasswordSave).toHaveBeenCalledWith({
      id: "user@example.com",
      name: "NeeDo",
      password: "Strong.Password.2026"
    });
    expect(mocked.navigateToPortal).toHaveBeenCalledWith("user", "/");
  });

  it("ignores a stale Google initialization failure after switching to registration", async () => {
    await act(async () => root.unmount());
    mocked.authApi.initializeGoogleLogin.mockReset();
    const initialization = createDeferred<{
      clientId: string;
      expiresIn: number;
      nonce: string;
      nonceChallengeId: string;
    }>();
    mocked.authApi.initializeGoogleLogin.mockReturnValueOnce(initialization.promise);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-registration"]')?.click()
    );

    await act(async () => {
      initialization.reject(new Error("error.api"));
      await initialization.promise.catch(() => undefined);
    });
    await flushUi();

    expect(container.querySelector('[data-testid="registration-form"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("登录服务暂时不可用");
  });

  it("keeps registration active when a stale Google provider completion updates auth context", async () => {
    await act(async () => root.unmount());
    mocked.requestGoogleCredential.mockResolvedValueOnce("stale-google-credential");
    const providerCompletion = createDeferred<{
      ok: true;
      session: AuthSession;
      status: "authenticated";
    }>();
    mocked.auth.authenticateWithGoogleCredential.mockReturnValueOnce(providerCompletion.promise);
    mocked.auth.switchPortal.mockResolvedValue({ ok: true, session });

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();
    expect(mocked.auth.authenticateWithGoogleCredential).toHaveBeenCalledTimes(1);

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-registration"]')?.click()
    );
    mocked.auth.isAuthenticated = true;
    mocked.auth.session = session;
    mocked.auth.canAccess.mockReturnValue(true);
    await act(async () => {
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
      await Promise.resolve();
    });
    await act(async () => {
      providerCompletion.resolve({
        ok: true,
        session,
        status: "authenticated"
      });
      await providerCompletion.promise;
    });
    await flushUi();

    expect(container.querySelector('[data-testid="registration-form"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="auth-verification-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="generated-needo-id"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mocked.navigateToPortal).not.toHaveBeenCalled();
  });

  it("registers only email and password, then shows the shared masked-email challenge", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-registration"]')?.click()
    );

    expect(container.querySelector('[name="nickname"]')).toBeNull();
    expect(container.querySelector('[name="city"]')).toBeNull();
    expect(container.querySelector('[name="accountType"]')).toBeNull();

    await act(async () => {
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="registration-email"]')!,
        " new@example.com "
      );
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="registration-password"]')!,
        "Strong.Password.11!"
      );
    });
    await act(async () =>
      container.querySelector<HTMLFormElement>('[data-testid="registration-form"]')?.requestSubmit()
    );
    await flushUi();

    expect(mocked.auth.startRegistration).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "Strong.Password.11!"
    });
    expect(container.querySelector('[data-testid="auth-verification-panel"]')).not.toBeNull();
    expect(container.textContent).toContain("n***@example.com");
  });

  it("shows and copies the generated NeeDo ID before explicit continuation", async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="show-registration"]')?.click()
    );
    await act(async () => {
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="registration-email"]')!,
        "new@example.com"
      );
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="registration-password"]')!,
        "Strong.Password.11!"
      );
    });
    await act(async () =>
      container.querySelector<HTMLFormElement>('[data-testid="registration-form"]')?.requestSubmit()
    );
    await flushUi();
    await act(async () =>
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="auth-verification-code"]')!,
        "123456"
      )
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="auth-verification-submit"]')
        ?.click()
    );
    await flushUi();

    expect(mocked.auth.verifyRegistration).toHaveBeenCalledWith({
      challengeId: challenge.challengeId,
      otp: "123456"
    });
    expect(container.querySelector('[data-testid="generated-needo-id"]')?.textContent).toContain(
      "NDO-2026-000011"
    );
    expect(container.querySelector('[data-testid="generated-needo-id-continue"]')).not.toBeNull();
    expect(mocked.navigateToPortal).not.toHaveBeenCalled();

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="generated-needo-id-copy"]')?.click()
    );
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith("NDO-2026-000011");

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="generated-needo-id-continue"]')
        ?.click()
    );
    expect(mocked.navigateToPortal).toHaveBeenCalledTimes(1);
    expect(mocked.navigateToPortal).toHaveBeenCalledWith("user", "/");
  });

  it("forwards the exact backend Google client ID and nonce and completes linked login", async () => {
    mocked.requestGoogleCredential.mockResolvedValueOnce("opaque-google-credential");
    mocked.auth.authenticateWithGoogleCredential.mockResolvedValueOnce({
      ok: true,
      session,
      status: "authenticated"
    });

    await act(async () => {
      await root.unmount();
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();

    expect(mocked.requestGoogleCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "google-client-id.apps.googleusercontent.com",
        nonce: "nonce-from-backend"
      })
    );
    expect(mocked.auth.authenticateWithGoogleCredential).toHaveBeenCalledWith(
      {
        credential: "opaque-google-credential",
        nonceChallengeId: "nonce-challenge-11"
      },
      "user"
    );
    expect(mocked.navigateToPortal).toHaveBeenCalledWith("user", "/");
  });

  it("uses the shared verification panel for first-use Google and shows a new NeeDo ID after verification", async () => {
    mocked.requestGoogleCredential.mockResolvedValueOnce("first-use-google-credential");

    await act(async () => {
      await root.unmount();
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();

    expect(container.textContent).toContain("n***@example.com");
    await act(async () =>
      setInput(
        container.querySelector<HTMLInputElement>('[data-testid="auth-verification-code"]')!,
        "654321"
      )
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="auth-verification-submit"]')
        ?.click()
    );
    await flushUi();

    expect(mocked.auth.verifyGoogleRegistrationOrLink).toHaveBeenCalledWith(
      { challengeId: challenge.challengeId, otp: "654321" },
      "user"
    );
    expect(container.querySelector('[data-testid="generated-needo-id"]')?.textContent).toContain(
      "NDO-2026-000012"
    );
  });

  it("starts a fresh Google nonce and credential request after leaving first-use verification", async () => {
    await act(async () => root.unmount());
    mocked.authApi.initializeGoogleLogin.mockClear();
    mocked.requestGoogleCredential.mockReset();
    mocked.requestGoogleCredential
      .mockResolvedValueOnce("first-use-google-credential")
      .mockImplementationOnce(() => new Promise<string>(() => undefined));

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();

    expect(container.querySelector('[data-testid="auth-verification-panel"]')).not.toBeNull();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="auth-verification-back"]')?.click()
    );
    await flushUi();

    expect(mocked.authApi.initializeGoogleLogin).toHaveBeenCalledTimes(2);
    expect(mocked.requestGoogleCredential).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="google-identity-button"]')).not.toBeNull();
  });

  it("localizes Google conflict and provider failures", async () => {
    mocked.requestGoogleCredential.mockRejectedValueOnce(new Error("error.auth.google_conflict"));
    await act(async () => {
      await root.unmount();
      root = createRoot(container);
      root.render(createElement(LoginPage, { navigateToPortal: mocked.navigateToPortal }));
    });
    await flushUi();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Google 账号已绑定到其他 NeeDo 账号"
    );
  });
});

describe("LoginPage formal flow guardrails", () => {
  it("contains no fake Google, callback-query, generic OTP, captcha, or public technician flow", () => {
    [
      "googleAccountIconSrc",
      "portalGmailEmail",
      "googleAccountMode",
      "/api/google-account/",
      "loginWithProvider",
      "sendVerificationCode",
      "loginWithVerificationCode",
      "authApi.register",
      "authApi.fetchCaptcha",
      "loginWithFormalPassword",
      "readRememberedCredentials",
      "writeRememberedCredentials",
      "clearRememberedCredentials",
      "rememberCredentials",
      "registrationCity",
      'accountType: "technician"'
    ].forEach((removedSource) => expect(loginPageSource).not.toContain(removedSource));
  });

  it("maps stable auth failures to helpful localized copy", () => {
    expect(resolveLoginErrorMessage("error.auth.invalid_credentials", "zh")).toContain(
      "邮箱、NeeDo ID 或密码"
    );
    expect(resolveLoginErrorMessage("error.auth.portal_forbidden", "zh")).toBe(
      "当前账号没有此入口所需的身份，请切换账号后重试。"
    );
    expect(resolveLoginErrorMessage("error.auth.portal_forbidden", "ja")).toContain(
      "アカウントを切り替えて"
    );
    expect(resolveLoginErrorMessage("error.auth.verification_challenge_expired", "ja")).toContain(
      "有効期限"
    );
    expect(resolveLoginErrorMessage("error.auth.verification_attempts_exhausted", "en")).toContain(
      "Too many"
    );
    expect(resolveLoginErrorMessage("error.auth.otp_cooldown", "ko")).toContain("잠시");
    expect(resolveLoginErrorMessage("error.dependency.google_auth_unavailable", "en")).toBe(
      "Google sign-in is temporarily unavailable. Try again later."
    );
    expect(resolveLoginErrorMessage("error.auth.otp_delivery_failed", "ja")).toBe(
      "確認コードを送信できませんでした。しばらくしてからお試しください。"
    );
    expect(resolveLoginErrorMessage("error.dependency.redis_unavailable", "ko")).toBe(
      "인증 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요."
    );
    expect(
      resolveLoginErrorMessage("error.dependency.auth_generation_unavailable", "zh-Hant")
    ).toBe("身分服務暫時無法使用，請稍後再試。");
  });

  it("uses the dedicated five-language translation for every trust-gateway UI source", () => {
    const sources = [
      "邮箱或 NeeDo ID",
      "使用邮箱或 NeeDo ID 登录",
      "输入邮箱或 NeeDo ID",
      "返回",
      "继续进入",
      "已登录",
      "已复制",
      "复制 NeeDo ID",
      "无法自动复制，请长按 NeeDo ID 手动复制。",
      "请保存此 ID。以后可以使用邮箱或 NeeDo ID 加密码登录。",
      "新建账号",
      "使用 Google 登录",
      "请选择下方的 Google 账号",
      "重新使用 Google 验证",
      "隐藏密码",
      "登录",
      "登录中…",
      "退出登录",
      "密码",
      "保存密码",
      "输入密码",
      "邮箱",
      "输入邮箱",
      "创建 NeeDo 账号",
      "至少 8 位，并包含大写字母、小写字母、数字和符号。",
      "验证码将发送到此邮箱。验证后会生成你的 NeeDo ID。",
      "发送验证码",
      "正在发送…",
      "显示密码",
      "当前账号",
      "账号登录",
      "使用已验证的邮箱或 NeeDo ID 登录。",
      "欢迎使用 NeeDo",
      "先确认你的 NeeDo 身份，再进入预约、消息或工作空间。",
      "请输入邮箱或 NeeDo ID 和密码。",
      "请输入邮箱和密码。",
      "后台",
      "NeeDo 运营后台",
      "推广",
      "店铺",
      "NeeDo 店铺端",
      "员工",
      "NeeDo 员工端",
      "用户",
      "NeeDo 用户端",
      "六位邮箱验证码",
      "验证码已发送至 {email}",
      "验证码将在 {seconds} 秒后失效",
      "{seconds} 秒后可重新发送",
      "身份验证",
      "验证码已过期，请重新发送。",
      "请输入完整的六位验证码。",
      "重新发送验证码",
      "确认验证码",
      "正在验证…",
      "验证邮箱",
      "最多可尝试 5 次",
      "首次注册已完成，这是你的 NeeDo ID",
      "Google 账号已绑定到其他 NeeDo 账号",
      "登录服务暂时不可用，请稍后重试。",
      "Google 登录服务暂时不可用，请稍后重试。",
      "未完成 Google 账号选择，请重试。",
      "Google 凭证无效或已过期，请重新选择账号。",
      "Google 登录等待超时，请重试。",
      "Google 登录请求已失效，请重新开始。",
      "Google 登录正在进行，请完成当前操作。",
      "无法加载 Google 登录服务，请检查网络后重试。",
      "邮箱、NeeDo ID 或密码不正确。",
      "验证码不正确，请重新输入。",
      "请稍候再重新发送验证码。",
      "尝试次数过多，请重新获取验证码。",
      "验证请求已超过有效期限，请重新开始。",
      "网络连接失败，请检查网络后重试。",
      "网络响应超时，请稍后重试。",
      "登录接口不可用，请联系 NeeDo 支持。",
      "登录服务返回异常，请稍后重试。",
      "该邮箱已注册，请直接登录。",
      "验证码发送失败，请稍后重试。",
      "身份服务暂时不可用，请稍后重试。",
      "登录方式",
      "Google 账号未绑定",
      "Google 账号已绑定",
      "绑定 Google 账号",
      "解除 Google 绑定",
      "先设置密码后才能解除 Google 绑定。",
      "解除后会退出所有设备，需要使用邮箱或 NeeDo ID 加密码重新登录。",
      "设置登录密码",
      "密码设置成功"
    ];
    const targetLanguages: Exclude<Language, "zh">[] = ["zh-Hant", "ja", "en", "ko"];

    sources.forEach((source) => {
      const dedicatedEntry = authTrustGatewayTranslations[source];
      expect(dedicatedEntry, `missing dedicated auth copy: ${source}`).toBeDefined();
      targetLanguages.forEach((language) => {
        const expected = dedicatedEntry?.[language];
        expect(expected, `missing ${language} auth copy: ${source}`).toBeTruthy();
        expect(translations[source]?.[language]).toBe(expected);
        expect(translateText(source, language)).toBe(expected);
      });
    });
  });

  it("keeps portal redirects scoped and formal login as the default", () => {
    expect(getPostLoginRoute("merchant", "/merchant/orders")).toBe("/merchant/orders");
    expect(getPostLoginRoute("user", "/admin")).toBe("/");
    expect(requiresFormalFrontendLogin("technician", "/technician")).toBe(true);
  });

  it("audits the current checkout instead of a hard-coded sibling workspace", () => {
    expect(i18nAuditSource).toContain("fileURLToPath(import.meta.url)");
    expect(i18nAuditSource).toContain("affiliateMarketplaceTranslations");
    expect(i18nAuditSource).not.toContain(
      'const workspaceRoot = "/Users/eason/Documents/New project"'
    );
  });
});
