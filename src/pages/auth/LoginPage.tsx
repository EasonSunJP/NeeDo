import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { demoAuthAccount, type PortalScope, useAuth } from "../../auth/AuthProvider";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  fetchGoogleAccountApi,
  googleAccountIconSrc,
  type GoogleAccountAuthUrlResponse
} from "../../lib/googleAccountApi";
import { cn } from "../../lib/utils";
import { getClientThemeClassName, getClientThemeModeClassName, useClientTheme } from "../../theme/ClientThemeProvider";

type LoginPanelMode = "welcome" | "account";

type FrontendLoginCopy = {
  brand: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  gmailLogin: string;
  accountLogin: string;
  createAccount: string;
  testAccountLogin: string;
  createNotice: string;
  useAccountTitle: string;
  useAccountSubtitle: string;
  accountLabel: string;
  accountPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  loginButton: string;
  back: string;
  requiredError: string;
  accountError: string;
  googleLoginUnavailable: string;
  continueTitle: string;
  signedInAs: string;
  continueButton: string;
  logout: string;
  copyright: string;
  portals: Record<PortalScope, { label: string; shortLabel: string; title: string; subtitle: string }>;
};

export type LoginFeedbackCopy = Pick<FrontendLoginCopy, "accountError" | "createNotice" | "googleLoginUnavailable" | "requiredError">;
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

const loginCopy = {
  zh: {
    brand: "NeeDo",
    welcomeTitle: "欢迎使用 NeeDo",
    welcomeSubtitle: "用一个账号连接消息、预约和工作协作。",
    gmailLogin: "使用 Google 登录",
    accountLogin: "使用邮箱 / ID 登录",
    createAccount: "新建账号",
    testAccountLogin: "测试账号登录",
    createNotice: "新建账号流程正在准备中，请先使用 Google 或邮箱 / ID 登录。",
    useAccountTitle: "账号登录",
    useAccountSubtitle: "请输入已发行账号信息。",
    accountLabel: "邮箱或账号 ID",
    accountPlaceholder: "请输入邮箱或账号 ID",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    loginButton: "登录",
    back: "返回",
    requiredError: "请先填写登录信息。",
    accountError: "账号或密码不正确，请确认后再试。",
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
    accountLogin: "使用信箱 / ID 登入",
    createAccount: "建立帳號",
    testAccountLogin: "測試帳號登入",
    createNotice: "建立帳號流程正在準備中，請先使用 Google 或信箱 / ID 登入。",
    useAccountTitle: "帳號登入",
    useAccountSubtitle: "請輸入已發行帳號資訊。",
    accountLabel: "信箱或帳號 ID",
    accountPlaceholder: "請輸入信箱或帳號 ID",
    passwordLabel: "密碼",
    passwordPlaceholder: "請輸入密碼",
    loginButton: "登入",
    back: "返回",
    requiredError: "請先填寫登入資訊。",
    accountError: "帳號或密碼不正確，請確認後再試。",
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
    accountLogin: "メール / IDでログイン",
    createAccount: "新規登録",
    testAccountLogin: "テストアカウントでログイン",
    createNotice: "新規登録フローは準備中です。Googleまたはメール / IDでログインしてください。",
    useAccountTitle: "アカウントログイン",
    useAccountSubtitle: "発行済みアカウント情報を入力してください。",
    accountLabel: "メールまたはアカウントID",
    accountPlaceholder: "メールまたはアカウントIDを入力",
    passwordLabel: "パスワード",
    passwordPlaceholder: "パスワードを入力",
    loginButton: "ログイン",
    back: "戻る",
    requiredError: "ログイン情報を入力してください。",
    accountError: "アカウントまたはパスワードが違います。内容を確認してください。",
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
    accountLogin: "Log in with email / ID",
    createAccount: "Create account",
    testAccountLogin: "Log in with test account",
    createNotice: "Account creation is being prepared. Use Google or email / ID login for now.",
    useAccountTitle: "Account login",
    useAccountSubtitle: "Enter your issued account details.",
    accountLabel: "Email or account ID",
    accountPlaceholder: "Enter email or account ID",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter password",
    loginButton: "Log in",
    back: "Back",
    requiredError: "Fill in the login information first.",
    accountError: "The account or password is incorrect. Please check and try again.",
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
    accountLogin: "이메일 / ID로 로그인",
    createAccount: "새 계정 만들기",
    testAccountLogin: "테스트 계정으로 로그인",
    createNotice: "새 계정 만들기 흐름은 준비 중입니다. 지금은 Google 또는 이메일 / ID로 로그인하세요.",
    useAccountTitle: "계정 로그인",
    useAccountSubtitle: "발급된 계정 정보를 입력하세요.",
    accountLabel: "이메일 또는 계정 ID",
    accountPlaceholder: "이메일 또는 계정 ID 입력",
    passwordLabel: "비밀번호",
    passwordPlaceholder: "비밀번호 입력",
    loginButton: "로그인",
    back: "뒤로",
    requiredError: "먼저 로그인 정보를 입력하세요.",
    accountError: "계정 또는 비밀번호가 올바르지 않습니다. 확인 후 다시 시도하세요.",
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

function getPostLoginRoute(portal: PortalScope, redirectPath: string | null) {
  if (portal === "user") {
    return portalEntryRoute.user;
  }

  return redirectPath || portalEntryRoute[portal];
}

export function LoginPage() {
  const { portal } = useParams();
  const [searchParams] = useSearchParams();
  const { language } = useI18n();
  const { theme, isNight } = useClientTheme();
  const { canAccess, isAuthenticated, login, loginWithProvider, logout, session, switchPortal: switchSessionPortal } = useAuth();
  const requestedPortal = normalizePortal(portal);
  const redirectPath = searchParams.get("redirect");
  const [activePortal, setActivePortal] = useState<PortalScope>(requestedPortal);
  const [panelMode, setPanelMode] = useState<LoginPanelMode>("welcome");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<LoginFeedbackState | null>(null);

  useEffect(() => {
    setActivePortal(requestedPortal);
  }, [requestedPortal]);

  const copy = loginCopy[language];
  const activePortalCopy = copy.portals[activePortal];
  const nextPath = useMemo(() => getPostLoginRoute(activePortal, redirectPath), [activePortal, redirectPath]);
  const hasActiveAccess = isAuthenticated && canAccess(activePortal);
  const feedbackMessage = resolveLoginFeedbackMessage(feedback, copy);
  const error = feedback?.tone === "error" ? feedbackMessage : "";
  const notice = feedback?.tone === "notice" ? feedbackMessage : "";

  useEffect(() => {
    if (searchParams.get("googleAccount") !== "connected" || searchParams.get("googleAccountMode") !== "login") {
      return;
    }

    const googlePortal = normalizePortal(searchParams.get("portal") ?? activePortal);
    const googleEmail = searchParams.get("googleEmail") || portalGmailEmail[googlePortal];

    if (!loginWithProvider(googlePortal, "gmail", googleEmail)) {
      setFeedback({ key: "accountError", tone: "error", type: "localized" });
      return;
    }

    openPortalEntry(googlePortal, getPostLoginRoute(googlePortal, redirectPath));
  }, [activePortal, loginWithProvider, redirectPath, searchParams]);

  const clearFeedback = () => {
    setFeedback(null);
  };

  const enterPortal = () => {
    if (isAuthenticated) {
      switchSessionPortal(activePortal);
    }

    openPortalEntry(activePortal, nextPath);
  };

  const continueWithGmail = async () => {
    clearFeedback();

    try {
      const response = await fetchGoogleAccountApi<GoogleAccountAuthUrlResponse>(
        `/api/google-account/auth-url?mode=login&portal=${encodeURIComponent(activePortal)}&actorId=${encodeURIComponent(
          `needo:login:${activePortal}`
        )}&returnTo=${encodeURIComponent(window.location.href)}`
      );

      window.location.assign(response.authUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(
        message.includes("GOOGLE_ACCOUNT") || message.includes("尚未配置")
          ? { key: "googleLoginUnavailable", tone: "error", type: "localized" }
          : { message, tone: "error", type: "custom" }
      );
    }
  };

  const handleAccountLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();

    if (!username.trim() || !password.trim()) {
      setFeedback({ key: "requiredError", tone: "error", type: "localized" });
      return;
    }

    if (!login(activePortal, username, password)) {
      setFeedback({ key: "accountError", tone: "error", type: "localized" });
      return;
    }

    openPortalEntry(activePortal, nextPath);
  };

  const handleTestAccountLogin = () => {
    clearFeedback();

    if (!login(activePortal, demoAuthAccount.username, demoAuthAccount.password)) {
      setFeedback({ key: "accountError", tone: "error", type: "localized" });
      return;
    }

    openPortalEntry(activePortal, nextPath);
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
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:opacity-90"
                  onClick={continueWithGmail}
                  type="button"
                >
                  <GmailMark />
                  {copy.gmailLogin}
                </button>
                <button
                  className="h-14 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 text-base font-black text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.08)] transition hover:border-[color:var(--client-primary)]"
                  onClick={() => {
                    setPanelMode("account");
                    clearFeedback();
                  }}
                  type="button"
                >
                  {copy.accountLogin}
                </button>
                <button
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-black text-[color:var(--client-text)]"
                  onClick={() => {
                    setFeedback({ key: "createNotice", tone: "notice", type: "localized" });
                  }}
                  type="button"
                >
                  {copy.createAccount}
                </button>
                <button
                  className="mt-6 h-14 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_36%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-5 text-base font-black text-[color:var(--client-primary)] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_10%,transparent)] transition hover:border-[color:var(--client-primary)]"
                  onClick={handleTestAccountLogin}
                  type="button"
                >
                  {copy.testAccountLogin}
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
                  <span className="text-sm font-black text-[color:var(--client-muted)]">{copy.passwordLabel}</span>
                  <input
                    autoComplete="current-password"
                    className="mt-2 h-14 w-full rounded-[6px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-4 text-base font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    type="password"
                    value={password}
                  />
                </label>
                <button
                  className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:opacity-90"
                  type="submit"
                >
                  {copy.loginButton}
                </button>
                <button
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 text-base font-black text-[color:var(--client-text)]"
                  onClick={continueWithGmail}
                  type="button"
                >
                  <GmailMark />
                  {copy.gmailLogin}
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
