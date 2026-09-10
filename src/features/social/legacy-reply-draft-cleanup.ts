type LegacySocialStorage = Pick<Storage, "getItem" | "setItem">;

const legacySocialStateStorageKey = "needo.social.module.v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getBrowserStorage(): LegacySocialStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function cleanupLegacySocialReplyDrafts(
  storage: LegacySocialStorage | null = getBrowserStorage()
) {
  if (!storage) return;

  try {
    const raw = storage.getItem(legacySocialStateStorageKey);
    if (!raw) return;

    const legacyState = JSON.parse(raw) as unknown;
    if (!isRecord(legacyState) || !isRecord(legacyState.drafts)) return;

    let removedReplyDraft = false;
    const drafts = Object.fromEntries(
      Object.entries(legacyState.drafts).filter(([, draft]) => {
        const shouldRemove = isRecord(draft) && Object.hasOwn(draft, "replyToPostId");
        removedReplyDraft ||= shouldRemove;
        return !shouldRemove;
      })
    );

    if (removedReplyDraft) {
      storage.setItem(legacySocialStateStorageKey, JSON.stringify({ ...legacyState, drafts }));
    }
  } catch {
    // Legacy cleanup is best-effort and must not block the formal Social UI.
  }
}
