import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import {
  formatBillingState,
  formatFreeDuration,
  formatJpy,
  isAccountOverdue,
  isMerchantGroup,
  type MerchantAccountCard
} from "../../features/merchant-saas-billing/model";

const fallbackCover = "/images/generated/stores/store-calm-body-room.jpg";

function cadenceLabel(cadence: MerchantAccountCard["billing"]["cadence"]) {
  if (cadence === "annual") return "年费";
  if (cadence === "free") return "免费";
  return "月费";
}

function stateTone(state: MerchantAccountCard["billing"]["state"]): BadgeTone {
  if (state === "overdue") return "red";
  if (state === "trial") return "yellow";
  if (state === "paid") return "green";
  return "blue";
}

export function MerchantBillingCard({
  card,
  expanded = false,
  nested = false,
  onToggleExpanded,
  onEditBilling,
  onOpenBusinessSettings,
  onViewDetails
}: {
  card: MerchantAccountCard;
  expanded?: boolean;
  nested?: boolean;
  onToggleExpanded?: () => void;
  onEditBilling: () => void;
  onOpenBusinessSettings: () => void;
  onViewDetails: () => void;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const group = isMerchantGroup(card) ? card : null;
  const shop = isMerchantGroup(card) ? null : card;
  const cover = group?.shops.find((item) => item.coverUrl)?.coverUrl ?? shop?.coverUrl ?? fallbackCover;
  const overdue = isAccountOverdue(card.billing);
  const technicianCount = group
    ? group.shops.reduce((total, shop) => total + shop.technicianCount, 0)
    : shop?.technicianCount ?? 0;
  const typeLabel = group ? "商家" : card.type === "single_shop" ? "单人店铺" : "店铺";
  const identifier = group ? group.code : `S${String(card.id).padStart(10, "0")}`;
  const paymentResponsibility = group
    ? group.paymentResponsibility === "group_consolidated"
      ? "集团统一付费"
      : "店铺各自负担"
    : null;

  return (
    <article
      className={`group/card overflow-hidden rounded-xl border bg-white shadow-panel transition ${
        nested ? "border-line/80" : "border-line"
      } ${overdue ? "ring-1 ring-coral/45" : ""}`}
      data-merchant-type={card.type}
    >
      <div className={`grid min-h-[270px] gap-0 ${nested ? "md:grid-cols-[190px,1fr]" : "md:grid-cols-[240px,1fr]"}`}>
        <div className="relative min-h-[210px] overflow-hidden bg-paper md:min-h-full">
          <img alt={card.name} className="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.015]" src={cover} />
          {group ? (
            <div className="absolute inset-x-3 bottom-3 rounded-lg border border-white/25 bg-ink/80 px-3 py-2 text-white backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Group account</p>
              <p className="mt-1 text-sm font-black">{group.shops.length} {t("家旗下店铺")}</p>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-moss">{group ? "NeeDo Group" : `${shop?.city ?? ""} · ${card.status}`}</p>
              <h2 className={`mt-1 truncate text-xl font-black ${overdue ? "text-coral" : "text-ink"}`}>{card.name}</h2>
              <p className="mt-1 text-xs font-bold text-ink/45">ID {identifier}</p>
              {shop?.ownerEmail ? <p className="mt-1 truncate text-xs font-bold text-coral">{shop.ownerEmail}</p> : null}
              {overdue ? <p className="mt-2 text-xs font-black text-coral">{t("后台红名：账单逾期，尚未人工封号")}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                className="focus-ring rounded-lg border border-moss/25 bg-mint/15 px-3 py-2 text-xs font-black text-[#2f6846] transition hover:border-moss"
                onClick={onEditBilling}
                type="button"
              >
                <small className="block text-[9px] uppercase tracking-[0.12em] text-[#2f6846]/65">{t("账号类型")}</small>
                <span className="mt-0.5 block">{t(typeLabel)}</span>
              </button>
              {card.suspension ? <Badge tone="red">{t("已封号")}</Badge> : <Badge tone="green">{card.status}</Badge>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(group
              ? [["旗下店铺", group.shops.length], ["技师", technicianCount], ["合计月费", formatJpy(group.consolidatedMonthlyTotalJpy, language)]]
              : [["评分", shop?.ratingAverage ?? 0], ["评论", shop?.reviewCount ?? 0], ["技师", shop?.technicianCount ?? 0]]
            ).map(([label, value]) => (
              <div className="rounded-lg bg-paper p-3" key={String(label)}>
                <p className="text-[11px] font-bold text-ink/45">{t(String(label))}</p>
                <strong className="mt-1 block truncate text-sm">{value}</strong>
              </div>
            ))}
          </div>

          <button
            className="focus-ring mt-3 grid w-full grid-cols-3 gap-2 rounded-xl border border-line bg-paper p-2 text-left transition hover:border-moss/45"
            onClick={onEditBilling}
            type="button"
          >
            <span className="rounded-lg px-2 py-1.5">
              <small className="block text-[10px] font-bold text-ink/40">{t("付费模式")}</small>
              <strong className="mt-0.5 block text-xs">{t(cadenceLabel(card.billing.cadence))}</strong>
            </span>
            <span className="rounded-lg px-2 py-1.5">
              <small className="block text-[10px] font-bold text-ink/40">{t("状态")}</small>
              <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-black">
                <span className={`h-2 w-2 rounded-full ${stateTone(card.billing.state) === "red" ? "bg-coral" : stateTone(card.billing.state) === "yellow" ? "bg-lemon" : stateTone(card.billing.state) === "green" ? "bg-moss" : "bg-sky"}`} />
                {formatBillingState(card.billing.state, language)}
              </span>
            </span>
            <span className="rounded-lg px-2 py-1.5">
              <small className="block text-[10px] font-bold text-ink/40">{t("月费")}</small>
              <strong className="mt-0.5 block truncate text-xs">{card.billing.cadence === "free" ? t("免费") : formatJpy(card.billing.monthlyFeeJpy, language)}</strong>
            </span>
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-ink/50">
            {paymentResponsibility ? <Badge tone="blue">{t(paymentResponsibility)}</Badge> : null}
            {card.type !== "single_shop" ? <span>{t("累计免费时间")} {formatFreeDuration(card.billing.freeDuration, language)}</span> : <span>{t("1 名技师店铺永久免费")}</span>}
            {card.billing.cadenceLocked || card.billing.amountLocked ? <span>· {t("含人工锁定")}</span> : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <Button size="sm" onClick={onViewDetails}>{t("查看详情")}</Button>
            <Button size="sm" variant="secondary" onClick={onEditBilling}>{t("计费设置")}</Button>
            <Button size="sm" variant={card.suspension ? "danger" : "secondary"} onClick={onOpenBusinessSettings}>{t("营业设置")}</Button>
            {group && onToggleExpanded ? (
              <Button className="ml-auto" size="sm" variant="ghost" onClick={onToggleExpanded}>
                {expanded ? t("收起集团") : `${t("展开集团")} (${group.shops.length})`} {expanded ? "↑" : "↓"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
