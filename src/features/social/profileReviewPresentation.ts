import { serviceReviewSpecialLabelSet } from "../../shared/order-detail/serviceReviewTagCatalog";

function normalizeProfileReviewTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeProfileReviewTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\/,，、]/)
      : [];

  return Array.from(
    new Set(
      rawTags
        .map((tag) => typeof tag === "string" ? normalizeProfileReviewTag(tag) : "")
        .filter(Boolean)
    )
  );
}

export function getCustomerCustomProfileReviewTags(value: unknown) {
  return normalizeProfileReviewTags(value).filter((tag) => !serviceReviewSpecialLabelSet.has(tag));
}
