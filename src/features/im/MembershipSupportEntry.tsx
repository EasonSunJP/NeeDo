import { useEffect, useState } from "react";
import type { Language } from "../../i18n/translations";
import {
  currentMembershipBenefitsApi,
  type CurrentMembershipBenefitsPayload
} from "../platform-membership/currentMembershipBenefitsApi";
import { ImIcon } from "./components";

const copy: Record<Language, { title: string; unavailable: string; explanation: string; close: string }> = {
  zh: {
    title: "NeeDo专属客服",
    unavailable: "能力未接通",
    explanation: "专属客服权益已配置，但正式服务号能力尚未接通，暂时无法发起对话。会员资格或权益变化不会创建或删除联系人。",
    close: "关闭"
  },
  "zh-Hant": {
    title: "NeeDo專屬客服",
    unavailable: "能力未接通",
    explanation: "專屬客服權益已設定，但正式服務號能力尚未接通，暫時無法發起對話。會員資格或權益變更不會建立或刪除聯絡人。",
    close: "關閉"
  },
  ja: {
    title: "NeeDo専用サポート",
    unavailable: "機能未接続",
    explanation: "専用サポート特典は設定済みですが、正式なサービスアカウント機能はまだ接続されていないため、現在は会話を開始できません。会員資格や特典の変更によって連絡先が作成・削除されることはありません。",
    close: "閉じる"
  },
  en: {
    title: "NeeDo dedicated support",
    unavailable: "Capability unavailable",
    explanation: "Dedicated support is configured for this tier, but formal service-account messaging is not connected yet, so a conversation cannot be started. Membership changes do not create or delete contacts.",
    close: "Close"
  },
  ko: {
    title: "NeeDo 전용 고객 지원",
    unavailable: "기능 미연결",
    explanation: "전용 고객 지원 혜택은 설정되어 있지만 정식 서비스 계정 메시지 기능은 아직 연결되지 않아 대화를 시작할 수 없습니다. 회원 자격이나 혜택 변경으로 연락처를 만들거나 삭제하지 않습니다.",
    close: "닫기"
  }
};

export function MembershipSupportEntry({
  enabled,
  language,
  load = currentMembershipBenefitsApi.getMine
}: {
  enabled: boolean;
  language: Language;
  load?: (language: Language) => Promise<CurrentMembershipBenefitsPayload>;
}) {
  const [configured, setConfigured] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setConfigured(false);
      return () => {
        active = false;
      };
    }
    load(language)
      .then((payload) => {
        if (!active) return;
        const support = payload.list.find((item) => item.code === "support_service");
        setConfigured(Boolean(support?.configuredEnabled));
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, language, load]);

  if (!enabled || !configured) return null;

  return (
    <>
      <button
        aria-disabled="true"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left opacity-55"
        onClick={() => setExplanationOpen(true)}
        type="button"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--client-line)] text-[color:var(--client-muted)]">
          <ImIcon name="service" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[15px] font-black text-[color:var(--client-muted)]">
            {copy[language].title}（{copy[language].unavailable}）
          </strong>
        </span>
      </button>

      {explanationOpen ? (
        <div aria-modal="true" className="fixed inset-0 z-[140] grid items-end bg-black/55 p-4" role="dialog">
          <div className="mx-auto w-full max-w-md rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.46)]">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy[language].title}</h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--client-muted)]">{copy[language].explanation}</p>
            <button className="mt-5 w-full rounded-full bg-[color:var(--client-primary)] px-4 py-3 text-sm font-black text-[color:var(--client-needo-text)]" onClick={() => setExplanationOpen(false)} type="button">{copy[language].close}</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
