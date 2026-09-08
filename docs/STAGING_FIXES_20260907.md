# Staging QA corrections — 2026-09-07

Release branch: `private`, tracking `origin/private` in `EasonSunJP/NeeDo-Private`. Do not push these changes to main. This replaces the former main upload convention for this task.

## Corrections

- Operations settings now render inside the shared AdminLayout and reuse its selected-tab styles for legible labels across themes; membership editors use the operations switch and theme tokens.
- Expanded home search tags render beside the clipped glass header, keeping the dropdown visible and scrollable.
- Manual home service areas survive configuration normalization and reload. Automatic device location no longer replaces an existing manual choice at app startup. This remains a browser/PWA preference, not a cross-device profile field.
- Membership adjustments lock the existing user account, so an operations account without a customer profile can receive an audited adjustment. Existing authorization, optimistic versioning and audit requirements remain enforced.
- The current user's membership card uses the latest published design for its tier. Historical entitlement version, multiplier and expiry remain unchanged.
- Contact-card candidate parsing and send validation support both current `needo` and legacy `u` account IDs. The chooser reuses composer glass styles, 12px side margins and composer width limits. Friendship and message-send authorization remain enforced.
- The chat frame detects actual viewport reduction before applying keyboard dimensions, and recalculates on page restoration/visibility changes. Focus alone no longer leaves a shortened frame after keyboard dismissal. Installed iOS/iPadOS PWA acceptance still requires physical-device verification.
- Operations membership benefit capability labels now read the backend capability service. Traceless recall was already connected; the obsolete frontend catalog incorrectly marked it unavailable. This change does not grant the benefit or weaken sender, membership, recall-window or audit checks.

- System membership group counts and member lists now share the managed-user tier query, including effective audited membership adjustments. This corrects a paid user being shown in the directory while the corresponding system group remained empty.

- Benefit catalog validation checks the fixed set of eight codes without requiring their editable display order to match enum order. This fixes `catalog_invalid` after moving traceless recall earlier in the list. Missing and duplicated codes are still rejected.

## Test-account contact synchronization

Source batch: the previously imported 251 local test accounts. Stable account number/email and identity public identifiers (or a unique type/scope match) map identities to staging IDs; source internal IDs are never copied.

The reviewed plan contained 1,366 active source relations: 466 already present and 900 missing. All 900 additions were committed with individual `staging.contact_graph.import` audit rows. A second plan found zero missing relations. Existing blocked/deleted relationships were preserved. No messages, wallet balances or pending friend requests were imported.

- Snapshot: `snap-0234d67eac58b8952`, completed before apply.
- Apply SSM command: `ee9f8e70-8517-4b48-aa0a-0ccb86848fb2`.
- Source bundle SHA-256: `1e495a4d2b077a453e84edc9c7fc2fbcb296ac5229fb48cc1a4f530782f7c810`.
- Plan SHA-256: `c9301c8b2365bf5248ba5a47c75c1202107dbec76e4989a73ace9da78275b6f1`.
- Pre-write database backup SHA-256: `bac6e35c9ed62929af5c99f35790ee65019245fbef36affb532ace8cd1fd0b84`.
- Backup object: `staging/pre-account-sync/6af029f2a31108724cb703e1fee1a779ff2f8950/contact-sync-20260907.sql.gz` in the existing staging backup bucket; version `g78JfAmcldehEEADPPebAW7E2leEXUOz`.

The planner and staging-only transaction runner are in `backend/scripts/staging-contact-graph*.cjs`. Plan digest and input digest are mandatory; the runner rejects account mismatches or ambiguous identities. The runner is an operational script and is not exposed as an HTTP endpoint. Rollback should use the exact audited created contact IDs after checking subsequent activity; the pre-write backup and volume snapshot are recovery evidence, not instructions to overwrite later data.

## Validation

Focused frontend regression: 144 tests plus 25 membership administration tests passed. Backend capability/recall service and repository regression: 61 tests passed. Contact graph planner: 4 tests passed. Additional membership and contact API suites cover the adjusted contract. Frontend and backend type/build/lint checks are run for the release.

Authenticated local browser checks used a dedicated frontend on 5191 and backend on 3091, both serving this worktree. A saved Ikebukuro service-area selection survived a full reload. The expanded search menu displayed 26 selectable tags without a clipped ancestor. A real mutual-friend conversation loaded three contact cards, including both ID formats; the mobile contact-card panel measured 416px at a 440px viewport. No test messages were sent. Desktop mobile emulation does not count as installed iPhone/iPad PWA acceptance.
