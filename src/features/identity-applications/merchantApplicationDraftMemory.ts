import type { IdentityApplication } from "./api";
import type { MerchantShowcaseForm } from "./formModel";
import type { MerchantPriceRange } from "./merchantPriceRange";

type MerchantApplicationDraft = {
  application: IdentityApplication | null;
  form: MerchantShowcaseForm;
  priceRange: MerchantPriceRange;
  showcaseImage: File | null;
  selectedKeywordLabels: string[];
};

// Route-stable memory only: applicant details and File objects must never enter browser storage.
const drafts = new Map<number, MerchantApplicationDraft>();

export const merchantApplicationDraftMemory = {
  read(accountId: number | null) {
    return accountId === null ? undefined : drafts.get(accountId);
  },
  retain(accountId: number | null, draft: MerchantApplicationDraft) {
    if (accountId !== null) drafts.set(accountId, draft);
  },
  clear(accountId: number | null) {
    if (accountId !== null) drafts.delete(accountId);
  }
};
