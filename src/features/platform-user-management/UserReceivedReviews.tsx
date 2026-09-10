import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import { ReceivedReviewFacts } from "./ReceivedReviewFacts";
import { ReviewAmendmentDialog } from "./ReviewAmendmentDialog";
import type {
  Paginated,
  ReceivedUserReview,
  UserDirectoryScope,
} from "./types";

const copy: Record<Language, Record<string, string>> = {
  zh: {
    title: "服务后收到的评价",
    loading: "正在读取评价...",
    empty: "暂无评价",
    failed: "评价读取失败",
    retry: "重试",
    reviewer: "评价人",
    order: "预约单",
    serviceAt: "服务时间",
    reviewedAt: "评价时间",
    corrected: "已修订",
    history: "修订历史",
    reason: "理由",
    revisedBy: "修订人",
    previous: "上一页",
    next: "下一页",
  },
  "zh-Hant": {
    title: "服務後收到的評價",
    loading: "正在讀取評價...",
    empty: "暫無評價",
    failed: "評價讀取失敗",
    retry: "重試",
    reviewer: "評價人",
    order: "預約單",
    serviceAt: "服務時間",
    reviewedAt: "評價時間",
    corrected: "已修訂",
    history: "修訂歷史",
    reason: "理由",
    revisedBy: "修訂人",
    previous: "上一頁",
    next: "下一頁",
  },
  ja: {
    title: "サービス後に受けた評価",
    loading: "評価を読み込み中...",
    empty: "評価はありません",
    failed: "評価を読み込めませんでした",
    retry: "再試行",
    reviewer: "評価者",
    order: "予約番号",
    serviceAt: "サービス日時",
    reviewedAt: "評価日時",
    corrected: "修正済み",
    history: "修正履歴",
    reason: "理由",
    revisedBy: "修正者",
    previous: "前へ",
    next: "次へ",
  },
  en: {
    title: "Reviews received after service",
    loading: "Loading reviews...",
    empty: "No reviews",
    failed: "Could not load reviews",
    retry: "Retry",
    reviewer: "Reviewer",
    order: "Booking",
    serviceAt: "Service time",
    reviewedAt: "Reviewed",
    corrected: "Corrected",
    history: "Amendment history",
    reason: "Reason",
    revisedBy: "Revised by",
    previous: "Previous",
    next: "Next",
  },
  ko: {
    title: "서비스 후 받은 평가",
    loading: "평가 불러오는 중...",
    empty: "평가가 없습니다",
    failed: "평가를 불러오지 못했습니다",
    retry: "다시 시도",
    reviewer: "평가자",
    order: "예약",
    serviceAt: "서비스 시간",
    reviewedAt: "평가 시간",
    corrected: "수정됨",
    history: "수정 이력",
    reason: "사유",
    revisedBy: "수정자",
    previous: "이전",
    next: "다음",
  },
};

const tagCopy: Record<string, Partial<Record<Language, string>>> = {
  punctual: {
    zh: "准时",
    "zh-Hant": "準時",
    ja: "時間厳守",
    en: "Punctual",
    ko: "시간 준수",
  },
  polite: {
    zh: "礼貌",
    "zh-Hant": "有禮",
    ja: "丁寧",
    en: "Polite",
    ko: "친절함",
  },
  professional: {
    zh: "专业",
    "zh-Hant": "專業",
    ja: "プロフェッショナル",
    en: "Professional",
    ko: "전문적",
  },
  communicative: {
    zh: "沟通顺畅",
    "zh-Hant": "溝通順暢",
    ja: "説明が丁寧",
    en: "Good communication",
    ko: "소통이 원활함",
  },
};

export const receivedReviewTagText = (tag: string, language: Language) =>
  tagCopy[tag]?.[language] ?? tag;

export function UserReceivedReviews({
  scope,
  userId,
  canAmend,
}: {
  scope: UserDirectoryScope;
  userId: number;
  canAmend: boolean;
}) {
  const { language } = useOptionalI18n();
  const text = copy[language];
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(
      language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language,
      { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" },
    ).format(new Date(value));
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    data: Paginated<ReceivedUserReview> | null;
  }>({ loading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    platformUserManagementApi
      .listReceivedReviews(scope, userId, { page, page_size: 10 })
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch(
        () =>
          active &&
          setState({ loading: false, error: text.failed, data: null }),
      );
    return () => {
      active = false;
    };
  }, [page, reloadToken, scope, text.failed, userId]);

  return (
    <section className="rounded-[18px] border border-line bg-white p-4 shadow-[0_8px_24px_rgba(22,23,26,0.05)] sm:p-5">
      <h3 className="border-l-[3px] border-moss pl-3 text-base font-black text-ink">
        {text.title}
      </h3>
      {state.loading ? (
        <p className="mt-4 text-sm font-bold text-ink/50">{text.loading}</p>
      ) : null}
      {!state.loading && state.error ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm font-bold text-coral">
          <span>{state.error}</span>
          <Button
            onClick={() => setReloadToken((value) => value + 1)}
            size="sm"
            variant="secondary"
          >
            {text.retry}
          </Button>
        </div>
      ) : null}
      {!state.loading && !state.error && state.data?.list.length === 0 ? (
        <p className="mt-4 text-sm font-bold text-ink/45">{text.empty}</p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {state.data?.list.map((review) => (
          <article
            className="min-w-0 overflow-hidden rounded-[20px] border border-line bg-paper p-4 sm:p-5"
            key={review.reviewId}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink/45">
                  {review.order.shopName}
                </p>
                <p className="mt-1 break-words text-lg font-black text-ink">
                  {review.order.serviceName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <strong className="text-base font-black tracking-wider text-moss">
                    {"★".repeat(review.rating)}
                    <span className="ml-1 text-sm text-ink/45">
                      {review.rating}/5
                    </span>
                  </strong>
                  {review.amendmentVersion > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
                      {text.corrected} v{review.amendmentVersion}
                    </span>
                  ) : null}
                </div>
              </div>
              {canAmend ? (
                <ReviewAmendmentDialog
                  onSaved={() => setReloadToken((value) => value + 1)}
                  review={review}
                />
              ) : null}
            </div>
            <ReceivedReviewFacts
              review={review}
              language={language}
              tagText={receivedReviewTagText}
            />
            {review.amendmentHistory.length > 0 ? (
              <details className="mt-3 rounded-lg border border-line bg-white p-3">
                <summary className="cursor-pointer text-xs font-black text-ink/65">
                  {text.history} ({review.amendmentHistory.length})
                </summary>
                <div className="mt-3 grid gap-2">
                  {review.amendmentHistory.map((amendment) => (
                    <div
                      className="rounded-lg bg-paper p-3 text-xs text-ink/65"
                      key={amendment.version}
                    >
                      <p className="font-black text-ink">
                        v{amendment.version} · {amendment.rating ?? "—"}/5
                      </p>
                      {amendment.comment ? (
                        <p className="mt-1 whitespace-pre-wrap">
                          {amendment.comment}
                        </p>
                      ) : null}
                      {amendment.tags.length > 0 ? (
                        <p className="mt-1">
                          {amendment.tags
                            .map((tag) => receivedReviewTagText(tag, language))
                            .join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1">
                        {text.reason}: {amendment.reason}
                      </p>
                      <p className="mt-1">
                        {text.revisedBy}: {amendment.revisedBy} ·{" "}
                        {dateTime(amendment.revisedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            <dl className="mt-5 grid gap-x-5 gap-y-4 border-t border-line pt-4 text-xs text-ink/45 sm:grid-cols-2">
              <div>
                <dt className="font-bold">{text.reviewer}: </dt>
                <dd className="mt-1 break-words font-semibold leading-5 text-ink/70">
                  {review.reviewer.displayName}
                </dd>
              </div>
              <div>
                <dt className="font-bold">{text.order}: </dt>
                <dd className="mt-1 break-words font-semibold leading-5 text-ink/70">
                  {review.order.orderNo}
                </dd>
              </div>
              <div>
                <dt className="font-bold">{text.serviceAt}: </dt>
                <dd className="mt-1 break-words font-semibold leading-5 text-ink/70">
                  {dateTime(review.order.startsAt)}
                </dd>
              </div>
              <div>
                <dt className="font-bold">{text.reviewedAt}: </dt>
                <dd className="mt-1 break-words font-semibold leading-5 text-ink/70">
                  {dateTime(review.createdAt)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {state.data && state.data.total > 10 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            size="sm"
            variant="secondary"
          >
            {text.previous}
          </Button>
          <span className="text-xs font-black text-ink/50">
            {page} / {Math.max(1, Math.ceil(state.data.total / 10))}
          </span>
          <Button
            disabled={page * 10 >= state.data.total}
            onClick={() => setPage((value) => value + 1)}
            size="sm"
            variant="secondary"
          >
            {text.next}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
