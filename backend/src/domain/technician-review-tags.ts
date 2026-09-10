import { unicodeDefaultCaseFoldKey } from "../utils/unicode-default-case-fold";

export const technicianReviewSpecialTags = [
  {
    code: "appeal_max",
    label: "魅力max",
    aliases: ["魅力值", "魅力值MAX", "魅力MAX"]
  },
  {
    code: "service_max",
    label: "服务max",
    aliases: ["服务精神", "服务精神MAX", "服务MAX"]
  },
  {
    code: "emotion_max",
    label: "情绪max",
    aliases: ["情绪价值", "情绪价值MAX", "情绪MAX"]
  },
  {
    code: "energy_max",
    label: "元气max",
    aliases: ["元气", "元气MAX"]
  }
] as const;

export type TechnicianReviewSpecialTag = (typeof technicianReviewSpecialTags)[number];
export type TechnicianReviewSpecialTagCode = TechnicianReviewSpecialTag["code"];

const normalizedTagKey = (label: string): string =>
  unicodeDefaultCaseFoldKey(label.normalize("NFKC").trim());

const aliasMap = new Map<string, TechnicianReviewSpecialTag>(
  technicianReviewSpecialTags.flatMap((tag) =>
    [tag.label, ...tag.aliases].map((label) => [normalizedTagKey(label), tag] as const)
  )
);

export function canonicalizeTechnicianReviewTag(label: string): string {
  const normalized = label.normalize("NFKC").trim();
  return aliasMap.get(normalizedTagKey(normalized))?.label ?? normalized;
}

export function technicianReviewTagKey(label: string): string {
  return unicodeDefaultCaseFoldKey(canonicalizeTechnicianReviewTag(label));
}

export function getTechnicianReviewSpecialTag(label: string): TechnicianReviewSpecialTag | null {
  return aliasMap.get(normalizedTagKey(label)) ?? null;
}

export function isTechnicianReviewSpecialTag(label: string): boolean {
  return getTechnicianReviewSpecialTag(label) !== null;
}
