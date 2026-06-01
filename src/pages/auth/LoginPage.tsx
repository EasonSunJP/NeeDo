import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { authApi } from "../../api/auth";
import { type PortalScope, useAuth } from "../../auth/AuthProvider";
import { clearRememberedCredentials, readRememberedCredentials, writeRememberedCredentials } from "../../auth/rememberCredentials";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { googleAccountIconSrc } from "../../lib/googleAccountApi";
import { cn } from "../../lib/utils";
import { getClientThemeClassName, getClientThemeModeClassName, useClientTheme } from "../../theme/ClientThemeProvider";

type LoginPanelMode = "welcome" | "account";

type FrontendLoginCopy = {
  brand: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  gmailLogin: string;
  accountLogin: string;
  testCredentialFill: string;
  testCredentialLogin: string;
  createAccount: string;
  createNotice: string;
  useAccountTitle: string;
  useAccountSubtitle: string;
  accountLabel: string;
  accountPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  captchaLabel: string;
  captchaPlaceholder: string;
  captchaRefresh: string;
  rememberCredentials: string;
  loginButton: string;
  loginPending: string;
  back: string;
  requiredError: string;
  captchaRequiredError: string;
  captchaLoadError: string;
  accountError: string;
  dependencyUnavailableError: string;
  networkTimeoutError: string;
  resourceNotFoundError: string;
  googleLoginUnavailable: string;
  continueTitle: string;
  signedInAs: string;
  continueButton: string;
  logout: string;
  copyright: string;
  portals: Record<PortalScope, { label: string; shortLabel: string; title: string; subtitle: string }>;
};

export type LoginFeedbackCopy = Pick<
  FrontendLoginCopy,
  "accountError" | "captchaLoadError" | "captchaRequiredError" | "createNotice" | "googleLoginUnavailable" | "requiredError"
>;
export type LoginErrorCopy = Pick<FrontendLoginCopy, "accountError" | "dependencyUnavailableError" | "networkTimeoutError" | "resourceNotFoundError">;
type LoginFeedbackTone = "error" | "notice";
type LoginFeedbackKey = keyof LoginFeedbackCopy;

export type LoginFeedbackState =
  | { key: LoginFeedbackKey; tone: LoginFeedbackTone; type: "localized" }
  | { message: string; tone: LoginFeedbackTone; type: "custom" };

export function resolveLoginFeedbackMessage(feedback: LoginFeedbackState | null, copy: LoginFeedbackCopy) {
  if (!feedback) {
    return "";
  }

  if (feedback.type === "custom") {
    return feedback.message;
  }

  return copy[feedback.key];
}

export function resolveLoginErrorMessage(message: string | undefined, copy: LoginErrorCopy) {
  const normalizedMessage = message?.trim();

  if (message === "error.network.timeout") {
    return copy.networkTimeoutError;
  }

  if (message === "error.dependency.redis_unavailable" || normalizedMessage === "Internal Server Error") {
    return copy.dependencyUnavailableError;
  }

  if (
    message === "error.resource_not_found" ||
    message === "resource_not_found" ||
    message === "error.cors_forbidden" ||
    message === "Not Found"
  ) {
    return copy.resourceNotFoundError;
  }

  return message || copy.accountError;
}

type TestCredentialEnv = {
  VITE_TEST_LOGIN_EMAIL?: string;
  VITE_TEST_LOGIN_PASSWORD?: string;
  VITE_TEST_LOGIN_ADMIN_EMAIL?: string;
  VITE_TEST_LOGIN_ADMIN_PASSWORD?: string;
  VITE_TEST_LOGIN_CUSTOMER_EMAIL?: string;
  VITE_TEST_LOGIN_CUSTOMER_PASSWORD?: string;
  VITE_TEST_LOGIN_MERCHANT_EMAIL?: string;
  VITE_TEST_LOGIN_MERCHANT_PASSWORD?: string;
  VITE_TEST_LOGIN_BUSINESS_EMAIL?: string;
  VITE_TEST_LOGIN_BUSINESS_PASSWORD?: string;
  VITE_TEST_LOGIN_TECHNICIAN_EMAIL?: string;
  VITE_TEST_LOGIN_TECHNICIAN_PASSWORD?: string;
};

const defaultPublicTestLoginEmail: Partial<Record<PortalScope, string>> = {
  merchant: "merchant@example.com",
  technician: "seed.technician@needo.local",
  business: "affiliate@example.com"
};

function getPortalTestLoginCredentials(env: TestCredentialEnv, portal: PortalScope) {
  if (portal === "admin") {
    return {
      email: env.VITE_TEST_LOGIN_ADMIN_EMAIL,
      password: env.VITE_TEST_LOGIN_ADMIN_PASSWORD
    };
  }

  if (portal === "merchant") {
    return {
      email: env.VITE_TEST_LOGIN_MERCHANT_EMAIL,
      password: env.VITE_TEST_LOGIN_MERCHANT_PASSWORD
    };
  }

  if (portal === "business") {
    return {
      email: env.VITE_TEST_LOGIN_BUSINESS_EMAIL,
      password: env.VITE_TEST_LOGIN_BUSINESS_PASSWORD
    };
  }

  if (portal === "technician") {
    return {
      email: env.VITE_TEST_LOGIN_TECHNICIAN_EMAIL,
      password: env.VITE_TEST_LOGIN_TECHNICIAN_PASSWORD
    };
  }

  if (portal === "user") {
    return {
      email: env.VITE_TEST_LOGIN_CUSTOMER_EMAIL,
      password: env.VITE_TEST_LOGIN_CUSTOMER_PASSWORD
    };
  }

  return {
    email: undefined,
    password: undefined
  };
}

export function resolveTestLoginCredentials(env: TestCredentialEnv, portal: PortalScope) {
  const portalCredentials = getPortalTestLoginCredentials(env, portal);
  const sharedEmail = env.VITE_TEST_LOGIN_EMAIL?.trim();
  const portalEmail = portalCredentials.email?.trim();
  const defaultPortalEmail = defaultPublicTestLoginEmail[portal];
  const email = portal === "user"
    ? portalEmail || sharedEmail
    : !portalEmail || portalEmail === sharedEmail
      ? defaultPortalEmail
      : portalEmail;
  const password = portalCredentials.password?.trim() || env.VITE_TEST_LOGIN_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

const loginIconMarkUrl = "/icons/needo-login-check-mark-white.png";

const portalEntryRoute: Record<PortalScope, string> = {
  user: "/",
  merchant: "/merchant",
  technician: "/technician",
  business: "/afirieito",
  admin: "/admin"
};

const portalEntryFile: Record<PortalScope, string> = {
  user: "/user.html",
  merchant: "/merchant.html",
  technician: "/technician.html",
  business: "/afirieito.html",
  admin: "/pf-admin.html"
};

const portalGmailEmail: Record<PortalScope, string> = {
  user: "needo.user@gmail.com",
  merchant: "needo.store@gmail.com",
  technician: "needo.staff@gmail.com",
  business: "needo.afirieito@gmail.com",
  admin: "needo.ops@gmail.com"
};

const loginCopyrightText = "Copyright © 2026 LifeDance. All rights reserved.";

function getFrontendRememberCredentialsScope(portal: PortalScope) {
  return `frontend.${portal}`;
}

const loginCopy = {
  zh: {
    brand: "NeeDo",
    welcomeTitle: "欢迎使用 NeeDo",
    welcomeSubtitle: "用一个账号连接消息、预约和工作协作。",
    gmailLogin: "使用 Google 登录",
    accountLogin: "使用邮箱登录",
    testCredentialFill: "填入测试账号",
    testCredentialLogin: "跳过验证登录",
    createAccount: "新建账号",
    createNotice: "新建账号流程正在准备中，请先使用已发行邮箱登录。",
    useAccountTitle: "账号登录",
    useAccountSubtitle: "请输入已发行账号信息。",
    accountLabel: "邮箱",
    accountPlaceholder: "请输入邮箱",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    captchaLabel: "图形验证码",
    captchaPlaceholder: "请输入验证码",
    captchaRefresh: "换一张",
    rememberCredentials: "记录账号密码",
    loginButton: "登录",
    loginPending: "登录中...",
    back: "返回",
    requiredError: "请先填写登录信息。",
    captchaRequiredError: "请先填写图形验证码。",
    captchaLoadError: "图形验证码加载失败，请刷新后再试。",
    accountError: "账号或密码不正确，请确认后再试。",
    dependencyUnavailableError: "登录服务依赖未启动，请确认真实 backend、MySQL 和 Redis 已启动。",
    networkTimeoutError: "后端没有响应，请确认真实 backend、MySQL 和 Redis 已启动。",
    resourceNotFoundError: "接口不存在，请确认接口域名和登录 / 注册路径配置正确。",
    googleLoginUnavailable: "当前环境暂时无法发起 Google 登录，请在正式环境配置 Google 账号 API 后重试。",
    continueTitle: "已登录",
    signedInAs: "当前账号",
    continueButton: "继续进入",
    logout: "退出登录",
    copyright: loginCopyrightText,
    portals: {
      user: {
        label: "用户端",
        shortLabel: "用户",
        title: "NeeDo 用户端",
        subtitle: "浏览服务、预约、聊天和订单。"
      },
      technician: {
        label: "员工端",
        shortLabel: "员工",
        title: "NeeDo 员工端",
        subtitle: "查看任务、状态和日程。"
      },
      merchant: {
        label: "店铺端",
        shortLabel: "店铺",
        title: "NeeDo 店铺端",
        subtitle: "处理预约、排班和门店协作。"
      },
      business: {
        label: "Afirieito",
        shortLabel: "推广",
        title: "NeeDoAfirieito",
        subtitle: "查看推广、素材、归因收益。"
      },
      admin: {
        label: "运营后台",
        shortLabel: "后台",
        title: "NeeDo 运营后台",
        subtitle: "平台运营管理。"
      }
    }
  },
  "zh-Hant": {
    brand: "NeeDo",
    welcomeTitle: "歡迎使用 NeeDo",
    welcomeSubtitle: "用一個帳號連接訊息、預約和工作協作。",
    gmailLogin: "使用 Google 登入",
    accountLogin: "使用信箱登入",
    testCredentialFill: "填入測試帳號",
    testCredentialLogin: "跳過驗證登入",
    createAccount: "建立帳號",
    createNotice: "建立帳號流程正在準備中，請先使用已發行信箱登入。",
    useAccountTitle: "帳號登入",
    useAccountSubtitle: "請輸入已發行帳號資訊。",
    accountLabel: "信箱",
    accountPlaceholder: "請輸入信箱",
    passwordLabel: "密碼",
    passwordPlaceholder: "請輸入密碼",
    captchaLabel: "圖形驗證碼",
    captchaPlaceholder: "請輸入驗證碼",
    captchaRefresh: "換一張",
    rememberCredentials: "記錄帳號密碼",
    loginButton: "登入",
    loginPending: "登入中...",
    back: "返回",
    requiredError: "請先填寫登入資訊。",
    captchaRequiredError: "請先填寫圖形驗證碼。",
    captchaLoadError: "圖形驗證碼載入失敗，請重新整理後再試。",
    accountError: "帳號或密碼不正確，請確認後再試。",
    dependencyUnavailableError: "登入服務依賴未啟動，請確認真實 backend、MySQL 和 Redis 已啟動。",
    networkTimeoutError: "後端沒有回應，請確認真實 backend、MySQL 和 Redis 已啟動。",
    resourceNotFoundError: "介面不存在，請確認介面域名和登入 / 註冊路徑配置正確。",
    googleLoginUnavailable: "目前環境暫時無法發起 Google 登入，請在正式環境配置 Google 帳號 API 後重試。",
    continueTitle: "已登入",
    signedInAs: "目前帳號",
    continueButton: "繼續進入",
    logout: "登出",
    copyright: loginCopyrightText,
    portals: {
      user: {
        label: "用戶端",
        shortLabel: "用戶",
        title: "NeeDo 用戶端",
        subtitle: "瀏覽服務、預約、聊天和訂單。"
      },
      technician: {
        label: "員工端",
        shortLabel: "員工",
        title: "NeeDo 員工端",
        subtitle: "查看任務、狀態和日程。"
      },
      merchant: {
        label: "店鋪端",
        shortLabel: "店鋪",
        title: "NeeDo 店鋪端",
        subtitle: "處理預約、排班和門店協作。"
      },
      business: {
        label: "Afirieito",
        shortLabel: "推廣",
        title: "NeeDoAfirieito",
        subtitle: "查看推廣、素材、歸因收益。"
      },
      admin: {
        label: "營運後台",
        shortLabel: "後台",
        title: "NeeDo 營運後台",
        subtitle: "平台營運管理。"
      }
    }
  },
  ja: {
    brand: "NeeDo",
    welcomeTitle: "NeeDoへようこそ",
    welcomeSubtitle: "メッセージ、予約、仕事の連絡をひとつのアカウントで。",
    gmailLogin: "Googleでログイン",
    accountLogin: "メールでログイン",
    testCredentialFill: "テストアカウントを入力",
    testCredentialLogin: "認証をスキップしてログイン",
    createAccount: "新規登録",
    createNotice: "新規登録フローは準備中です。発行済みメールでログインしてください。",
    useAccountTitle: "アカウントログイン",
    useAccountSubtitle: "発行済みアカウント情報を入力してください。",
    accountLabel: "メール",
    accountPlaceholder: "メールを入力",
    passwordLabel: "パスワード",
    passwordPlaceholder: "パスワードを入力",
    captchaLabel: "画像認証コード",
    captchaPlaceholder: "認証コードを入力",
    captchaRefresh: "更新",
    rememberCredentials: "アカウントとパスワードを保存",
    loginButton: "ログイン",
    loginPending: "ログイン中...",
    back: "戻る",
    requiredError: "ログイン情報を入力してください。",
    captchaRequiredError: "画像認証コードを入力してください。",
    captchaLoadError: "画像認証コードを読み込めません。更新してから再試行してください。",
    accountError: "アカウントまたはパスワードが違います。内容を確認してください。",
    dependencyUnavailableError: "ログインサービスの依存先が起動していません。実際の backend、MySQL、Redis が起動しているか確認してください。",
    networkTimeoutError: "バックエンドが応答していません。実際の backend、MySQL、Redis が起動しているか確認してください。",
    resourceNotFoundError: "API が見つかりません。API ドメインとログイン / 登録パスの設定を確認してください。",
    googleLoginUnavailable: "現在の環境では Google ログインを開始できません。正式環境で Google アカウント API を設定してから再試行してください。",
    continueTitle: "ログイン済み",
    signedInAs: "現在のアカウント",
    continueButton: "続けて開く",
    logout: "ログアウト",
    copyright: loginCopyrightText,
    portals: {
      user: {
        label: "ユーザー端末",
        shortLabel: "ユーザー",
        title: "NeeDo ユーザー端末",
        subtitle: "サービス閲覧、予約、チャット、注文確認。"
      },
      technician: {
        label: "スタッフ端末",
        shortLabel: "スタッフ",
        title: "NeeDo スタッフ端末",
        subtitle: "タスク、ステータス、スケジュール確認。"
      },
      merchant: {
        label: "店舗端末",
        shortLabel: "店舗",
        title: "NeeDo 店舗端末",
        subtitle: "予約、シフト、店舗内連携の管理。"
      },
      business: {
        label: "Afirieito",
        shortLabel: "紹介",
        title: "NeeDoAfirieito",
        subtitle: "紹介、素材、成果収益の確認。"
      },
      admin: {
        label: "運営管理",
        shortLabel: "管理",
        title: "NeeDo 運営管理",
        subtitle: "プラットフォーム運営管理。"
      }
    }
  },
  en: {
    brand: "NeeDo",
    welcomeTitle: "Welcome to NeeDo",
    welcomeSubtitle: "Messages, bookings, and work updates in one account.",
    gmailLogin: "Continue with Google",
    accountLogin: "Log in with email",
    testCredentialFill: "Fill test account",
    testCredentialLogin: "Skip verification login",
    createAccount: "Create account",
    createNotice: "Account creation is being prepared. Use an issued email for now.",
    useAccountTitle: "Account login",
    useAccountSubtitle: "Enter your issued account details.",
    accountLabel: "Email",
    accountPlaceholder: "Enter email",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter password",
    captchaLabel: "Captcha",
    captchaPlaceholder: "Enter captcha",
    captchaRefresh: "Refresh",
    rememberCredentials: "Remember account and password",
    loginButton: "Log in",
    loginPending: "Logging in...",
    back: "Back",
    requiredError: "Fill in the login information first.",
    captchaRequiredError: "Enter the captcha first.",
    captchaLoadError: "Captcha could not be loaded. Refresh and try again.",
    accountError: "The account or password is incorrect. Please check and try again.",
    dependencyUnavailableError: "The login service dependency is not running. Confirm the real backend, MySQL, and Redis are running.",
    networkTimeoutError: "The backend did not respond. Confirm the real backend, MySQL, and Redis are running.",
    resourceNotFoundError: "The API route was not found. Confirm the API domain and login / register routes are configured correctly.",
    googleLoginUnavailable: "Google login cannot be started in this environment. Configure the Google Account API in the production environment and try again.",
    continueTitle: "Signed in",
    signedInAs: "Current account",
    continueButton: "Continue to",
    logout: "Log out",
    copyright: loginCopyrightText,
    portals: {
      user: {
        label: "User",
        shortLabel: "User",
        title: "NeeDo User",
        subtitle: "Browse services, book, chat, and review orders."
      },
      technician: {
        label: "Staff",
        shortLabel: "Staff",
        title: "NeeDo Staff",
        subtitle: "Check tasks, status, and schedules."
      },
      merchant: {
        label: "Store",
        shortLabel: "Store",
        title: "NeeDo Store",
        subtitle: "Handle bookings, shifts, and store collaboration."
      },
      business: {
        label: "Afirieito",
        shortLabel: "Promo",
        title: "NeeDoAfirieito",
        subtitle: "Track campaigns, creatives, attribution, and earnings."
      },
      admin: {
        label: "Operations Admin",
        shortLabel: "Admin",
        title: "NeeDo Operations Admin",
        subtitle: "Platform operations management."
      }
    }
  },
  ko: {
    brand: "NeeDo",
    welcomeTitle: "NeeDo에 오신 것을 환영합니다",
    welcomeSubtitle: "메시지, 예약, 업무 연락을 하나의 계정으로 연결합니다.",
    gmailLogin: "Google로 로그인",
    accountLogin: "이메일로 로그인",
    testCredentialFill: "테스트 계정 입력",
    testCredentialLogin: "인증 건너뛰고 로그인",
    createAccount: "새 계정 만들기",
    createNotice: "새 계정 만들기 흐름은 준비 중입니다. 지금은 발급된 이메일로 로그인하세요.",
    useAccountTitle: "계정 로그인",
    useAccountSubtitle: "발급된 계정 정보를 입력하세요.",
    accountLabel: "이메일",
    accountPlaceholder: "이메일 입력",
    passwordLabel: "비밀번호",
    passwordPlaceholder: "비밀번호 입력",
    captchaLabel: "이미지 인증 코드",
    captchaPlaceholder: "인증 코드 입력",
    captchaRefresh: "새로고침",
    rememberCredentials: "계정과 비밀번호 저장",
    loginButton: "로그인",
    loginPending: "로그인 중...",
    back: "뒤로",
    requiredError: "먼저 로그인 정보를 입력하세요.",
    captchaRequiredError: "먼저 이미지 인증 코드를 입력하세요.",
    captchaLoadError: "이미지 인증 코드를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.",
    accountError: "계정 또는 비밀번호가 올바르지 않습니다. 확인 후 다시 시도하세요.",
    dependencyUnavailableError: "로그인 서비스 의존성이 실행 중이 아닙니다. 실제 backend, MySQL, Redis가 실행 중인지 확인하세요.",
    networkTimeoutError: "백엔드가 응답하지 않습니다. 실제 backend, MySQL, Redis가 실행 중인지 확인하세요.",
    resourceNotFoundError: "API 경로를 찾을 수 없습니다. API 도메인과 로그인 / 가입 경로 설정을 확인하세요.",
    googleLoginUnavailable: "현재 환경에서는 Google 로그인을 시작할 수 없습니다. 정식 환경에서 Google 계정 API를 설정한 후 다시 시도하세요.",
    continueTitle: "로그인됨",
    signedInAs: "현재 계정",
    continueButton: "계속 이동",
    logout: "로그아웃",
    copyright: loginCopyrightText,
    portals: {
      user: {
        label: "사용자",
        shortLabel: "사용자",
        title: "NeeDo 사용자",
        subtitle: "서비스 탐색, 예약, 채팅, 주문 확인."
      },
      technician: {
        label: "스태프",
        shortLabel: "스태프",
        title: "NeeDo 스태프",
        subtitle: "작업, 상태, 일정을 확인."
      },
      merchant: {
        label: "상점",
        shortLabel: "상점",
        title: "NeeDo 상점",
        subtitle: "예약, 근무표, 상점 협업 관리."
      },
      business: {
        label: "Afirieito",
        shortLabel: "홍보",
        title: "NeeDoAfirieito",
        subtitle: "홍보, 소재, 기여 수익 확인."
      },
      admin: {
        label: "운영 관리자",
        shortLabel: "관리",
        title: "NeeDo 운영 관리자",
        subtitle: "플랫폼 운영 관리."
      }
    }
  }
} satisfies Record<Language, FrontendLoginCopy>;

function normalizePortal(value?: string | null): PortalScope {
  if (value === "merchant" || value === "technician" || value === "business") {
    return value;
  }

  if (value === "cps" || value === "afirieito") {
    return "business";
  }

  return "user";
}

function AppMark() {
  return (
    <div className="needo-login-logo mx-auto h-[92px] w-[92px] overflow-hidden rounded-[26px]">
      <img alt="" aria-hidden="true" className="needo-login-logo__mark h-full w-full object-cover" draggable="false" src={loginIconMarkUrl} />
    </div>
  );
}

function GmailMark() {
  return (
    <img alt="" aria-hidden="true" className="h-7 w-7 object-contain" draggable="false" src={googleAccountIconSrc} />
  );
}

function openPortalEntry(portal: PortalScope, route: string) {
  const target = new URL(portalEntryFile[portal], window.location.href);
  target.hash = route;
  window.location.assign(target.href);
}

function normalizeRedirectRoute(redirectPath: string | null) {
  const normalized = redirectPath?.trim();

  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//") || normalized.startsWith("/login")) {
    return null;
  }

  return normalized;
}

function resolvePortalFromRoute(route: string): PortalScope {
  const pathname = route.split(/[?#]/)[0] || "/";

  if (pathname.startsWith("/merchant-admin") || pathname.startsWith("/merchant") || pathname.startsWith("/shop")) {
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

  if (pathname.startsWith("/admin")) {
    return "admin";
  }

  return "user";
}

export function getPostLoginRoute(portal: PortalScope, redirectPath: string | null) {
  const redirectRoute = normalizeRedirectRoute(redirectPath);

  if (!redirectRoute || resolvePortalFromRoute(redirectRoute) !== portal) {
    return portalEntryRoute[portal];
  }

  return redirectRoute;
}

export function getPublicTestLoginPortal(portal: PortalScope): PortalScope {
  return portal;
}

export function LoginPage() {
  const { portal } = useParams();
  const [searchParams] = useSearchParams();
  const { language } = useI18n();
  const { theme, isNight } = useClientTheme();
  const { canAccess, isAuthenticated, login, loginWithFormalPassword, loginWithProvider, logout, session, switchPortal: switchSessionPortal } = useAuth();
  const requestedPortal = normalizePortal(portal);
  const redirectPath = searchParams.get("redirect");
  const [activePortal, setActivePortal] = useState<PortalScope>(requestedPortal);
  const [panelMode, setPanelMode] = useState<LoginPanelMode>("welcome");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<LoginFeedbackState | null>(null);
  const [isLoginPending, setIsLoginPending] = useState(false);
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [isCaptchaPending, setIsCaptchaPending] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const navigationInFlightRef = useRef(false);

  useEffect(() => {
    setActivePortal(requestedPortal);
  }, [requestedPortal]);

  const copy = loginCopy[language];
  const activePortalCopy = copy.portals[activePortal];
  const nextPath = useMemo(() => getPostLoginRoute(activePortal, redirectPath), [activePortal, redirectPath]);
  const rememberCredentialsScope = useMemo(() => getFrontendRememberCredentialsScope(activePortal), [activePortal]);
  const testCredentials = useMemo(
    () => resolveTestLoginCredentials(import.meta.env as TestCredentialEnv, activePortal),
    [activePortal]
  );
  const hasActiveAccess = isAuthenticated && canAccess(activePortal);
  const feedbackMessage = resolveLoginFeedbackMessage(feedback, copy);
  const error = feedback?.tone === "error" ? feedbackMessage : "";
  const notice = feedback?.tone === "notice" ? feedbackMessage : "";

  useEffect(() => {
    navigationInFlightRef.current = false;
  }, [activePortal, nextPath]);

  useEffect(() => {
    if (searchParams.get("googleAccount") !== "connected" || searchParams.get("googleAccountMode") !== "login") {
      return;
    }

    const googlePortal = normalizePortal(searchParams.get("portal") ?? activePortal);
    const googleEmail = searchParams.get("googleEmail") || portalGmailEmail[googlePortal];

    loginWithProvider(googlePortal, "gmail", googleEmail).then((result) => {
      if (!result.ok) {
        setFeedback({ message: result.message, tone: "error", type: "custom" });
        return;
      }

      openPortalEntry(result.session.portal, getPostLoginRoute(result.session.portal, redirectPath));
    });
  }, [activePortal, loginWithProvider, redirectPath, searchParams]);

  useEffect(() => {
    const remembered = readRememberedCredentials(rememberCredentialsScope);
    setRememberCredentials(remembered.enabled);

    if (remembered.enabled) {
      setUsername(remembered.account);
      setPassword(remembered.password);
    } else {
      setPassword("");
    }
  }, [rememberCredentialsScope]);

  useEffect(() => {
    if (!rememberCredentials) {
      return;
    }

    writeRememberedCredentials(rememberCredentialsScope, username, password);
  }, [password, rememberCredentials, rememberCredentialsScope, username]);

  const clearFeedback = () => {
    setFeedback(null);
  };

  const loadCaptcha = useCallback(async () => {
    setIsCaptchaPending(true);

    try {
      const nextCaptchaImage = await authApi.fetchCaptcha();
      setCaptchaImage(nextCaptchaImage);
      setCaptchaCode("");
    } catch {
      setCaptchaImage("");
      setCaptchaCode("");
      setFeedback({ key: "captchaLoadError", tone: "error", type: "localized" });
    } finally {
      setIsCaptchaPending(false);
    }
  }, []);

  useEffect(() => {
    if (hasActiveAccess || panelMode !== "account") {
      return;
    }

    void loadCaptcha();
  }, [hasActiveAccess, loadCaptcha, panelMode]);

  const enterPortal = useCallback(async () => {
    if (navigationInFlightRef.current) {
      return;
    }

    navigationInFlightRef.current = true;

    if (isAuthenticated && canAccess(activePortal)) {
      const switched = await switchSessionPortal(activePortal);

      if (!switched.ok) {
        navigationInFlightRef.current = false;
        setFeedback({ message: switched.message, tone: "error", type: "custom" });
        return;
      }
    }

    openPortalEntry(activePortal, nextPath);
  }, [activePortal, canAccess, isAuthenticated, nextPath, switchSessionPortal]);

  useEffect(() => {
    if (!hasActiveAccess || isLoginPending) {
      return;
    }

    void enterPortal();
  }, [enterPortal, hasActiveAccess, isLoginPending]);

  const toggleRememberCredentials = (checked: boolean) => {
    setRememberCredentials(checked);

    if (checked) {
      writeRememberedCredentials(rememberCredentialsScope, username, password);
      return;
    }

    clearRememberedCredentials(rememberCredentialsScope);
  };

  const continueWithGmail = async () => {
    if (isLoginPending) {
      return;
    }

    clearFeedback();
    setIsLoginPending(true);

    try {
      const result = await loginWithProvider(activePortal, "gmail", portalGmailEmail[activePortal]);

      if (!result.ok) {
        setFeedback({ key: "googleLoginUnavailable", tone: "error", type: "localized" });
        return;
      }

      openPortalEntry(result.session.portal, getPostLoginRoute(result.session.portal, redirectPath));
    } finally {
      setIsLoginPending(false);
    }
  };

  const fillTestCredentials = () => {
    if (!testCredentials || isLoginPending) {
      return;
    }

    setUsername(testCredentials.email);
    setPassword(testCredentials.password);
    clearFeedback();
  };

  const continueWithTestCredentials = async () => {
    if (!testCredentials || isLoginPending) {
      return;
    }

    clearFeedback();
    setIsLoginPending(true);

    try {
      const result = await loginWithFormalPassword(getPublicTestLoginPortal(activePortal), testCredentials.email, testCredentials.password);
      if (!result.ok) {
        setFeedback({ message: resolveLoginErrorMessage(result.message, copy), tone: "error", type: "custom" });
        return;
      }

      openPortalEntry(result.session.portal, getPostLoginRoute(result.session.portal, redirectPath));
    } finally {
      setIsLoginPending(false);
    }
  };

  const handleAccountLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoginPending) {
      return;
    }

    clearFeedback();

    if (!username.trim() || !password.trim()) {
      setFeedback({ key: "requiredError", tone: "error", type: "localized" });
      return;
    }
    const normalizedCaptchaCode = captchaCode.trim();

    if (!normalizedCaptchaCode) {
      setFeedback({ key: "captchaRequiredError", tone: "error", type: "localized" });
      return;
    }

    setIsLoginPending(true);

    try {
      const result = await login(activePortal, username, password, normalizedCaptchaCode);
      if (!result.ok) {
        setFeedback({ message: resolveLoginErrorMessage(result.message, copy), tone: "error", type: "custom" });
        void loadCaptcha();
        return;
      }

      openPortalEntry(result.session.portal, getPostLoginRoute(result.session.portal, redirectPath));
    } finally {
      setIsLoginPending(false);
    }
  };

  const captchaControl = (
    <label className="block text-left">
      <span className="text-sm font-black text-[color:var(--client-muted)]">{copy.captchaLabel}</span>
      <div className="mt-2 grid grid-cols-[1fr_128px] gap-2">
        <input
          autoComplete="off"
          className="h-12 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-4 text-base font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
          disabled={isLoginPending}
          inputMode="text"
          onChange={(event) => setCaptchaCode(event.target.value)}
          placeholder={copy.captchaPlaceholder}
          value={captchaCode}
        />
        <button
          aria-label={copy.captchaRefresh}
          className="flex h-12 items-center justify-center overflow-hidden rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] text-xs font-black text-[color:var(--client-muted)] disabled:cursor-wait disabled:opacity-70"
          disabled={isLoginPending || isCaptchaPending}
          onClick={() => {
            void loadCaptcha();
          }}
          title={copy.captchaRefresh}
          type="button"
        >
          {captchaImage ? (
            <img alt="" className="h-full w-full object-cover" draggable="false" src={captchaImage} />
          ) : (
            <span>{isCaptchaPending ? copy.loginPending : copy.captchaRefresh}</span>
          )}
        </button>
      </div>
    </label>
  );

  return (
    <div
      className={cn(
        "client-shell flex min-h-[100dvh] bg-[color:var(--client-bg)] px-5 text-[color:var(--client-text)]",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme)
      )}
      data-no-i18n
    >
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col pb-8 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <header className="flex min-h-11 items-center justify-between gap-3">
          {panelMode === "account" ? (
            <button
              className="inline-flex h-10 items-center justify-center rounded-full px-1 text-sm font-black text-[color:var(--client-muted)]"
              onClick={() => {
                setPanelMode("welcome");
                clearFeedback();
              }}
              type="button"
            >
              {copy.back}
            </button>
          ) : (
            <span className="text-sm font-black text-[color:var(--client-soft-muted)]">{activePortalCopy.shortLabel}</span>
          )}
          <LanguageSwitcher dark={isNight} iconOnly />
        </header>

        <section className="flex flex-1 flex-col justify-center py-10 text-center">
          <AppMark />
          <h1 className="mt-7 text-[32px] font-black leading-tight tracking-normal text-[color:var(--client-text)]">{copy.welcomeTitle}</h1>
          <p className="mx-auto mt-3 max-w-[320px] text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{copy.welcomeSubtitle}</p>

          <div className="mt-9">
            {hasActiveAccess ? (
              <div className="space-y-4">
                <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 py-5 text-left shadow-[var(--client-shadow)]">
                  <p className="text-sm font-black text-[color:var(--client-primary)]">{copy.continueTitle}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
                    {copy.signedInAs}: <strong className="text-[color:var(--client-text)]">{session?.email || session?.username}</strong>
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{activePortalCopy.title}</p>
                </div>
                <button
                  className="h-14 w-full rounded-[6px] bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:opacity-90"
                  onClick={enterPortal}
                  type="button"
                >
                  {copy.continueButton} {activePortalCopy.shortLabel}
                </button>
                <button
                  className="h-12 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,var(--client-bg)_24%)] px-5 text-sm font-black text-[color:var(--client-muted)]"
                  onClick={logout}
                  type="button"
                >
                  {copy.logout}
                </button>
              </div>
            ) : panelMode === "welcome" ? (
              <div className="space-y-4">
                <button
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
                  disabled={isLoginPending}
                  onClick={continueWithGmail}
                  type="button"
                >
                  <GmailMark />
                  {isLoginPending ? copy.loginPending : copy.gmailLogin}
                </button>
                <button
                  className="h-14 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 text-base font-black text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.08)] transition hover:border-[color:var(--client-primary)] disabled:cursor-wait disabled:opacity-70"
                  disabled={isLoginPending}
                  onClick={() => {
                    setPanelMode("account");
                    clearFeedback();
                  }}
                  type="button"
                >
                  {copy.accountLogin}
                </button>
                {testCredentials ? (
                  <div className="space-y-3">
                    <button
                      className="h-14 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 text-base font-black text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.08)] transition hover:border-[color:var(--client-primary)] disabled:cursor-wait disabled:opacity-70"
                      disabled={isLoginPending}
                      onClick={continueWithTestCredentials}
                      type="button"
                    >
                      {isLoginPending ? copy.loginPending : copy.testCredentialLogin}
                    </button>
                  </div>
                ) : null}
                <button
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-black text-[color:var(--client-text)]"
                  onClick={() => {
                    setFeedback({ key: "createNotice", tone: "notice", type: "localized" });
                  }}
                  type="button"
                >
                  {copy.createAccount}
                </button>
              </div>
            ) : (
              <form className="space-y-5 text-left" onSubmit={handleAccountLogin}>
                <div className="text-center">
                  <h2 className="text-2xl font-black tracking-normal text-[color:var(--client-text)]">{copy.useAccountTitle}</h2>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">{copy.useAccountSubtitle}</p>
                </div>
                <label className="block">
                  <span className="text-sm font-black text-[color:var(--client-muted)]">{copy.accountLabel}</span>
                  <input
                    autoComplete="username email"
                    className="mt-2 h-14 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-4 text-base font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={copy.accountPlaceholder}
                    value={username}
                  />
                </label>
                <label className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-[color:var(--client-muted)]">{copy.passwordLabel}</span>
                    <button
                      aria-checked={rememberCredentials}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-1 py-1 text-xs font-black text-[color:var(--client-muted)]",
                        "transition hover:text-[color:var(--client-text)]"
                      )}
                      onClick={() => toggleRememberCredentials(!rememberCredentials)}
                      role="switch"
                      type="button"
                    >
                      <span>{copy.rememberCredentials}</span>
                      <span
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] transition",
                          rememberCredentials
                            ? "bg-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-surface))]"
                            : "bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg))]"
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
                    autoComplete="current-password"
                    disabled={isLoginPending}
                    inputClassName="h-14 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-4 pr-14 text-base font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    toggleClassName="right-3 text-[color:var(--client-muted)]"
                    value={password}
                    wrapperClassName="mt-2"
                  />
                </label>
                {testCredentials ? (
                  <button
                    className="h-11 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-4 text-sm font-black text-[color:var(--client-muted)] disabled:cursor-wait disabled:opacity-70"
                    disabled={isLoginPending}
                    onClick={fillTestCredentials}
                    type="button"
                  >
                    {copy.testCredentialFill}
                  </button>
                ) : null}
                {captchaControl}
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
                  disabled={isLoginPending}
                  type="submit"
                >
                  {isLoginPending ? copy.loginPending : copy.loginButton}
                </button>
                <button
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 text-base font-black text-[color:var(--client-text)] disabled:cursor-wait disabled:opacity-70"
                  disabled={isLoginPending}
                  onClick={continueWithGmail}
                  type="button"
                >
                  <GmailMark />
                  {isLoginPending ? copy.loginPending : copy.gmailLogin}
                </button>
              </form>
            )}

            {error ? <p className="mt-4 rounded-[6px] bg-[color:color-mix(in_srgb,var(--client-accent)_13%,var(--client-bg)_87%)] px-4 py-3 text-left text-sm font-bold text-[color:var(--client-accent)]">{error}</p> : null}
            {notice ? <p className="mt-4 rounded-[6px] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-bg)_88%)] px-4 py-3 text-left text-sm font-bold leading-6 text-[color:var(--client-primary-strong)]">{notice}</p> : null}
          </div>
        </section>

        <footer className="pb-[env(safe-area-inset-bottom,0px)]">
          <p className="text-center text-xs font-semibold leading-5 text-[color:var(--client-soft-muted)]">{copy.copyright}</p>
        </footer>
      </main>
    </div>
  );
}
