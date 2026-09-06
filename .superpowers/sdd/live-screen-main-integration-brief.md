# Live Screen Main Integration Brief

## Goal

Replay only the approved operations live-screen data-foundation commits onto current `main` in the isolated worktree, preserve every newer main capability, and leave a coherent migration/schema/API/test branch ready for local non-production migration acceptance.

## Fixed bases

- Integration base: `0d9f8d7d928802c5a3d7cf6cc6c55def21af081a` (`main` when the worktree was created).
- Source branch: `codex/operations-live-screen` at `3c3bcf8a3b125bbd3ec8246d7cf531347ea9f7ea`.
- Do not merge the whole old source branch: it contains unrelated interleaved commits.

## Commits to replay, in this exact order

1. `d679f0a6` design spec
2. `332e19e7` implementation plans
3. `4aa94c9f`
4. `831f0d24`
5. `33c50bc1`
6. `29e7f416`
7. `132d44e2`
8. `d05927ec`
9. `00831e8e`
10. `c4e746e9`
11. `ee7a39d5`
12. `395df7bd`
13. `744ade77`
14. `152129ea`
15. `18919ec3`
16. `85cd349f`
17. `730ef7c5`
18. `9c4973d3`
19. `bd615736`
20. `eddf710e`
21. `1aa39e76`
22. `f837eada`
23. `207e04c0`
24. `3c3bcf8a`

## Excluded source-branch commits

Do not replay unrelated interleaved commits such as technician work status, admin staffing, or portal session/PWA changes. If an approved live-screen commit truly depends on one, prove the exact symbol/schema dependency and stop for context rather than importing the whole feature.

## Conflict rules

- Resolve each conflict semantically. Preserve current-main behavior and APIs while adding the approved live-screen contract.
- Never choose `ours` or `theirs` for a whole conflicted file without line-by-line evidence.
- Preserve current-main Prisma models, migrations, formal payment availability/settings, membership, notification, Exchange, travel-fare, refund, and identity behavior.
- Preserve live-screen invariants: official JP catalogue, verified service-occurrence region snapshots, safe backfill, regional repository facts, strict cached API, Redis Stream SSE/generation fencing, 16 post-commit order hooks, rollback checker, docs, and i18n audit-loader guardrail.
- Do not edit an already-applied historical migration. The known operating-cost migration repair is already present on current main.
- No mocks/fake data, no push/deploy, no database write/migration during integration.
- New user-facing strings must remain in existing i18n structure.

## Required evidence

1. Record every conflict and its semantic resolution in `.superpowers/sdd/live-screen-main-integration-report.md`.
2. Run `npm run prisma:generate` and Prisma validation.
3. Run the Task 8 14-suite backend acceptance plus Task 7 event/booking/payment/expiry matrix and any current-main tests for conflicted files.
4. Run frontend booking tests, i18n loader guardrail, `npm run i18n:audit`, root/backend lint and builds.
5. Run current-main baseline failure `src/pages/admin/masterDataPages.test.ts` separately and report whether it remains byte-identical/unrelated; do not fix it in this task.
6. Run `git diff --check 0d9f8d7d..HEAD`, verify no unrelated source commit was replayed, and verify tracked worktree cleanliness.
7. Do not squash the 24 approved commits. Conflict resolutions belong in their cherry-picked commits; if integration-only repairs are needed after replay, add one clearly named integration fix commit with failing test first.

## Completion boundary

Implementation integration can be approved independently. Applying migrations to `needo_dev`, running the formal checker, frontend plan B, push, deployment, and production migration are later gates.
