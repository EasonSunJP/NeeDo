import type { IdentityApplication } from "./api";
import type { MerchantShowcaseForm } from "./formModel";
import type { MerchantPriceRange } from "./merchantPriceRange";

type MerchantApplicationDraft = {
  baseApplication: { id: number; version: number } | null;
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
  clearIfCurrent(accountId: number | null, ownedDraft: MerchantApplicationDraft | undefined) {
    // The captured snapshot reference is its ownership token; later route instances create new snapshots.
    if (accountId !== null && ownedDraft && drafts.get(accountId) === ownedDraft) drafts.delete(accountId);
  }
};
