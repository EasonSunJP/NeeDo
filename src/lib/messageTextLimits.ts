export const messageTextLimits = {
  maxBytes: 10_000,
  maxCharacters: 5_000
};

function measureUtf8Bytes(value: string) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  return Array.from(value).reduce((total, char) => {
    const encoded = encodeURIComponent(char);
    return total + encoded.replace(/%[0-9A-F]{2}/g, "x").length;
  }, 0);
}

export function clampMessageText(value: string) {
  let bytes = 0;
  let characters = 0;
  let nextValue = "";

  for (const char of Array.from(value)) {
    const nextBytes = measureUtf8Bytes(char);

    if (characters + 1 > messageTextLimits.maxCharacters || bytes + nextBytes > messageTextLimits.maxBytes) {
      break;
    }

    bytes += nextBytes;
    characters += 1;
    nextValue += char;
  }

  return nextValue;
}
