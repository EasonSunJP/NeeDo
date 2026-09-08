import { useState, type CSSProperties } from "react";
import { Drawer } from "../ui/Drawer";
import { Tabs } from "../ui/Tabs";
import { Button } from "../ui/Button";
import { DetailGrid } from "./DetailGrid";
import { UnifiedFormalStoreDetail } from "../../pages/user/StoreDetailPage";
import { useI18n } from "../../i18n/I18nProvider";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import { formatFreeDuration, formatJpy, isMerchantGroup, type MerchantAccountCard } from "../../features/merchant-saas-billing/model";

const presentationStyle = {
  "--client-bg": "var(--admin-bg)",
  "--client-bg-soft": "var(--admin-bg-soft)",
  "--client-surface": "var(--admin-surface)",
  "--client-elevated": "var(--admin-elevated)",
  "--client-text": "var(--admin-text)",
  "--client-muted": "var(--admin-muted)",
  "--client-line": "var(--admin-line)",
  "--client-primary": "var(--admin-accent)",
  "--client-primary-strong": "var(--admin-accent-strong)",
  "--client-primary-soft": "color-mix(in srgb, var(--admin-accent) 14%, var(--admin-surface))",
  "--client-needo-text": "var(--admin-on-accent, #fff)",
  "--client-primary-contrast": "var(--admin-on-accent, #fff)"
} as CSSProperties;

export function MerchantAccountDetailDrawer({
  card,
  onClose,
  onOpenMerchantAdminPreview,
}: {
  card: MerchantAccountCard | null;
  onClose: () => void;
  onOpenMerchantAdminPreview?: (card: MerchantAccountCard, selectedShopId?: number) => void;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  return (
    <Drawer open={Boolean(card)} title={t("商家 / 门店详情")} onClose={onClose}>
      {card ? <MerchantAccountDetailContent key={`${card.type}-${card.id}`} card={card} onOpenMerchantAdminPreview={onOpenMerchantAdminPreview} /> : null}
    </Drawer>
  );
}

function MerchantAccountDetailContent({
  card,
  onOpenMerchantAdminPreview,
}: {
  card: MerchantAccountCard;
  onOpenMerchantAdminPreview?: (card: MerchantAccountCard, selectedShopId?: number) => void;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const [active, setActive] = useState("店铺 SaaS 情报");
  const shops = isMerchantGroup(card) ? card.shops : [card];
  const [shopId, setShopId] = useState(shops[0]?.id);
  const selectedShop = shops.find((shop) => shop.id === shopId) ?? shops[0];
  const tabs = ["店铺 SaaS 情报", "店铺展示"];
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs items={tabs.map(t)} active={t(active)} onChange={(label) => setActive(tabs.find((tab) => t(tab) === label) ?? tabs[0])} />
        {selectedShop && onOpenMerchantAdminPreview ? (
          <Button size="sm" variant="dark" onClick={() => onOpenMerchantAdminPreview(card, selectedShop.id)}>
            {t("打开该店铺后台")}
          </Button>
        ) : null}
      </div>
      {active === "店铺 SaaS 情报" ? (
          <DetailGrid
            items={[
              { label: "名称", value: card.name },
              { label: "账号类型", value: isMerchantGroup(card) ? "商家" : card.type === "single_shop" ? "单人店铺" : "店铺" },
              { label: "付费模式", value: card.billing.cadence },
              { label: "月费", value: card.billing.cadence === "free" ? "免费" : formatJpy(card.billing.monthlyFeeJpy, language) },
              { label: "年费", value: formatJpy(card.billing.annualFeeJpy, language) },
              { label: "计费状态", value: card.billing.state },
              { label: "累计免费时间", value: formatFreeDuration(card.billing.freeDuration, language) },
              { label: "支付接口", value: card.billing.paymentProvider },
              { label: "人工锁定", value: `模式 ${card.billing.cadenceLocked ? "是" : "否"} / 金额 ${card.billing.amountLocked ? "是" : "否"}` },
              { label: "封号状态", value: card.suspension ? "已人工封号" : "未封号" },
              ...(isMerchantGroup(card) ? [
                { label: "付费责任", value: card.paymentResponsibility },
                { label: "旗下店铺", value: card.shops.length },
                { label: "合计月费", value: formatJpy(card.consolidatedMonthlyTotalJpy, language) }
              ] : [{ label: "有效技师", value: card.technicianCount }])
            ]}
          />
      ) : (
        <div className="min-w-0 space-y-4" style={presentationStyle}>
          {isMerchantGroup(card) && shops.length > 0 ? (
            <label className="block text-sm font-bold text-ink">
              {t("选择旗下店铺")}
              <select className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" value={selectedShop?.id} onChange={(event) => setShopId(Number(event.target.value))}>
                {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
              </select>
            </label>
          ) : null}
          {selectedShop ? <UnifiedFormalStoreDetail key={selectedShop.id} embedded scope="user" shopId={selectedShop.id} /> : <p className="text-sm text-ink/60">{t("暂无旗下店铺")}</p>}
        </div>
      )}
    </div>
  );
}
