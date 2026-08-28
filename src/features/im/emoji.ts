import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";

export const IM_RECENT_EMOJI_LIMIT = 8;
const recentEmojiStorageKey = "needo.im.recent-emojis.v1";

const emojiCatalog = [
  // Smileys and emotion
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
  "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳",
  "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "🥹", "😢", "😭",
  "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🫣",
  "🤭", "🫢", "🫡", "🤫", "🫠", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲",
  "🥱", "😴", "🤤", "😪", "😵", "🤐", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "😈", "👿", "💀", "👻",
  "🤖", "💩", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
  // Gestures and people
  "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
  "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏",
  "💪", "🦾", "🫵", "💅", "🤳", "🙇", "💁", "🙋", "🧏", "🤦", "🤷", "🙆", "🙅", "💆", "💃", "🕺",
  // Hearts and symbols
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "💕", "💞", "💓", "💗", "💖",
  "💘", "💝", "💟", "❣️", "💯", "💢", "💥", "💫", "💦", "💨", "✨", "🌟", "⭐", "🔥", "✅", "❌",
  "⭕", "❗", "❓", "‼️", "⁉️", "➕", "➖", "➗", "✔️", "☑️", "🔔", "🔕", "💬", "💭", "🗨️", "📍",
  // Celebration, objects, food, nature, travel and activity
  "🎉", "🎊", "🎈", "🎁", "🎂", "🏆", "🥇", "🎯", "🎵", "🎶", "📣", "📢", "💡", "📅", "📚", "✏️",
  "📌", "📎", "🔑", "🔒", "🔓", "📱", "💻", "⌚", "📷", "🎥", "☎️", "✉️", "📦", "💰", "💳", "💎",
  "🌹", "🌸", "🌺", "🌻", "🌼", "🌷", "🍀", "🌱", "🌳", "🌈", "☀️", "🌤️", "🌙", "☁️", "☔", "❄️",
  "🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🍒", "🍑", "🥭", "🍍", "🥑", "🍅", "🍜", "🍣", "🍱", "🍙",
  "🍔", "🍕", "🍰", "🍪", "🍫", "🍿", "☕", "🍵", "🥤", "🍺", "🍻", "🥂", "🍷", "🍶", "🥢", "🍽️",
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🏸", "⛳", "🏋️", "🏃", "🚶", "🧘", "🏊", "🚴", "🎮",
  "🚗", "🚕", "🚌", "🚆", "🚅", "✈️", "🚀", "🚲", "🏠", "🏢", "🏥", "🏪", "🗼", "🗻", "🌍", "🧭",
  "🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧"
] as const;

export const IM_COMMON_EMOJIS: readonly string[] = Object.freeze(
  Array.from(new Set<string>(emojiCatalog)),
);

const defaultRecentEmojis = ["😀", "😂", "🥹", "👌", "👍", "🙏", "❤️", "🔥"];
const availableEmojiSet = new Set(IM_COMMON_EMOJIS);

function normalizeRecentEmojis(value: unknown) {
  const candidates = Array.isArray(value) ? value : [];
  const normalized = candidates.filter(
    (emoji): emoji is string => typeof emoji === "string" && availableEmojiSet.has(emoji),
  );

  for (const emoji of [...defaultRecentEmojis, ...IM_COMMON_EMOJIS]) {
    if (!normalized.includes(emoji)) normalized.push(emoji);
    if (normalized.length >= IM_RECENT_EMOJI_LIMIT) break;
  }

  return Array.from(new Set(normalized)).slice(0, IM_RECENT_EMOJI_LIMIT);
}

export function loadRecentImEmojis() {
  return normalizeRecentEmojis(
    parseBrowserStorageJson<unknown>(recentEmojiStorageKey, [], {
      removeOnError: true,
      silent: true,
    }),
  );
}

export function recordRecentImEmoji(recent: readonly string[], emoji: string) {
  if (!availableEmojiSet.has(emoji)) return normalizeRecentEmojis(recent);
  return normalizeRecentEmojis([emoji, ...recent.filter((item) => item !== emoji)]);
}

export function saveRecentImEmojis(recent: readonly string[]) {
  return writeBrowserStorage(
    recentEmojiStorageKey,
    JSON.stringify(normalizeRecentEmojis(recent)),
    { silent: true },
  );
}
