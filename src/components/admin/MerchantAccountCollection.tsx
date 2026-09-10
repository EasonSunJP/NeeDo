import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import {
  formatBillingState,
  formatJpy,
  isMerchantGroup,
  type MerchantAccountCard,
  type ShopCard,
} from "../../features/merchant-saas-billing/model";
import { Badge } from "../ui/Badge";
import { DataTable } from "../ui/DataTable";
import { MerchantBillingCard } from "./MerchantBillingCard";

type MerchantAccountViewMode = "cards" | "list";

type MerchantShopListRow = {
  shop: ShopCard;
  groupName: string | null;
};

type MerchantAccountCollectionProps = {
  accounts: MerchantAccountCard[];
  onEditBilling: (card: MerchantAccountCard) => void;
  onOpenBusinessSettings: (card: MerchantAccountCard) => void;
  onOpenMerchantAdminPreview: (card: MerchantAccountCard, selectedShopId?: number) => void;
  onViewDetails: (card: MerchantAccountCard) => void;
};

function ViewModeIcon({ mode }: { mode: MerchantAccountViewMode }) {
  if (mode === "cards") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="6" x="2" y="2" />
        <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="6" x="12" y="2" />
        <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="6" x="2" y="12" />
        <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="6" x="12" y="12" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <rect fill="currentColor" height="2" rx="1" width="2" x="2" y={y} />
          <path d={`M7 ${y + 1}h11`} stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </g>
      ))}
    </svg>
  );
}

function formatCreatedAt(value: string, language: ReturnType<typeof useI18n>["language"]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = { zh: "zh-CN", "zh-Hant": "zh-Hant", ja: "ja-JP", en: "en-US", ko: "ko-KR" }[language];
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function MerchantAccountCollection({
  accounts,
  onEditBilling,
  onOpenBusinessSettings,
  onOpenMerchantAdminPreview,
  onViewDetails,
}: MerchantAccountCollectionProps) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const [viewMode, setViewMode] = useState<MerchantAccountViewMode>("cards");
  const [expandedGroups, setExpandedGroups] = useState<number[]>([]);
  const listRows = useMemo<MerchantShopListRow[]>(
    () => accounts.flatMap((account): MerchantShopListRow[] => (
      isMerchantGroup(account)
        ? account.shops.map((shop) => ({ shop, groupName: account.name }))
        : [{ shop: account, groupName: null }]
    )),
    [accounts],
  );

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-panel">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Merchant SaaS ledger</p>
          <p className="mt-1 text-sm font-semibold text-ink/55">
            {viewMode === "cards"
              ? t("集团以 1 张卡片显示；展开后可在同一边框内管理集团与旗下店铺。")
              : t("列表按店铺显示正式资料，集团名称保留在店名下方。")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue">{accounts.length} {t("个独立账单主体")}</Badge>
          {(["cards", "list"] as const).map((mode) => {
            const label = mode === "cards" ? t("信息卡显示") : t("列表显示");
            const active = viewMode === mode;
            return (
              <button
                aria-label={label}
                aria-pressed={active}
                className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${active ? "border-[color:var(--admin-accent)] bg-[color:var(--admin-accent)] text-[color:var(--admin-on-accent,#fff)] shadow-sm" : "border-line bg-paper text-ink/55 hover:border-[color:var(--admin-accent)] hover:text-ink"}`}
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                type="button"
              >
                <ViewModeIcon mode={mode} />
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {accounts.map((card) => {
            const expanded = isMerchantGroup(card) && expandedGroups.includes(card.id);
            const commonProps = {
              onEditBilling: () => onEditBilling(card),
              onOpenBusinessSettings: () => onOpenBusinessSettings(card),
              onOpenMerchantAdminPreview: () => onOpenMerchantAdminPreview(card),
              onViewDetails: () => onViewDetails(card),
            };

            if (!isMerchantGroup(card)) {
              return <MerchantBillingCard card={card} key={`shop-${card.id}`} {...commonProps} />;
            }

            return (
              <section
                className={`rounded-2xl transition xl:col-span-2 ${expanded ? "border-2 border-coral/70 bg-coral/[0.035] p-3 shadow-[0_14px_45px_rgba(232,95,114,0.09)]" : ""}`}
                key={`merchant-${card.id}`}
              >
                {expanded ? <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-coral">{t("集团账户边界")} · {card.name}</p> : null}
                <MerchantBillingCard
                  card={card}
                  expanded={expanded}
                  onToggleExpanded={() => setExpandedGroups((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}
                  {...commonProps}
                />
                {expanded ? (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {card.shops.map((shop) => (
                      <MerchantBillingCard
                        card={shop}
                        key={`merchant-${card.id}-shop-${shop.id}`}
                        nested
                        onEditBilling={() => onEditBilling(shop)}
                        onOpenBusinessSettings={() => onOpenBusinessSettings(shop)}
                        onOpenMerchantAdminPreview={() => onOpenMerchantAdminPreview(shop)}
                        onViewDetails={() => onViewDetails(shop)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
          {accounts.length === 0 ? <p className="text-sm text-ink/50">{t("暂无商家或店铺数据")}</p> : null}
        </div>
      ) : listRows.length > 0 ? (
        <DataTable<MerchantShopListRow>
          columns={[
            { key: "id", title: "ID", render: ({ shop }) => shop.id, sortValue: ({ shop }) => shop.id, width: "90px" },
            {
              key: "name",
              title: t("店名"),
              render: ({ shop, groupName }) => <div className="max-w-[260px]"><p className="truncate font-black text-ink">{shop.name}</p>{groupName ? <p className="mt-1 truncate text-xs font-bold text-ink/45">{groupName}</p> : null}</div>,
              filterValue: ({ shop }) => shop.name,
              sortValue: ({ shop }) => shop.name,
              width: "230px",
            },
            {
              key: "creator",
              title: t("创建者"),
              render: ({ shop }) => shop.createdBy ? (
                <div className="max-w-[220px]">
                  <p className="truncate font-black text-ink">{shop.createdBy.displayName}</p>
                  <p className="mt-1 truncate text-xs font-bold text-ink/45">{shop.createdBy.needoId}</p>
                </div>
              ) : t("未记录"),
              filterValue: ({ shop }) => shop.createdBy ? `${shop.createdBy.displayName} ${shop.createdBy.needoId}` : t("未记录"),
              width: "220px",
            },
            { key: "region", title: t("地区"), render: ({ shop }) => shop.city, filterValue: ({ shop }) => shop.city, width: "160px" },
            { key: "commission", title: t("平台抽成"), render: ({ shop }) => `${shop.platformCommissionRatePercent}%`, sortValue: ({ shop }) => shop.platformCommissionRatePercent, width: "130px" },
            { key: "monthlyFee", title: t("月费"), render: ({ shop }) => shop.billing.cadence === "free" ? t("免费") : formatJpy(shop.billing.monthlyFeeJpy, language), sortValue: ({ shop }) => shop.billing.cadence === "free" ? 0 : shop.billing.monthlyFeeJpy, width: "150px" },
            {
              key: "status",
              title: t("状态"),
              render: ({ shop }) => <div className="flex flex-wrap gap-1.5"><Badge tone={shop.suspension ? "red" : "green"}>{shop.suspension ? t("已封号") : shop.status}</Badge><Badge tone={shop.billing.state === "overdue" ? "red" : shop.billing.state === "trial" ? "yellow" : "blue"}>{formatBillingState(shop.billing.state, language)}</Badge></div>,
              filterValue: ({ shop }) => `${shop.status} ${formatBillingState(shop.billing.state, language)}`,
              width: "180px",
            },
            { key: "createdAt", title: t("添加时间"), render: ({ shop }) => formatCreatedAt(shop.createdAt, language), sortValue: ({ shop }) => shop.createdAt, width: "190px" },
          ]}
          footerPlacement="inline"
          frozenDetailLabel={t("详情")}
          onView={({ shop }) => onViewDetails(shop)}
          pageSize={10}
          rows={listRows}
          showFooterActions={false}
        />
      ) : (
        <p className="rounded-xl border border-line bg-white p-6 text-sm font-bold text-ink/50 shadow-panel">{t("暂无店铺数据")}</p>
      )}
    </section>
  );
}
