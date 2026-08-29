export const MESSAGE_JUDGEMENT_REACTIONS = [
  "OK",
  "NO",
  "Pending",
  "+1",
  "Done",
  "Cool",
  "Good",
  "Thanks"
] as const;

export type MessageReactionCategory = "judgement" | "emoji";

const judgementReactionSet = new Set<string>(MESSAGE_JUDGEMENT_REACTIONS);

export function getMessageReactionCategory(value: string): MessageReactionCategory {
  return judgementReactionSet.has(value) ? "judgement" : "emoji";
}

export function compareMessageReactionCategories(left: string, right: string): number {
  return (
    Number(getMessageReactionCategory(left) === "emoji") -
    Number(getMessageReactionCategory(right) === "emoji")
  );
}
