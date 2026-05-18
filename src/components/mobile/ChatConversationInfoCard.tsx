import { AvatarImage } from "../ui/AvatarImage";
import { cn } from "../../lib/utils";
import { SocialProfileMiniCard, type SocialProfileMiniData } from "../../shared/profile-card";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";

type ConversationKind = "customer" | "technician" | "store" | "staff" | "support";

export function ChatProfileCardIcon({ kind }: { kind: ConversationKind }) {
  if (kind === "store") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M5.5 10.5V8A1.5 1.5 0 0 1 7 6.5h10A1.5 1.5 0 0 1 18.5 8v2.5M6.5 10.5h11v7a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 17.5v-7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9.5 13h5M9.5 16h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (kind === "technician") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8.2" r="3.1" stroke="currentColor" strokeWidth="2" />
        <path d="M6.5 18.8a5.8 5.8 0 0 1 11 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 10h6M9 14h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ChatProfileCardControlIcon({ name }: { name: "minimize" | "expand" }) {
  if (name === "expand") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M6 12h12" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function profileSeed(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildChatProfileData({
  avatar,
  kind,
  metricLabel,
  metricValue,
  name,
  subtitle
}: {
  avatar: string;
  kind: "customer" | "technician" | "store";
  metricLabel: string;
  metricValue: string;
  name: string;
  subtitle: string;
}): SocialProfileMiniData {
  const seed = profileSeed(`${kind}-${name}`);
  const entityType = kind === "store" ? "shop" : kind === "technician" ? "technician" : "user";
  const scoreNumber = Number.parseFloat(metricValue.replace(/[^\d.]/g, ""));
  const scoreValue = Number.isFinite(scoreNumber) ? `${Math.max(0, Math.min(5, scoreNumber > 5 ? scoreNumber / 2 : scoreNumber)).toFixed(1)}/5` : "0.0/5";
  const customerMembership = kind === "customer" ? resolveCustomerMembership(subtitle) : undefined;
  const levelFromSubtitle = subtitle.match(/Lv\.\d+/)?.[0];

  return {
    id: `${kind}-${name}`,
    entityType,
    displayName: name,
    avatar,
    coverImage: avatar,
    headline: subtitle,
    genderLabel: kind === "store" ? "店铺" : kind === "technician" ? "性别未公开" : "性别未公开",
    regionLabel: subtitle.split(/[·/]/)[0]?.trim() || "东京",
    primaryLabel: kind === "customer" ? customerMembership?.label ?? "免费会员" : kind === "technician" ? "技师" : "店铺",
    membershipKind: customerMembership?.kind,
    levelLabel: kind === "customer" ? levelFromSubtitle ?? `Lv.${Math.max(1, Math.min(100, 20 + (seed % 76)))}` : `Lv.${Math.max(1, Math.min(100, 12 + (seed % 89)))}`,
    scoreLabel: kind === "customer" || metricLabel.includes("信用") ? "信用度" : "服务评价",
    scoreValue,
    followerCount: 120 + (seed * 17) % 3200,
    followingCount: 36 + (seed * 11) % 520,
    actionLabel: "关注中"
  };
}

export function ChatConversationInfoCard({
  dark,
  kind,
  name,
  avatar,
  subtitle,
  metricLabel,
  metricValue,
  onOpenDetails,
  onMinimize,
  showMinimizeButton = true
}: {
  dark: boolean;
  kind: ConversationKind;
  name: string;
  avatar: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  onOpenDetails: () => void;
  onMinimize: () => void;
  showMinimizeButton?: boolean;
}) {
  if (kind === "store" || kind === "technician" || kind === "customer") {
    return (
      <SocialProfileMiniCard
        actionSlot={
          showMinimizeButton ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("rounded-[16px] px-3.5 py-2.5 text-sm font-black shadow-panel", dark ? "bg-white/10 text-white" : "bg-paper text-ink")}>关注中</span>
              <button
                aria-label="最小化资料卡"
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-panel transition",
                  dark ? "bg-[#0f0f0f] text-white/62 hover:bg-[#f3cf78] hover:text-[#13110e]" : "bg-white text-ink/55 hover:bg-moss hover:text-white"
                )}
                onClick={onMinimize}
                type="button"
              >
                <ChatProfileCardControlIcon name="minimize" />
              </button>
            </div>
          ) : null
        }
        className="rounded-[22px]"
        dark={dark}
        data={buildChatProfileData({ avatar, kind, metricLabel, metricValue, name, subtitle })}
        onOpenDetails={onOpenDetails}
      />
    );
  }

  const panelClass = dark ? "border-[#3f3118]/55 bg-[#15110d] text-white" : "border-line bg-white text-ink";
  const mutedTextClass = dark ? "text-[#f7ead0]/55" : "text-ink/45";
  const minimizeButtonClass = dark
    ? "bg-[#0f0f0f] text-white/62 hover:bg-[#f3cf78] hover:text-[#13110e]"
    : "bg-white text-ink/55 hover:bg-moss hover:text-white";
  const metricClass = dark ? "bg-[#0f0f0f] text-[#f3cf78]" : "bg-moss/10 text-moss";

  return (
    <section className={cn("rounded-[22px] border px-2.5 py-2 shadow-panel", panelClass)}>
      <div className="flex min-h-[56px] items-center gap-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onOpenDetails}
          type="button"
        >
          <AvatarImage alt={name} className="h-14 w-14 shrink-0" src={avatar} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-[10px]",
                  dark ? "bg-[#0f0f0f] text-[#f3cf78]" : "bg-moss/12 text-moss"
                )}
              >
                <ChatProfileCardIcon kind={kind} />
              </span>
              <h3 className="min-w-0 truncate text-[17px] font-black leading-none">{name}</h3>
            </div>
            <p className={cn("mt-1.5 truncate text-[12px] leading-none", mutedTextClass)}>{subtitle}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className={cn("rounded-[14px] px-2.5 py-2 text-right shadow-panel", metricClass)}
            onClick={onOpenDetails}
            type="button"
          >
            <span className={cn("block text-[10px] font-bold leading-none", dark ? "text-[#f7ead0]/56" : "text-ink/45")}>{metricLabel}</span>
            <span className="mt-1 block text-[12px] font-black leading-none">{metricValue}</span>
          </button>
          {showMinimizeButton ? (
            <button
              aria-label="最小化资料卡"
              className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full shadow-panel transition", minimizeButtonClass)}
              onClick={onMinimize}
              type="button"
            >
              <ChatProfileCardControlIcon name="minimize" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
