import type { MerchantAffiliateTask } from "../../api/merchantAffiliateTasks";
import { Badge } from "../../components/ui/Badge";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  getMerchantAffiliateTaskCopy,
  merchantAffiliateTaskStatusLabel
} from "../../pages/merchant-admin/merchantAffiliateTaskCopy";

type DetailText = {
  overview: string;
  rejectionReason: string;
  serviceScope: string;
  finances: string;
  commissionBudget: string;
  platformFeeRate: string;
  platformFeeReserve: string;
  frozenTotal: string;
  timeline: string;
  created: string;
  submitted: string;
  reviewed: string;
  activated: string;
  updated: string;
  languages: string;
};

const detailCopies: Record<Language, DetailText> = {
  zh: { overview: "任务概览", rejectionReason: "驳回原因", serviceScope: "店铺与服务范围", finances: "费用快照", commissionBudget: "佣金预算", platformFeeRate: "平台费率", platformFeeReserve: "平台费预留", frozenTotal: "冻结合计", timeline: "状态时间线", created: "已创建", submitted: "已提交审核", reviewed: "已完成审核", activated: "已生效", updated: "最后更新", languages: "语言内容" },
  "zh-Hant": { overview: "任務概覽", rejectionReason: "駁回原因", serviceScope: "店舖與服務範圍", finances: "費用快照", commissionBudget: "佣金預算", platformFeeRate: "平台費率", platformFeeReserve: "平台費預留", frozenTotal: "凍結合計", timeline: "狀態時間線", created: "已建立", submitted: "已提交審核", reviewed: "已完成審核", activated: "已生效", updated: "最後更新", languages: "語言內容" },
  ja: { overview: "タスク概要", rejectionReason: "差し戻し理由", serviceScope: "店舗とサービス範囲", finances: "費用スナップショット", commissionBudget: "報酬予算", platformFeeRate: "手数料率", platformFeeReserve: "手数料引当", frozenTotal: "凍結合計", timeline: "ステータスタイムライン", created: "作成", submitted: "審査申請", reviewed: "審査完了", activated: "有効化", updated: "最終更新", languages: "言語別コンテンツ" },
  en: { overview: "Task overview", rejectionReason: "Rejection reason", serviceScope: "Shop and service scope", finances: "Fee snapshot", commissionBudget: "Commission budget", platformFeeRate: "Platform fee rate", platformFeeReserve: "Platform fee reserve", frozenTotal: "Gross freeze", timeline: "Status timeline", created: "Created", submitted: "Submitted", reviewed: "Reviewed", activated: "Activated", updated: "Last updated", languages: "Language content" },
  ko: { overview: "작업 개요", rejectionReason: "반려 사유", serviceScope: "매장 및 서비스 범위", finances: "수수료 스냅샷", commissionBudget: "커미션 예산", platformFeeRate: "플랫폼 수수료율", platformFeeReserve: "플랫폼 수수료 적립", frozenTotal: "총 동결액", timeline: "상태 타임라인", created: "생성", submitted: "심사 제출", reviewed: "심사 완료", activated: "활성화", updated: "마지막 업데이트", languages: "언어별 콘텐츠" }
};

const formatNdp = (value: number, locale: string) => `${value.toLocaleString(locale)} NDP`;
const formatJpy = (value: number, locale: string) => `${value.toLocaleString(locale)} JPY`;
const formatDateTime = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );

export function MerchantAffiliateTaskDetail({ task }: { task: MerchantAffiliateTask }) {
  const { language } = useI18n();
  const copy = getMerchantAffiliateTaskCopy(language);
  const text = detailCopies[language];
  const shopById = new Map(task.shops.map((shop) => [shop.shopId, shop]));
  const timeline = [
    { label: text.created, value: task.createdAt },
    { label: text.submitted, value: task.submittedAt },
    { label: text.reviewed, value: task.reviewedAt },
    { label: text.activated, value: task.activatedAt },
    { label: text.updated, value: task.updatedAt }
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

  return (
    <article className="space-y-5" data-affiliate-task-detail>
      <section className="rounded-xl border border-line bg-paper px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-black text-ink/50">{task.taskCode}</p>
            <h2 className="mt-1 text-xl font-black text-ink">{task.name}</h2>
            <p className="mt-1 text-sm font-bold text-ink/55">{task.publisherDisplayName}</p>
          </div>
          <Badge tone={task.status === "rejected" ? "red" : task.status === "pending_review" ? "yellow" : "neutral"}>
            {merchantAffiliateTaskStatusLabel(task.status, language)}
          </Badge>
        </div>
        {task.description ? <p className="mt-3 whitespace-pre-wrap text-sm font-bold text-ink/70">{task.description}</p> : null}
        {task.rejectionReason ? (
          <div className="mt-3 rounded-lg border border-coral/25 bg-coral/5 px-3 py-3">
            <p className="text-xs font-black text-coral">{text.rejectionReason}</p>
            <p className="mt-1 text-sm font-bold text-ink">{task.rejectionReason}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-white px-4 py-4">
        <h3 className="font-black text-ink">{text.serviceScope}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {task.shops.map((shop) => (
            <div className="rounded-lg border border-line bg-paper px-3 py-3" key={shop.publicId}>
              <p className="text-sm font-black text-ink">{shop.shopNameSnapshot}</p>
              <span className="mt-1 inline-flex rounded-md border border-moss/25 bg-mint/10 px-2 py-0.5 font-mono text-[11px] font-black text-[#2f6846]">{shop.publicId}</span>
            </div>
          ))}
          {task.services.map((service) => {
            const shop = shopById.get(service.shopId);
            return (
              <div className="rounded-lg border border-line bg-white px-3 py-3" key={`${shop?.publicId ?? "shop"}:${service.serviceNameSnapshot}`}>
                <p className="text-sm font-black text-ink">{service.serviceNameSnapshot}</p>
                <p className="mt-1 text-xs font-bold text-ink/55">
                  {formatJpy(service.servicePriceJpySnapshot, copy.locale)}
                  {shop ? ` · ${shop.shopNameSnapshot}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white px-4 py-4">
        <h3 className="font-black text-ink">{text.finances}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs font-black text-ink/45">{text.commissionBudget}</dt><dd className="mt-1 text-lg font-black text-ink">{formatNdp(task.totalBudgetNdp, copy.locale)}</dd></div>
          <div><dt className="text-xs font-black text-ink/45">{text.platformFeeRate}</dt><dd className="mt-1 text-lg font-black text-ink">{task.platformFeeBps / 100}%</dd></div>
          <div><dt className="text-xs font-black text-ink/45">{text.platformFeeReserve}</dt><dd className="mt-1 text-lg font-black text-ink">{formatNdp(task.platformFeeReserveNdp, copy.locale)}</dd></div>
          <div><dt className="text-xs font-black text-ink/45">{text.frozenTotal}</dt><dd className="mt-1 text-lg font-black text-ink">{formatNdp(task.reservedBudgetNdp, copy.locale)}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-white px-4 py-4">
        <h3 className="font-black text-ink">{text.languages}</h3>
        <div className="mt-3 space-y-2">
          {Object.entries(task.translations).map(([locale, translation]) => translation ? (
            <div className="rounded-lg border border-line bg-paper px-3 py-3" key={locale}>
              <p className="text-xs font-black text-ink/45">{locale}</p>
              <p className="mt-1 text-sm font-black text-ink">{translation.name}</p>
              {translation.description ? <p className="mt-1 text-sm font-bold text-ink/60">{translation.description}</p> : null}
            </div>
          ) : null)}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white px-4 py-4">
        <h3 className="font-black text-ink">{text.timeline}</h3>
        <ol className="mt-3 space-y-3 border-l-2 border-moss/20 pl-4">
          {timeline.map((entry) => (
            <li key={`${entry.label}:${entry.value}`}>
              <p className="text-sm font-black text-ink">{entry.label}</p>
              <time className="text-xs font-bold text-ink/50" dateTime={entry.value}>{formatDateTime(entry.value, copy.locale)}</time>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
