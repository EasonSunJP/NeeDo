import { z } from "zod";

const boundedRequiredString = (max: number) => z.string().trim().min(1).max(max);
const safeDisplayUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/iu.test(value),
    "Contact-card display URLs must be HTTP(S) or root-relative"
  );
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);

const imContactCardV2Schema = z
  .object({
    targetUserPublicId: boundedRequiredString(191),
    needoId: boundedRequiredString(160),
    nickname: boundedRequiredString(160),
    avatarUrl: safeDisplayUrlSchema.nullable(),
    entityKind: z.enum(["customer", "technician", "shop", "service"]),
    ekycVerified: z.boolean(),
    level: z.number().int().min(1).max(100).nullable(),
    bio: z.string().max(500).nullable(),
    tierCode: z.enum(["free", "silver", "gold", "black_diamond"]).nullable(),
    themeVersionPublicId: boundedRequiredString(191).nullable(),
    simpleTopColor: colorSchema.nullable(),
    simpleBottomColor: colorSchema.nullable()
  })
  .strict();

const imContactCardSnapshotV2Schema = z
  .object({
    snapshotVersion: z.literal(2),
    type: z.literal("contact-card"),
    contactCard: imContactCardV2Schema
  })
  .strict();

export type ImContactCardV2 = z.infer<typeof imContactCardV2Schema>;
export type ImContactCardSnapshotV2 = z.infer<typeof imContactCardSnapshotV2Schema>;

export interface LegacyImContactCardSnapshot {
  userId: string;
  displayName: string;
  avatar?: string;
  profileKind: "person" | "technician" | "store" | "service";
  entityType?: "user" | "technician" | "shop";
  entityId?: string;
  userIdLabel?: string;
  headline?: string;
}

export type ParsedContactCardSnapshot =
  | { kind: "v2"; snapshot: ImContactCardSnapshotV2 }
  | { kind: "legacy"; contactCard: LegacyImContactCardSnapshot }
  | { kind: "invalid" };

export function serializeContactCardSnapshotV2(
  contactCard: ImContactCardV2
): ImContactCardSnapshotV2 {
  return imContactCardSnapshotV2Schema.parse({
    snapshotVersion: 2,
    type: "contact-card",
    contactCard
  });
}

export function parseContactCardSnapshot(metadata: unknown): ParsedContactCardSnapshot {
  const v2 = imContactCardSnapshotV2Schema.safeParse(metadata);
  if (v2.success) return { kind: "v2", snapshot: v2.data };

  if (!isRecord(metadata) || metadata.needoMessageType !== "contact-card") {
    return { kind: "invalid" };
  }
  const extension = isRecord(metadata.needoMessageExt) ? metadata.needoMessageExt : null;
  const card = extension && isRecord(extension.contactCard) ? extension.contactCard : null;
  if (!card) return { kind: "invalid" };

  const userId = requiredString(card.userId, 191);
  const displayName = requiredString(card.displayName, 160);
  const profileKind = card.profileKind;
  if (
    !userId ||
    !displayName ||
    (profileKind !== "person" &&
      profileKind !== "technician" &&
      profileKind !== "store" &&
      profileKind !== "service")
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "legacy",
    contactCard: compact({
      userId,
      displayName,
      profileKind,
      avatar: optionalSafeDisplayUrl(card.avatar),
      entityType: optionalEnum(card.entityType, ["user", "technician", "shop"]),
      entityId: optionalString(card.entityId, 191),
      userIdLabel: optionalString(card.userIdLabel, 160),
      headline: optionalString(card.headline, 500)
    }) as unknown as LegacyImContactCardSnapshot
  };
}

function requiredString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : null;
}

function optionalString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function optionalSafeDisplayUrl(value: unknown): string | undefined {
  return typeof value === "string" && safeDisplayUrlSchema.safeParse(value).success
    ? value
    : undefined;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : undefined;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
