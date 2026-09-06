import { useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type { UserUsage } from "./types";

const copy: Record<Language, Record<string, string>> = {
  zh: {
    action: "修改退款信息",
    title: "修改退款信息",
    reference: "退款显示编号",
    note: "退款说明",
    reason: "修改理由",
    required: "请填写修改理由",
    cancel: "取消",
    save: "保存修改",
    failed: "退款信息修改失败",
    conflict: "退款信息已被其他运营修改，请刷新后重试",
  },
  "zh-Hant": {
    action: "修改退款資訊",
    title: "修改退款資訊",
    reference: "退款顯示編號",
    note: "退款說明",
    reason: "修改理由",
    required: "請填寫修改理由",
    cancel: "取消",
    save: "儲存修改",
    failed: "退款資訊修改失敗",
    conflict: "退款資訊已被其他營運修改，請重新整理後再試",
  },
  ja: {
    action: "返金情報を修正",
    title: "返金情報を修正",
    reference: "返金表示番号",
    note: "返金メモ",
    reason: "修正理由",
    required: "修正理由を入力してください",
    cancel: "キャンセル",
    save: "修正を保存",
    failed: "返金情報を修正できませんでした",
    conflict:
      "別の運営担当者が返金情報を修正しました。更新して再試行してください",
  },
  en: {
    action: "Edit refund details",
    title: "Edit refund details",
    reference: "Display reference",
    note: "Refund note",
    reason: "Reason for change",
    required: "Enter a reason for the change",
    cancel: "Cancel",
    save: "Save change",
    failed: "Could not edit refund details",
    conflict:
      "Another operator edited the refund details. Refresh and try again",
  },
  ko: {
    action: "환불 정보 수정",
    title: "환불 정보 수정",
    reference: "환불 표시 번호",
    note: "환불 메모",
    reason: "수정 사유",
    required: "수정 사유를 입력하세요",
    cancel: "취소",
    save: "수정 저장",
    failed: "환불 정보를 수정하지 못했습니다",
    conflict:
      "다른 운영자가 환불 정보를 수정했습니다. 새로고침 후 다시 시도하세요",
  },
};

export function RefundAmendmentDialog({
  userId,
  usage,
  onSaved,
}: {
  userId: number;
  usage: UserUsage;
  onSaved: () => void;
}) {
  const { language } = useOptionalI18n();
  const text = copy[language];
  const [open, setOpen] = useState(false);
  const [displayReference, setDisplayReference] = useState(
    usage.refund.displayReference ?? "",
  );
  const [note, setNote] = useState(usage.refund.note ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!reason.trim()) {
      setError(text.required);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await platformUserManagementApi.amendUsageRefund(userId, usage.id, {
        displayReference: displayReference.trim() || null,
        note: note.trim() || null,
        reason: reason.trim(),
        expectedVersion: usage.refund.amendmentVersion,
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
          className="fixed inset-0 z-[170] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-[18px] border border-line bg-white p-5 shadow-panel">
            <h3 className="text-lg font-black text-ink">{text.title}</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-black text-ink/55">
                {text.reference}
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold"
                  maxLength={120}
                  onChange={(event) => setDisplayReference(event.target.value)}
                  value={displayReference}
                />
              </label>
              <label className="block text-xs font-black text-ink/55">
                {text.note}
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-line bg-paper p-3 text-sm font-bold"
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
              <label className="block text-xs font-black text-ink/55">
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
