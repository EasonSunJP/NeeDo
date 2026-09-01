export type MembershipCardTheme = {
  detailAccentColor: string;
  detailSurfaceColor: string;
  detailItemSurfaceColor: string;
  detailOuterBorderColor: string;
  detailItemBorderColor: string;
  detailAvatarBorderColor: string;
  simpleTopColor: string;
  simpleBottomColor: string;
};

const hexPattern = /^#[0-9a-f]{6}$/i;
const rgb = (value: string) => {
  if (!hexPattern.test(value)) return null;
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
};
const luminance = (value: string) => {
  const values = rgb(value);
  if (!values) return null;
  const linear = values.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

export function getMembershipThemeContrast(first: string, second: string) {
  const left = luminance(first);
  const right = luminance(second);
  if (left === null || right === null) return 0;
  const [lighter, darker] = [left, right].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolveReadableTextColor(background: string) {
  return getMembershipThemeContrast(background, "#FFFFFF") >= getMembershipThemeContrast(background, "#08110A") ? "#FFFFFF" : "#08110A";
}

export function resolveMembershipTheme(theme: MembershipCardTheme) {
  return {
    ...theme,
    detailTextColor: resolveReadableTextColor(theme.detailSurfaceColor),
    detailItemTextColor: resolveReadableTextColor(theme.detailItemSurfaceColor),
    detailAccentTextColor: resolveReadableTextColor(theme.detailAccentColor),
    simpleTopTextColor: resolveReadableTextColor(theme.simpleTopColor),
    simpleBottomTextColor: resolveReadableTextColor(theme.simpleBottomColor)
  };
}

export function isAccessibleMembershipTheme(theme: MembershipCardTheme) {
  return Object.values(theme).every((value) => hexPattern.test(value)) && getMembershipThemeContrast(theme.detailAccentColor, theme.detailSurfaceColor) >= 3;
}
