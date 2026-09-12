import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  currentMembershipBenefitsApi,
  type CurrentMembershipBenefitItem,
  type CurrentMembershipBenefitsPayload
} from "./currentMembershipBenefitsApi";

export const currentMembershipBenefitsCopy: Record<
  Language,
  {
    title: string;
    subtitle: string;
    retry: string;
    active: string;
    unavailable: string;
    disabled: string;
    enabled: string;
    loading: string;
    loadError: string;
    infoLabel: string;
  }
> = {
  zh: {
    title: "NeeDo会员权益",
    subtitle: "按当前会员类型显示配置与实际可用状态",
    retry: "重试",
    active: "可使用",
    unavailable: "能力未接通",
    disabled: "未启用",
    enabled: "已开启",
    loading: "正在读取会员权益",
    loadError: "会员权益读取失败",
    infoLabel: "查看NeeDo会员权益说明"
  },
  "zh-Hant": {
    title: "NeeDo會員權益",
    subtitle: "依目前會員類型顯示設定與實際可用狀態",
    retry: "重試",
    active: "可使用",
    unavailable: "能力未接通",
    disabled: "未啟用",
    enabled: "已開啟",
    loading: "正在讀取會員權益",
    loadError: "會員權益讀取失敗",
    infoLabel: "查看NeeDo會員權益說明"
  },
  ja: {
    title: "NeeDo会員特典",
    subtitle: "現在の会員ランクの設定と実際の利用可否を表示します",
    retry: "再試行",
    active: "利用可能",
    unavailable: "機能未接続",
    disabled: "無効",
    enabled: "件有効",
    loading: "会員特典を読み込んでいます",
    loadError: "会員特典を読み込めませんでした",
    infoLabel: "NeeDo会員特典の説明を見る"
  },
  en: {
    title: "NeeDo benefits",
    subtitle: "Configuration and actual availability for your current tier",
    retry: "Retry",
    active: "Available",
    unavailable: "Capability unavailable",
    disabled: "Off",
    enabled: " enabled",
    loading: "Loading membership benefits",
    loadError: "Could not load membership benefits",
    infoLabel: "View NeeDo membership benefit information"
  },
  ko: {
    title: "NeeDo 회원 혜택",
    subtitle: "현재 회원 등급의 설정과 실제 이용 가능 상태",
    retry: "다시 시도",
    active: "이용 가능",
    unavailable: "기능 미연결",
    disabled: "비활성",
    enabled: "개 활성화",
    loading: "회원 혜택을 불러오는 중",
    loadError: "회원 혜택을 불러올 수 없습니다",
    infoLabel: "NeeDo 회원 혜택 설명 보기"
  }
};

export function getCurrentMembershipBenefitStateLabel(
  item: CurrentMembershipBenefitItem,
  language: Language
) {
  if (item.effective) return currentMembershipBenefitsCopy[language].active;
  if (item.configuredEnabled && item.globallyEnabled && item.deliveryCapability === "unavailable") {
    return currentMembershipBenefitsCopy[language].unavailable;
  }
  return currentMembershipBenefitsCopy[language].disabled;
}

export function useCurrentMembershipBenefits(
  language: Language,
  load: (language: Language) => Promise<CurrentMembershipBenefitsPayload>
) {
  const [payload, setPayload] = useState<CurrentMembershipBenefitsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);

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

  return {
    payload,
    retry: () => setRevision((value) => value + 1),
    status
  };
}

export function CurrentMembershipBenefits({
  className,
  language,
  load = currentMembershipBenefitsApi.getMine
}: {
  className?: string;
  language: Language;
  load?: (language: Language) => Promise<CurrentMembershipBenefitsPayload>;
}) {
  const { payload, status } = useCurrentMembershipBenefits(language, load);
  const text = currentMembershipBenefitsCopy[language];

  return (
    <section
      className={cn(
        "relative min-h-[74px] rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]",
        className
      )}
      data-testid="current-membership-benefits"
    >
      <Link
        aria-label={text.title}
        className="focus-ring absolute inset-0 rounded-[28px]"
        to="/me/benefits"
      />
      <div className="pointer-events-none relative z-10 flex min-h-[50px] flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <h3 className="min-w-0 whitespace-nowrap text-sm font-black text-[color:var(--client-text)]">
            {text.title}
          </h3>
          <InfoTooltipTrigger
            className="pointer-events-auto h-4 w-4 border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[10px] text-ink/45 hover:text-ink/80"
            content={text.subtitle}
            label={text.infoLabel}
            panelMode="tooltip"
          />
        </div>
        <div className="flex justify-end">
          <span className="shrink-0 rounded-md bg-mint/20 px-1 py-1 text-[10px] font-black leading-none text-moss">
            {status === "ready" && payload
              ? `${payload.list.filter((item) => item.effective).length}/${payload.list.length}${text.enabled}`
              : status === "error"
                ? text.retry
                : "…"}
          </span>
        </div>
      </div>
    </section>
  );
}
