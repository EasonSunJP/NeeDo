import { parseContactCardSnapshot } from "../domain/im-contact-card";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export const CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES = [
  "text",
  "emoji",
  "image",
  "video",
  "voice",
  "file",
  "location",
  "contact-card",
  "service-card",
  "schedule-invite"
] as const;

export type ChatRecordSnapshotMessageType =
  (typeof CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES)[number];

const mediaMimeTypes = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm"]),
  voice: new Set(["audio/webm", "audio/mp4", "audio/ogg"]),
  file: new Set(["application/pdf"])
} as const;

export interface ChatRecordSourceMedia {
  fileSize: number;
  mimeType: string;
  url: string;
}

export type ChatRecordSnapshotMetadata = {
  snapshotVersion: 1;
  type: ChatRecordSnapshotMessageType;
  display?: Record<string, unknown>;
};

type ContentSnapshotType = Exclude<
  ChatRecordSnapshotMessageType,
  "image" | "video" | "voice" | "file"
>;

export type ChatRecordSourcePolicy =
  | {
      kind: "content";
      messageType: ContentSnapshotType;
      snapshotMetadata: ChatRecordSnapshotMetadata;
    }
  | {
      kind: "media";
      messageType: "image" | "video" | "voice" | "file";
      media: ChatRecordSourceMedia;
      snapshotMetadata: ChatRecordSnapshotMetadata;
    };

export function parseChatRecordSourcePolicy(
  messageType: string,
  metadata: unknown
): ChatRecordSourcePolicy | null {
  if (messageType !== "text") return null;
  if (metadata === null || metadata === undefined) return snapshot("text");
  if (!isRecord(metadata)) return null;

  const parsedContactCard = parseContactCardSnapshot(metadata);
  if (parsedContactCard.kind === "v2") {
    return snapshot("contact-card", {
      contactCard: {
        snapshotVersion: 2,
        ...parsedContactCard.snapshot.contactCard
      }
    });
  }

  const rawType = metadata.needoMessageType;
  if (rawType === undefined || rawType === "text") return snapshot("text");
  if (rawType === "emoji") return snapshot("emoji");
  if (!CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES.includes(rawType as ChatRecordSnapshotMessageType)) {
    return null;
  }

  const extension = metadata.needoMessageExt;
  if (!isRecord(extension)) return null;
  if (rawType === "image" || rawType === "video" || rawType === "voice" || rawType === "file") {
    const media = parseMedia(rawType, extension);
    if (!media) return null;
    return {
      kind: "media",
      messageType: rawType,
      media,
      snapshotMetadata: {
        snapshotVersion: 1,
        type: rawType,
        display: compactRecord({
          caption: optionalString(extension.caption, 2_000),
          duration: optionalPositiveNumber(extension.duration),
          fileName: optionalString(extension.fileName, 255),
          height: optionalPositiveNumber(extension.height),
          width: optionalPositiveNumber(extension.width)
        })
      }
    };
  }
  if (rawType === "location") {
    const location = isRecord(extension.location) ? extension.location : null;
    const title = location && requiredString(location.title, 255);
    const address = location && requiredString(location.address, 500);
    const latitude = location?.latitude;
    const longitude = location?.longitude;
    if (
      !title || !address || typeof latitude !== "number" || !Number.isFinite(latitude) ||
      latitude < -90 || latitude > 90 || typeof longitude !== "number" ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) return null;
    return snapshot(rawType, { location: { title, address, latitude, longitude } });
  }
  if (rawType === "contact-card") {
    if (parsedContactCard.kind !== "legacy") return null;
    return snapshot(rawType, { contactCard: parsedContactCard.contactCard });
  }
  if (rawType === "service-card") {
    const card = isRecord(extension.serviceCard) ? extension.serviceCard : null;
    const serviceId = card && requiredString(card.serviceId, 191);
    const name = card && requiredString(card.name, 255);
    const summary = card && requiredString(card.summary, 2_000, true);
    const priceLabel = card && requiredString(card.priceLabel, 160);
    if (!serviceId || !name || summary === null || !priceLabel) return null;
    return snapshot(rawType, {
      serviceCard: compactRecord({
        serviceId, name, summary, priceLabel,
        cover: optionalSafeDisplayUrl(card?.cover),
        durationLabel: optionalString(card?.durationLabel, 160),
        providerId: optionalString(card?.providerId, 191),
        providerName: optionalString(card?.providerName, 160),
        providerType: optionalEnum(card?.providerType, ["store", "technician"]),
        tags: optionalStringArray(card?.tags, 4, 80)
      })
    });
  }
  if (rawType === "schedule-invite") {
    const invite = isRecord(extension.scheduleInvite) ? extension.scheduleInvite : null;
    const scheduleId = invite && requiredString(invite.scheduleId, 191);
    const title = invite && requiredString(invite.title, 255);
    const date = invite && requiredString(invite.date, 32);
    const timeRange = invite && requiredString(invite.timeRange, 80);
    if (!scheduleId || !title || !date || !timeRange) return null;
    return snapshot(rawType, {
      scheduleInvite: compactRecord({
        scheduleId, title, date, timeRange,
        attendeeLabel: optionalString(invite?.attendeeLabel, 255),
        hostName: optionalString(invite?.hostName, 160),
        location: optionalString(invite?.location, 500),
        note: optionalString(invite?.note, 2_000),
        reminderLabel: optionalString(invite?.reminderLabel, 160),
        statusLabel: optionalString(invite?.statusLabel, 160)
      })
    });
  }
  return null;
}

function snapshot(messageType: ContentSnapshotType, display?: Record<string, unknown>): ChatRecordSourcePolicy {
  return {
    kind: "content",
    messageType,
    snapshotMetadata: { snapshotVersion: 1, type: messageType, ...(display ? { display } : {}) }
  };
}

function parseMedia(
  type: "image" | "video" | "voice" | "file",
  extension: Record<string, unknown>
): ChatRecordSourceMedia | null {
  const { fileSize, mimeType, url } = extension;
  if (
    !Number.isInteger(fileSize) || (fileSize as number) <= 0 ||
    (fileSize as number) > MAX_MEDIA_BYTES || typeof mimeType !== "string" ||
    !mediaMimeTypes[type].has(mimeType) || typeof url !== "string" || url.trim().length === 0
  ) return null;
  return { fileSize: fileSize as number, mimeType, url };
}

function requiredString(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  return allowEmpty || value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function optionalSafeDisplayUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  return /^(?:https?:\/\/|\/)/iu.test(value) ? value : undefined;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : undefined;
}

function optionalStringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.length <= maxLength
  );
  return strings.length === value.length ? strings : undefined;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
