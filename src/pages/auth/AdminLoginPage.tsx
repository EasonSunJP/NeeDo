import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAdminLoginPortalScope, type AdminLoginPortal } from "../../auth/adminLogin";
import {
  readBrowserPasswordSavePreference,
  requestBrowserPasswordSave,
  writeBrowserPasswordSavePreference,
  type BrowserPasswordSaveScope
} from "../../auth/browserPasswordSave";
import type { PortalScope } from "../../auth/portal";
import { useAuth } from "../../auth/AuthProvider";
import { purgeLegacyRememberedCredentials } from "../../auth/rememberCredentials";
import { backendManagementSystemBgUrl } from "../../assets/runtime/images";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  defaultDayAdminTheme,
  defaultNightAdminTheme,
  detectSystemAdminTheme,
  isDarkAdminTheme,
  normalizeAdminTheme,
  platformAdminThemeOptions,
  sharedAdminThemeOptions,
  type AdminTheme
} from "../../theme/AdminTheme";

type LoginMode = "account" | "code" | "qr";

type BackendLoginCopy = {
  pageEyebrow: string;
  pageTitle: string;
  pageSubtitle: Record<AdminLoginPortal, string>;
  portalName: Record<AdminLoginPortal, string>;
  portalSubtitle: Record<AdminLoginPortal, string>;
  tabs: Record<LoginMode, string>;
  accountLabel: string;
  accountPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  savePassword: string;
  codeEmailLabel: string;
  codeEmailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  sendCode: string;
  codeSent: string;
  login: string;
  continue: string;
  loggedIn: string;
  loggedInAs: string;
  logout: string;
  qrTitle: string;
  qrSubtitle: string;
  qrTokenLabel: string;
  qrApprove: string;
  qrApproved: string;
  accountError: string;
  codeError: string;
  qrError: string;
  requiredError: string;
  portalMismatchError: string;
  copyright: string;
};

const adminLoginCopyrightText = "Copyright © 2026 LifeDance Co., Ltd. All rights reserved.";

const adminLoginCopy = {
  zh: {
    pageEyebrow: "NeeDo 后台",
    pageTitle: "欢迎回来",
    pageSubtitle: {
      admin: "请使用运营后台",
      "merchant-admin": "请使用商户/店铺后台",
      "afirieito-admin": "请使用后台账号登录"
    },
    portalName: {
      admin: "运营后台",
      "merchant-admin": "商户后台",
      "afirieito-admin": "NDA管理后台"
    },
    portalSubtitle: {
      admin: "平台运营、订单、用户、技师、店铺与财务管理入口",
      "merchant-admin": "门店订单、排班、人员、财务与店铺设置入口",
      "afirieito-admin": "推广计划、素材、归因、佣金与风控管理入口"
    },
    tabs: {
      account: "账号登录",
      code: "验证码登录",
      qr: "扫码登录"
    },
    accountLabel: "邮箱",
    accountPlaceholder: "admin@example.com",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    savePassword: "保存密码",
    codeEmailLabel: "登录邮箱",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "验证码",
    codePlaceholder: "6 位验证码",
    sendCode: "获取验证码",
    codeSent: "验证码已发送，请查看对应邮箱或开发环境 OTP 交付日志。",
    login: "登录",
    continue: "进入后台",
    loggedIn: "当前已登录",
    loggedInAs: "登录账号",
    logout: "退出登录",
    qrTitle: "扫码登录尚未启用",
    qrSubtitle: "正式的服务端一次性登录码接口完成前，此入口不会生成或接受二维码。",
    qrTokenLabel: "登录码",
    qrApprove: "扫码登录不可用",
    qrApproved: "扫码登录不可用。",
    accountError: "账号或密码不正确，请确认后再试。",
    codeError: "验证码不正确或已过期，请确认后再试。",
    qrError: "二维码登录暂未接入真实接口，请使用邮箱或验证码登录。",
    requiredError: "请先填写登录信息。",
    portalMismatchError: "当前账号没有这个后台的访问权限，请使用对应后台账号登录。",
    copyright: adminLoginCopyrightText
  },
  "zh-Hant": {
    pageEyebrow: "NeeDo 後台",
    pageTitle: "歡迎回來",
    pageSubtitle: {
      admin: "請使用營運後台",
      "merchant-admin": "請使用商戶／店鋪後台",
      "afirieito-admin": "請使用後台帳號登入"
    },
    portalName: {
      admin: "營運後台",
      "merchant-admin": "商戶後台",
      "afirieito-admin": "NDA管理後台"
    },
    portalSubtitle: {
      admin: "平台營運、訂單、用戶、技師、店鋪與財務管理入口",
      "merchant-admin": "門店訂單、排班、人員、財務與店鋪設定入口",
      "afirieito-admin": "推廣計劃、素材、歸因、佣金與風控管理入口"
    },
    tabs: {
      account: "帳號登入",
      code: "驗證碼登入",
      qr: "掃碼登入"
    },
    accountLabel: "信箱",
    accountPlaceholder: "admin@example.com",
    passwordLabel: "密碼",
    passwordPlaceholder: "請輸入密碼",
    savePassword: "儲存密碼",
    codeEmailLabel: "登入信箱",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "驗證碼",
    codePlaceholder: "6 位驗證碼",
    sendCode: "取得驗證碼",
    codeSent: "驗證碼已發送，請查看對應信箱或開發環境 OTP 交付日誌。",
    login: "登入",
    continue: "進入後台",
    loggedIn: "目前已登入",
    loggedInAs: "登入帳號",
    logout: "登出",
    qrTitle: "掃碼登入尚未啟用",
    qrSubtitle: "正式的服務端一次性登入碼接口完成前，此入口不會產生或接受 QR 碼。",
    qrTokenLabel: "登入碼",
    qrApprove: "掃碼登入不可用",
    qrApproved: "掃碼登入不可用。",
    accountError: "帳號或密碼不正確，請確認後再試。",
    codeError: "驗證碼不正確或已過期，請確認後再試。",
    qrError: "QR 登入尚未接入真實接口，請使用信箱或驗證碼登入。",
    requiredError: "請先填寫登入資訊。",
    portalMismatchError: "目前帳號沒有此後台的存取權限，請使用對應後台帳號登入。",
    copyright: adminLoginCopyrightText
  },
  ja: {
    pageEyebrow: "NeeDo 管理",
    pageTitle: "お帰りなさい",
    pageSubtitle: {
      admin: "運営管理画面をご利用ください",
      "merchant-admin": "店舗管理画面をご利用ください",
      "afirieito-admin": "管理アカウントでログインしてください"
    },
    portalName: {
      admin: "運営管理",
      "merchant-admin": "店舗管理",
      "afirieito-admin": "NDA管理"
    },
    portalSubtitle: {
      admin: "プラットフォーム運営、注文、ユーザー、スタッフ、店舗、財務の管理入口",
      "merchant-admin": "店舗注文、シフト、人員、財務、店舗設定の管理入口",
      "afirieito-admin": "紹介プラン、素材、成果計測、報酬、リスク管理の入口"
    },
    tabs: {
      account: "アカウントログイン",
      code: "認証コードログイン",
      qr: "QRログイン"
    },
    accountLabel: "メール",
    accountPlaceholder: "admin@example.com",
    passwordLabel: "パスワード",
    passwordPlaceholder: "パスワードを入力",
    savePassword: "パスワードを保存",
    codeEmailLabel: "ログインメール",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "認証コード",
    codePlaceholder: "6桁のコード",
    sendCode: "コードを取得",
    codeSent: "認証コードを送信しました。メールまたは開発環境の OTP 配信ログを確認してください。",
    login: "ログイン",
    continue: "管理画面へ",
    loggedIn: "ログイン済み",
    loggedInAs: "ログインアカウント",
    logout: "ログアウト",
    qrTitle: "QRログインは利用できません",
    qrSubtitle: "サーバー発行のワンタイムログインコード API が完成するまで、QRコードは発行・受理しません。",
    qrTokenLabel: "ログインコード",
    qrApprove: "QRログインは利用できません",
    qrApproved: "QRログインは利用できません。",
    accountError: "アカウントまたはパスワードが違います。内容を確認してください。",
    codeError: "認証コードが違うか期限切れです。内容を確認してください。",
    qrError: "QRログインはまだ正式 API に接続されていません。メールまたは認証コードでログインしてください。",
    requiredError: "ログイン情報を入力してください。",
    portalMismatchError: "このアカウントにはこの管理画面へのアクセス権がありません。対応する管理アカウントでログインしてください。",
    copyright: adminLoginCopyrightText
  },
  en: {
    pageEyebrow: "NeeDo Admin",
    pageTitle: "Welcome back",
    pageSubtitle: {
      admin: "Please use Operations Admin",
      "merchant-admin": "Please use Merchant / Store Admin",
      "afirieito-admin": "Sign in with your admin account"
    },
    portalName: {
      admin: "Operations Admin",
      "merchant-admin": "Merchant Admin",
      "afirieito-admin": "NDA Admin"
    },
    portalSubtitle: {
      admin: "Platform operations, orders, users, technicians, stores, and finance",
      "merchant-admin": "Store orders, scheduling, staff, finance, and store settings",
      "afirieito-admin": "Campaigns, creatives, attribution, commissions, and risk control"
    },
    tabs: {
      account: "Account Login",
      code: "Code Login",
      qr: "QR Login"
    },
    accountLabel: "Email",
    accountPlaceholder: "admin@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter password",
    savePassword: "Save password",
    codeEmailLabel: "Login email",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "Verification code",
    codePlaceholder: "6-digit code",
    sendCode: "Send code",
    codeSent: "Code sent. Check the mailbox or development OTP delivery logs.",
    login: "Log in",
    continue: "Enter Admin",
    loggedIn: "Already signed in",
    loggedInAs: "Signed in as",
    logout: "Log out",
    qrTitle: "QR login is unavailable",
    qrSubtitle: "No QR code is issued or accepted until the server-backed single-use login-code API is complete.",
    qrTokenLabel: "Login code",
    qrApprove: "QR login unavailable",
    qrApproved: "QR login is unavailable.",
    accountError: "The account or password is incorrect. Please check and try again.",
    codeError: "The code is incorrect or expired. Please check and try again.",
    qrError: "QR login is not connected to the real API yet. Use email or code login.",
    requiredError: "Fill in the login information first.",
    portalMismatchError: "This account does not have access to this admin area. Sign in with the matching admin account.",
    copyright: adminLoginCopyrightText
  },
  ko: {
    pageEyebrow: "NeeDo 관리자",
    pageTitle: "다시 오신 것을 환영합니다",
    pageSubtitle: {
      admin: "운영 관리자 화면을 이용해 주세요",
      "merchant-admin": "가맹점/매장 관리자 화면을 이용해 주세요",
      "afirieito-admin": "관리자 계정으로 로그인하세요"
    },
    portalName: {
      admin: "운영 관리자",
      "merchant-admin": "상점 관리자",
      "afirieito-admin": "NDA 관리자"
    },
    portalSubtitle: {
      admin: "플랫폼 운영, 주문, 사용자, 기사, 상점, 재무 관리 입구",
      "merchant-admin": "상점 주문, 근무표, 직원, 재무, 상점 설정 입구",
      "afirieito-admin": "캠페인, 소재, 어트리뷰션, 커미션, 리스크 관리 입구"
    },
    tabs: {
      account: "계정 로그인",
      code: "인증코드 로그인",
      qr: "QR 로그인"
    },
    accountLabel: "이메일",
    accountPlaceholder: "admin@example.com",
    passwordLabel: "비밀번호",
    passwordPlaceholder: "비밀번호 입력",
    savePassword: "비밀번호 저장",
    codeEmailLabel: "로그인 이메일",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "인증코드",
    codePlaceholder: "6자리 코드",
    sendCode: "코드 받기",
    codeSent: "인증코드를 보냈습니다. 메일함 또는 개발 환경 OTP 전달 로그를 확인하세요.",
    login: "로그인",
    continue: "관리자로 이동",
    loggedIn: "이미 로그인됨",
    loggedInAs: "로그인 계정",
    logout: "로그아웃",
    qrTitle: "QR 로그인을 사용할 수 없습니다",
    qrSubtitle: "서버 기반 일회용 로그인 코드 API가 완성되기 전에는 QR 코드를 발급하거나 허용하지 않습니다.",
    qrTokenLabel: "로그인 코드",
    qrApprove: "QR 로그인 사용 불가",
    qrApproved: "QR 로그인을 사용할 수 없습니다.",
    accountError: "계정 또는 비밀번호가 올바르지 않습니다. 확인 후 다시 시도하세요.",
    codeError: "인증코드가 올바르지 않거나 만료되었습니다. 확인 후 다시 시도하세요.",
    qrError: "QR 로그인은 아직 실제 API에 연결되지 않았습니다. 이메일 또는 인증코드로 로그인하세요.",
    requiredError: "먼저 로그인 정보를 입력하세요.",
    portalMismatchError: "현재 계정은 이 관리자 화면에 접근할 수 없습니다. 해당 관리자 계정으로 로그인하세요.",
    copyright: adminLoginCopyrightText
  }
} satisfies Record<Language, BackendLoginCopy>;

const backendDefaultLoginEmails = {
  admin: "",
  "merchant-admin": "",
  "afirieito-admin": ""
} as const satisfies Record<AdminLoginPortal, string>;

const backendLoginConfig = {
  admin: {
    authPortal: getAdminLoginPortalScope("admin"),
    defaultEmail: backendDefaultLoginEmails.admin,
    entryPath: "/admin",
    background: backendManagementSystemBgUrl,
    themeStorageKey: "needo.admin.theme",
    themePreferenceModeStorageKey: "needo.admin.theme.mode",
    themeOptions: platformAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  },
  "merchant-admin": {
    authPortal: getAdminLoginPortalScope("merchant-admin"),
    defaultEmail: backendDefaultLoginEmails["merchant-admin"],
    entryPath: "/merchant-admin",
    background: backendManagementSystemBgUrl,
    themeStorageKey: "needo.merchant-admin.theme",
    themePreferenceModeStorageKey: "needo.merchant-admin.theme.mode",
    themeOptions: sharedAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  },
  "afirieito-admin": {
    authPortal: getAdminLoginPortalScope("afirieito-admin"),
    defaultEmail: backendDefaultLoginEmails["afirieito-admin"],
    entryPath: "/NDA-admin",
    background: backendManagementSystemBgUrl,
    themeStorageKey: "needo.afirieito-admin.theme",
    themePreferenceModeStorageKey: "needo.afirieito-admin.theme.mode",
    themeOptions: sharedAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  }
} as const;

export function resolveBackendLoginTarget(sessionPortal: PortalScope, requestedPortal: PortalScope, nextPath: string) {
  return sessionPortal === requestedPortal ? nextPath : null;
}

function normalizeMode(value: string | null): LoginMode {
  if (value === "code" || value === "qr") {
    return value;
  }

  return "account";
}

function getInitialBackendLoginTheme(portal: AdminLoginPortal): AdminTheme {
  const config = backendLoginConfig[portal];

  if (typeof window === "undefined") {
    return config.dayTheme;
  }

  const preferenceMode = window.localStorage.getItem(config.themePreferenceModeStorageKey);
  const storedTheme = window.localStorage.getItem(config.themeStorageKey);

  if (preferenceMode === "manual") {
    return normalizeAdminTheme(storedTheme, config.dayTheme, config.themeOptions, config.legacyDarkTheme);
  }

  return detectSystemAdminTheme(config.dayTheme, config.nightTheme, config.themeOptions);
}

export function AdminLoginPage({ portal }: { portal: AdminLoginPortal }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    canAccess,
    isAuthenticated,
    loginWithFormalPassword,
    loginWithVerificationCode,
    logout,
    sendVerificationCode,
    session,
    switchPortal
  } = useAuth();
  const { language } = useI18n();
  const copy = adminLoginCopy[language];
  const config = backendLoginConfig[portal];
  const passwordSaveScope = `backend:${portal}` as BrowserPasswordSaveScope;
  const theme = useMemo(() => getInitialBackendLoginTheme(portal), [portal]);
  const requestedMode = normalizeMode(searchParams.get("mode"));
  const [mode, setMode] = useState<LoginMode>(requestedMode);
  const [account, setAccount] = useState<string>(config.defaultEmail);
  const [password, setPassword] = useState<string>("");
  const [savePassword, setSavePassword] = useState(() =>
    readBrowserPasswordSavePreference(passwordSaveScope)
  );
  const [codeEmail, setCodeEmail] = useState<string>(config.defaultEmail);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const redirectPath = searchParams.get("redirect");
  const nextPath = redirectPath || config.entryPath;
  const hasAccess = isAuthenticated && canAccess(config.authPortal);
  const navigateToBackendSession = useCallback(
    (sessionPortal: PortalScope) => {
      const target = resolveBackendLoginTarget(sessionPortal, config.authPortal, nextPath);

      if (!target) {
        setError(copy.portalMismatchError);
        return;
      }

      navigate(target, { replace: true });
    },
    [config.authPortal, copy.portalMismatchError, navigate, nextPath]
  );
  const enterExistingBackendSession = useCallback(async () => {
    setError("");
    const result = await switchPortal(config.authPortal);

    if (!result.ok) {
      setError(copy.portalMismatchError);
      return;
    }

    navigateToBackendSession(result.session.portal);
  }, [config.authPortal, copy.portalMismatchError, navigateToBackendSession, switchPortal]);

  useEffect(() => {
    setMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    purgeLegacyRememberedCredentials();
    setAccount(config.defaultEmail);
    setPassword("");
    setCodeEmail(config.defaultEmail);
  }, [config.defaultEmail]);

  useEffect(() => {
    setSavePassword(readBrowserPasswordSavePreference(passwordSaveScope));
  }, [passwordSaveScope]);

  const modeButtons = useMemo<Array<{ mode: LoginMode; label: string }>>(
    () => [
      { mode: "account", label: copy.tabs.account },
      { mode: "code", label: copy.tabs.code },
      { mode: "qr", label: copy.tabs.qr }
    ],
    [copy.tabs.account, copy.tabs.code, copy.tabs.qr]
  );

  const submitAccountLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const submittedAccount = formData.get("username");
    const submittedPassword = formData.get("password");
    const loginAccount = (
      typeof submittedAccount === "string" ? submittedAccount : account
    ).trim();
    const loginPassword =
      typeof submittedPassword === "string" ? submittedPassword : password;

    if (!loginAccount || !loginPassword.trim()) {
      setError(copy.requiredError);
      return;
    }

    const result = await loginWithFormalPassword(
      config.authPortal,
      loginAccount,
      loginPassword
    );
    if (!result.ok) {
      setError(result.message || copy.accountError);
      return;
    }

    if (savePassword && result.session.portal === config.authPortal) {
      await requestBrowserPasswordSave({
        id: loginAccount,
        name: copy.portalName[portal],
        password: loginPassword
      });
    }

    navigateToBackendSession(result.session.portal);
  };

  const updateSavePassword = (enabled: boolean) => {
    setSavePassword(enabled);
    writeBrowserPasswordSavePreference(passwordSaveScope, enabled);
  };

  const submitCodeLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!codeEmail.trim() || !code.trim()) {
      setError(copy.requiredError);
      return;
    }

    const result = await loginWithVerificationCode(config.authPortal, codeEmail, code);
    if (!result.ok) {
      setError(result.message || copy.codeError);
      return;
    }

    navigateToBackendSession(result.session.portal);
  };

  const requestCode = async () => {
    setError("");
    const result = await sendVerificationCode(codeEmail);

    if (!result.ok) {
      setError(result.message || copy.codeError);
      return;
    }

    setCodeSent(true);
  };

  return (
    <div
      className={cn(
        "admin-shell admin-login-shell",
        portal !== "admin" && "merchant-admin-shell",
        portal === "afirieito-admin" && "cps-admin-shell",
        `admin-theme-${theme}`
      )}
      data-no-i18n
    >
      <main className="admin-login-layout">
        <section aria-hidden="true" className="admin-login-hero">
          <img alt="" className="admin-login-bg-image" src={config.background} />
          <div className="admin-login-bg-overlay" />
        </section>

        <section className="admin-login-panel">
          <div className="admin-login-panel-content">
            <div className="admin-login-heading">
              <div className="admin-login-heading-row">
                <h1 className="admin-login-title text-3xl font-black leading-tight">{copy.pageTitle}</h1>
                <LanguageSwitcher dark={isDarkAdminTheme(theme)} iconOnly />
              </div>
              <p className="admin-login-muted mt-2 text-sm font-semibold">{copy.pageSubtitle[portal]}</p>
            </div>

            <div className="admin-login-card">
              <div className="admin-login-tabs">
                {modeButtons.map((item) => {
                  const active = item.mode === mode;

                  return (
                    <button
                      aria-pressed={active}
                      className={cn("admin-login-tab text-sm", active && "is-active")}
                      key={item.mode}
                      onClick={() => {
                        setMode(item.mode);
                        setError("");
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6">
                {hasAccess ? (
                  <div className="admin-login-state">
                    <p className="admin-login-eyebrow text-sm font-black">{copy.loggedIn}</p>
                    <p className="admin-login-muted mt-2 text-sm font-semibold">
                      {copy.loggedInAs}: <span className="admin-login-title">{session?.email || session?.username}</span>
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button className="admin-login-primary px-5 text-base" onClick={() => void enterExistingBackendSession()} type="button">
                        {copy.continue}
                      </button>
                      <button className="admin-login-secondary px-5 text-base" onClick={logout} type="button">
                        {copy.logout}
                      </button>
                    </div>
                  </div>
                ) : null}

                {!hasAccess && mode === "account" ? (
                  <form
                    action="/api/v1/auth/login"
                    autoComplete="on"
                    className="space-y-5"
                    method="post"
                    onSubmit={submitAccountLogin}
                  >
                    <label className="block">
                      <span className="admin-login-label mb-2 block text-sm font-black">{copy.accountLabel}</span>
                      <div className="admin-login-field">
                        <span className="admin-login-field-icon">@</span>
                        <input
                          autoComplete="username"
                          name="username"
                          onChange={(event) => setAccount(event.target.value)}
                          placeholder={copy.accountPlaceholder}
                          type="text"
                          value={account}
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center justify-between gap-3">
                        <span className="admin-login-label text-sm font-black">{copy.passwordLabel}</span>
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-[color:var(--admin-muted)]">
                          {copy.savePassword}
                          <AdminToggleSwitch
                            ariaLabel={copy.savePassword}
                            checked={savePassword}
                            onChange={updateSavePassword}
                          />
                        </span>
                      </span>
                      <PasswordInput
                        autoComplete="current-password"
                        inputClassName="pr-10"
                        name="password"
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={copy.passwordPlaceholder}
                        prefix={<span className="admin-login-field-icon">#</span>}
                        toggleClassName="right-3 text-[color:var(--admin-muted)]"
                        value={password}
                        wrapperClassName="admin-login-field"
                      />
                    </label>
                    {error ? <p className="admin-login-error px-4 py-3 text-sm font-bold">{error}</p> : null}
                    <button className="admin-login-primary w-full text-base" type="submit">
                      {copy.login}
                    </button>
                  </form>
                ) : null}

                {!hasAccess && mode === "code" ? (
                  <form className="space-y-5" onSubmit={submitCodeLogin}>
                    <label className="block">
                      <span className="admin-login-label mb-2 block text-sm font-black">{copy.codeEmailLabel}</span>
                      <div className="admin-login-field">
                        <span className="admin-login-field-icon">@</span>
                        <input
                          autoComplete="email"
                          onChange={(event) => setCodeEmail(event.target.value)}
                          placeholder={copy.codeEmailPlaceholder}
                          value={codeEmail}
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className="admin-login-label mb-2 block text-sm font-black">{copy.codeLabel}</span>
                      <div className="grid gap-3 sm:grid-cols-[1fr,140px]">
                        <div className="admin-login-field">
                          <span className="admin-login-field-icon">K</span>
                          <input
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            onChange={(event) => setCode(event.target.value)}
                            placeholder={copy.codePlaceholder}
                            value={code}
                          />
                        </div>
                        <button className="admin-login-secondary px-4 text-sm" onClick={requestCode} type="button">
                          {copy.sendCode}
                        </button>
                      </div>
                    </label>
                    {codeSent ? <p className="admin-login-notice px-4 py-3 text-sm font-bold">{copy.codeSent}</p> : null}
                    {error ? <p className="admin-login-error px-4 py-3 text-sm font-bold">{error}</p> : null}
                    <button className="admin-login-primary w-full text-base" type="submit">
                      {copy.login}
                    </button>
                  </form>
                ) : null}

                {!hasAccess && mode === "qr" ? (
                  <div className="grid gap-3">
                    <h2 className="admin-login-title text-xl font-black">{copy.qrTitle}</h2>
                    <p className="admin-login-muted text-sm font-semibold leading-6">{copy.qrSubtitle}</p>
                    <p className="admin-login-error px-4 py-3 text-sm font-bold">{copy.qrError}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <p className="admin-login-copyright">{copy.copyright}</p>
        </section>
      </main>
    </div>
  );
}
