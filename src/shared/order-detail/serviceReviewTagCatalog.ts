export type ServiceReviewTagKind = "stamp" | "chip";
export type ServiceReviewStampTone = "appeal" | "service" | "empathy" | "energy";

export type ServiceReviewTagOption = {
  label: string;
  count?: number;
  kind?: ServiceReviewTagKind;
  tone?: ServiceReviewStampTone;
};

export type ServiceReviewStampVisual = {
  iconSrc: string;
  tone: ServiceReviewStampTone;
};

export const serviceReviewStampVisuals: ServiceReviewStampVisual[] = [
  {
    iconSrc: "/images/generated/ui/review-stamp-appeal.svg",
    tone: "appeal"
  },
  {
    iconSrc: "/images/generated/ui/review-stamp-service.svg",
    tone: "service"
  },
  {
    iconSrc: "/images/generated/ui/review-stamp-empathy.svg",
    tone: "empathy"
  },
  {
    iconSrc: "/images/generated/ui/review-stamp-energy.svg",
    tone: "energy"
  }
];

export const serviceReviewSpecialTags: Required<Pick<ServiceReviewTagOption, "label" | "count" | "kind" | "tone">>[] = [
  { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
  { label: "服务max", count: 0, kind: "stamp", tone: "service" },
  { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
  { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
];

export const serviceReviewSpecialTagAliases = [
  "魅力值",
  "魅力值MAX",
  "魅力MAX",
  "服务精神",
  "服务精神MAX",
  "服务MAX",
  "情绪价值",
  "情绪价值MAX",
  "情绪MAX",
  "元气",
  "元气MAX"
] as const;

export const serviceReviewSpecialLabelSet = new Set([
  ...serviceReviewSpecialTags.map((tag) => tag.label),
  ...serviceReviewSpecialTagAliases
]);

export function getServiceReviewStampVisual(tag: Pick<ServiceReviewTagOption, "tone">, index: number) {
  return serviceReviewStampVisuals.find((visual) => visual.tone === tag.tone) ?? serviceReviewStampVisuals[index % serviceReviewStampVisuals.length]!;
}

export function splitMaxReviewStampLabel(label: string) {
  const markerMatch = label.match(/max$/i);

  if (!markerMatch || markerMatch.index === undefined || markerMatch.index === 0) {
    return {
      title: label,
      marker: ""
    };
  }

  return {
    title: label.slice(0, markerMatch.index),
    marker: "max"
  };
}
