import { ApiClientError } from "../../api/httpClient";

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
