import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { IM_COMMON_EMOJIS, loadRecentImEmojis } from "./emoji";
import { IM_JUDGEMENT_REPLIES } from "./reaction-policy";

export const IM_RECENT_REACTION_LIMIT = 8;
export const IM_RECENT_REACTION_STORAGE_KEY = "needo.im.recent-reactions.v2";

const allowedReactions = new Set<string>([...IM_JUDGEMENT_REPLIES, ...IM_COMMON_EMOJIS]);
const recentReactionListeners = new Set<() => void>();

function normalizeRecentImReactions(values: readonly unknown[]) {
  const normalized: string[] = [];

  for (const value of values) {
    if (
      typeof value === "string" &&
      allowedReactions.has(value) &&
      !normalized.includes(value)
    ) {
      normalized.push(value);
    }
    if (normalized.length >= IM_RECENT_REACTION_LIMIT) break;
  }

  for (const fallback of loadRecentImEmojis()) {
    if (normalized.length >= IM_RECENT_REACTION_LIMIT) break;
    if (!normalized.includes(fallback)) normalized.push(fallback);
  }

  return normalized;
}

const storedRecentReactions = parseBrowserStorageJson<unknown[]>(
  IM_RECENT_REACTION_STORAGE_KEY,
  [],
  { removeOnError: true, silent: true }
);

let recentReactions = normalizeRecentImReactions(storedRecentReactions);

if (storedRecentReactions.length === 0) {
  writeBrowserStorage(IM_RECENT_REACTION_STORAGE_KEY, JSON.stringify(recentReactions), {
    silent: true
  });
}

export function getRecentImReactionSnapshot() {
  return recentReactions;
}

export function subscribeRecentImReactions(listener: () => void) {
  recentReactionListeners.add(listener);
  return () => {
    recentReactionListeners.delete(listener);
  };
}

export function recordRecentImReaction(value: string) {
  if (!allowedReactions.has(value)) return recentReactions;

  recentReactions = normalizeRecentImReactions([
    value,
    ...recentReactions.filter((item) => item !== value)
  ]);
  writeBrowserStorage(IM_RECENT_REACTION_STORAGE_KEY, JSON.stringify(recentReactions), {
    silent: true
  });
  recentReactionListeners.forEach((listener) => listener());
  return recentReactions;
}
