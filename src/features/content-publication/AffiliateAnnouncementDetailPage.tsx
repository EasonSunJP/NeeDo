import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  contentPublicationApi,
  type PublishedAnnouncementPayload,
} from "../../api/contentPublication";
import { ApiClientError } from "../../api/httpClient";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { toContentLocale } from "./locales";

const detailCopy = {
  zh: {
    back: "返回",
    detailTitle: "公告详情",
    loading: "正在读取公告",
    unavailable: "公告暂不可用",
    unavailableHint: "该公告不存在、尚未生效或已停止公开。",
    error: "公告读取失败",
    errorHint: "当前公告暂时无法读取，其他联盟营销功能仍可继续使用。",
    retry: "重试",
    publishedAt: "发布时间",
    visibleFrom: "生效时间",
    visibleUntil: "截止时间",
  },
  "zh-Hant": {
    back: "返回",
    detailTitle: "公告詳情",
    loading: "正在讀取公告",
    unavailable: "公告暫不可用",
    unavailableHint: "該公告不存在、尚未生效或已停止公開。",
    error: "公告讀取失敗",
    errorHint: "目前暫時無法讀取此公告，其他聯盟行銷功能仍可繼續使用。",
    retry: "重試",
    publishedAt: "發佈時間",
    visibleFrom: "生效時間",
    visibleUntil: "截止時間",
  },
  ja: {
    back: "戻る",
    detailTitle: "お知らせ詳細",
    loading: "お知らせを読み込み中",
    unavailable: "お知らせを表示できません",
    unavailableHint: "このお知らせは存在しないか、公開期間外です。",
    error: "お知らせを読み込めませんでした",
    errorHint: "このお知らせは一時的に読み込めません。他のアフィリエイト機能は引き続き利用できます。",
    retry: "再試行",
    publishedAt: "公開日時",
    visibleFrom: "適用開始",
    visibleUntil: "適用終了",
  },
  en: {
    back: "Back",
    detailTitle: "Announcement details",
    loading: "Loading announcement",
    unavailable: "Announcement unavailable",
    unavailableHint: "This announcement does not exist or is outside its publication window.",
    error: "Couldn't load announcement",
    errorHint: "This announcement is temporarily unavailable. Other Affiliate features remain available.",
    retry: "Retry",
    publishedAt: "Published",
    visibleFrom: "Effective from",
    visibleUntil: "Effective until",
  },
  ko: {
    back: "뒤로",
    detailTitle: "공지 상세",
    loading: "공지를 불러오는 중",
    unavailable: "공지를 이용할 수 없습니다",
    unavailableHint: "이 공지가 없거나 공개 기간이 아닙니다.",
    error: "공지를 불러오지 못했습니다",
    errorHint: "이 공지를 일시적으로 불러올 수 없습니다. 다른 제휴 기능은 계속 사용할 수 있습니다.",
    retry: "다시 시도",
    publishedAt: "게시 시간",
    visibleFrom: "적용 시작",
    visibleUntil: "적용 종료",
  },
} satisfies Record<Language, Record<string, string>>;

type DetailStatus = "loading" | "ready" | "unavailable" | "error";

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(
    language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language,
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    },
  ).format(new Date(value));
}

function AnnouncementTime({
  label,
  language,
  value,
}: {
  label: string;
  language: Language;
  value: string;
}) {
  return (
    <div className="grid gap-1 rounded-[18px] bg-[color:var(--client-elevated)] px-4 py-3">
      <span className="text-xs font-bold text-[color:var(--client-muted)]">{label}</span>
      <time className="text-sm font-black text-[color:var(--client-text)]" dateTime={value}>
        {formatDate(value, language)}
      </time>
    </div>
  );
}

export function AffiliateAnnouncementDetailPage() {
  const { announcementPublicId = "" } = useParams();
  const navigate = useNavigate();
  const { language } = useI18n();
  const locale = toContentLocale(language);
  const copy = detailCopy[language];
  const requestSequence = useRef(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [status, setStatus] = useState<DetailStatus>("loading");
  const [announcement, setAnnouncement] =
    useState<PublishedAnnouncementPayload | null>(null);

  useEffect(() => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    let active = true;

    setStatus("loading");
    setAnnouncement(null);

    void contentPublicationApi
      .getAffiliateAnnouncement(announcementPublicId, locale)
      .then((payload) => {
        if (!active || requestSequence.current !== requestId) return;
        setAnnouncement(payload);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active || requestSequence.current !== requestId) return;
        setStatus(
          error instanceof ApiClientError && error.status === 404
            ? "unavailable"
            : "error",
        );
      });

    return () => {
      active = false;
    };
  }, [announcementPublicId, locale, retryRevision]);

  return (
    <MobileShell className="business-cps-shell" navItems={businessNavItems}>
      <MobileFullscreenHeader
        backLabel={copy.back}
        onBack={() => navigate(-1)}
        title={copy.detailTitle}
      />
      <main className="client-app-gutter pb-28 pt-4">
        {status === "loading" ? (
          <section
            className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-sm font-bold text-[color:var(--client-muted)]"
            data-testid="announcement-loading"
            role="status"
          >
            {copy.loading}
          </section>
        ) : null}

        {status === "unavailable" ? (
          <section
            className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-[color:var(--client-text)]"
            data-testid="announcement-unavailable"
          >
            <h2 className="text-xl font-black">{copy.unavailable}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
              {copy.unavailableHint}
            </p>
          </section>
        ) : null}

        {status === "error" ? (
          <section
            className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-[color:var(--client-text)]"
            data-testid="announcement-error"
          >
            <h2 className="text-xl font-black">{copy.error}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
              {copy.errorHint}
            </p>
            <button
              className="focus-ring mt-5 rounded-full bg-[color:var(--client-primary)] px-5 py-3 text-sm font-black text-white"
              onClick={() => setRetryRevision((value) => value + 1)}
              type="button"
            >
              {copy.retry}
            </button>
          </section>
        ) : null}

        {status === "ready" && announcement ? (
          <article
            className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)]"
            data-no-i18n
          >
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">
              {copy.detailTitle}
            </p>
            <h1 className="mt-3 text-2xl font-black leading-tight">{announcement.title}</h1>
            {announcement.summary ? (
              <p className="mt-4 text-sm font-bold leading-7 text-[color:var(--client-muted)]">
                {announcement.summary}
              </p>
            ) : null}
            <div className="my-5 h-px bg-[color:var(--client-line)]" />
            <p
              className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-8"
              data-testid="announcement-body"
            >
              {announcement.body}
            </p>

            <div className="mt-6 grid gap-3">
              {announcement.activatedAt ? (
                <AnnouncementTime
                  label={copy.publishedAt}
                  language={language}
                  value={announcement.activatedAt}
                />
              ) : null}
              {announcement.visibleFrom ? (
                <AnnouncementTime
                  label={copy.visibleFrom}
                  language={language}
                  value={announcement.visibleFrom}
                />
              ) : null}
              {announcement.visibleUntil ? (
                <AnnouncementTime
                  label={copy.visibleUntil}
                  language={language}
                  value={announcement.visibleUntil}
                />
              ) : null}
            </div>

            {announcement.taskAction?.claimable === true ? (
              <Link
                className="focus-ring mt-6 flex min-h-12 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-center text-sm font-black text-white"
                to={`/afirieito/plan?${new URLSearchParams({ taskCode: announcement.taskAction.taskCode }).toString()}`}
              >
                {announcement.taskAction.label}
              </Link>
            ) : null}
          </article>
        ) : null}
      </main>
    </MobileShell>
  );
}
