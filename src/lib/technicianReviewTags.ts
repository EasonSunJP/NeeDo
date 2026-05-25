type ComposeTechnicianReviewTagsInput = {
  specialTags: string[];
  fallbackTags: string[];
  customerCustomTags: string[];
  specialLimit?: number;
  totalLimit?: number;
};

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueTags(values: string[]) {
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)));
}

export function composeTechnicianReviewTags({
  specialTags,
  fallbackTags,
  customerCustomTags,
  specialLimit = 4,
  totalLimit = 8
}: ComposeTechnicianReviewTagsInput) {
  const special = uniqueTags([...specialTags, ...fallbackTags]).slice(0, specialLimit);
  const custom = uniqueTags(customerCustomTags).filter((tag) => !special.includes(tag));

  return [...special, ...custom].slice(0, totalLimit);
}
