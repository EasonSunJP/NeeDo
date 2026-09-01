import { httpClient } from "../../api/httpClient";
import type { MembershipCardTheme } from "../../shared/profile-card/platformMembershipTheme";

export type MyExperienceSummary = { level: number; totalExp: string; currentLevelExp: string; nextLevelExp: string; progressBps: number };
export type MyPlatformMembership = { tierCode: "free" | "silver" | "gold" | "black_diamond"; tierVersionPublicId: string; multiplier: number; expiresAt: string | null; ekycVerified: boolean; benefits: Array<{ code: string; configuration: Record<string, unknown> }>; theme: MembershipCardTheme };

const invalid = (): never => { throw new TypeError("Invalid platform membership response"); };
const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const text = (value: unknown) => typeof value === "string" ? value : invalid();
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : invalid();
const boolean = (value: unknown) => typeof value === "boolean" ? value : invalid();
const color = (value: unknown) => { const result = text(value); return /^#[0-9a-f]{6}$/i.test(result) ? result : invalid(); };

export const platformMembershipSelfApi = {
  async getMyExperience(): Promise<MyExperienceSummary> {
    const raw = record(await httpClient.request<unknown>("/me/experience"));
    return { level: number(raw.level), totalExp: text(raw.totalExp), currentLevelExp: text(raw.currentLevelExp), nextLevelExp: text(raw.nextLevelExp), progressBps: number(raw.progressBps) };
  },
  async getMine(): Promise<MyPlatformMembership> {
    const raw = record(await httpClient.request<unknown>("/me/platform-membership"));
    const rawTheme = record(raw.theme);
    const tierCode = text(raw.tierCode);
    if (!["free", "silver", "gold", "black_diamond"].includes(tierCode)) invalid();
    return {
      tierCode: tierCode as MyPlatformMembership["tierCode"], tierVersionPublicId: text(raw.tierVersionPublicId), multiplier: number(raw.multiplier), expiresAt: raw.expiresAt === null ? null : text(raw.expiresAt), ekycVerified: boolean(raw.ekycVerified),
      benefits: Array.isArray(raw.benefits) ? raw.benefits.map((value) => { const benefit = record(value); return { code: text(benefit.code), configuration: record(benefit.configuration) }; }) : invalid(),
      theme: { detailAccentColor: color(rawTheme.detailAccentColor), detailSurfaceColor: color(rawTheme.detailSurfaceColor), detailItemSurfaceColor: color(rawTheme.detailItemSurfaceColor), detailOuterBorderColor: color(rawTheme.detailOuterBorderColor), detailItemBorderColor: color(rawTheme.detailItemBorderColor), detailAvatarBorderColor: color(rawTheme.detailAvatarBorderColor), simpleTopColor: color(rawTheme.simpleTopColor), simpleBottomColor: color(rawTheme.simpleBottomColor) }
    };
  }
};
