import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  affiliateMarketplaceApi,
  type AffiliateClaim,
  type AffiliateMarketplaceTask
} from "../../api/affiliateMarketplace";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import {
  getLocalizedTaskContent,
  getRemainingPercent
} from "../../features/affiliate-marketplace/model";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";

type GalleryImage = { url: string; altText: string };

function getGallery(task: AffiliateMarketplaceTask): GalleryImage[] {
  const images: GalleryImage[] = [];
  const seen = new Set<string>();
  const addImage = (url: string | null | undefined, altText: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, altText: altText || task.name });
  };

  addImage(task.coverImageUrl, task.name);
  task.shops.forEach((shop) =>
    shop.mediaAssets.forEach((asset) => addImage(asset.url, asset.altText))
  );
  return images;
}

function StatusPanel({ title, detail }: { title: string; detail?: string }) {
  return (
    <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center">
      <p className="text-base font-black text-[color:var(--client-text)]">{title}</p>
      {detail ? (
        <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">{detail}</p>
      ) : null}
    </section>
  );
}

export function AffiliateTaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const numericTaskId = Number(taskId);
  const validTaskId = Number.isInteger(numericTaskId) && numericTaskId > 0;
  const [task, setTask] = useState<AffiliateMarketplaceTask | null>(null);
  const [loading, setLoading] = useState(validTaskId);
  const [loadError, setLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [claim, setClaim] = useState<AffiliateClaim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const claimPendingRef = useRef(false);
  const [claimError, setClaimError] = useState(false);
  const [copiedField, setCopiedField] = useState<"code" | "url" | null>(null);

  useEffect(() => {
    if (!validTaskId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);

    void affiliateMarketplaceApi
      .getTask(numericTaskId, { signal: controller.signal })
      .then((nextTask) => {
        if (!controller.signal.aborted) setTask(nextTask);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadVersion, numericTaskId, validTaskId]);

  const content = useMemo(
    () => (task ? getLocalizedTaskContent(task, language) : null),
    [language, task]
  );
  const gallery = useMemo(
    () => (task ? getGallery({ ...task, name: content?.name ?? task.name }) : []),
    [content?.name, task]
  );
  const activeImage =
    gallery.find((image) => image.url === selectedImageUrl) ?? gallery[0] ?? null;
  const shop = task?.shops[0];
  const number = new Intl.NumberFormat(languageLocales[language], {
    maximumFractionDigits: 0
  });
  const dateTime = new Intl.DateTimeFormat(languageLocales[language], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  });

  const createClaim = async () => {
    if (!task || claimPendingRef.current) return;
    claimPendingRef.current = true;
    setClaiming(true);
    setClaimError(false);
    try {
      setClaim(await affiliateMarketplaceApi.claimTask(task.id));
    } catch {
      setClaimError(true);
    } finally {
      claimPendingRef.current = false;
      setClaiming(false);
    }
  };

  const copyValue = async (field: "code" | "url", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
    } catch {
      setCopiedField(null);
    }
  };

  const consultationHref = shop
    ? `/messages/new?${new URLSearchParams({ mode: "friend", q: shop.shopNameSnapshot })}`
    : "/messages/new?mode=friend";

  return (
    <MobileShell className="affiliate-task-detail-shell" navItems={businessNavItems}>
      <MobileFullscreenHeader
        backLabel={t("返回")}
        info={t("任务名称")}
        onBack={() => navigate(-1)}
        title={content?.name ?? t("任务详细")}
      />
      <main className="client-app-gutter space-y-5 pb-40 pt-3">
        {!validTaskId ? (
          <StatusPanel detail={t("请从推荐任务列表重新进入。")} title={t("任务链接无效")} />
        ) : loading ? (
          <StatusPanel title={t("正在读取任务详细")} />
        ) : loadError || !task ? (
          <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center">
            <p className="text-base font-black text-[color:var(--client-text)]">
              {t("任务详细读取失败")}
            </p>
            <button
              className="mt-4 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[#07100b]"
              onClick={() => setLoadVersion((value) => value + 1)}
              type="button"
            >
              {t("重试")}
            </button>
          </section>
        ) : (
          <>
            <nav className="grid grid-cols-2 gap-2 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-1.5">
              <span className="grid min-h-11 place-items-center rounded-[17px] bg-[color:var(--client-primary)] text-sm font-black text-[#07100b]">
                {t("任务详细")}
              </span>
              {shop?.publicId ? (
                <Link
                  className="grid min-h-11 place-items-center rounded-[17px] text-sm font-black text-[color:var(--client-text)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
                  to={`/stores/${shop.publicId}`}
                >
                  {t("跳转到店铺")}
                </Link>
              ) : (
                <span className="grid min-h-11 place-items-center text-sm font-black text-[color:var(--client-muted)]">
                  {t("店铺暂不可跳转")}
                </span>
              )}
            </nav>

            <section className="overflow-hidden rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]">
              {activeImage ? (
                <img
                  alt={activeImage.altText}
                  className="h-[260px] w-full object-cover"
                  data-testid="affiliate-task-hero"
                  src={activeImage.url}
                />
              ) : (
                <div className="grid h-[220px] place-items-center bg-[color:var(--client-elevated)] text-sm font-black text-[color:var(--client-muted)]">
                  {t("任务暂无图片")}
                </div>
              )}
              {gallery.length ? (
                <div className="flex gap-2 overflow-x-auto p-3" data-page-drag-ignore="true">
                  {gallery.map((image) => {
                    const active = image.url === activeImage?.url;
                    return (
                      <button
                        aria-label={t("切换任务图片")}
                        className={`h-16 w-20 shrink-0 overflow-hidden rounded-[16px] border-2 ${
                          active
                            ? "border-[color:var(--client-primary)]"
                            : "border-transparent"
                        }`}
                        data-gallery-image={image.url}
                        key={image.url}
                        onClick={() => setSelectedImageUrl(image.url)}
                        type="button"
                      >
                        <img alt={image.altText} className="h-full w-full object-cover" src={image.url} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]">
              <div className="grid grid-cols-2 gap-px bg-[color:var(--client-line)]">
                <div className="bg-[color:var(--client-surface)] p-4">
                  <p className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("本次总预算")}
                  </p>
                  <p className="mt-1 text-lg font-black text-[color:var(--client-text)]">
                    {number.format(task.totalBudgetNdp)} NDP
                  </p>
                </div>
                <div className="bg-[color:var(--client-surface)] p-4">
                  <p className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("目前剩余预算 {percent}%").replace(
                      "{percent}",
                      String(getRemainingPercent(task))
                    )}
                  </p>
                  <p className="mt-1 text-lg font-black text-[color:var(--client-primary)]">
                    {number.format(task.remainingBudgetNdp)} NDP
                  </p>
                </div>
              </div>
              <dl className="divide-y divide-[color:var(--client-line)] px-4">
                <div className="py-4">
                  <dt className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("开始日期时间")}
                  </dt>
                  <dd className="mt-1 text-sm font-black text-[color:var(--client-text)]">
                    {dateTime.format(new Date(task.taskStartsAt))}
                  </dd>
                </div>
                <div className="py-4">
                  <dt className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("截止日期时间")}
                  </dt>
                  <dd className="mt-1 text-sm font-black text-[color:var(--client-text)]">
                    {dateTime.format(new Date(task.taskEndsAt))}
                  </dd>
                </div>
                <div className="py-4">
                  <dt className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("注意事项")}
                  </dt>
                  <dd className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[color:var(--client-text)]">
                    {content?.description || t("请按照任务规则完成推广与订单归因。")}
                  </dd>
                </div>
                <div className="py-4">
                  <dt className="text-xs font-black text-[color:var(--client-muted)]">
                    {t("用户获得单价")}
                  </dt>
                  <dd className="mt-1 text-xl font-black text-[color:var(--client-primary)]">
                    {number.format(task.rewardNdpPerCompletedOrder)} NDP
                  </dd>
                </div>
              </dl>
            </section>

            {claim ? (
              <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))] p-5">
                <p className="text-base font-black text-[color:var(--client-text)]">
                  {t("已参加任务")}
                </p>
                <div className="mt-4 space-y-3">
                  <button
                    className="w-full rounded-[18px] bg-[color:var(--client-elevated)] p-3 text-left"
                    onClick={() => void copyValue("code", claim.publicCode)}
                    type="button"
                  >
                    <span className="block text-[11px] font-black text-[color:var(--client-muted)]">
                      {t("推广码")}
                    </span>
                    <strong className="mt-1 block break-all text-sm text-[color:var(--client-text)]">
                      {claim.publicCode}
                    </strong>
                    {copiedField === "code" ? <span>{t("已复制")}</span> : null}
                  </button>
                  <button
                    className="w-full rounded-[18px] bg-[color:var(--client-elevated)] p-3 text-left"
                    onClick={() => void copyValue("url", claim.promotionUrl)}
                    type="button"
                  >
                    <span className="block text-[11px] font-black text-[color:var(--client-muted)]">
                      {t("推广链接")}
                    </span>
                    <strong className="mt-1 block break-all text-xs text-[color:var(--client-text)]">
                      {claim.promotionUrl}
                    </strong>
                    {copiedField === "url" ? <span>{t("已复制")}</span> : null}
                  </button>
                </div>
              </section>
            ) : null}

            {claimError ? (
              <p className="rounded-[18px] bg-red-500/10 px-4 py-3 text-sm font-black text-red-500">
                {t("参加任务失败，请重试")}
              </p>
            ) : null}
          </>
        )}
      </main>

      {task ? (
        <div className="client-app-frame client-app-gutter fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,transparent)] pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3 backdrop-blur-xl">
          <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
            <Link
              className="grid min-h-14 place-items-center rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)]"
              to={consultationHref}
            >
              {t("聊天咨询")}
            </Link>
            <button
              className="min-h-14 rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[#07100b] disabled:opacity-45"
              disabled={claiming || !task.claimable}
              onClick={() => void createClaim()}
              type="button"
            >
              {claiming ? t("参加中…") : claim ? t("再次确认参加") : t("立即参加")}
            </button>
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}
