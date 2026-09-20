import type { ReactNode } from "react";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { registerTranslationEntries, translateText } from "../../i18n/translations";
import { ClientActionDialog } from "./ClientActionDialog";

registerTranslationEntries({
  "强制取消预约": { "zh-Hant": "強制取消預約", ja: "予約を強制キャンセル", en: "Force-cancel booking", ko: "예약 강제 취소" },
  "强制取消预约可能引起用户差评，并会降低接单率数值。是否真的要取消此预约？": { "zh-Hant": "強制取消預約可能引起使用者負評，並會降低接單率數值。是否確定取消此預約？", ja: "予約を強制キャンセルすると低評価につながり、受注率の数値が下がる可能性があります。本当にこの予約をキャンセルしますか？", en: "Force-cancelling may result in a poor customer review and lower the acceptance-rate metric. Do you really want to cancel this booking?", ko: "예약을 강제로 취소하면 사용자에게 낮은 평가를 받고 수락률 수치가 낮아질 수 있습니다. 정말 이 예약을 취소하시겠습니까?" },
  "确定取消预约": { "zh-Hant": "確定取消預約", ja: "予約をキャンセル", en: "Cancel booking", ko: "예약 취소 확인" },
  "正在取消预约": { "zh-Hant": "正在取消預約", ja: "予約をキャンセル中", en: "Cancelling booking", ko: "예약 취소 중" },
  "预约取消失败，请稍后重试": { "zh-Hant": "預約取消失敗，請稍後再試", ja: "予約をキャンセルできませんでした。しばらくしてからもう一度お試しください", en: "The booking could not be cancelled. Try again later", ko: "예약을 취소하지 못했습니다. 잠시 후 다시 시도하세요" }
});

export function DangerConfirmDialog({
  cancelLabel = "取消",
  children,
  confirmLabel = "确认取消",
  description,
  error,
  onCancel,
  onConfirm,
  open,
  pending = false,
  pendingLabel = "正在取消预约",
  title
}: {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  description?: string;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  pending?: boolean;
  pendingLabel?: string;
  title: string;
}) {
  const { language } = useOptionalI18n();
  const localize = (value: string) => translateText(value, language);

  return (
    <ClientActionDialog
      className="danger-confirm-dialog bg-[color:color-mix(in_srgb,#160304_72%,transparent)] backdrop-blur-md"
      closeOnBackdrop={!pending}
      description={description ? localize(description) : undefined}
      onClose={pending ? undefined : onCancel}
      open={open}
      panelClassName="max-w-[380px] border-red-400/45 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--client-elevated)_94%,#4a0808)_0%,color-mix(in_srgb,var(--client-surface)_98%,#210202)_100%)] shadow-[0_28px_80px_rgba(146,20,20,0.34)]"
      role="alertdialog"
      title={localize(title)}
      actions={(
        <div className="grid grid-cols-[0.82fr_1fr] gap-3">
          <button
            className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-45"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            {localize(cancelLabel)}
          </button>
          <button
            className="focus-ring h-11 rounded-full bg-[linear-gradient(180deg,#ff776f_0%,#ef4542_56%,#d9282a_100%)] text-sm font-black text-white shadow-[0_14px_32px_rgba(214,40,40,0.32)] disabled:cursor-wait disabled:opacity-65"
            disabled={pending}
            onClick={() => void onConfirm()}
            type="button"
          >
            {localize(pending ? pendingLabel : confirmLabel)}
          </button>
        </div>
      )}
    >
      {children}
      {error ? (
        <p className="rounded-[16px] border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm font-bold leading-5 text-red-400" role="alert">
          {localize(error)}
        </p>
      ) : null}
    </ClientActionDialog>
  );
}
