const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

const mediaMimeTypes = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  voice: new Set(["audio/webm", "audio/mp4", "audio/ogg"])
} as const;

export interface ChatRecordSourceMedia {
  fileSize: number;
  mimeType: string;
  url: string;
}

export type ChatRecordSourcePolicy =
  | { kind: "text" }
  | { kind: "media"; media: ChatRecordSourceMedia };

export function parseChatRecordSourcePolicy(
  messageType: string,
  metadata: unknown
): ChatRecordSourcePolicy | null {
  if (messageType !== "text") return null;
  if (metadata === null || metadata === undefined) return { kind: "text" };
  if (!isRecord(metadata)) return null;

  const needoMessageType = metadata.needoMessageType;
  if (needoMessageType === undefined || needoMessageType === "text") {
    return { kind: "text" };
  }
  if (needoMessageType !== "image" && needoMessageType !== "voice") return null;

  const extension = metadata.needoMessageExt;
  if (!isRecord(extension)) return null;
  const { fileSize, mimeType, url } = extension;
  if (
    !Number.isInteger(fileSize) ||
    (fileSize as number) <= 0 ||
    (fileSize as number) > MAX_MEDIA_BYTES ||
    typeof mimeType !== "string" ||
    !mediaMimeTypes[needoMessageType].has(mimeType) ||
    typeof url !== "string" ||
    url.trim().length === 0
  ) {
    return null;
  }
  return {
    kind: "media",
    media: { fileSize: fileSize as number, mimeType, url }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
