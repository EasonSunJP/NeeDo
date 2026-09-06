# User detail review cards and capsule tabs — local acceptance

Scope: Step 12 read-only review projection and existing detail-card presentation.

- `FormalTabs` groups the detail categories in a single rounded capsule with an inner selected pill, horizontal overflow on narrow screens, and the existing keyboard/ARIA relationships.
- Both existing received-review endpoints retain their RBAC, authenticated merchant shop scope, completed-order restriction, and ten-row pagination. The order projection now includes payment method/state, checkout ledger currency, an explicitly configured other payment label, accepted add-on count/minutes, shop and service duration, and booking notes. Deleted or rejected add-ons are excluded. Missing checkout/ledger data does not invent a currency.
- Cards distinguish NDP from Test NDP, show actual pending/paid/refund-pending/refunded states, split known special tags, ordinary review tags and custom tags, and label review notes and booking notes separately. The historical subjective tag `支付顺利` is omitted from the main card; the underlying review and amendment history are unchanged. Date/time presentation uses Asia/Tokyo. Labels cover zh, zh-Hant, ja, en and ko.
- No new API route, schema, migration, payment mutation or review mutation was introduced. Existing review amendment controls remain permission-gated.

## Evidence

The repository and frontend regression tests were first observed failing on missing payment/add-on facts. Tests also cover offline pending payment, explicit other methods, deleted checkout handling, Test NDP, refund state, tag groups, absent notes and rejection of an invented payment state.

Read-only local MySQL verification of the screenshot's order `ND202609021800398191` returned payment method `ndp`, payment state `confirmed`, ledger currency `TEST_NDP`, one accepted add-on totaling 45 minutes, and the original review comment. The logged-in operations page loaded the same facts. Other existing reviews show cash and Test NDP payments with accepted 60-minute extensions. No test data was created or changed for this verification.

The current local frontend/backend run from `.worktrees/dashboard-remaining-acceptance`. Vite's existing watcher ignores `.worktrees`, so the verified 5180 frontend was restarted to clear stale transformed modules. Operations and merchant API proxies remained healthy. Desktop and 390-pixel viewport checks cover the capsule and card layout. Temporary browser viewport settings are restored after inspection.

## Separate XP finding

Read-only lookup of `u4083532147` found 40,000 fixed-point units, four sign-in entries of 10,000 units each, and stored level 1. The approved conversion is 10,000 units = 1 EXP and level 2 starts at 5 EXP: the correct presentation is **4 EXP / Lv.1**. The current operations presentation incorrectly labels raw units as EXP. Level resolution and experience account writes already use the formal threshold rule. This requested confirmation does not include changing XP display or account data.

## Validation commands

```sh
npx vitest run src/components/admin/FormalProfileDetailPanels.test.tsx src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx src/features/platform-user-management/UserReceivedReviews.test.tsx src/features/platform-user-management/api.test.ts
npm --prefix backend test -- --runTestsByPath tests/backoffice-user-review.repository.test.ts tests/backoffice-user-review.service.test.ts tests/backoffice-user-review-api.test.ts tests/backoffice-user-review-openapi.test.ts tests/user-experience-levels.test.ts tests/user-experience.repository.test.ts
npm run build -- --mode formal
npm --prefix backend run build
```

This task did not commit, push, or deploy. Concurrent local integration may include these shared-worktree edits; the latest local Git status is authoritative. No staging or production acceptance is claimed.

Final focused regression: frontend 4 files / 47 tests passed; backend 6 suites / 17 tests passed. Frontend formal build and backend TypeScript build passed. Targeted backend ESLint and frontend TypeScript checks passed. The Vite build reports existing large-chunk and mixed static/dynamic import warnings. At 390px, the review panel reported clientWidth = scrollWidth = 327px. Desktop keyboard ArrowRight/ArrowLeft selection was verified in the live page.
