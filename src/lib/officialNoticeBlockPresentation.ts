import type {
  OfficialNoticeBlockType,
  OfficialNoticeFontSize
} from "../api/officialNotices";

const textBlockTypes = new Set<OfficialNoticeBlockType>([
  "paragraph",
  "heading",
  "subheading",
  "bullet",
  "numbered",
  "quote",
  "callout"
]);

const fontSizeClasses: Record<OfficialNoticeFontSize, string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-lg",
  xlarge: "text-xl"
};

export function isTextualOfficialNoticeBlock(type: OfficialNoticeBlockType) {
  return textBlockTypes.has(type);
}

export function defaultOfficialNoticeFontSize(
  type: OfficialNoticeBlockType
): OfficialNoticeFontSize {
  if (type === "heading") return "xlarge";
  if (type === "subheading") return "large";
  return "medium";
}

export function officialNoticeFontSizeClass(
  type: OfficialNoticeBlockType,
  fontSize?: OfficialNoticeFontSize
) {
  return fontSizeClasses[fontSize ?? defaultOfficialNoticeFontSize(type)];
}
