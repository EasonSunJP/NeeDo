export type ResolvedSearchTag = {
  id: string;
};

export function canRunCategorySearch(input: {
  selectedHomeCategoryIds: readonly string[];
  searchCategoryIds: readonly number[];
  keywords: readonly string[];
}) {
  return input.keywords.length > 0
    || input.selectedHomeCategoryIds.length === 0
    || input.searchCategoryIds.length > 0;
}

export function parseCategorySearchDraft(
  value: string,
  findTag: (value: string) => ResolvedSearchTag | null
) {
  const parts = value
    .trim()
    .split(/[，、,]+/)
    .map((part) => part.replace(/^[＃#]+/, "").trim())
    .filter(Boolean);
  const tagIds: string[] = [];
  const customLabels: string[] = [];

  parts.forEach((part) => {
    const tag = findTag(part);

    if (tag) {
      tagIds.push(tag.id);
    } else {
      customLabels.push(part);
    }
  });

  return {
    tagIds: Array.from(new Set(tagIds)),
    customLabels: Array.from(new Set(customLabels))
  };
}
