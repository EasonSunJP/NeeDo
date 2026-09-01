import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { UserPolicyComplianceRequirement } from "../../auth/rbac";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { accountComplianceApi } from "./accountComplianceApi";

const copy = {
  zh: {
    title: "完成账户要求", info: "仅处理当前已发布的账户要求。完成后由服务器重新确认，原页面会自动恢复。", close: "退出登录",
    intro: "你的账户仍可登录，但在完成以下要求前不能使用其他功能。", policy: "当前策略", phoneTitle: "绑定手机号", phoneBody: "填写国际格式手机号。本次只保存规范化号码，不代表已经通过短信验证。", phonePlaceholder: "+819012345678", phoneAction: "保存手机号", saving: "保存中…", phoneInvalid: "请输入以 + 开头的国际格式手机号。", phoneSaved: "手机号已保存，正在重新确认账户状态。", emailTitle: "验证邮箱", emailBody: "当前版本没有为已登录旧账户提供独立的邮箱补验流程，请联系运营处理。", ekycTitle: "完成 eKYC", ekycBody: "当前客户端尚未接入可完成 eKYC 的正式服务商流程，请联系运营处理。", unavailable: "当前能力不可用", operationReference: "运营处置编号", logout: "退出登录", retry: "重新确认", retrying: "确认中…", error: "操作失败，请重试。"
  },
  "zh-Hant": {
    title: "完成帳戶要求", info: "只處理目前已發布的帳戶要求。完成後由伺服器重新確認，原頁面會自動恢復。", close: "登出",
    intro: "你的帳戶仍可登入，但完成下列要求前不能使用其他功能。", policy: "目前策略", phoneTitle: "綁定手機號碼", phoneBody: "填寫國際格式手機號碼。本次只儲存規範化號碼，不代表已通過簡訊驗證。", phonePlaceholder: "+819012345678", phoneAction: "儲存手機號碼", saving: "儲存中…", phoneInvalid: "請輸入以 + 開頭的國際格式手機號碼。", phoneSaved: "手機號碼已儲存，正在重新確認帳戶狀態。", emailTitle: "驗證電子郵件", emailBody: "目前版本未提供已登入舊帳戶的獨立信箱補驗流程，請聯絡營運處理。", ekycTitle: "完成 eKYC", ekycBody: "目前用戶端尚未接入可完成 eKYC 的正式服務商流程，請聯絡營運處理。", unavailable: "目前功能不可用", operationReference: "營運處置編號", logout: "登出", retry: "重新確認", retrying: "確認中…", error: "操作失敗，請重試。"
  },
  ja: {
    title: "アカウント要件の完了", info: "現在公開中の要件のみを処理します。完了後はサーバーで再確認し、元の画面へ戻ります。", close: "ログアウト",
    intro: "ログインは維持されていますが、次の要件を満たすまで他の機能は利用できません。", policy: "適用中のポリシー", phoneTitle: "電話番号を登録", phoneBody: "国際形式で入力してください。今回は正規化した番号の保存のみで、SMS認証済みを意味しません。", phonePlaceholder: "+819012345678", phoneAction: "電話番号を保存", saving: "保存中…", phoneInvalid: "+ から始まる国際形式の電話番号を入力してください。", phoneSaved: "電話番号を保存しました。アカウント状態を再確認しています。", emailTitle: "メールアドレスを確認", emailBody: "現行版には既存アカウント向けの個別メール再確認フローがないため、運営へお問い合わせください。", ekycTitle: "eKYCを完了", ekycBody: "現行クライアントには正式なeKYC事業者フローが未接続です。運営へお問い合わせください。", unavailable: "現在利用できません", operationReference: "運営対応番号", logout: "ログアウト", retry: "再確認", retrying: "確認中…", error: "操作に失敗しました。もう一度お試しください。"
  },
  en: {
    title: "Complete account requirements", info: "Only currently published account requirements are handled here. The server rechecks them before returning you to the requested page.", close: "Log out",
    intro: "You remain signed in, but other features stay unavailable until these requirements are completed.", policy: "Current policy", phoneTitle: "Add a phone number", phoneBody: "Enter an international-format number. This stores a normalized number only and does not claim SMS verification.", phonePlaceholder: "+819012345678", phoneAction: "Save phone number", saving: "Saving…", phoneInvalid: "Enter an international-format number beginning with +.", phoneSaved: "Phone number saved. Rechecking your account status.", emailTitle: "Verify email", emailBody: "This release has no separate email re-verification flow for an existing signed-in account. Contact operations for remediation.", ekycTitle: "Complete eKYC", ekycBody: "A formal eKYC provider flow is not connected in this client yet. Contact operations for remediation.", unavailable: "Capability unavailable", operationReference: "Operations reference", logout: "Log out", retry: "Recheck", retrying: "Checking…", error: "The operation failed. Try again."
  },
  ko: {
    title: "계정 요구 사항 완료", info: "현재 게시된 계정 요구 사항만 처리합니다. 완료 후 서버가 다시 확인하고 원래 화면으로 돌아갑니다.", close: "로그아웃",
    intro: "로그인은 유지되지만 아래 요구 사항을 완료하기 전에는 다른 기능을 사용할 수 없습니다.", policy: "현재 정책", phoneTitle: "휴대전화 번호 등록", phoneBody: "국제 형식 번호를 입력하세요. 정규화된 번호만 저장하며 SMS 인증 완료를 의미하지 않습니다.", phonePlaceholder: "+819012345678", phoneAction: "번호 저장", saving: "저장 중…", phoneInvalid: "+로 시작하는 국제 형식 번호를 입력하세요.", phoneSaved: "번호를 저장했습니다. 계정 상태를 다시 확인하고 있습니다.", emailTitle: "이메일 확인", emailBody: "현재 버전에는 로그인된 기존 계정용 이메일 재확인 절차가 없습니다. 운영팀에 문의하세요.", ekycTitle: "eKYC 완료", ekycBody: "현재 클라이언트에는 정식 eKYC 제공업체 절차가 연결되어 있지 않습니다. 운영팀에 문의하세요.", unavailable: "현재 사용할 수 없음", operationReference: "운영 처리 번호", logout: "로그아웃", retry: "다시 확인", retrying: "확인 중…", error: "작업에 실패했습니다. 다시 시도하세요."
  }
} satisfies Record<Language, Record<string, string>>;

export const accountComplianceCopyByLanguage = copy;

export function sanitizeComplianceReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/account-compliance")) return "/";
  return value;
}

function RequirementCard({
  requirement,
  text,
  phone,
  setPhone,
  saving,
  onBindPhone
}: {
  requirement: UserPolicyComplianceRequirement;
  text: (typeof copy)[Language];
  phone: string;
  setPhone: (value: string) => void;
  saving: boolean;
  onBindPhone: () => void;
}) {
  const isPhone = requirement === "phone_binding_required";
  const title = isPhone ? text.phoneTitle : requirement === "email_binding_required" ? text.emailTitle : text.ekycTitle;
  const body = isPhone ? text.phoneBody : requirement === "email_binding_required" ? text.emailBody : text.ekycBody;
  return (
    <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[color:var(--client-surface)] p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] text-[color:var(--client-primary)]">
          <AppIcon className="h-5 w-5" name={isPhone ? "info" : requirement === "email_binding_required" ? "check" : "shield"} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-black">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{body}</p>
        </div>
      </div>
      {isPhone ? (
        <div className="mt-4 grid gap-3">
          <input aria-label={text.phoneTitle} autoComplete="tel" className="min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-base font-bold outline-none focus:border-[color:var(--client-primary)]" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder={text.phonePlaceholder} value={phone} />
          <button className="min-h-12 rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-ink)] disabled:opacity-45" disabled={saving} onClick={onBindPhone} type="button">{saving ? text.saving : text.phoneAction}</button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-[color:var(--client-bg)] px-4 py-3 text-sm font-black text-[color:var(--client-muted)]">{text.unavailable}</div>
      )}
    </section>
  );
}

export function AccountCompliancePage() {
  const { language } = useI18n();
  const { logout, refreshSession, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const text = copy[language];
  const returnTo = useMemo(() => sanitizeComplianceReturnTo(searchParams.get("returnTo")), [searchParams]);
  const requirements = session?.complianceRequirements ?? [];
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"phone" | "refresh" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (session && requirements.length === 0) navigate(returnTo, { replace: true });
  }, [navigate, requirements.length, returnTo, session]);

  if (!session) return <Navigate replace to={`/login/user?redirect=${encodeURIComponent(returnTo)}`} />;

  const refresh = async () => {
    setBusy("refresh");
    setMessage("");
    const result = await refreshSession(session.portal);
    if (!result.ok) setMessage(text.error);
    setBusy(null);
  };
  const bindPhone = async () => {
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage(text.phoneInvalid);
      return;
    }
    setBusy("phone");
    setMessage("");
    try {
      await accountComplianceApi.bindPhone(normalized);
      setMessage(text.phoneSaved);
      await refreshSession(session.portal);
    } catch {
      setMessage(text.error);
    } finally {
      setBusy(null);
    }
  };
  const signOut = async () => {
    await logout();
    navigate("/login/user", { replace: true });
  };

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader closeLabel={text.close} info={text.info} onClose={() => { void signOut(); }} title={text.title} />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
        <div className="rounded-[28px] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] p-5">
          <p className="text-sm font-bold leading-6 text-[color:var(--client-muted)]">{text.intro}</p>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[color:var(--client-primary)]">{text.policy}: {session.compliancePolicyVersionPublicId ?? "—"}</p>
        </div>
        <div className="mt-4 grid gap-4">
          {requirements.map((requirement) => <RequirementCard key={requirement} onBindPhone={() => { void bindPhone(); }} phone={phone} requirement={requirement} saving={busy === "phone"} setPhone={setPhone} text={text} />)}
        </div>
        {requirements.some((item) => item !== "phone_binding_required") ? <p className="mt-4 px-1 text-xs font-bold text-[color:var(--client-muted)]">{text.operationReference}: {session.compliancePolicyVersionPublicId ?? "—"}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-[color:var(--client-surface)] px-4 py-3 text-sm font-bold" role="status">{message}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="min-h-12 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black" disabled={busy !== null} onClick={() => { void refresh(); }} type="button">{busy === "refresh" ? text.retrying : text.retry}</button>
          <button className="min-h-12 rounded-2xl border border-[color:var(--client-line)] bg-transparent text-sm font-black text-[color:var(--client-muted)]" onClick={() => { void signOut(); }} type="button">{text.logout}</button>
        </div>
      </main>
    </MobileFullscreenPage>
  );
}
