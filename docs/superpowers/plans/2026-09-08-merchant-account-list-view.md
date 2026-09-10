# Merchant Account List View Implementation Plan

> **For agentic workers:** Execute inline in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card/list display switching to the operations shop list and open a selected shop's merchant admin in a new read-only tab from the detail drawer.

**Architecture:** A focused merchant account collection component owns display mode and group expansion. Its list projection flattens formal group children into shop rows. The page owns preview session creation and browser navigation, while the drawer reports the selected shop ID.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, existing DataTable and merchant preview guard.

## Global Constraints

- Use only existing formal API data and the requested 0% platform commission rule.
- Keep information cards as the default view.
- Preserve the existing SaaS and shop-display drawer tabs.
- Merchant preview stays read-only through existing frontend and backend guards.
- Make no remote, staging or deployment changes.

---

### Task 1: View switch and list projection

**Files:**
- Create: `src/components/admin/MerchantAccountCollection.tsx`
- Create: `src/components/admin/MerchantAccountCollection.test.tsx`
- Modify: `src/pages/admin/MerchantsPage.tsx`

- [x] Write tests that expect information cards by default, switch to a formal shop list, flatten group shops, show the required columns, and open the matching detail row.
- [x] Run the focused test and confirm it fails because the component does not exist.
- [x] Implement the collection component and connect it to `MerchantsPage`.
- [x] Run the focused test and confirm it passes.

### Task 2: Selected-shop read-only merchant preview

**Files:**
- Modify: `src/components/admin/MerchantAccountDetailDrawer.tsx`
- Modify: `src/components/admin/MerchantAccountDetailDrawer.test.tsx`
- Modify: `src/auth/merchantAdminPreview.ts`
- Create: `src/auth/merchantAdminPreview.test.ts`
- Modify: `src/pages/admin/MerchantsPage.tsx`

- [x] Write tests for selecting a group child, emitting its ID from the drawer, and starting the preview with that selected shop.
- [x] Run the tests and confirm the new expectations fail.
- [x] Add the drawer action, optional selected-shop preview selection, and new-tab opening.
- [x] Run the tests and confirm they pass.

### Task 3: Copy and adjacent regression

**Files:**
- Modify: `src/features/merchant-saas-billing/i18n.ts`
- Modify: `src/features/merchant-saas-billing/i18n.test.ts`
- Modify: `src/pages/admin/masterDataPages.test.ts`
- Modify: `docs/shop-detail-drawer-tabs.md`

- [x] Add complete translations for new labels and update the stale merchant people-page assertion to its current formal API architecture.
- [x] Run the focused merchant tests and translation audit.
- [x] Update the local acceptance documentation.

### Task 4: Verification and local integration

**Files:**
- Verify only.

- [x] Run focused tests, TypeScript lint/typecheck, production build, and diff checks.
- [x] Commit the complete batch once.
- [x] Merge the batch into local main and verify the merge contents.
- [x] Remove this completed temporary worktree and branch only after confirming no unmerged changes remain.
