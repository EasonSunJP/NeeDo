import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import { RefundAmendmentDialog } from "./RefundAmendmentDialog";
import type { UserDirectoryScope, UserUsage, UserUsageTimeline } from "./types";

const copy: Record<Language, Record<string, string>> = {
  zh: {
    title: "履约流程",
    loading: "正在读取履约流程...",
    failed: "履约流程读取失败",
    retry: "重试",
    comment: "追加评论",
    placeholder: "填写不可删除的运营评论",
    required: "请填写评论",
    submit: "追加评论",
    refund: "退款信息",
    reference: "退款编号",
    none: "暂无履约记录",
    system: "系统",
  },
  "zh-Hant": {
    title: "履約流程",
    loading: "正在讀取履約流程...",
    failed: "履約流程讀取失敗",
    retry: "重試",
    comment: "追加評論",
    placeholder: "填寫不可刪除的營運評論",
    required: "請填寫評論",
    submit: "追加評論",
    refund: "退款資訊",
    reference: "退款編號",
    none: "暫無履約紀錄",
    system: "系統",
  },
  ja: {
    title: "履行プロセス",
    loading: "履行プロセスを読み込み中...",
    failed: "履行プロセスを読み込めませんでした",
    retry: "再試行",
    comment: "コメントを追加",
    placeholder: "削除できない運営コメントを入力",
    required: "コメントを入力してください",
    submit: "コメントを追加",
    refund: "返金情報",
    reference: "返金番号",
    none: "履行記録はありません",
    system: "システム",
  },
  en: {
    title: "Fulfillment timeline",
    loading: "Loading fulfillment timeline...",
    failed: "Could not load the fulfillment timeline",
    retry: "Retry",
    comment: "Add comment",
    placeholder: "Enter an immutable operations comment",
    required: "Enter a comment",
    submit: "Add comment",
    refund: "Refund details",
    reference: "Refund reference",
    none: "No fulfillment events",
    system: "System",
  },
  ko: {
    title: "이행 과정",
    loading: "이행 과정 불러오는 중...",
    failed: "이행 과정을 불러오지 못했습니다",
    retry: "다시 시도",
    comment: "댓글 추가",
    placeholder: "삭제할 수 없는 운영 댓글을 입력",
    required: "댓글을 입력하세요",
    submit: "댓글 추가",
    refund: "환불 정보",
    reference: "환불 번호",
    none: "이행 기록이 없습니다",
    system: "시스템",
  },
};

const eventLabels: Record<string, Partial<Record<Language, string>>> = {
  order_created: {
    zh: "预约已创建",
    "zh-Hant": "預約已建立",
    ja: "予約作成",
    en: "Booking created",
    ko: "예약 생성",
  },
  pending: {
    zh: "待确认",
    "zh-Hant": "待確認",
    ja: "確認待ち",
    en: "Pending",
    ko: "확인 대기",
  },
  confirmed: {
    zh: "已确认",
    "zh-Hant": "已確認",
    ja: "確認済み",
    en: "Confirmed",
    ko: "확인됨",
  },
  in_service: {
    zh: "服务中",
    "zh-Hant": "服務中",
    ja: "サービス中",
    en: "In service",
    ko: "서비스 중",
  },
  completed: {
    zh: "已完成",
    "zh-Hant": "已完成",
    ja: "完了",
    en: "Completed",
    ko: "완료",
  },
  cancelled: {
    zh: "已取消",
    "zh-Hant": "已取消",
    ja: "キャンセル",
    en: "Cancelled",
    ko: "취소됨",
  },
  comment: {
    zh: "运营评论",
    "zh-Hant": "營運評論",
    ja: "運営コメント",
    en: "Operations comment",
    ko: "운영 댓글",
  },
  refund: {
    zh: "退款记录",
    "zh-Hant": "退款紀錄",
    ja: "返金記録",
    en: "Refund record",
    ko: "환불 기록",
  },
  service_started: {
    zh: "服务开始",
    "zh-Hant": "服務開始",
    ja: "サービス開始",
    en: "Service started",
    ko: "서비스 시작",
  },
  service_ended: {
    zh: "服务结束",
    "zh-Hant": "服務結束",
    ja: "サービス終了",
    en: "Service ended",
    ko: "서비스 종료",
  },
};

export function UserFulfillmentTimelineDrawer({
  scope,
  userId,
  usage,
  canComment,
  canAmendRefund,
  onClose,
}: {
  scope: UserDirectoryScope;
  userId: number;
  usage: UserUsage | null;
  canComment: boolean;
  canAmendRefund: boolean;
  onClose: () => void;
}) {
  const { language } = useOptionalI18n();
  const text = copy[language];
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    data: UserUsageTimeline | null;
  }>({ loading: false, error: "", data: null });
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!usage) {
      setState({ loading: false, error: "", data: null });
      return;
    }
    let active = true;
    setState({ loading: true, error: "", data: null });
    platformUserManagementApi
      .getUsageTimeline(scope, userId, usage.id)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch(
        () =>
          active &&
          setState({ loading: false, error: text.failed, data: null }),
      );
    return () => {
      active = false;
    };
  }, [reloadToken, scope, text.failed, usage, userId]);
  const append = async () => {
    if (!comment.trim()) {
      setCommentError(text.required);
      return;
    }
    if (!usage) return;
    setSaving(true);
    setCommentError("");
    try {
      await platformUserManagementApi.appendUsageComment(
        userId,
        usage.id,
        comment.trim(),
      );
      setComment("");
      setReloadToken((value) => value + 1);
    } catch {
      setCommentError(text.failed);
    } finally {
      setSaving(false);
    }
  };
  const currentUsage = state.data?.order ?? usage;
  return (
    <Drawer
      defaultWidth={720}
      maxWidth={980}
      onClose={onClose}
      open={usage !== null}
      title={usage ? `${text.title} · ${usage.orderNo}` : text.title}
      widthStorageKey="needo.ui.drawer.user-fulfillment-timeline.width"
    >
      {state.loading ? (
        <p className="text-sm font-bold text-ink/50">{text.loading}</p>
      ) : null}
      {!state.loading && state.error ? (
        <div className="flex items-center justify-between gap-3 text-sm font-bold text-coral">
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
      {currentUsage?.refund.exists ? (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-amber-900">
                {text.refund}
              </h3>
              <p className="mt-1 text-xs font-bold text-amber-800">
                {text.reference}: {currentUsage.refund.displayReference ?? "—"}
              </p>
              {currentUsage.refund.note ? (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  {currentUsage.refund.note}
                </p>
              ) : null}
            </div>
            {canAmendRefund ? (
              <RefundAmendmentDialog
                onSaved={() => setReloadToken((value) => value + 1)}
                usage={currentUsage}
                userId={userId}
              />
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="grid gap-3">
        {state.data?.timeline.map((event) => (
          <article
            className="relative ml-3 border-l-2 border-moss/30 pb-4 pl-5 last:pb-0"
            key={event.id}
          >
            <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-moss" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-black text-ink">
                {eventLabels[event.code]?.[language] ??
                  eventLabels[event.type]?.[language] ??
                  text.system}
              </strong>
              <time className="text-xs font-bold text-ink/40">
                {new Intl.DateTimeFormat(
                  language === "zh"
                    ? "zh-CN"
                    : language === "zh-Hant"
                      ? "zh-TW"
                      : language,
                  { dateStyle: "medium", timeStyle: "short" },
                ).format(new Date(event.occurredAt))}
              </time>
            </div>
            {event.actorName ? (
              <p className="mt-1 text-xs font-bold text-ink/45">
                {event.actorName}
              </p>
            ) : null}
            {event.body ? (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm font-medium text-ink/70">
                {event.body}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {!state.loading && state.data?.timeline.length === 0 ? (
        <p className="text-sm font-bold text-ink/45">{text.none}</p>
      ) : null}
      {canComment ? (
        <section className="mt-5 border-t border-line pt-4">
          <label className="text-xs font-black text-ink/55">
            {text.comment}
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-line bg-paper p-3 text-sm font-bold"
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
              placeholder={text.placeholder}
              value={comment}
            />
          </label>
          {commentError ? (
            <p className="mt-2 text-sm font-bold text-coral">{commentError}</p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button disabled={saving} onClick={() => void append()} size="sm">
              {text.submit}
            </Button>
          </div>
        </section>
      ) : null}
    </Drawer>
  );
}
