import { useEffect, useState } from "react";
import type { AnalyticsRankingItem, DashboardQuery } from "../../api/backofficeRealData";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { coreReadApi, type CoreCategory } from "../core-read/api";
import { AnalyticsRankingPanel } from "./AnalyticsRankingPanel";

async function listAllActiveCategories(language: string) {
  const pageSize = 100;
  const categories: Array<{ id: number; name: string }> = [];
  let page = 1;
  let expectedTotal: number | null = null;
  for (;;) {
    const result = await coreReadApi.listCategories({ page, pageSize });
    if (
      result.page !== page ||
      result.page_size !== pageSize ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      (expectedTotal !== null && result.total !== expectedTotal) ||
      (result.list.length === 0 && categories.length < result.total)
    ) throw new Error("error.categories.pagination_mismatch");
    expectedTotal = result.total;
    categories.push(...result.list.filter((category) => category.isActive).map((category) => ({
      id: category.id,
      name: localizedCategoryName(category, language)
    })));
    if (page * pageSize >= result.total) break;
    page += 1;
  }
  return categories;
}

export function AnalyticsRankingsSection({
  onOpenDetail,
  query
}: {
  onOpenDetail: (item: AnalyticsRankingItem) => void;
  query: DashboardQuery;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [categoryStatus, setCategoryStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let active = true;
    setCategoryStatus("loading");
    void listAllActiveCategories(language).then((nextCategories) => {
      if (!active) return;
      setCategories(nextCategories);
      setCategoryStatus("success");
    }).catch(() => {
      if (!active) return;
      setCategories([]);
      setCategoryStatus("error");
    });
    return () => { active = false; };
  }, [language]);

  return (
    <section aria-label={t("排行榜")} className="min-w-0 space-y-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-bold text-moss">{t("完成订单排行")}</p>
          <h2 className="mt-1 text-xl font-black text-ink">{t("排行榜 TOP10")}</h2>
        </div>
        {categoryStatus === "error" ? (
          <p className="text-xs font-bold text-ink/45" role="status">{t("服务类型暂不可筛选")}</p>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <AnalyticsRankingPanel kind="service" onOpenDetail={onOpenDetail} query={query} title="服务项目排行 TOP10" />
        <AnalyticsRankingPanel categories={categories} kind="technician" onOpenDetail={onOpenDetail} query={query} title="技师排行 TOP10" />
        <AnalyticsRankingPanel categories={categories} kind="customer" onOpenDetail={onOpenDetail} query={query} title="用户消费排行 TOP10" />
      </div>
    </section>
  );
}

function localizedCategoryName(category: CoreCategory, language: string) {
  if (language === "ja") return category.nameJa ?? category.name;
  if (language === "en") return category.nameEn ?? category.name;
  return category.name;
}
