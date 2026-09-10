import { ApiClientError } from "../../api/httpClient";
import { clampMessageText } from "../../lib/messageTextLimits";

export const IM_JUDGEMENT_REPLIES = [
  "OK",
  "NO",
  "Pending",
  "+1",
  "Done",
  "Cool",
  "Good",
  "Thanks"
] as const;

export type ImReactionCategory = "judgement" | "emoji";

export type ImReactionSlots = Partial<Record<ImReactionCategory, string>>;

type ImReactionPerson = {
  id: string;
};

const judgementReplies = new Set<string>(IM_JUDGEMENT_REPLIES);
const judgementDraftTokenEntries = IM_JUDGEMENT_REPLIES.map(
  (value, index) => [value, String.fromCodePoint(0xe100 + index)] as const,
);
const judgementDraftTokenByValue = new Map<string, string>(judgementDraftTokenEntries);
const judgementValueByDraftToken = new Map<string, string>(
  judgementDraftTokenEntries.map(([value, token]) => [token, value]),
);

export type ImComposerDraftPart =
  | { type: "text"; value: string }
  | { type: "judgement"; token: string; value: string };

export type ImMessageRichTextPart =
  | { type: "text"; value: string }
  | { type: "judgement"; value: string };

export type ImMessageRichText = {
  version: 1;
  parts: ImMessageRichTextPart[];
};

export function encodeImComposerJudgement(value: string): string {
  return judgementDraftTokenByValue.get(value) ?? value;
}

export function parseImComposerDraft(value: string): ImComposerDraftPart[] {
  const parts: ImComposerDraftPart[] = [];
  let text = "";

  const flushText = () => {
    if (!text) return;
    parts.push({ type: "text", value: text });
    text = "";
  };

  for (const character of Array.from(value)) {
    const judgement = judgementValueByDraftToken.get(character);
    if (!judgement) {
      text += character;
      continue;
    }

    flushText();
    parts.push({ type: "judgement", token: character, value: judgement });
  }

  flushText();
  return parts;
}

export function materializeImComposerDraft(value: string): string {
  return parseImComposerDraft(value)
    .map((part) => part.value)
    .join("");
}

export function serializeImComposerMessage(value: string): {
  content: string;
  richText?: ImMessageRichText;
} {
  const parsedParts = parseImComposerDraft(value.trim());
  const limitedContent = clampMessageText(
    parsedParts.map((part) => part.value).join("")
  );
  const parts: ImMessageRichTextPart[] = [];
  let content = "";
  let hasJudgement = false;
  let reachedLimit = false;

  for (const part of parsedParts) {
    if (reachedLimit) break;

    if (part.type === "judgement") {
      const candidate = `${content}${part.value}`;
      if (!limitedContent.startsWith(candidate)) break;
      content = candidate;
      hasJudgement = true;
      parts.push({ type: "judgement", value: part.value });
      continue;
    }

    let text = "";
    for (const character of Array.from(part.value)) {
      const candidate = `${content}${text}${character}`;
      if (!limitedContent.startsWith(candidate)) {
        reachedLimit = true;
        break;
      }
      text += character;
    }

    if (text) {
      content += text;
      parts.push({ type: "text", value: text });
    }
  }

  return hasJudgement
    ? { content, richText: { version: 1, parts } }
    : { content: limitedContent };
}

export function resolveImMessageRichText(
  content: string,
  richText: unknown
): ImMessageRichTextPart[] {
  if (!richText || typeof richText !== "object" || Array.isArray(richText)) {
    return [{ type: "text", value: content }];
  }

  const candidate = richText as { version?: unknown; parts?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.parts)) {
    return [{ type: "text", value: content }];
  }

  const parts: ImMessageRichTextPart[] = [];
  let hasJudgement = false;

  for (const part of candidate.parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return [{ type: "text", value: content }];
    }

    const typedPart = part as { type?: unknown; value?: unknown };
    if (typedPart.type === "text" && typeof typedPart.value === "string") {
      parts.push({ type: "text", value: typedPart.value });
      continue;
    }

    if (
      typedPart.type === "judgement" &&
      typeof typedPart.value === "string" &&
      judgementReplies.has(typedPart.value)
    ) {
      hasJudgement = true;
      parts.push({ type: "judgement", value: typedPart.value });
      continue;
    }

    return [{ type: "text", value: content }];
  }

  if (!hasJudgement || parts.map((part) => part.value).join("") !== content) {
    return [{ type: "text", value: content }];
  }

  return parts;
}

export function normalizeImMessageRichText(
  content: string,
  richText: unknown
): ImMessageRichText | undefined {
  const parts = resolveImMessageRichText(content, richText);
  const hasJudgement = parts.some((part) => part.type === "judgement");
  if (!hasJudgement || parts.map((part) => part.value).join("") !== content) {
    return undefined;
  }
  return { version: 1, parts };
}

export function restoreImComposerDraft(content: string, richText: unknown): string {
  return resolveImMessageRichText(content, richText)
    .map((part) =>
      part.type === "judgement"
        ? encodeImComposerJudgement(part.value)
        : part.value
    )
    .join("");
}

export function getImReactionCategory(value: string): ImReactionCategory {
  return judgementReplies.has(value) ? "judgement" : "emoji";
}

export function deriveCurrentUserReactionSlots(
  reactions: Readonly<Record<string, readonly ImReactionPerson[]>>,
  currentUserId: string
): ImReactionSlots {
  const slots: ImReactionSlots = {};

  for (const [value, people] of Object.entries(reactions)) {
    if (!people.some((person) => person.id === currentUserId)) continue;

    const category = getImReactionCategory(value);
    if (!slots[category]) slots[category] = value;
  }

  return slots;
}

export function isImReactionChoiceDisabled(
  choice: string,
  selectedValue: string | undefined,
  mutationPending: boolean
): boolean {
  if (mutationPending) return true;
  if (!selectedValue || choice === selectedValue) return false;

  return getImReactionCategory(choice) === getImReactionCategory(selectedValue);
}

export function sortImReactionSummaries<T extends { emoji: string }>(
  summaries: readonly T[]
): T[] {
  return [...summaries].sort(
    (left, right) =>
      Number(getImReactionCategory(left.emoji) === "emoji") -
      Number(getImReactionCategory(right.emoji) === "emoji")
  );
}

export function getImReactionFailureMessage(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    (error.code === 40946 || error.message === "error.im.reaction_slot_occupied")
  ) {
    return "请先取消已发送的同类回复";
  }

  if (error instanceof ApiClientError && error.status === 429) {
    return "操作过于频繁，请稍后重试";
  }

  return "回复操作失败，请稍后重试";
}
