import type { SocialComposerDraft } from "./types";

type SocialDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const composerDraftStorageKey = "needo.social.composer-drafts.v1";
const legacySocialStateStorageKey = "needo.social.module.v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeSocialComposerDrafts(value: unknown): Record<string, SocialComposerDraft> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, SocialComposerDraft] => {
      const draft = entry[1];
      return isRecord(draft) &&
        !Object.hasOwn(draft, "replyToPostId") &&
        typeof draft.authorKey === "string" &&
        typeof draft.text === "string" &&
        Array.isArray(draft.media) &&
        typeof draft.updatedAt === "string";
    })
  );
}

function getBrowserStorage(): SocialDraftStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorage(storage: SocialDraftStorage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: SocialDraftStorage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Draft persistence is best-effort and must never block the formal Social UI.
  }
}

export function persistSocialComposerDrafts(
  drafts: Record<string, unknown>,
  storage: SocialDraftStorage | null = getBrowserStorage()
) {
  if (!storage) return;
  writeStorage(storage, composerDraftStorageKey, JSON.stringify(sanitizeSocialComposerDrafts(drafts)));
}

export function hydrateSocialComposerDrafts(
  storage: SocialDraftStorage | null = getBrowserStorage()
): Record<string, SocialComposerDraft> {
  if (!storage) return {};

  const currentDrafts = sanitizeSocialComposerDrafts(parseRecord(readStorage(storage, composerDraftStorageKey)));
  const legacyState = parseRecord(readStorage(storage, legacySocialStateStorageKey));
  const legacyDrafts = sanitizeSocialComposerDrafts(legacyState.drafts);
  const drafts = { ...legacyDrafts, ...currentDrafts };

  if (Object.hasOwn(legacyState, "drafts")) {
    writeStorage(storage, legacySocialStateStorageKey, JSON.stringify({ ...legacyState, drafts: legacyDrafts }));
  }

  persistSocialComposerDrafts(drafts, storage);
  return drafts;
}
