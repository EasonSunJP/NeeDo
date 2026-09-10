import { httpClient } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";

export const CURRENT_MEMBERSHIP_BENEFIT_CODES = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift",
  "traceless_recall"
] as const;

export type CurrentMembershipBenefitCode =
  (typeof CURRENT_MEMBERSHIP_BENEFIT_CODES)[number];

export interface CurrentMembershipBenefitItem {
  code: CurrentMembershipBenefitCode;
  configuredEnabled: boolean;
  globallyEnabled: boolean;
  effective: boolean;
  deliveryCapability: "available" | "unavailable";
  name: string;
  description: string;
}

export interface CurrentMembershipBenefitsPayload {
  tierCode: "free" | "silver" | "gold" | "black_diamond";
  tierVersionPublicId: string;
  expiresAt: string | null;
  list: CurrentMembershipBenefitItem[];
}

const invalid = (): never => {
  throw new TypeError("Invalid current membership benefits response");
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const text = (value: unknown): string => (typeof value === "string" ? value : invalid());
const boolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : invalid();

function decodeItem(value: unknown): CurrentMembershipBenefitItem {
  const raw = record(value);
  const code = text(raw.code);
  const deliveryCapabilityValue = text(raw.deliveryCapability);
  if (!CURRENT_MEMBERSHIP_BENEFIT_CODES.includes(code as CurrentMembershipBenefitCode)) invalid();
  const deliveryCapability =
    deliveryCapabilityValue === "available" || deliveryCapabilityValue === "unavailable"
      ? deliveryCapabilityValue
      : invalid();
  return {
    code: code as CurrentMembershipBenefitCode,
    configuredEnabled: boolean(raw.configuredEnabled),
    globallyEnabled: boolean(raw.globallyEnabled),
    effective: boolean(raw.effective),
    deliveryCapability,
    name: text(raw.name),
    description: text(raw.description)
  };
}

function decodePayload(value: unknown): CurrentMembershipBenefitsPayload {
  const raw = record(value);
  const tierCode = text(raw.tierCode);
  if (!["free", "silver", "gold", "black_diamond"].includes(tierCode)) invalid();
  const list = Array.isArray(raw.list) ? raw.list : invalid();
  return {
    tierCode: tierCode as CurrentMembershipBenefitsPayload["tierCode"],
    tierVersionPublicId: text(raw.tierVersionPublicId),
    expiresAt: raw.expiresAt === null ? null : text(raw.expiresAt),
    list: list.map(decodeItem)
  };
}

export const currentMembershipBenefitsApi = {
  async getMine(language: Language): Promise<CurrentMembershipBenefitsPayload> {
    return decodePayload(
      await httpClient.request<unknown>(
        `/me/membership-benefits?locale=${encodeURIComponent(language)}`
      )
    );
  }
};
