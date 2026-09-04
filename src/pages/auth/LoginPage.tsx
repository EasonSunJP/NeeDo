import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { authApi, type VerificationChallengePayload } from "../../api/auth";
import { type PortalScope, useAuth } from "../../auth/AuthProvider";
import {
  readBrowserPasswordSavePreference,
  requestBrowserPasswordSave,
  writeBrowserPasswordSavePreference,
  type BrowserPasswordSaveScope
} from "../../auth/browserPasswordSave";
import { requestGoogleCredential } from "../../auth/googleIdentity";
import { type AuthSession } from "../../auth/rbac";
import { openPortalEntry } from "../../auth/portalEntry";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  getClientThemeClassName,
  getClientThemeModeClassName,
  useClientTheme
} from "../../theme/ClientThemeProvider";
import { AuthVerificationPanel, type AuthVerificationLabels } from "./AuthVerificationPanel";

type LoginPanelMode = "welcome" | "account" | "register" | "verification" | "needo-id";
type VerificationKind = "google" | "registration";

type VerificationState = {
  challenge: VerificationChallengePayload;
  kind: VerificationKind;
};

type GeneratedNeedoIdState = {
  needoId: string;
  session: AuthSession;
};

const loginIconMarkUrl = "/icons/needo-login-check-mark-white.png";
const loginCopyrightText = "Copyright © 2026 LifeDance Co., Ltd. All rights reserved.";

const portalEntryRoute: Record<PortalScope, string> = {
  admin: "/admin",
  business: "/afirieito",
  merchant: "/merchant",
  technician: "/technician",
  user: "/"
};

function formatLocalized(
  source: string,
  language: Language,
  values: Record<string, number | string> = {}
) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    translateText(source, language)
  );
}

function buildLoginCopy(language: Language) {
  const text = (source: string) => translateText(source, language);

  return {
    accountLabel: text("邮箱或 NeeDo ID"),
    accountLogin: text("使用邮箱或 NeeDo ID 登录"),
    accountPlaceholder: text("输入邮箱或 NeeDo ID"),
    back: text("返回"),
    continueButton: text("继续进入"),
    continueTitle: text("已登录"),
    copied: text("已复制"),
    copy: text("复制 NeeDo ID"),
    copyFailed: text("无法自动复制，请长按 NeeDo ID 手动复制。"),
    copyright: loginCopyrightText,
    createAccount: text("新建账号"),
    generatedDescription: text("请保存此 ID。以后可以使用邮箱或 NeeDo ID 加密码登录。"),
    generatedTitle: text("首次注册已完成，这是你的 NeeDo ID"),
    googleLogin: text("使用 Google 登录"),
    googlePrompt: text("请选择下方的 Google 账号"),
    googleRestart: text("重新使用 Google 验证"),
    hidePassword: text("隐藏密码"),
    loginButton: text("登录"),
    loginPending: text("登录中…"),
    logout: text("退出登录"),
    passwordLabel: text("密码"),
    passwordPlaceholder: text("输入密码"),
    savePassword: text("保存密码"),
    registrationEmailLabel: text("邮箱"),
    registrationEmailPlaceholder: text("输入邮箱"),
    registrationPasswordHint: text("至少 8 位，并包含大写字母、小写字母、数字和符号。"),
    registrationSubtitle: text("验证码将发送到此邮箱。验证后会生成你的 NeeDo ID。"),
    registrationTitle: text("创建 NeeDo 账号"),
    registerButton: text("发送验证码"),
    registering: text("正在发送…"),
    requiredAccount: text("请输入邮箱或 NeeDo ID 和密码。"),
    requiredRegistration: text("请输入邮箱和密码。"),
    showPassword: text("显示密码"),
    signedInAs: text("当前账号"),
    useAccountSubtitle: text("使用已验证的邮箱或 NeeDo ID 登录。"),
    useAccountTitle: text("账号登录"),
    welcomeSubtitle: text("先确认你的 NeeDo 身份，再进入预约、消息或工作空间。"),
    welcomeTitle: text("欢迎使用 NeeDo"),
    portals: {
      admin: { shortLabel: text("后台"), title: text("NeeDo 运营后台") },
      business: { shortLabel: text("推广"), title: "NeeDoAfirieito" },
      merchant: { shortLabel: text("店铺"), title: text("NeeDo 店铺端") },
      technician: { shortLabel: text("员工"), title: text("NeeDo 员工端") },
      user: { shortLabel: text("用户"), title: text("NeeDo 用户端") }
    }
  };
}

function buildVerificationLabels(
  language: Language,
  kind: VerificationKind
): AuthVerificationLabels {
  return {
    back: translateText("返回", language),
    codeLabel: translateText("六位邮箱验证码", language),
    cooldown: (seconds) => formatLocalized("{seconds} 秒后可重新发送", language, { seconds }),
    destination: (maskedEmail) =>
      formatLocalized("验证码已发送至 {email}", language, {
        email: maskedEmail
      }),
    eyebrow: translateText("身份验证", language),
    expired: translateText("验证码已过期，请重新发送。", language),
    expires: (seconds) => formatLocalized("验证码将在 {seconds} 秒后失效", language, { seconds }),
    invalidLength: translateText("请输入完整的六位验证码。", language),
    resend: translateText(kind === "google" ? "重新使用 Google 验证" : "重新发送验证码", language),
    submit: translateText("确认验证码", language),
    submitting: translateText("正在验证…", language),
    title: translateText("验证邮箱", language)
  };
}

export function resolveLoginErrorMessage(message: string | undefined, language: Language) {
  const errorSource: Record<string, string> = {
    "error.api": "登录服务暂时不可用，请稍后重试。",
    "error.auth.google_api_unavailable": "Google 登录服务暂时不可用，请稍后重试。",
    "error.auth.google_conflict": "Google 账号已绑定到其他 NeeDo 账号",
    "error.auth.google_credential_cancelled": "未完成 Google 账号选择，请重试。",
    "error.auth.google_credential_invalid": "Google 凭证无效或已过期，请重新选择账号。",
    "error.auth.google_credential_timeout": "Google 登录等待超时，请重试。",
    "error.auth.google_nonce_invalid": "Google 登录请求已失效，请重新开始。",
    "error.auth.google_request_in_progress": "Google 登录正在进行，请完成当前操作。",
    "error.auth.google_script_load_failed": "无法加载 Google 登录服务，请检查网络后重试。",
    "error.auth.invalid_credentials": "邮箱、NeeDo ID 或密码不正确。",
    "error.auth.invalid_otp": "验证码不正确，请重新输入。",
    "error.auth.portal_forbidden": "当前账号没有此入口所需的身份，请切换账号后重试。",
    "error.auth.otp_delivery_failed": "验证码发送失败，请稍后重试。",
    "error.auth.otp_cooldown": "请稍候再重新发送验证码。",
    "error.auth.otp_expired": "验证码已过期，请重新发送。",
    "error.auth.verification_attempts_exhausted": "尝试次数过多，请重新获取验证码。",
    "error.auth.verification_challenge_expired": "验证请求已超过有效期限，请重新开始。",
    "error.auth.verification_code_invalid": "验证码不正确，请重新输入。",
    "error.dependency.auth_generation_unavailable": "身份服务暂时不可用，请稍后重试。",
    "error.dependency.google_auth_unavailable": "Google 登录服务暂时不可用，请稍后重试。",
    "error.dependency.redis_unavailable": "身份服务暂时不可用，请稍后重试。",
    "error.network": "网络连接失败，请检查网络后重试。",
    "error.network.timeout": "网络响应超时，请稍后重试。",
    "error.resource_not_found": "登录接口不可用，请联系 NeeDo 支持。",
    "error.response.invalid_json": "登录服务返回异常，请稍后重试。",
    "error.user.email_exists": "该邮箱已注册，请直接登录。"
  };
  const source = message ? errorSource[message.trim()] : undefined;

  return translateText(source ?? "登录服务暂时不可用，请稍后重试。", language);
}

function normalizePortal(value?: string | null): PortalScope {
  if (value === "merchant" || value === "technician" || value === "business") {
    return value;
  }

  if (value === "cps" || value === "afirieito") {
    return "business";
  }

  return "user";
}

function normalizeRedirectRoute(redirectPath: string | null) {
  const normalized = redirectPath?.trim();

  if (
    !normalized ||
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.startsWith("/login")
  ) {
    return null;
  }

  return normalized;
}

function resolvePortalFromRoute(route: string): PortalScope {
  const pathname = route.split(/[?#]/u)[0] || "/";

  if (
    pathname.startsWith("/merchant-admin") ||
    pathname.startsWith("/merchant") ||
    pathname.startsWith("/shop")
  ) {
    return "merchant";
  }

  if (pathname.startsWith("/technician")) {
    return "technician";
  }

  if (
    pathname.startsWith("/NDA-admin") ||
    pathname.startsWith("/nda-admin") ||
    pathname.startsWith("/afirieito-admin") ||
    pathname.startsWith("/CPS-admin") ||
    pathname.startsWith("/cps-admin") ||
    pathname.startsWith("/business-admin") ||
    pathname.startsWith("/afirieito") ||
    pathname.startsWith("/business") ||
    pathname.startsWith("/cps")
  ) {
    return "business";
  }

  return pathname.startsWith("/admin") ? "admin" : "user";
}

export function getPostLoginRoute(portal: PortalScope, redirectPath: string | null) {
  const redirectRoute = normalizeRedirectRoute(redirectPath);
  return !redirectRoute || resolvePortalFromRoute(redirectRoute) !== portal
    ? portalEntryRoute[portal]
    : redirectRoute;
}

export function requiresFormalFrontendLogin(_portal: PortalScope, _redirectPath: string | null) {
  void _portal;
  void _redirectPath;
  return true;
}

export function isGoogleAuthEnabled(value = import.meta.env.VITE_AUTH_GOOGLE_ENABLED) {
  return value?.trim().toLowerCase() !== "false";
}

export function isRegistrationEnabled(
  value = import.meta.env.VITE_AUTH_REGISTRATION_ENABLED
) {
  return value?.trim().toLowerCase() !== "false";
}

function AppMark() {
  return (
    <div className="needo-login-logo mx-auto h-[92px] w-[92px] overflow-hidden rounded-[26px]">
      <img
        alt=""
        aria-hidden="true"
        className="needo-login-logo__mark h-full w-full object-cover"
        draggable="false"
        src={loginIconMarkUrl}
      />
    </div>
  );
}

export function LoginPage({
  googleAuthEnabled = isGoogleAuthEnabled(),
  registrationEnabled = isRegistrationEnabled(),
  navigateToPortal = openPortalEntry
}: {
  googleAuthEnabled?: boolean;
  registrationEnabled?: boolean;
  navigateToPortal?: (portal: PortalScope, route: string) => void;
}) {
  const { portal } = useParams();
  const [searchParams] = useSearchParams();
  const { language } = useI18n();
  const { theme, isNight } = useClientTheme();
  const {
    authenticateWithGoogleCredential,
    canAccess,
    hasRememberedPortalAuthorization,
    isAuthenticated,
    login,
    logout,
    session,
    startRegistration,
    switchPortal,
    verifyGoogleRegistrationOrLink,
    verifyRegistration
  } = useAuth();
  const requestedPortal = normalizePortal(portal);
  const redirectPath = searchParams.get("redirect");
  const [activePortal, setActivePortal] = useState<PortalScope>(requestedPortal);
  const passwordSaveScope = `frontend:${activePortal}` as BrowserPasswordSaveScope;
  const [savePassword, setSavePassword] = useState(() =>
    readBrowserPasswordSavePreference(`frontend:${requestedPortal}` as BrowserPasswordSaveScope)
  );
  const [panelMode, setPanelMode] = useState<LoginPanelMode>("welcome");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [generatedNeedoId, setGeneratedNeedoId] = useState<GeneratedNeedoIdState | null>(null);
  const [feedback, setFeedback] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [googleFlowKey, setGoogleFlowKey] = useState(0);
  const [googleState, setGoogleState] = useState<"connecting" | "error" | "idle">("idle");
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const googleFlowGenerationRef = useRef(0);
  const navigationInFlightRef = useRef(false);
  const copy = useMemo(() => buildLoginCopy(language), [language]);
  const activePortalCopy = copy.portals[activePortal];
  const nextPath = useMemo(
    () => getPostLoginRoute(activePortal, redirectPath),
    [activePortal, redirectPath]
  );
  const hasRememberedActivePortal = hasRememberedPortalAuthorization(activePortal);
  const hasActiveAccess = (isAuthenticated && canAccess(activePortal)) || hasRememberedActivePortal;

  const handleLogout = async () => {
    const result = await logout();
    if (!result.ok) setFeedback(resolveLoginErrorMessage(result.message, language));
  };

  useEffect(() => setActivePortal(requestedPortal), [requestedPortal]);
  useEffect(() => {
    setSavePassword(readBrowserPasswordSavePreference(passwordSaveScope));
  }, [passwordSaveScope]);
  useEffect(() => {
    navigationInFlightRef.current = false;
  }, [activePortal, nextPath]);

  const enterPortal = useCallback(async () => {
    if (navigationInFlightRef.current) {
      return;
    }

    navigationInFlightRef.current = true;
    if (isAuthenticated || hasRememberedPortalAuthorization(activePortal)) {
      const switched = await switchPortal(activePortal);
      if (!switched.ok) {
        navigationInFlightRef.current = false;
        setFeedback(resolveLoginErrorMessage(switched.message, language));
        return;
      }
    }

    navigateToPortal(activePortal, nextPath);
  }, [
    activePortal,
    hasRememberedPortalAuthorization,
    isAuthenticated,
    language,
    navigateToPortal,
    nextPath,
    switchPortal
  ]);

  useEffect(() => {
    if (hasActiveAccess && !pending && !generatedNeedoId && panelMode === "welcome") {
      void enterPortal();
    }
  }, [enterPortal, generatedNeedoId, hasActiveAccess, panelMode, pending]);

  useEffect(() => {
    const container = googleContainerRef.current;
    if (
      !googleAuthEnabled ||
      !container ||
      panelMode !== "welcome" ||
      hasActiveAccess ||
      generatedNeedoId
    ) {
      return;
    }

    container.replaceChildren();
    let active = true;
    const flowGeneration = googleFlowGenerationRef.current + 1;
    googleFlowGenerationRef.current = flowGeneration;
    const isCurrentFlow = () => active && googleFlowGenerationRef.current === flowGeneration;
    setGoogleState("connecting");
    setFeedback("");

    const run = async () => {
      try {
        const initialization = await authApi.initializeGoogleLogin();
        if (!isCurrentFlow()) return;
        const credential = await requestGoogleCredential({
          clientId: initialization.clientId,
          container,
          nonce: initialization.nonce
        });
        if (!isCurrentFlow()) return;
        const result = await authenticateWithGoogleCredential(
          {
            credential,
            nonceChallengeId: initialization.nonceChallengeId
          },
          activePortal
        );
        if (!isCurrentFlow()) return;
        if (!result.ok) {
          setGoogleState("error");
          setFeedback(resolveLoginErrorMessage(result.message, language));
          return;
        }
        if (result.status === "verification_required") {
          setVerification({ challenge: result.challenge, kind: "google" });
          setVerificationError("");
          setPanelMode("verification");
          setGoogleState("idle");
          return;
        }
        navigateToPortal(
          result.session.portal,
          getPostLoginRoute(result.session.portal, redirectPath)
        );
      } catch (error) {
        if (!isCurrentFlow()) return;
        setGoogleState("error");
        setFeedback(
          resolveLoginErrorMessage(error instanceof Error ? error.message : undefined, language)
        );
      }
    };

    void run();
    return () => {
      active = false;
      if (googleFlowGenerationRef.current === flowGeneration) {
        googleFlowGenerationRef.current += 1;
      }
    };
  }, [
    activePortal,
    generatedNeedoId,
    googleFlowKey,
    googleAuthEnabled,
    hasActiveAccess,
    language,
    authenticateWithGoogleCredential,
    navigateToPortal,
    panelMode,
    redirectPath
  ]);

  const handleAccountLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFeedback("");
    const formData = new FormData(event.currentTarget);
    const submittedIdentifier = formData.get("username");
    const submittedPassword = formData.get("password");
    const identifier = (
      typeof submittedIdentifier === "string" ? submittedIdentifier : loginIdentifier
    ).trim();
    const password = typeof submittedPassword === "string" ? submittedPassword : loginPassword;
    if (!identifier || !password) {
      setFeedback(copy.requiredAccount);
      return;
    }

    setPending(true);
    try {
      const result = await login(activePortal, identifier, password);
      if (!result.ok) {
        setFeedback(resolveLoginErrorMessage(result.message, language));
        return;
      }
      if (savePassword && result.session.portal === activePortal) {
        await requestBrowserPasswordSave({
          id: identifier,
          name: "NeeDo",
          password
        });
      }
      navigateToPortal(
        result.session.portal,
        getPostLoginRoute(result.session.portal, redirectPath)
      );
    } finally {
      setPending(false);
    }
  };

  const handleRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || activePortal !== "user") return;
    setFeedback("");
    const email = registrationEmail.trim();
    if (!email || !registrationPassword) {
      setFeedback(copy.requiredRegistration);
      return;
    }

    setPending(true);
    try {
      const result = await startRegistration({
        email,
        password: registrationPassword
      });
      if (!result.ok) {
        setFeedback(resolveLoginErrorMessage(result.message, language));
        return;
      }
      setVerification({ challenge: result.challenge, kind: "registration" });
      setVerificationError("");
      setPanelMode("verification");
    } finally {
      setPending(false);
    }
  };

  const handleVerificationSubmit = async (otp: string) => {
    if (!verification || pending) return;
    setPending(true);
    setVerificationError("");
    try {
      const input = { challengeId: verification.challenge.challengeId, otp };
      const result =
        verification.kind === "registration"
          ? await verifyRegistration(input)
          : await verifyGoogleRegistrationOrLink(input, activePortal);
      if (!result.ok) {
        setVerificationError(resolveLoginErrorMessage(result.message, language));
        return;
      }
      if (result.needoId) {
        setGeneratedNeedoId({
          needoId: result.needoId,
          session: result.session
        });
        setCopied(false);
        setCopyError("");
        setPanelMode("needo-id");
        return;
      }
      navigateToPortal(
        result.session.portal,
        getPostLoginRoute(result.session.portal, redirectPath)
      );
    } finally {
      setPending(false);
    }
  };

  const handleVerificationResend = async () => {
    if (!verification || pending) return;
    setVerificationError("");
    if (verification.kind === "google") {
      setVerification(null);
      setPanelMode("welcome");
      setGoogleFlowKey((current) => current + 1);
      return;
    }

    setPending(true);
    try {
      const result = await startRegistration({
        email: registrationEmail.trim(),
        password: registrationPassword
      });
      if (!result.ok) {
        setVerificationError(resolveLoginErrorMessage(result.message, language));
        return;
      }
      setVerification({ challenge: result.challenge, kind: "registration" });
    } finally {
      setPending(false);
    }
  };

  const handleVerificationBack = () => {
    const returningFromGoogle = verification?.kind === "google";
    const priorMode = returningFromGoogle ? "welcome" : "register";
    setVerification(null);
    setVerificationError("");
    setPanelMode(priorMode);
    if (returningFromGoogle) {
      setGoogleFlowKey((current) => current + 1);
    }
  };

  const handleCopyNeedoId = async () => {
    if (!generatedNeedoId) return;
    setCopyError("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(generatedNeedoId.needoId);
      setCopied(true);
    } catch {
      setCopyError(copy.copyFailed);
    }
  };

  const resetToWelcome = () => {
    setPanelMode("welcome");
    setFeedback("");
    setVerificationError("");
  };

  const leaveGoogleWelcome = (nextMode: "account" | "register") => {
    googleFlowGenerationRef.current += 1;
    setPanelMode(nextMode);
    setFeedback("");
  };

  return (
    <div
      className={cn(
        "client-shell flex min-h-[100dvh] bg-[color:var(--client-bg)] px-5 text-[color:var(--client-text)]",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme)
      )}
      data-no-i18n
    >
      <main
        className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col pb-8 pt-[calc(env(safe-area-inset-top,0px)+16px)]"
        style={{ maxWidth: "440px" }}
      >
        <header className="flex min-h-11 items-center justify-between gap-3">
          {panelMode === "account" || panelMode === "register" ? (
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-full px-1 text-sm font-black text-[color:var(--client-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
              onClick={resetToWelcome}
              type="button"
            >
              {copy.back}
            </button>
          ) : (
            <span className="text-sm font-black text-[color:var(--client-soft-muted)]">
              {activePortalCopy.shortLabel}
            </span>
          )}
          <LanguageSwitcher dark={isNight} iconOnly />
        </header>

        <section className="flex flex-1 flex-col justify-center py-8 text-center">
          <AppMark />
          <h1 className="mt-7 text-[32px] font-black leading-tight tracking-normal text-[color:var(--client-text)]">
            {copy.welcomeTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-[340px] text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
            {copy.welcomeSubtitle}
          </p>

          <div className="mt-8">
            {generatedNeedoId ? (
              <div className="space-y-5" data-testid="generated-needo-id">
                <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_8%,var(--client-surface))] p-5 text-left shadow-[var(--client-shadow)]">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">
                    {copy.generatedTitle}
                  </p>
                  <p className="mt-4 select-all break-all font-mono text-2xl font-black tracking-[0.08em] text-[color:var(--client-text)]">
                    {generatedNeedoId.needoId}
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
                    {copy.generatedDescription}
                  </p>
                  <button
                    className="mt-4 min-h-11 rounded-full border border-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
                    data-testid="generated-needo-id-copy"
                    onClick={() => void handleCopyNeedoId()}
                    type="button"
                  >
                    {copied ? copy.copied : copy.copy}
                  </button>
                  {copyError ? (
                    <p
                      className="mt-3 text-sm font-bold text-[color:var(--client-accent)]"
                      role="alert"
                    >
                      {copyError}
                    </p>
                  ) : null}
                </div>
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
                  data-testid="generated-needo-id-continue"
                  onClick={() =>
                    navigateToPortal(
                      generatedNeedoId.session.portal,
                      getPostLoginRoute(generatedNeedoId.session.portal, redirectPath)
                    )
                  }
                  type="button"
                >
                  {copy.continueButton}
                </button>
              </div>
            ) : panelMode === "verification" && verification ? (
              <AuthVerificationPanel
                attemptFeedback={translateText("最多可尝试 5 次", language)}
                challenge={verification.challenge}
                error={verificationError}
                key={verification.challenge.challengeId}
                labels={buildVerificationLabels(language, verification.kind)}
                onBack={handleVerificationBack}
                onResend={handleVerificationResend}
                onSubmit={handleVerificationSubmit}
                pending={pending}
              />
            ) : panelMode === "welcome" && hasActiveAccess ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[color:var(--client-surface)] p-5 text-left shadow-[var(--client-shadow)]">
                  <p className="text-sm font-black text-[color:var(--client-primary)]">
                    {copy.continueTitle}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
                    {copy.signedInAs}:{" "}
                    <strong className="text-[color:var(--client-text)]">
                      {session?.email || session?.needoId || activePortalCopy.title}
                    </strong>
                  </p>
                </div>
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)]"
                  onClick={() => void enterPortal()}
                  type="button"
                >
                  {copy.continueButton} {activePortalCopy.shortLabel}
                </button>
                <button
                  className="h-12 w-full rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black text-[color:var(--client-muted)]"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  {copy.logout}
                </button>
              </div>
            ) : panelMode === "register" && registrationEnabled ? (
              <form
                className="space-y-5 text-left"
                data-testid="registration-form"
                onSubmit={handleRegistration}
              >
                <div className="text-center">
                  <h2 className="text-2xl font-black text-[color:var(--client-text)]">
                    {copy.registrationTitle}
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
                    {copy.registrationSubtitle}
                  </p>
                </div>
                <label className="block">
                  <span className="text-sm font-black text-[color:var(--client-muted)]">
                    {copy.registrationEmailLabel}
                  </span>
                  <input
                    autoComplete="email"
                    className="mt-2 h-14 w-full rounded-[8px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-base font-bold outline-none focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                    data-testid="registration-email"
                    disabled={pending}
                    onChange={(event) => setRegistrationEmail(event.target.value)}
                    placeholder={copy.registrationEmailPlaceholder}
                    type="email"
                    value={registrationEmail}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-black text-[color:var(--client-muted)]">
                    {copy.passwordLabel}
                  </span>
                  <PasswordInput
                    autoComplete="new-password"
                    data-testid="registration-password"
                    disabled={pending}
                    hidePasswordLabel={copy.hidePassword}
                    inputClassName="h-14 w-full rounded-[8px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 pr-14 text-base font-bold outline-none focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                    onChange={(event) => setRegistrationPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    showPasswordLabel={copy.showPassword}
                    value={registrationPassword}
                    wrapperClassName="mt-2"
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[color:var(--client-soft-muted)]">
                    {copy.registrationPasswordHint}
                  </span>
                </label>
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] disabled:opacity-60"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? copy.registering : copy.registerButton}
                </button>
              </form>
            ) : panelMode === "account" ? (
              <form
                action="/api/v1/auth/login"
                autoComplete="on"
                className="space-y-5 text-left"
                data-testid="password-login-form"
                method="post"
                onSubmit={handleAccountLogin}
              >
                <div className="text-center">
                  <h2 className="text-2xl font-black text-[color:var(--client-text)]">
                    {copy.useAccountTitle}
                  </h2>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">
                    {copy.useAccountSubtitle}
                  </p>
                </div>
                <label className="block">
                  <span className="text-sm font-black text-[color:var(--client-muted)]">
                    {copy.accountLabel}
                  </span>
                  <input
                    autoComplete="username"
                    className="mt-2 h-14 w-full rounded-[8px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-base font-bold outline-none focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                    data-testid="login-identifier"
                    name="username"
                    onChange={(event) => setLoginIdentifier(event.target.value)}
                    placeholder={copy.accountPlaceholder}
                    type="text"
                    value={loginIdentifier}
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-sm font-black text-[color:var(--client-muted)]">
                      {copy.passwordLabel}
                    </span>
                    <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--client-muted)]">
                      <span>{copy.savePassword}</span>
                      <ToggleSwitch
                        ariaLabel={copy.savePassword}
                        checked={savePassword}
                        disabled={pending}
                        onChange={(enabled) => {
                          setSavePassword(enabled);
                          writeBrowserPasswordSavePreference(passwordSaveScope, enabled);
                        }}
                      />
                    </span>
                  </span>
                  <PasswordInput
                    autoComplete="current-password"
                    data-testid="login-password"
                    disabled={pending}
                    hidePasswordLabel={copy.hidePassword}
                    inputClassName="h-14 w-full rounded-[8px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 pr-14 text-base font-bold outline-none focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                    name="password"
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    showPasswordLabel={copy.showPassword}
                    value={loginPassword}
                    wrapperClassName="mt-2"
                  />
                </label>
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] disabled:opacity-60"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? copy.loginPending : copy.loginButton}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <button
                  className="h-14 w-full rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-5 text-base font-black text-[color:var(--client-text)] shadow-[var(--client-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
                  data-testid="show-password-login"
                  onClick={() => leaveGoogleWelcome("account")}
                  type="button"
                >
                  {copy.accountLogin}
                </button>
                {activePortal === "user" && registrationEnabled ? (
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-black text-[color:var(--client-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
                    data-testid="show-registration"
                    onClick={() => leaveGoogleWelcome("register")}
                    type="button"
                  >
                    {copy.createAccount}
                  </button>
                ) : null}
              </div>
            )}

            {googleAuthEnabled ? (
              <div
                className={
                  panelMode === "welcome" && !hasActiveAccess && !generatedNeedoId
                    ? "mt-4"
                    : "hidden"
                }
              >
                <div className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-3">
                  <p className="mb-2 text-xs font-bold text-[color:var(--client-muted)]">
                    {copy.googlePrompt}
                  </p>
                  <div
                    aria-label={copy.googleLogin}
                    className="flex min-h-11 items-center justify-center"
                    data-testid="google-identity-button"
                    ref={googleContainerRef}
                  />
                  {googleState === "error" ? (
                    <button
                      className="mt-2 min-h-11 rounded-full px-4 text-sm font-black text-[color:var(--client-primary)]"
                      onClick={() => setGoogleFlowKey((current) => current + 1)}
                      type="button"
                    >
                      {copy.googleRestart}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {feedback ? (
              <p
                className="mt-4 rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-accent)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,var(--client-bg))] px-4 py-3 text-left text-sm font-bold leading-5 text-[color:var(--client-accent)]"
                role="alert"
              >
                {feedback}
              </p>
            ) : null}
          </div>
        </section>

        <footer className="pb-[env(safe-area-inset-bottom,0px)]">
          <p className="text-center text-xs font-semibold leading-5 text-[color:var(--client-soft-muted)]">
            {copy.copyright}
          </p>
        </footer>
      </main>
    </div>
  );
}
