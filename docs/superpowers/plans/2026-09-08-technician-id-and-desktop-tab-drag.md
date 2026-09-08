# Technician Public ID And Desktop Tab Drag Implementation Plan

**Goal:** Correct formal technician identifiers and support mouse dragging on the desktop PWA profile tab rail.

**Architecture:** Keep canonical identifier selection in the backoffice repository read boundary, sourcing the existing active `S` public identifier through Prisma. Reuse the shared horizontal drag hook in the common formal tabs component so operations and merchant surfaces receive identical behavior.

**Tech stack:** TypeScript, Prisma/MySQL, Jest, React 19, Vitest/jsdom, Vite.

## Task 1: Lock the technician identifier contract

- Update backend repository fixtures to contain both the `u` account identifier and the `s` technician identity identifier.
- Add assertions that list/detail payloads expose `s` at the profile level and in the technician account view; keep `u` only in persistence.
- Add query-contract assertions requiring the formal technician identity.
- Run the focused tests and confirm they fail before production changes.

## Task 2: Implement canonical technician reads

- Select the active technician identity and active `S` public identifier in list/detail reads.
- Filter formal reads so incomplete/test-residue profiles without a canonical identifier are not exposed.
- Map the top-level profile identifier from that relation without synthesizing or falling back.
- Run focused repository tests and the backend TypeScript build.

## Task 3: Lock and implement desktop mouse drag

- Add a jsdom interaction test that moves `scrollLeft` on mouse pointer drag.
- Assert the post-drag click is suppressed and an ordinary click still selects a tab.
- Wire `FormalTabs` to `useHorizontalDragScroll` and retain accessibility/keyboard behavior.
- Run focused component tests and frontend typecheck/build.

## Task 4: Batch verification and local Git completion

- Run relevant backend and frontend suites, lint/typecheck, and builds.
- Verify the reported technician maps to its stored `s` identifier using the local database only.
- Review the diff, commit the batch once, merge into local `main`, rerun verification, and remove only this task's temporary worktree and branch.
- Do not push, deploy, trigger staging CI/CD, or modify any remote environment.
