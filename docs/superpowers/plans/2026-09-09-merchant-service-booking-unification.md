# Merchant Service And Booking Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make merchant service cards, service-detail headers, and booking-detail presentation reuse the same approved user-side visual system while retaining merchant-only contact and cancellation behavior.

**Architecture:** Keep formal API ownership unchanged. Consolidate reusable presentation in shared components, make merchant pages delegate to those components, and keep route components responsible only for formal loading, navigation, and mutations.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Tailwind utility classes, Vitest, jsdom.

## Global Constraints

- Work only on `temp/merchant-service-booking-unification` in the dedicated local worktree.
- Do not merge main, push, deploy, or mutate any remote environment.
- Do not add mock data, fake APIs, hard-coded business metrics, TODO, FIXME, or placeholder behavior.
- Use one final batch commit after all implementation and verification.
- Keep user-facing copy in the existing five-language translation catalog.

---

### Task 1: One Service Card Design

**Files:**
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Test: `src/pages/mobile/MerchantPortalPage.test.tsx`

**Interfaces:**
- Consumes: `UnifiedServiceInfoCardData` and `buildOrderServiceMiniCardData(order)`.
- Produces: one shared service-card DOM rooted at `data-testid="unified-service-info-card"`.

- [x] **Step 1: Write failing tests** asserting the merchant dashboard/order list render direct `UnifiedServiceInfoCard` instances without the extra appointment shell or separate details CTA.
- [x] **Step 2: Run** `npx vitest run src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/pages/mobile/MerchantPortalPage.test.tsx` and confirm the new assertions fail for the current duplicate design.
- [x] **Step 3: Replace** merchant `OrderServiceMiniCard` wrappers with direct `UnifiedServiceInfoCard` delegation using the persisted order snapshot builder while retaining the shared card's formal public facts.
- [x] **Step 4: Re-run the two tests** and confirm zero failures.

### Task 2: Shared Glass Service Detail Header

**Files:**
- Modify: `src/pages/user/ServiceDetailPage.tsx`
- Modify: `src/pages/user/ServiceDetailPage.test.ts`

**Interfaces:**
- Consumes: `MobileFullscreenHeader`, `AppIcon`, and `floatingHeaderControlButtonClassName`.
- Produces: action order `收藏 -> 转发 -> 关闭`, with shared back control on the left.

- [x] **Step 1: Write a failing source-contract test** requiring `MobileFullscreenHeader`, `onClose`, heart/share actions, and absence of like/star/translate action definitions.
- [x] **Step 2: Run** `npx vitest run src/pages/user/ServiceDetailPage.test.ts` and confirm the header contract fails.
- [x] **Step 3: Replace** the page-local absolute header layers with one `MobileFullscreenHeader`; keep local favorite/share UI state and remove duplicate action concepts.
- [x] **Step 4: Re-run the service-detail test** and confirm zero failures.

### Task 3: Shared Dangerous Confirmation Window

**Files:**
- Create: `src/components/ui/DangerConfirmDialog.tsx`
- Create: `src/components/ui/DangerConfirmDialog.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `DangerConfirmDialog({ open, title, description, confirmLabel, pending, error, onCancel, onConfirm })`.
- Consumes: `ClientActionDialog`, `useI18n`, and `translateText`.

- [x] **Step 1: Write a failing render test** for red semantics, accessible dialog, translated labels, disabled pending controls, and inline error retention.
- [x] **Step 2: Run** `npx vitest run src/components/ui/DangerConfirmDialog.test.tsx` and confirm failure because the component does not exist.
- [x] **Step 3: Implement** the shared dialog with existing client theme surfaces and red danger controls; add complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean copy entries.
- [x] **Step 4: Re-run the dialog test** and confirm zero failures.

### Task 4: User-Consistent Merchant Booking Detail

**Files:**
- Create: `src/shared/order-detail/OrderDetailSections.tsx`
- Create: `src/shared/order-detail/OrderDetailSections.test.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.formal.test.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.test.tsx`

**Interfaces:**
- Produces: `OrderDetailSection` and `OrderDetailFactGrid` used by both user and merchant detail pages.
- Consumes: `PageScaffold`, `AppTopBar`, `OrderDynamicStatusCard`, `DangerConfirmDialog`, `bookingApi.cancelOrder`, `getMerchantCustomerConversationId`, and `getMerchantTechnicianConversationId`.

- [x] **Step 1: Write failing tests** for shared page scaffolding, shared sections, title `预约详情`, red header cancellation before close, no service verification code, two bottom contacts, Exchange guard, danger copy, successful cancellation state adoption, and failed cancellation error retention.
- [x] **Step 2: Run** `npx vitest run src/shared/order-detail/OrderDetailSections.test.tsx src/pages/mobile/MerchantOrderRoutePages.test.tsx src/pages/mobile/MerchantOrderRoutePages.formal.test.tsx` and confirm failures match the missing behavior.
- [x] **Step 3: Extract** the user detail section/fact visuals into `OrderDetailSections.tsx` and update the user page without changing its data or actions.
- [x] **Step 4: Reshape** formal merchant details onto `PageScaffold` and `AppTopBar`, reuse the shared status/service/profile/fact/timeline components, render merchant contacts only, and keep service verification absent.
- [x] **Step 5: Wire** the top danger action to the shared dialog and existing formal cancel API. Apply only the returned server order, block duplicate submits, and show mapped failures inside the dialog.
- [x] **Step 6: Re-run the task tests** and confirm zero failures.

### Task 5: Final Local Verification And Commit

**Files:**
- Verify all modified files and documentation.

**Interfaces:**
- Produces: a clean local temp branch with one final commit and no remote changes.

- [x] **Step 1: Run targeted tests** for every changed component and page.
- [x] **Step 2: Run** `npm run lint`, the complete Vitest-compatible suite, and `npm run build`; distinguish the two pre-existing Node-runner file discovery failures from regressions.
- [x] **Step 3: Start the local frontend** and verify listener PID/cwd/branch. Route-level jsdom tests verified the authenticated page structure and dialog interactions; the in-app browser correctly enforced login but its local login attempt returned the existing generic service-unavailable state, so authenticated visual acceptance remains explicitly separate.
- [x] **Step 4: Review** `git diff --check`, `git diff --stat`, tracked/untracked files, branch name, main revision, and absence of remote actions.
- [x] **Step 5: Commit once** with `fix(merchant): unify service and booking details`, leaving the worktree and temp branch intact.

## Plan Self-Review

Every product requirement maps to a task. Component names and route/API interfaces are consistent, and the plan contains no unspecified implementation or business data.
