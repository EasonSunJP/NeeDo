import { useEffect, useId, useState } from "react";
import type { Language } from "../../i18n/translations";
import {
  currentMembershipBenefitsApi,
  type CurrentMembershipBenefitItem,
  type CurrentMembershipBenefitsPayload
} from "./currentMembershipBenefitsApi";

const copy: Record<
  Language,
  {
    title: string;
    subtitle: string;
    loading: string;
    loadFailed: string;
    retry: string;
    active: string;
    unavailable: string;
    disabled: string;
    explanation: string;
    enabled: string;
    collapse: string;
    close: string;
  }
> = {
  zh: {
    title: "会员权益",
    subtitle: "按当前会员类型显示配置与实际可用状态",
    loading: "正在读取会员权益…",
    loadFailed: "会员权益读取失败",
    retry: "重试",
    active: "可使用",
    unavailable: "能力未接通",
    disabled: "未启用",
    explanation: "该权益已包含在会员配置中，但对应服务能力尚未接通。当前不会创建客服账号、聊天、优惠券或权益履约记录。",
    enabled: "已开启",
    collapse: "收起",
    close: "关闭"
  },
  "zh-Hant": {
    title: "會員權益",
    subtitle: "依目前會員類型顯示設定與實際可用狀態",
    loading: "正在讀取會員權益…",
    loadFailed: "會員權益讀取失敗",
    retry: "重試",
    active: "可使用",
    unavailable: "能力未接通",
    disabled: "未啟用",
    explanation: "此權益已包含在會員設定中，但對應服務能力尚未接通。目前不會建立客服帳號、聊天、優惠券或權益履約紀錄。",
    enabled: "已開啟",
    collapse: "收起",
    close: "關閉"
  },
  ja: {
    title: "会員特典",
    subtitle: "現在の会員ランクの設定と実際の利用可否を表示します",
    loading: "会員特典を読み込み中…",
    loadFailed: "会員特典を読み込めませんでした",
    retry: "再試行",
    active: "利用可能",
    unavailable: "機能未接続",
    disabled: "無効",
    explanation: "この特典は会員設定に含まれていますが、対応サービスはまだ接続されていません。サポート用アカウント、チャット、クーポン、付与履歴は作成されません。",
    enabled: "件有効",
    collapse: "折りたたむ",
    close: "閉じる"
  },
  en: {
    title: "Membership benefits",
    subtitle: "Configuration and actual availability for your current tier",
    loading: "Loading membership benefits…",
    loadFailed: "Could not load membership benefits",
    retry: "Retry",
    active: "Available",
    unavailable: "Capability unavailable",
    disabled: "Off",
    explanation: "This benefit is included in the membership configuration, but its delivery service is not connected. No support account, chat, coupon, or fulfillment record will be created.",
    enabled: " enabled",
    collapse: "Collapse",
    close: "Close"
  },
  ko: {
    title: "회원 혜택",
    subtitle: "현재 회원 등급의 설정과 실제 이용 가능 상태",
    loading: "회원 혜택 불러오는 중…",
    loadFailed: "회원 혜택을 불러오지 못했습니다",
    retry: "다시 시도",
    active: "이용 가능",
    unavailable: "기능 미연결",
    disabled: "비활성",
    explanation: "이 혜택은 회원 설정에 포함되어 있지만 해당 서비스 기능은 아직 연결되지 않았습니다. 고객 지원 계정, 채팅, 쿠폰 또는 지급 기록을 만들지 않습니다.",
    enabled: "개 활성화",
    collapse: "접기",
    close: "닫기"
  }
};

function stateLabel(item: CurrentMembershipBenefitItem, language: Language) {
  if (item.effective) return copy[language].active;
  if (item.configuredEnabled && item.globallyEnabled && item.deliveryCapability === "unavailable") {
    return copy[language].unavailable;
  }
  return copy[language].disabled;
}

export function CurrentMembershipBenefits({
  language,
  load = currentMembershipBenefitsApi.getMine
}: {
  language: Language;
  load?: (language: Language) => Promise<CurrentMembershipBenefitsPayload>;
}) {
  const [payload, setPayload] = useState<CurrentMembershipBenefitsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [explained, setExplained] = useState<CurrentMembershipBenefitItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  useEffect(() => {
    let active = true;
    setStatus("loading");
    load(language)
      .then((result) => {
        if (!active) return;
        setPayload(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setPayload(null);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [language, load, revision]);

  return (
    <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]" data-testid="current-membership-benefits">
      <button
        aria-controls={listId}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 text-left disabled:cursor-default"
        disabled={status !== "ready" || !payload}
        onClick={() => setExpanded(true)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-base font-black text-[color:var(--client-text)]">{copy[language].title}</span>
          <span className="mt-1 block text-xs font-bold text-[color:var(--client-muted)]">{copy[language].subtitle}</span>
        </span>
        {status === "ready" && payload ? (
          <span className="shrink-0 text-sm font-black text-[color:var(--client-text)]">
            {payload.list.filter((item) => item.effective).length}/{payload.list.length}{copy[language].enabled}
          </span>
        ) : null}
      </button>

      {status === "loading" ? <p className="py-6 text-center text-sm text-[color:var(--client-muted)]">{copy[language].loading}</p> : null}
      {status === "error" ? (
        <div className="grid justify-items-center gap-3 py-5 text-sm text-[color:var(--client-muted)]">
          <p>{copy[language].loadFailed}</p>
          <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 font-black" onClick={() => setRevision((value) => value + 1)} type="button">{copy[language].retry}</button>
        </div>
      ) : null}
      {status === "ready" && payload && expanded ? (
        <div className="mt-4 grid gap-2" id={listId}>
          {payload.list.map((item) => {
            const unavailable = item.configuredEnabled && item.globallyEnabled && item.deliveryCapability === "unavailable";
            return (
              <button
                aria-disabled={!item.effective}
                className="flex min-h-[68px] items-center gap-3 rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-3 py-3 text-left disabled:cursor-default"
                disabled={!unavailable}
                key={item.code}
                onClick={unavailable ? () => setExplained(item) : undefined}
                type="button"
              >
                <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${item.effective ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]" : "bg-[color:var(--client-line)] text-[color:var(--client-muted)]"}`}>
                  {item.effective ? "✓" : "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[color:var(--client-text)]">{item.name}</strong>
                  <span className="mt-1 block line-clamp-2 text-xs text-[color:var(--client-muted)]">{item.description}</span>
                </span>
                <span className="shrink-0 text-[11px] font-black text-[color:var(--client-muted)]">{stateLabel(item, language)}</span>
              </button>
            );
          })}
          <button
            className="mx-auto mt-1 block px-2 py-2 text-sm font-black text-[color:var(--client-muted)]"
            onClick={() => setExpanded(false)}
            type="button"
          >
            {copy[language].collapse}
          </button>
        </div>
      ) : null}

      {explained ? (
        <div aria-modal="true" className="fixed inset-0 z-[120] grid items-end bg-black/55 p-4" role="dialog">
          <div className="mx-auto w-full max-w-md rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.46)]">
            <h3 className="text-lg font-black text-[color:var(--client-text)]">{explained.name}</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--client-muted)]">{copy[language].explanation}</p>
            <button className="mt-5 w-full rounded-full bg-[color:var(--client-primary)] px-4 py-3 text-sm font-black text-[color:var(--client-needo-text)]" onClick={() => setExplained(null)} type="button">{copy[language].close}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
