# Technician Service Card Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved reference-style service card to technician profile information without changing image-upload behavior or unrelated service cards.

**Architecture:** Extend the shared card with an explicit `showcase` presentation variant while retaining the current default branch. Opt technician profile rendering into the variant; keep service data and upload persistence contracts unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, React DOM server rendering

## Global Constraints

- Local development only on `codex/technician-service-card-visual`.
- No crop tool for service-cover uploads.
- No API, database, migration, remote, staging, or production changes.
- Use only persisted/mapped service fields; no mock or static business facts.

---

### Task 1: Lock the showcase card contract

**Files:**
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`

**Interfaces:**
- Consumes: `UnifiedServiceInfoCardData`
- Produces: `variant?: "default" | "showcase"`

- [ ] Add a server-rendered test that requests `variant="showcase"` and asserts the title band, overlapping cover, factual metadata, and upper-right action overlay.
- [ ] Run `npm test -- --run src/shared/service-card/UnifiedServiceInfoCard.test.tsx` and confirm the new test fails because the variant is not implemented.
- [ ] Implement a focused showcase rendering branch while leaving `variant="default"` behavior unchanged.
- [ ] Run the same test and confirm every assertion passes.

### Task 2: Adopt the card on technician profiles

**Files:**
- Modify: `src/shared/technician-profile/TechnicianProfileInfoView.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/shared/service-card/service-card-usage.test.ts`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`

**Interfaces:**
- Consumes: `UnifiedServiceInfoCard variant="showcase"`
- Produces: reference-style cards in public and self technician information surfaces

- [ ] Add source-contract tests requiring `variant="showcase"` at both technician profile render sites.
- [ ] Run the targeted tests and confirm they fail before the render sites opt in.
- [ ] Pass the showcase variant at those two render sites.
- [ ] Run the targeted tests and confirm they pass.

### Task 3: Verify direct upload and local integration

**Files:**
- Verify: `src/features/pricing-mode/TechnicianServiceCoverField.test.tsx`
- Verify: `src/features/pricing-mode/api.test.ts`

**Interfaces:**
- Consumes: selected original `File`
- Produces: existing cover upload request and persisted URL projection

- [ ] Run the cover-field and pricing API suites to prove direct file pass-through, validation, and URL persistence remain intact.
- [ ] Run all affected service-card/profile suites.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Commit the implementation, merge it into local `main`, rerun the same verification on merged `main`, then safely remove only this feature worktree and branch.
