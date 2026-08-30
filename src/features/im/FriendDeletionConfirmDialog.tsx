import { useCallback, useState } from "react";
import { ClientActionDialog } from "../../components/ui/ClientActionDialog";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

export type FriendDeletionTarget = {
  id: string;
};

export function useFriendDeletionConfirmation<T extends FriendDeletionTarget>({
  deleteContact,
  onDeleted,
}: {
  deleteContact: (contactId: string) => Promise<unknown>;
  onDeleted?: (target: T) => void;
}) {
  const [target, setTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestDeletion = useCallback((nextTarget: T) => {
    if (deleting) {
      return;
    }

    setErrorMessage(null);
    setTarget(nextTarget);
  }, [deleting]);

  const cancelDeletion = useCallback(() => {
    if (deleting) {
      return;
    }

    setErrorMessage(null);
    setTarget(null);
  }, [deleting]);

  const confirmDeletion = useCallback(async () => {
    if (!target || deleting) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);

    try {
      await deleteContact(target.id);
      setTarget(null);
      setDeleting(false);
      onDeleted?.(target);
    } catch {
      setErrorMessage("删除失败，请稍后重试");
      setDeleting(false);
    }
  }, [deleteContact, deleting, onDeleted, target]);

  return {
    cancelDeletion,
    confirmDeletion,
    deleting,
    errorMessage,
    open: target !== null,
    requestDeletion,
    target,
  };
}

export function FriendDeletionConfirmDialog({
  open,
  deleting,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  deleting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <ClientActionDialog
      actions={(
        <div className="grid grid-cols-2 gap-3" data-testid="friend-deletion-actions">
          <button
            className="focus-ring min-h-11 rounded-full bg-[#ef4f3f] px-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleting}
            onClick={() => void onConfirm()}
            type="button"
          >
            {t(deleting ? "正在删除…" : "确认删除")}
          </button>
          <button
            className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-3 text-sm font-black text-[color:var(--client-text)] transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleting}
            onClick={onCancel}
            type="button"
          >
            {t("取消")}
          </button>
        </div>
      )}
      closeOnBackdrop={!deleting}
      description={t("删除后，你与对方的好友关系将解除。你的聊天记录以及双方的动态关注关系将被永久删除，且无法恢复。确定删除该好友吗？")}
      onClose={onCancel}
      open={open}
      title={t("确认删除好友？")}
    >
      {errorMessage ? (
        <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-500" role="alert">
          {t(errorMessage)}
        </p>
      ) : null}
    </ClientActionDialog>
  );
}
