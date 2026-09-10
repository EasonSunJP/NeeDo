import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type {
  Paginated,
  UserDirectoryScope,
  UserUsage,
  UserUsagePeriod,
  UserUsageQuery,
} from "./types";
import { UserFulfillmentTimelineDrawer } from "./UserFulfillmentTimelineDrawer";

const periodKeys: UserUsagePeriod[] = [
  "last7days",
  "thisWeek",
  "last30days",
  "thisMonth",
  "thisYear",
  "custom",
];
const copy: Record<Language, Record<string, string>> = {
  zh: {
    title: "利用详细列表",
    last7days: "近7天",
    thisWeek: "本周",
    last30days: "近30天",
    thisMonth: "本月",
    thisYear: "今年",
    custom: "自定义日期",
    search: "搜索预约单、服务或店铺",
    query: "查询",
    loading: "正在读取利用记录...",
    failed: "利用记录读取失败",
    empty: "暂无利用记录",
    detail: "查看用户LOG",
    refund: "有退款",
    previous: "上一页",
    next: "下一页",
    from: "开始日期",
    to: "结束日期",
  },
  "zh-Hant": {
    title: "利用詳細列表",
    last7days: "近7天",
    thisWeek: "本週",
    last30days: "近30天",
    thisMonth: "本月",
    thisYear: "今年",
    custom: "自訂日期",
    search: "搜尋預約單、服務或店鋪",
    query: "查詢",
    loading: "正在讀取利用紀錄...",
    failed: "利用紀錄讀取失敗",
    empty: "暫無利用紀錄",
    detail: "查看使用者LOG",
    refund: "有退款",
    previous: "上一頁",
    next: "下一頁",
    from: "開始日期",
    to: "結束日期",
  },
  ja: {
    title: "利用詳細一覧",
    last7days: "直近7日",
    thisWeek: "今週",
    last30days: "直近30日",
    thisMonth: "今月",
    thisYear: "今年",
    custom: "日付指定",
    search: "予約番号・サービス・店舗を検索",
    query: "検索",
    loading: "利用履歴を読み込み中...",
    failed: "利用履歴を読み込めませんでした",
    empty: "利用履歴はありません",
    detail: "ユーザーLOGを見る",
    refund: "返金あり",
    previous: "前へ",
    next: "次へ",
    from: "開始日",
    to: "終了日",
  },
  en: {
    title: "Usage details",
    last7days: "Last 7 days",
    thisWeek: "This week",
    last30days: "Last 30 days",
    thisMonth: "This month",
    thisYear: "This year",
    custom: "Custom dates",
    search: "Search booking, service or shop",
    query: "Search",
    loading: "Loading usage records...",
    failed: "Could not load usage records",
    empty: "No usage records",
    detail: "View user LOG",
    refund: "Refund",
    previous: "Previous",
    next: "Next",
    from: "From",
    to: "To",
  },
  ko: {
    title: "이용 상세 목록",
    last7days: "최근 7일",
    thisWeek: "이번 주",
    last30days: "최근 30일",
    thisMonth: "이번 달",
    thisYear: "올해",
    custom: "날짜 지정",
    search: "예약, 서비스 또는 매장 검색",
    query: "검색",
    loading: "이용 기록 불러오는 중...",
    failed: "이용 기록을 불러오지 못했습니다",
    empty: "이용 기록이 없습니다",
    detail: "사용자 LOG 보기",
    refund: "환불 있음",
    previous: "이전",
    next: "다음",
    from: "시작일",
    to: "종료일",
  },
};

export function UserUsageList({
  scope,
  userId,
  canComment,
  canRefundAmend,
}: {
  scope: UserDirectoryScope;
  userId: number;
  canComment: boolean;
  canRefundAmend: boolean;
}) {
  const { language } = useOptionalI18n();
  const text = copy[language];
  const [query, setQuery] = useState<UserUsageQuery>({
    page: 1,
    page_size: 10,
    period: "last30days",
  });
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<UserUsage | null>(null);
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    data: Paginated<UserUsage> | null;
  }>({ loading: true, error: "", data: null });
  useEffect(() => {
    if (query.period === "custom" && (!query.from || !query.to)) {
      setState({ loading: false, error: "", data: null });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    platformUserManagementApi
      .listUsage(scope, userId, query)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch(
        () =>
          active &&
          setState({ loading: false, error: text.failed, data: null }),
      );
    return () => {
      active = false;
    };
  }, [query, scope, text.failed, userId]);
  const setPeriod = (period: UserUsagePeriod) =>
    setQuery((current) => ({
      page: 1,
      page_size: 10,
      period,
      ...(period === "custom" ? { from: current.from, to: current.to } : {}),
    }));
  return (
    <section className="rounded-[18px] border border-line bg-white p-4 shadow-[0_8px_24px_rgba(22,23,26,0.05)] sm:p-5">
      <h3 className="border-l-[3px] border-moss pl-3 text-base font-black text-ink">
        {text.title}
      </h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {periodKeys.map((period) => (
          <Button
            key={period}
            onClick={() => setPeriod(period)}
            size="sm"
            variant={query.period === period ? "primary" : "secondary"}
          >
            {text[period]}
          </Button>
        ))}
      </div>
      {query.period === "custom" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-black text-ink/55">
            {text.from}
            <input
              className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3"
              onChange={(event) =>
                setQuery((current) => ({
                  ...current,
                  page: 1,
                  from: event.target.value,
                }))
              }
              type="date"
              value={query.from ?? ""}
            />
          </label>
          <label className="text-xs font-black text-ink/55">
            {text.to}
            <input
              className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3"
              onChange={(event) =>
                setQuery((current) => ({
                  ...current,
                  page: 1,
                  to: event.target.value,
                }))
              }
              type="date"
              value={query.to ?? ""}
            />
          </label>
        </div>
      ) : null}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery((current) => ({
            ...current,
            page: 1,
            keyword: keyword.trim() || undefined,
          }));
        }}
      >
        <input
          aria-label={text.search}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm font-bold"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={text.search}
          value={keyword}
        />
        <Button size="sm" type="submit">
          {text.query}
        </Button>
      </form>
      {state.loading ? (
        <p className="mt-4 text-sm font-bold text-ink/50">{text.loading}</p>
      ) : null}
      {state.error ? (
        <p className="mt-4 text-sm font-bold text-coral">{state.error}</p>
      ) : null}
      {!state.loading && !state.error && state.data?.list.length === 0 ? (
        <p className="mt-4 text-sm font-bold text-ink/45">{text.empty}</p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {state.data?.list.map((usage) => (
          <button
            className="w-full rounded-xl border border-line bg-paper p-4 text-left transition hover:border-moss"
            key={usage.id}
            onClick={() => setSelected(usage)}
            type="button"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-sm font-black text-ink">
                  {usage.serviceName}
                </strong>
                <p className="mt-1 text-xs font-bold text-ink/50">
                  {usage.orderNo} · {usage.shopName}
                </p>
              </div>
              <div className="text-right">
                <strong className="text-sm font-black text-ink">
                  {new Intl.NumberFormat(
                    language === "zh" ? "zh-CN" : language,
                    {
                      style: "currency",
                      currency: usage.currency,
                      maximumFractionDigits: 0,
                    },
                  ).format(usage.priceAmount)}
                </strong>
                {usage.refund.exists ? (
                  <p className="mt-1 text-xs font-black text-amber-700">
                    {text.refund}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-ink/45">
              <time>
                {new Intl.DateTimeFormat(
                  language === "zh" ? "zh-CN" : language,
                  { dateStyle: "medium", timeStyle: "short" },
                ).format(new Date(usage.startsAt))}
              </time>
              <span className="text-moss">{text.detail}</span>
            </div>
          </button>
        ))}
      </div>
      {state.data ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            disabled={(query.page ?? 1) <= 1}
            onClick={() =>
              setQuery((current) => ({
                ...current,
                page: Math.max(1, (current.page ?? 1) - 1),
              }))
            }
            size="sm"
            variant="secondary"
          >
            {text.previous}
          </Button>
          <span className="text-xs font-black text-ink/50">
            {query.page ?? 1} / {Math.max(1, Math.ceil(state.data.total / 10))}
          </span>
          <Button
            disabled={(query.page ?? 1) * 10 >= state.data.total}
            onClick={() =>
              setQuery((current) => ({
                ...current,
                page: (current.page ?? 1) + 1,
              }))
            }
            size="sm"
            variant="secondary"
          >
            {text.next}
          </Button>
        </div>
      ) : null}
      <UserFulfillmentTimelineDrawer
        canAmendRefund={canRefundAmend}
        canComment={canComment}
        onClose={() => setSelected(null)}
        scope={scope}
        usage={selected}
        userId={userId}
      />
    </section>
  );
}
