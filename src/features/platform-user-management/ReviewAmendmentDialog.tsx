import { useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type { ReceivedUserReview } from "./types";

const copy: Record<Language, Record<string, string>> = {
  zh: {
    action: "修改评价",
    title: "修改评价",
    rating: "评分",
    comment: "评价内容",
    tags: "评价标签",
    tagsHint: "多个标签请用逗号分隔",
    reason: "修改理由",
    reasonRequired: "请填写修改理由",
    cancel: "取消",
    save: "保存修改",
    failed: "评价修改失败",
    conflict: "评价已被其他运营修改，请刷新后重试",
  },
  "zh-Hant": {
    action: "修改評價",
    title: "修改評價",
    rating: "評分",
    comment: "評價內容",
    tags: "評價標籤",
    tagsHint: "多個標籤請用逗號分隔",
    reason: "修改理由",
    reasonRequired: "請填寫修改理由",
    cancel: "取消",
    save: "儲存修改",
    failed: "評價修改失敗",
    conflict: "評價已被其他營運修改，請重新整理後再試",
  },
  ja: {
    action: "評価を修正",
    title: "評価を修正",
    rating: "評価",
    comment: "評価内容",
    tags: "評価タグ",
    tagsHint: "複数のタグはカンマで区切ってください",
    reason: "修正理由",
    reasonRequired: "修正理由を入力してください",
    cancel: "キャンセル",
    save: "修正を保存",
    failed: "評価を修正できませんでした",
    conflict: "別の運営担当者が評価を修正しました。更新して再試行してください",
  },
  en: {
    action: "Edit review",
    title: "Edit review",
    rating: "Rating",
    comment: "Review",
    tags: "Review tags",
    tagsHint: "Separate multiple tags with commas",
    reason: "Reason for change",
    reasonRequired: "Enter a reason for the change",
    cancel: "Cancel",
    save: "Save change",
    failed: "Could not edit the review",
    conflict: "Another operator edited this review. Refresh and try again",
  },
  ko: {
    action: "평가 수정",
    title: "평가 수정",
    rating: "평점",
    comment: "평가 내용",
    tags: "평가 태그",
    tagsHint: "여러 태그는 쉼표로 구분하세요",
    reason: "수정 사유",
    reasonRequired: "수정 사유를 입력하세요",
    cancel: "취소",
    save: "수정 저장",
    failed: "평가를 수정하지 못했습니다",
    conflict: "다른 운영자가 평가를 수정했습니다. 새로고침 후 다시 시도하세요",
  },
};

export function ReviewAmendmentDialog({
  review,
  onSaved,
}: {
  review: ReceivedUserReview;
  onSaved: () => void;
}) {
  const { language } = useOptionalI18n();
  const text = copy[language];
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(String(review.rating));
  const [comment, setComment] = useState(review.comment ?? "");
  const [tags, setTags] = useState(review.tags.join(", "));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError(text.reasonRequired);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await platformUserManagementApi.amendReview(review.reviewId, {
        rating: Number(rating),
        comment: comment.trim() || null,
        tags: tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        reason: normalizedReason,
        expectedVersion: review.amendmentVersion,
      });
      setOpen(false);
      setReason("");
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof ApiClientError && saveError.status === 409
          ? text.conflict
          : text.failed,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        size="sm"
        variant="secondary"
      >
        {text.action}
      </Button>
      {open ? (
        <div
          aria-label={text.title}
          aria-modal="true"
          className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <section className="w-full max-w-lg rounded-[18px] border border-line bg-white p-5 shadow-panel">
            <h3 className="text-lg font-black text-ink">{text.title}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-ink/55">
                {text.rating}
                <select
                  className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold"
                  onChange={(event) => setRating(event.target.value)}
                  value={rating}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-ink/55">
                {text.tags}
                <input
                  aria-describedby={`review-tags-${review.reviewId}`}
                  className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold"
                  maxLength={820}
                  onChange={(event) => setTags(event.target.value)}
                  value={tags}
                />
                <span
                  className="mt-1 block text-[11px] font-medium text-ink/45"
                  id={`review-tags-${review.reviewId}`}
                >
                  {text.tagsHint}
                </span>
              </label>
              <label className="text-xs font-black text-ink/55 sm:col-span-2">
                {text.comment}
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-line bg-paper p-3 text-sm font-bold"
                  maxLength={1000}
                  onChange={(event) => setComment(event.target.value)}
                  value={comment}
                />
              </label>
              <label className="text-xs font-black text-ink/55 sm:col-span-2">
                {text.reason}
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-line bg-paper p-3 text-sm font-bold"
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-sm font-bold text-coral">{error}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                disabled={saving}
                onClick={() => setOpen(false)}
                size="sm"
                variant="secondary"
              >
                {text.cancel}
              </Button>
              <Button disabled={saving} onClick={() => void save()} size="sm">
                {text.save}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
