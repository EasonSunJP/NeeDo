import type { ConversationDisappearingCountdown } from "./model";

export type GroupPrivacyCountdownField = "hours" | "minutes";
export type GroupPrivacyCountdownInput = Record<GroupPrivacyCountdownField, string>;

export const GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE = "时间上限最大为99小时59分钟";

export const defaultGroupPrivacyCountdownInput: GroupPrivacyCountdownInput = {
  hours: "",
  minutes: "",
};

export const groupPrivacyCountdownLimits = {
  hours: 99,
  minutes: 59,
} as const;

export const groupPrivacyCountdownLabels = [
  { field: "hours", label: "小时", suffix: "小时" },
  { field: "minutes", label: "分钟", suffix: "分钟" },
] as const;

export function sanitizeCountdownInputValue(_field: GroupPrivacyCountdownField, value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function hasCountdownInputOverflow(input: GroupPrivacyCountdownInput) {
  return Object.entries(groupPrivacyCountdownLimits).some(
    ([field, limit]) => Number(input[field as GroupPrivacyCountdownField] || 0) > limit,
  );
}

export function parseCountdownInput(
  input: GroupPrivacyCountdownInput,
): ConversationDisappearingCountdown {
  return {
    months: 0,
    days: 0,
    hours: Number(input.hours) || 0,
    minutes: Number(input.minutes) || 0,
  };
}

export function createCountdownInput(
  countdown?: Partial<ConversationDisappearingCountdown>,
): GroupPrivacyCountdownInput {
  const totalMinutes =
    Math.max(0, Math.floor(countdown?.months ?? 0)) * 30 * 24 * 60 +
    Math.max(0, Math.floor(countdown?.days ?? 0)) * 24 * 60 +
    Math.max(0, Math.floor(countdown?.hours ?? 0)) * 60 +
    Math.max(0, Math.floor(countdown?.minutes ?? 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours: hours ? String(hours) : "",
    minutes: minutes ? String(minutes) : "",
  };
}

export function hasCountdownValue(countdown: ConversationDisappearingCountdown) {
  return countdown.hours + countdown.minutes > 0;
}

export function formatConversationDisappearingCountdown(
  countdown?: Partial<ConversationDisappearingCountdown>,
) {
  if (!countdown) {
    return "";
  }

  const input = createCountdownInput(countdown);

  return [
    input.hours ? `${input.hours}小时` : "",
    input.minutes ? `${input.minutes}分钟` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
