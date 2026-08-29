import { Link } from "react-router-dom";
import type { AffiliateMarketplaceTask } from "../../api/affiliateMarketplace";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import {
  getMaximumRewardNdp,
  getLocalizedTaskContent,
  getRemainingPercent,
  getTaskTags,
  type AffiliateTaskTag
} from "./model";

function tagLabel(
  tag: AffiliateTaskTag,
  t: (source: string) => string,
  number: Intl.NumberFormat
) {
  switch (tag.kind) {
    case "customer-limit":
      return t("每位顾客最多 {count} 单").replace("{count}", number.format(tag.count));
    case "service":
      return tag.label;
    case "minimum-order":
      return t("满 {amount} JPY 可参加").replace("{amount}", number.format(tag.amountJpy));
    case "discount":
      return tag.discountType === "fixed_jpy"
        ? t("顾客优惠 {amount} JPY").replace("{amount}", number.format(tag.value))
        : t("顾客优惠 {percent}%").replace("{percent}", number.format(tag.value / 100));
    case "high-reward":
      return t("高额报酬");
  }
}

export function AffiliateTaskCard({ task }: { task: AffiliateMarketplaceTask }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const number = new Intl.NumberFormat(languageLocales[language], {
    maximumFractionDigits: 0
  });
  const remainingPercent = getRemainingPercent(task);
  const maximumRewardNdp = getMaximumRewardNdp(task);
  const content = getLocalizedTaskContent(task, language);
  const imageUrl = task.coverImageUrl ?? task.shops[0]?.mediaAssets[0]?.url ?? null;
  const imageAlt = task.coverImageUrl
    ? content.name
    : task.shops[0]?.mediaAssets[0]?.altText || content.name;

  return (
    <Link
      aria-label={`${t("查看任务详细")}：${content.name}`}
      className="group block overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-primary)_22%)] bg-[color:var(--client-surface)] text-[color:var(--client-text)] shadow-[0_22px_54px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)] outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
      to={`/afirieito/tasks/${task.id}`}
    >
      <div className="relative h-44 overflow-hidden bg-[color:var(--client-elevated)]">
        {imageUrl ? (
          <img
            alt={imageAlt}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
            loading="lazy"
            src={imageUrl}
          />
        ) : (
          <div
            aria-label={t("任务暂无图片")}
            className="grid h-full place-items-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--client-elevated)_86%,var(--client-primary)_14%),var(--client-surface))] text-sm font-black text-[color:var(--client-muted)]"
            role="img"
          >
            NeeDo Affiliate
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.72))]" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3.5">
          <span className="rounded-full border border-white/30 bg-black/55 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">
            {t("剩余：{percent}%").replace("{percent}", number.format(remainingPercent))}
          </span>
          <span className="max-w-[68%] rounded-2xl bg-[color:var(--client-primary)] px-3 py-2 text-right text-[11px] font-black leading-4 text-[#07100b] shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
            {t("当前最高收益：{amount} NDP").replace(
              "{amount}",
              number.format(maximumRewardNdp)
            )}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[color:var(--client-primary)]"
              style={{ width: `${remainingPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--client-primary)]">
          {task.shops[0]?.shopNameSnapshot ?? t("联盟营销任务")}
        </p>
        <h2 className="mt-1 line-clamp-1 text-[19px] font-black leading-7">{content.name}</h2>
        <p className="mt-1.5 line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-[color:var(--client-muted)]">
          {content.description || t("进入详细页查看任务内容与参加条件")}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {getTaskTags(task).map((tag, index) => (
            <span
              className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-elevated)_88%)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary-strong)]"
              key={`${tag.kind}-${index}`}
            >
              {tagLabel(tag, t, number)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
