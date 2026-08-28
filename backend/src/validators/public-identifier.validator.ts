import { z } from "zod";

export const identifierNumberPartSchema = z.string().regex(/^\d{10}$/);

const identifierKindByPrefix = {
  needo: "NEEDO",
  owner: "OWNER",
  shop: "SHOP",
  cs: "CUSTOMER_SUPPORT",
  u: "U",
  s: "S",
  b: "B",
  o: "O"
} as const;

export type PublicIdentifierKind =
  (typeof identifierKindByPrefix)[keyof typeof identifierKindByPrefix];

export interface ParsedPublicIdentifier {
  publicId: string;
  kind: PublicIdentifierKind;
  numberPart: string;
}

export const publicIdentifierSchema = z
  .string()
  .regex(/^(?:needo|owner|shop|cs|u|s|b|o)\d{10}$/)
  .transform((publicId): ParsedPublicIdentifier => {
    const prefix = Object.keys(identifierKindByPrefix).find((candidate) =>
      publicId.startsWith(candidate)
    ) as keyof typeof identifierKindByPrefix;

    return {
      publicId,
      kind: identifierKindByPrefix[prefix],
      numberPart: publicId.slice(prefix.length)
    };
  });
