import type { ReactNode } from "react";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { usePlatformSettings } from "../../features/platform-settings/PlatformSettingsProvider";
import { resolveMembershipDetailGradient, resolveMembershipTheme, type MembershipCardTheme } from "./platformMembershipTheme";
import { normalizeProfileLanguageLabels } from "./profileLanguages";

export type PlatformMembershipDetailCardProps = {
  avatarUrl: string | null;
  bio: string;
  displayName: string;
  ekycVerified: boolean;
  entityKind: "customer" | "technician" | "shop" | "service";
  level: number | null;
  needoId: string;
  tierLabel: string;
  languages: string[];
  gender?: string | null;
  age?: number | null;
  heightCm?: number | string | null;
  points?: number | string | null;
  pointsLabel?: string;
  testPoints?: number | string | null;
  usageCount?: number | string | null;
  credit?: number | string | null;
  theme?: MembershipCardTheme;
  actionSlot?: ReactNode;
  afterDetailsSlot?: ReactNode;
  footerSlot?: ReactNode;
  onNeedoIdClick?: () => void;
};

export function PlatformMembershipDetailCard(props: PlatformMembershipDetailCardProps) {
  const { settings } = usePlatformSettings();
  const theme = !settings.membershipCardFollowUiTheme && props.theme ? resolveMembershipTheme(props.theme) : null;
  const languages = normalizeProfileLanguageLabels(props.languages);
  const showLevel = props.entityKind === "customer" && props.level !== null;
  const itemStyle = { backgroundColor: theme?.detailItemSurfaceColor ?? "var(--client-elevated)", borderColor: theme?.detailItemBorderColor ?? "var(--client-line)", color: theme?.detailItemTextColor ?? "var(--client-text)" };
  const avatarNode = props.entityKind === "service"
    ? props.avatarUrl
      ? <img alt="" className="h-full w-full object-cover" src={props.avatarUrl} />
      : <span className="grid h-full w-full place-items-center text-3xl font-black">{props.displayName.slice(0, 1)}</span>
    : <AvatarImage alt="" className="h-full w-full object-cover" src={props.avatarUrl ?? undefined} />;
  return <article className="w-full max-w-[610px] rounded-[28px] border p-5 shadow-[var(--client-shadow)]" data-platform-membership-detail-card="true" style={{ backgroundColor: theme?.detailSurfaceColor ?? "var(--client-surface)", backgroundImage: theme ? resolveMembershipDetailGradient(theme) : undefined, borderColor: theme?.detailOuterBorderColor ?? "var(--client-line)", color: theme?.detailTextColor ?? "var(--client-text)" }}>
    <div className="flex items-start gap-4"><div className="h-28 w-28 shrink-0 overflow-hidden rounded-[28px] border-[3px] bg-[color:var(--client-elevated)]" style={{ borderColor: theme?.detailAvatarBorderColor ?? "var(--client-primary)" }}>{avatarNode}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="truncate text-lg font-black">{props.displayName}</h1>{props.ekycVerified ? <span aria-label="eKYC verified" className="grid h-5 w-5 place-items-center rounded-full text-xs font-black" style={{ backgroundColor: theme?.detailAccentColor ?? "var(--client-primary)", color: theme?.detailAccentTextColor ?? "var(--client-primary-contrast)" }}>✓</span> : null}</div>{props.actionSlot ? <div className="shrink-0">{props.actionSlot}</div> : null}</div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: theme?.detailAccentColor ?? "var(--client-primary-soft)", color: theme?.detailAccentTextColor ?? "var(--client-primary-strong)" }}>{props.tierLabel}</span>{showLevel ? <div><span className="font-black">Lv.{props.level}</span></div> : null}</div>{props.onNeedoIdClick ? <button aria-label="复制 NeeDo ID" className="mt-3 block max-w-full cursor-copy truncate text-left text-sm opacity-70" onClick={props.onNeedoIdClick} type="button">ID {props.needoId}</button> : <p className="mt-3 text-sm opacity-70">ID {props.needoId}</p>}</div></div>
    <div className="mt-5 grid grid-cols-3 gap-3">{[[props.pointsLabel ?? "积分", props.points], ["利用次数", props.usageCount], ["信用值", props.credit]].map(([label, value], index) => <div className="rounded-[18px] border p-3" key={String(label)} style={itemStyle}><p className="text-xs opacity-60">{label}</p><p className="mt-1 text-lg font-black">{value ?? "—"}</p>{index === 0 && props.testPoints !== null && props.testPoints !== undefined ? <p className="mt-1 text-[10px] font-bold opacity-60" data-testid="platform-membership-test-ndp">Test NDP {props.testPoints}</p> : null}</div>)}</div>
    <div className="my-5 h-px" style={{ backgroundColor: theme?.detailOuterBorderColor ?? "var(--client-line)" }} />
    <h3 className="text-lg font-black">基础信息</h3><div className="mt-3 grid grid-cols-3 gap-3">{[["性别", props.gender], ["年龄", props.age], ["身高（cm）", props.heightCm]].map(([label, value]) => <div className="rounded-[18px] border p-3" key={String(label)} style={itemStyle}><p className="text-xs opacity-60">{label}</p><p className="mt-1 font-bold">{value ?? "未设置"}</p></div>)}</div>
    <section className="mt-3 rounded-[22px] border p-4" style={itemStyle}><p className="text-xs font-bold opacity-60">语言能力</p><div className="mt-2 flex min-h-6 flex-wrap gap-2">{languages.length ? languages.map((language) => <span className="rounded-full border px-2.5 py-1 text-xs font-black" key={language} style={{ borderColor: theme?.detailAccentColor ?? "var(--client-primary)" }}>{language}</span>) : <span className="text-sm">未设置</span>}</div></section>
    <section className="mt-3 min-h-28 rounded-[22px] border p-4" style={itemStyle}><p className="text-xs font-bold opacity-60">自我介绍</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" data-no-i18n={Boolean(props.bio)}>{props.bio || "未设置"}</p></section>
    {props.afterDetailsSlot ? <div className="mt-3">{props.afterDetailsSlot}</div> : null}
    {props.footerSlot ? <div className="mt-3">{props.footerSlot}</div> : null}
  </article>;
}
