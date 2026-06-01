export const privacyModeConfirmMessage = "打开隐私模式后，本账号将不会在检索结果中显示，确定要开启吗？";

export function PrivacyModeConfirmDialog({
  cancelLabel = "取消",
  confirmLabel = "确定",
  message = privacyModeConfirmMessage,
  onCancel,
  onConfirm,
  open,
  showConfirmAction = true
}: {
  cancelLabel?: string;
  confirmLabel?: string;
  message?: string;
  onCancel: () => void;
  onConfirm?: () => void;
  open: boolean;
  showConfirmAction?: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[140] grid place-items-center bg-[#160307]/78 px-5 backdrop-blur-sm"
      data-testid="privacy-mode-confirm-dialog"
      role="dialog"
    >
      <div className="w-full max-w-[320px] rounded-[24px] border border-[#ff4d5e] bg-[#26060b] p-4 text-white shadow-[0_26px_62px_rgba(255,36,64,0.26)]">
        <div
          aria-hidden="true"
          className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-[5px] border-[#ff4d5e] bg-[#ff314f]/18 text-[42px] font-black leading-none text-[#ff4d5e] shadow-[0_0_28px_rgba(255,49,79,0.34)]"
        >
          !
        </div>
        <p className="text-center text-[15px] font-black leading-6 text-white">{message}</p>
        <div className={showConfirmAction ? "mt-4 grid grid-cols-2 gap-2" : "mt-4 grid gap-2"}>
          {showConfirmAction ? (
            <button
              className="rounded-full border border-[#ff8a96]/46 bg-[#3a0c12] px-4 py-2.5 text-sm font-black text-[#ffd6dc]"
              onClick={onConfirm ?? onCancel}
              type="button"
            >
              {confirmLabel}
            </button>
          ) : null}
          <button
            className="rounded-full bg-[#ff314f] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(255,49,79,0.28)]"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
