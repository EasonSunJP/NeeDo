# Application Flow and Chinese Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete local shop application → manual eKYC → shop-bound technician application and deliver full screenshots and a Chinese PDF.
**Architecture:** Persist manual eKYC applications with encrypted profile snapshots and versioned operator decisions. Reuse existing merchant/technician review services and UI controls, expose them in the requested management sections. Capture actual local pages and document only observed results.
**Tech Stack:** Existing React/TSX/Vite, Express/Prisma/MySQL, Jest/Vitest, Chrome browser skill, ReportLab.

## Global Constraints
- Work only in `.worktrees/merchant-main-runtime`; preserve unrelated changes. User authorizes completing development, pushing to origin/private, and deploying staging; preserve all other worktrees.
- Formal API, Zod, RBAC, audit, encrypted PII, paginated lists. No mock verification or status booleans.
- Only explicit submission starts review; approved verification is written only by an authorized manual decision.
- User excludes housing type, phone/contact, email, bank card, transaction purpose from eKYC.
- eKYC application fields match `src/features/settings/ekycProfileModel.ts`; shared dropdowns and floating buttons; errors below header in red.
- Shop application management under operations shop category; employee application management under merchant employee management.

### Task 1: Manual eKYC backend
Read `.superpowers/sdd/manual-ekyc-backend-brief.md` for exact contract. Write failing service/validator/API tests, implement layered persistence and migration, run targeted tests, build/lint; report without applying migration or committing other files.

### Task 2: Application and reviewer UI
- Add formal API adapter and owner pending/approved/rejected/withdrawal states to EkycProfileForm.
- Add eKYC reviewer page in the independent operations review section, entered through the operator summary review card. Manual approval requires an explicit checked-person confirmation and review note; rejected applications require reason.
- Move/expose merchant application review under shop category and employee review under merchant staff management, guarded by existing permissions.
- Test API failure, preserved input, immutable pending snapshot, resubmit and guarded navigation; then build.

### Task 3: Local workflow acceptance
- Verify listener cwd/ports, migrate locally and verify health.
- Use dedicated local test identities and actual public/formal APIs; merchant draft/save/bank/contract/submit → ops approve → switch merchant; user eKYC submit → ops approve → actual verified state; technician choose approved shop → submit → merchant approve → switch technician.
- Exercise pending reentry, withdrawal, rejection/resubmit and version conflict where practical; fix defects with regression tests.
- Capture every application step plus expanded dropdowns. Use actual UI with clearly labeled QA data.

### Task 4: Tutorial artifact
- Create Chinese PDF covering applicant steps only, screenshots, dropdown selection and troubleshooting. Do not teach operator/store review actions.
- Embed Chinese fonts, render/review every PDF page, ensure no credentials/tokens or real identity documents.
- Deliver PDF and screenshot appendix; accurately state local acceptance and any unresolved boundary.

## Latest execution order (user correction, 2026-09-07)
1. Complete development and necessary regression/build checks.
2. Integrate and push origin/private without force-push.
3. Deploy the exact verified revision to staging.
4. Run complete application acceptance on staging and create the applicant-only Chinese PDF alongside it.
