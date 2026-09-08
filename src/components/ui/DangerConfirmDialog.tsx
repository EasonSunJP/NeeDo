import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { ClientActionDialog } from "./ClientActionDialog";

export function DangerConfirmDialog({
  cancelLabel = "取消",
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
      {error ? (
        <p className="rounded-[16px] border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm font-bold leading-5 text-red-400" role="alert">
          {localize(error)}
        </p>
      ) : null}
    </ClientActionDialog>
  );
}
