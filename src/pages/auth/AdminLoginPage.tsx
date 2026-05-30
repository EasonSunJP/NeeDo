import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminLoginQrTokens, getAdminLoginPortalScope, type AdminLoginPortal } from "../../auth/adminLogin";
import type { PortalScope } from "../../auth/demoAccount";
import { useAuth } from "../../auth/AuthProvider";
import { clearRememberedCredentials, readRememberedCredentials, writeRememberedCredentials } from "../../auth/rememberCredentials";
import { backendManagementSystemBgUrl } from "../../assets/runtime/images";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  defaultDayAdminTheme,
  defaultNightAdminTheme,
  detectSystemAdminTheme,
  normalizeAdminTheme,
  platformAdminThemeOptions,
  sharedAdminThemeOptions,
  type AdminTheme
} from "../../theme/AdminTheme";

type LoginMode = "account" | "code" | "qr";

type BackendLoginCopy = {
  pageEyebrow: string;
  pageTitle: string;
  pageSubtitle: string;
  portalName: Record<AdminLoginPortal, string>;
  portalSubtitle: Record<AdminLoginPortal, string>;
  tabs: Record<LoginMode, string>;
  accountLabel: string;
  accountPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  rememberCredentials: string;
  codeEmailLabel: string;
  codeEmailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  sendCode: string;
  codeSent: string;
  gmailLogin: string;
  login: string;
  testCredentialLogin: string;
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

const adminLoginCopyrightText = "Copyright © 2026 LifeDance. All rights reserved.";

const adminLoginCopy = {
  zh: {
    pageEyebrow: "NeeDo 后台",
    pageTitle: "欢迎回来",
    pageSubtitle: "请使用后台账号登录",
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
    rememberCredentials: "记录账号密码",
    codeEmailLabel: "登录邮箱",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "验证码",
    codePlaceholder: "6 位验证码",
    sendCode: "获取验证码",
    codeSent: "验证码已发送，请查看对应邮箱或开发环境 OTP 交付日志。",
    gmailLogin: "使用 Gmail 登录",
    login: "登录",
    testCredentialLogin: "测试账号登录",
    continue: "进入后台",
    loggedIn: "当前已登录",
    loggedInAs: "登录账号",
    logout: "退出登录",
    qrTitle: "使用手机 NeeDo 聊天页扫一扫",
    qrSubtitle: "PC 端保留二维码，手机端在聊天页面打开扫一扫后扫描即可确认登录。",
    qrTokenLabel: "登录码",
    qrApprove: "模拟扫码确认",
    qrApproved: "扫码已确认，正在进入后台。",
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
    pageSubtitle: "請使用後台帳號登入",
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
    rememberCredentials: "記錄帳號密碼",
    codeEmailLabel: "登入信箱",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "驗證碼",
    codePlaceholder: "6 位驗證碼",
    sendCode: "取得驗證碼",
    codeSent: "驗證碼已發送，請查看對應信箱或開發環境 OTP 交付日誌。",
    gmailLogin: "使用 Gmail 登入",
    login: "登入",
    testCredentialLogin: "測試帳號登入",
    continue: "進入後台",
    loggedIn: "目前已登入",
    loggedInAs: "登入帳號",
    logout: "登出",
    qrTitle: "使用手機 NeeDo 聊天頁掃一掃",
    qrSubtitle: "PC 端保留 QR 碼，手機端在聊天頁面打開掃一掃後掃描即可確認登入。",
    qrTokenLabel: "登入碼",
    qrApprove: "模擬掃碼確認",
    qrApproved: "掃碼已確認，正在進入後台。",
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
    pageSubtitle: "管理アカウントでログインしてください",
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
    rememberCredentials: "アカウントとパスワードを保存",
    codeEmailLabel: "ログインメール",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "認証コード",
    codePlaceholder: "6桁のコード",
    sendCode: "コードを取得",
    codeSent: "認証コードを送信しました。メールまたは開発環境の OTP 配信ログを確認してください。",
    gmailLogin: "Gmail でログイン",
    login: "ログイン",
    testCredentialLogin: "テストアカウントでログイン",
    continue: "管理画面へ",
    loggedIn: "ログイン済み",
    loggedInAs: "ログインアカウント",
    logout: "ログアウト",
    qrTitle: "スマホの NeeDo チャットでスキャン",
    qrSubtitle: "PC には QR コードを表示し、スマホのチャット画面のスキャンからログインを確認します。",
    qrTokenLabel: "ログインコード",
    qrApprove: "スキャン確認を再現",
    qrApproved: "スキャンを確認しました。管理画面へ移動します。",
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
    pageSubtitle: "Sign in with your admin account",
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
    rememberCredentials: "Remember account and password",
    codeEmailLabel: "Login email",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "Verification code",
    codePlaceholder: "6-digit code",
    sendCode: "Send code",
    codeSent: "Code sent. Check the mailbox or development OTP delivery logs.",
    gmailLogin: "Continue with Gmail",
    login: "Log in",
    testCredentialLogin: "Test account login",
    continue: "Enter Admin",
    loggedIn: "Already signed in",
    loggedInAs: "Signed in as",
    logout: "Log out",
    qrTitle: "Scan with NeeDo mobile chat",
    qrSubtitle: "The PC shows a QR code. Open Scan from the mobile chat page to confirm the login.",
    qrTokenLabel: "Login code",
    qrApprove: "Simulate scan approval",
    qrApproved: "Scan confirmed. Entering admin.",
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
    pageSubtitle: "관리자 계정으로 로그인하세요",
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
    rememberCredentials: "계정과 비밀번호 저장",
    codeEmailLabel: "로그인 이메일",
    codeEmailPlaceholder: "admin@needo.jp",
    codeLabel: "인증코드",
    codePlaceholder: "6자리 코드",
    sendCode: "코드 받기",
    codeSent: "인증코드를 보냈습니다. 메일함 또는 개발 환경 OTP 전달 로그를 확인하세요.",
    gmailLogin: "Gmail로 로그인",
    login: "로그인",
    testCredentialLogin: "테스트 계정 로그인",
    continue: "관리자로 이동",
    loggedIn: "이미 로그인됨",
    loggedInAs: "로그인 계정",
    logout: "로그아웃",
    qrTitle: "모바일 NeeDo 채팅에서 스캔",
    qrSubtitle: "PC에는 QR 코드를 표시하고, 모바일 채팅 화면의 스캔으로 로그인을 확인합니다.",
    qrTokenLabel: "로그인 코드",
    qrApprove: "스캔 확인 시뮬레이션",
    qrApproved: "스캔이 확인되었습니다. 관리자 화면으로 이동합니다.",
    accountError: "계정 또는 비밀번호가 올바르지 않습니다. 확인 후 다시 시도하세요.",
    codeError: "인증코드가 올바르지 않거나 만료되었습니다. 확인 후 다시 시도하세요.",
    qrError: "QR 로그인은 아직 실제 API에 연결되지 않았습니다. 이메일 또는 인증코드로 로그인하세요.",
    requiredError: "먼저 로그인 정보를 입력하세요.",
    portalMismatchError: "현재 계정은 이 관리자 화면에 접근할 수 없습니다. 해당 관리자 계정으로 로그인하세요.",
    copyright: adminLoginCopyrightText
  }
} satisfies Record<Language, BackendLoginCopy>;

const backendDefaultLoginEmails = {
  admin: "admin",
  "merchant-admin": "merchant@example.com",
  "afirieito-admin": "affiliate@example.com"
} as const satisfies Record<AdminLoginPortal, string>;

const backendPortalAccountAliases = {
  admin: ["admin", "admin@example.com", "admin@needo.jp"],
  "merchant-admin": ["merchant@example.com", "merchant-owner@example.com", "store-admin", "store-admin@needo.jp"],
  "afirieito-admin": ["affiliate@example.com", "afirieito", "afirieito@needo.jp"]
} as const satisfies Record<AdminLoginPortal, readonly string[]>;

const backendLoginConfig = {
  admin: {
    authPortal: getAdminLoginPortalScope("admin"),
    defaultEmail: backendDefaultLoginEmails.admin,
    gmailEmail: "needo.ops@gmail.com",
    entryPath: "/admin",
    background: backendManagementSystemBgUrl,
    mark: "N",
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
    gmailEmail: "needo.store@gmail.com",
    entryPath: "/merchant-admin",
    background: backendManagementSystemBgUrl,
    mark: "S",
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
    gmailEmail: "needo.afirieito@gmail.com",
    entryPath: "/NDA-admin",
    background: backendManagementSystemBgUrl,
    mark: "A",
    themeStorageKey: "needo.afirieito-admin.theme",
    themePreferenceModeStorageKey: "needo.afirieito-admin.theme.mode",
    themeOptions: sharedAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  }
} as const;

type AdminTestCredentialEnv = {
  VITE_TEST_LOGIN_EMAIL?: string;
  VITE_TEST_LOGIN_PASSWORD?: string;
  VITE_TEST_LOGIN_ADMIN_EMAIL?: string;
  VITE_TEST_LOGIN_ADMIN_PASSWORD?: string;
  VITE_TEST_LOGIN_MERCHANT_EMAIL?: string;
  VITE_TEST_LOGIN_MERCHANT_PASSWORD?: string;
  VITE_TEST_LOGIN_BUSINESS_EMAIL?: string;
  VITE_TEST_LOGIN_BUSINESS_PASSWORD?: string;
};

function normalizeCredentialValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeAccountAlias(value: string) {
  return value.trim().toLowerCase();
}

export function isBackendAccountForAnotherPortal(portal: AdminLoginPortal, account: string) {
  const normalizedAccount = normalizeAccountAlias(account);

  if (!normalizedAccount) {
    return false;
  }

  return (Object.entries(backendPortalAccountAliases) as Array<[AdminLoginPortal, readonly string[]]>).some(
    ([aliasPortal, aliases]) =>
      aliasPortal !== portal && aliases.map(normalizeAccountAlias).includes(normalizedAccount)
  );
}

export function resolveAdminTestLoginCredentials(env: AdminTestCredentialEnv, portal: AdminLoginPortal) {
  const portalCredentials =
    portal === "admin"
      ? {
          email: env.VITE_TEST_LOGIN_ADMIN_EMAIL,
          password: env.VITE_TEST_LOGIN_ADMIN_PASSWORD
        }
      : portal === "merchant-admin"
        ? {
            email: env.VITE_TEST_LOGIN_MERCHANT_EMAIL,
            password: env.VITE_TEST_LOGIN_MERCHANT_PASSWORD
          }
        : {
            email: env.VITE_TEST_LOGIN_BUSINESS_EMAIL,
            password: env.VITE_TEST_LOGIN_BUSINESS_PASSWORD
          };
  const portalEmail = normalizeCredentialValue(portalCredentials.email);
  const portalPassword = normalizeCredentialValue(portalCredentials.password);
  const email = portalEmail || (portal === "admin" ? normalizeCredentialValue(env.VITE_TEST_LOGIN_EMAIL) : "");
  const password = portalPassword || (portal === "admin" ? normalizeCredentialValue(env.VITE_TEST_LOGIN_PASSWORD) : "");

  if (!email || !password) {
    return null;
  }

  if (portal !== "admin" && isBackendAccountForAnotherPortal(portal, email)) {
    return { email: backendDefaultLoginEmails[portal], password };
  }

  return { email, password };
}

export function resolveAdminDefaultCredentials(
  env: AdminTestCredentialEnv,
  portal: AdminLoginPortal,
  fallbackEmail: string
) {
  const testCredentials = resolveAdminTestLoginCredentials(env, portal);
  const fallbackDefaultEmail = fallbackEmail.trim();
  const emailFallback = isBackendAccountForAnotherPortal(portal, fallbackDefaultEmail)
    ? backendDefaultLoginEmails[portal]
    : fallbackDefaultEmail;

  return {
    email: testCredentials?.email ?? emailFallback,
    password: testCredentials?.password ?? ""
  };
}

export function resolveBackendLoginTarget(sessionPortal: PortalScope, requestedPortal: PortalScope, nextPath: string) {
  return sessionPortal === requestedPortal ? nextPath : null;
}

const qrCells = new Set([
  0, 1, 2, 3, 4, 5, 6, 8, 10, 14, 16, 18, 20, 21, 22, 24, 26, 28, 32, 34, 36, 37, 38, 39, 40, 42, 44,
  46, 48, 50, 52, 54, 55, 56, 58, 60, 62, 64, 66, 68, 69, 70, 72, 74, 76, 77, 78, 80
]);

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

function getAdminRememberCredentialsScope(portal: AdminLoginPortal) {
  return `admin.${portal}`;
}

function QrLoginGraphic({ mark }: { mark: string }) {
  return (
    <div className="admin-login-qr-card relative mx-auto grid aspect-square w-full max-w-[260px] grid-cols-9 gap-1 p-4">
      {Array.from({ length: 81 }).map((_, index) => (
        <span
          className={cn("aspect-square rounded-[2px]", qrCells.has(index) ? "bg-[color:var(--admin-text)]" : "bg-transparent")}
          key={index}
        />
      ))}
      <span className="pointer-events-none absolute" />
      <div className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border border-[color:var(--admin-line)] bg-[color:var(--admin-surface)] text-lg font-black text-[color:var(--admin-accent)] shadow-sm">
        {mark}
      </div>
    </div>
  );
}

export function AdminLoginPage({ portal }: { portal: AdminLoginPortal }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    canAccess,
    isAuthenticated,
    loginWithFormalPassword,
    loginWithProvider,
    loginWithQr,
    loginWithVerificationCode,
    logout,
    sendVerificationCode,
    session
  } = useAuth();
  const { language } = useI18n();
  const copy = adminLoginCopy[language];
  const config = backendLoginConfig[portal];
  const defaultCredentials = useMemo(
    () => resolveAdminDefaultCredentials(import.meta.env as AdminTestCredentialEnv, portal, config.defaultEmail),
    [config.defaultEmail, portal]
  );
  const theme = useMemo(() => getInitialBackendLoginTheme(portal), [portal]);
  const requestedMode = normalizeMode(searchParams.get("mode"));
  const scanStatus = searchParams.get("scan");
  const qrParam = searchParams.get("qr");
  const [mode, setMode] = useState<LoginMode>(requestedMode);
  const [account, setAccount] = useState<string>(defaultCredentials.email);
  const [password, setPassword] = useState<string>(defaultCredentials.password);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [codeEmail, setCodeEmail] = useState<string>(defaultCredentials.email);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const redirectPath = searchParams.get("redirect");
  const nextPath = redirectPath || config.entryPath;
  const hasAccess = isAuthenticated && canAccess(config.authPortal);
  const qrToken = adminLoginQrTokens[portal];
  const rememberCredentialsScope = useMemo(() => getAdminRememberCredentialsScope(portal), [portal]);
  const testCredentials = useMemo(
    () => resolveAdminTestLoginCredentials(import.meta.env as AdminTestCredentialEnv, portal),
    [portal]
  );
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

  useEffect(() => {
    setMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    const remembered = readRememberedCredentials(rememberCredentialsScope);
    const hasRememberedCredentials = remembered.enabled && Boolean(remembered.account.trim() || remembered.password.trim());
    const rememberedAccountBelongsToAnotherPortal =
      hasRememberedCredentials && remembered.account.trim()
        ? isBackendAccountForAnotherPortal(portal, remembered.account)
        : false;
    const canUseRememberedCredentials = hasRememberedCredentials && !rememberedAccountBelongsToAnotherPortal;

    if (remembered.enabled && (!hasRememberedCredentials || rememberedAccountBelongsToAnotherPortal)) {
      clearRememberedCredentials(rememberCredentialsScope);
    }

    setRememberCredentials(canUseRememberedCredentials);
    setAccount(canUseRememberedCredentials && remembered.account.trim() ? remembered.account : defaultCredentials.email);
    setPassword(canUseRememberedCredentials && remembered.password.trim() ? remembered.password : defaultCredentials.password);
    setCodeEmail(defaultCredentials.email);
  }, [defaultCredentials.email, defaultCredentials.password, portal, rememberCredentialsScope]);

  useEffect(() => {
    if (!rememberCredentials) {
      return;
    }

    writeRememberedCredentials(rememberCredentialsScope, account, password);
  }, [account, password, rememberCredentials, rememberCredentialsScope]);

  useEffect(() => {
    if (scanStatus !== "approved") {
      return;
    }

    loginWithQr(config.authPortal, qrParam ?? qrToken).then((result) => {
      if (!result.ok) {
        setError(copy.qrError);
        return;
      }

      setNotice(copy.qrApproved);
      navigateToBackendSession(result.session.portal);
    });
  }, [config.authPortal, copy.qrApproved, copy.qrError, loginWithQr, navigateToBackendSession, qrParam, qrToken, scanStatus]);

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

    if (!account.trim() || !password.trim()) {
      setError(copy.requiredError);
      return;
    }

    const result = await loginWithFormalPassword(config.authPortal, account, password);
    if (!result.ok) {
      setError(result.message || copy.accountError);
      return;
    }

    navigateToBackendSession(result.session.portal);
  };

  const continueWithTestCredentials = async () => {
    if (!testCredentials) {
      return;
    }

    setError("");
    const result = await loginWithFormalPassword(config.authPortal, testCredentials.email, testCredentials.password);

    if (!result.ok) {
      setError(result.message || copy.accountError);
      return;
    }

    navigateToBackendSession(result.session.portal);
  };

  const toggleRememberCredentials = (checked: boolean) => {
    setRememberCredentials(checked);

    if (checked) {
      writeRememberedCredentials(rememberCredentialsScope, account, password);
      return;
    }

    clearRememberedCredentials(rememberCredentialsScope);
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

  const approveQrLogin = async () => {
    setError("");

    const result = await loginWithQr(config.authPortal, qrToken);
    if (!result.ok) {
      setError(result.message || copy.qrError);
      return;
    }

    setNotice(copy.qrApproved);
    navigateToBackendSession(result.session.portal);
  };

  const continueWithGmail = async () => {
    setError("");

    const result = await loginWithProvider(config.authPortal, "gmail", config.gmailEmail);
    if (!result.ok) {
      setError(result.message || copy.accountError);
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
              <h1 className="admin-login-title text-3xl font-black leading-tight">{copy.pageTitle}</h1>
              <p className="admin-login-muted mt-2 text-sm font-semibold">{copy.pageSubtitle}</p>
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
                        setNotice("");
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
                      <button className="admin-login-primary px-5 text-base" onClick={() => navigate(nextPath, { replace: true })} type="button">
                        {copy.continue}
                      </button>
                      <button className="admin-login-secondary px-5 text-base" onClick={logout} type="button">
                        {copy.logout}
                      </button>
                    </div>
                  </div>
                ) : null}

                {!hasAccess && mode === "account" ? (
                  <form className="space-y-5" onSubmit={submitAccountLogin}>
                    <label className="block">
                      <span className="admin-login-label mb-2 block text-sm font-black">{copy.accountLabel}</span>
                      <div className="admin-login-field">
                        <span className="admin-login-field-icon">@</span>
                        <input
                          autoComplete="username email"
                          onChange={(event) => setAccount(event.target.value)}
                          placeholder={copy.accountPlaceholder}
                          value={account}
                        />
                      </div>
                    </label>
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="admin-login-label text-sm font-black">{copy.passwordLabel}</span>
                        <button
                          aria-checked={rememberCredentials}
                          className="inline-flex items-center gap-2 rounded-full px-1 py-1 text-xs font-black text-[color:var(--admin-muted)] transition hover:text-[color:var(--admin-text)]"
                          onClick={() => toggleRememberCredentials(!rememberCredentials)}
                          role="switch"
                          type="button"
                        >
                          <span>{copy.rememberCredentials}</span>
                          <span
                            className={cn(
                              "relative inline-flex h-6 w-11 items-center rounded-full border border-[color:var(--admin-line)] transition",
                              rememberCredentials ? "bg-[color:color-mix(in_srgb,var(--admin-accent)_45%,var(--admin-surface))]" : "bg-[color:var(--admin-elevated)]"
                            )}
                          >
                            <span
                              className={cn(
                                "h-5 w-5 rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.24)] transition",
                                rememberCredentials ? "translate-x-[19px]" : "translate-x-[2px]"
                              )}
                            />
                          </span>
                        </button>
                      </div>
                      <PasswordInput
                        inputClassName="pr-10"
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
                    {testCredentials ? (
                      <button className="admin-login-secondary w-full px-4 text-base" onClick={continueWithTestCredentials} type="button">
                        {copy.testCredentialLogin}
                      </button>
                    ) : null}
                    <button className="admin-login-secondary flex w-full items-center justify-center gap-3 px-4 text-base" onClick={continueWithGmail} type="button">
                      <span className="grid h-8 w-8 place-items-center rounded-md bg-[color:color-mix(in_srgb,var(--admin-muted-surface)_86%,var(--admin-surface))] text-base font-black text-[color:var(--admin-danger)]">G</span>
                      {copy.gmailLogin}
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
                  <div className="grid gap-5">
                    <div className="relative">
                      <QrLoginGraphic mark={config.mark} />
                    </div>
                    <div>
                      <h2 className="admin-login-title text-xl font-black">{copy.qrTitle}</h2>
                      <p className="admin-login-muted mt-3 text-sm font-semibold leading-6">{copy.qrSubtitle}</p>
                      <div className="admin-login-token-box mt-5 p-3">
                        <p className="admin-login-token-label text-xs font-black uppercase tracking-[0.14em]">{copy.qrTokenLabel}</p>
                        <p className="admin-login-title mt-2 break-all font-mono text-xs font-bold">{qrToken}</p>
                      </div>
                      {notice ? <p className="admin-login-notice mt-4 px-4 py-3 text-sm font-bold">{notice}</p> : null}
                      {error ? <p className="admin-login-error mt-4 px-4 py-3 text-sm font-bold">{error}</p> : null}
                      <button className="admin-login-primary mt-5 w-full text-base" onClick={approveQrLogin} type="button">
                        {copy.qrApprove}
                      </button>
                    </div>
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
