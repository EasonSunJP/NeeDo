# Unified Calendar Multi-participant V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the formal participant-selection and multi-participant calendar confirmation flow inside the existing `UnifiedUserCalendar` without creating a second calendar renderer or a second draft state.

**Architecture:** Keep `UnifiedUserCalendar` as the owner of one `CalendarEditorDraft`. Add a focused participant workflow component that reads and writes that draft, renders the existing day timeline in controlled multi-lane mode, and consumes a privacy-safe busy-range API. The backend authorizes every requested participant through active contact relationships and returns only time occupancy for other identities.

**Tech Stack:** React 19, TypeScript strict mode, Vitest/jsdom, Express, Zod, Prisma, Jest/Supertest, existing NeeDo calendar and glass-surface components.

## Global Constraints

- Work only on local branch `codex/unified-calendar-multi-participant-v2`.
- Do not use, stop, restart, or modify port 5180.
- Do not push, create a PR, deploy, or modify staging/production.
- Reuse `UnifiedUserCalendar`, `DayTimeline`, and `ScheduleDraftRangeBlock`; do not add a second timeline or calendar system.
- Availability is a non-blocking visual range rendered as one continuous narrow strip at the left edge of each technician lane. Adjacent/overlapping hourly rows are merged; only occupied events participate in participant conflict warnings.
- Conflict warnings never block completing participant selection or saving the event.
- Other participants' event titles, locations, notes, prices, customers, and services must not leave the backend.
- Visible copy must use the existing five-language i18n system.

---

### Task 1: Privacy-safe participant busy projection

**Files:**
- Create: `backend/src/domain/calendar-participant-availability.ts`
- Test: `backend/tests/calendar-participant-availability.test.ts`

**Interfaces:**
- Produces: `CalendarParticipantBusyRange`, `rangesOverlap(candidate, busy)`, and `projectParticipantBusyRanges(rows)`.
- Projection contains only `participantIdentityId`, `startsAt`, `endsAt`, and `status: "locked"`.

- [x] **Step 1: Write the failing domain tests**

Cover strict overlap (`candidateStart < existingEnd && candidateEnd > existingStart`), adjacent ranges, participant grouping, and the absence of private event fields in the projection.

- [x] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runInBand tests/calendar-participant-availability.test.ts`

Expected: FAIL because the domain module does not exist.

- [x] **Step 3: Implement the minimal pure domain module**

Return immutable time-only ranges and reject invalid or zero-duration source intervals.

- [x] **Step 4: Verify GREEN**

Run the same focused Jest command and expect all tests to pass.

### Task 2: Authenticated participant busy-range API

**Files:**
- Modify: `backend/src/repositories/calendar-event.repository.ts`
- Modify: `backend/src/services/calendar-event.service.ts`
- Modify: `backend/src/controllers/calendar-event.controller.ts`
- Modify: `backend/src/routes/calendar-event.routes.ts`
- Modify: `backend/src/validators/calendar-event.validator.ts`
- Modify: `backend/src/api/calendar-event.openapi.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/calendar-event.service.test.ts`
- Modify: `backend/tests/calendar-event-api.test.ts`
- Modify: `src/features/scheduling/calendar-event-api.ts`
- Modify: `src/features/scheduling/calendar-event-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/calendar-events/participant-busy?from=<ISO>&to=<ISO>&participant_identity_ids=1,2`.
- Response: paginated formal envelope containing time-only `CalendarParticipantBusyRange` rows for a maximum 24-hour query window.
- Authorization: every requested identity must be an active, unblocked, non-deleted contact of the current personal identity; unknown or unauthorized identities return the normal 403 envelope.

- [x] **Step 1: Add failing validator/service/API/OpenAPI tests**

Cover unique positive IDs, maximum 20 participants, invalid range, contact authorization, redacted response keys, authentication, permission middleware, and route ordering before `/:id`.

- [x] **Step 2: Verify RED**

Run the focused backend tests and confirm missing route/repository behavior is the failure.

- [x] **Step 3: Implement repository, service, controller, route, and OpenAPI contract**

Query overlapping non-deleted `CalendarEvent` rows plus confirmed/in-service `BookingOrder` occupancy belonging to authorized participant users/technicians. Do not return source event IDs or private payload columns.

- [x] **Step 4: Add and verify the frontend API adapter**

Parse exact response keys and invalidate no mutation caches because the endpoint is read-only.

- [x] **Step 5: Verify GREEN**

Run focused backend and frontend adapter tests until they pass.

### Task 3: Contact selection and single draft state

**Files:**
- Create: `src/components/scheduling/CalendarParticipantFlow.tsx`
- Create: `src/components/scheduling/CalendarParticipantFlow.test.tsx`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`

**Interfaces:**
- Consumes: `CalendarEditorDraft.syncContactIds`, `startTime`, `endTime`, contact identities, and `calendarEventApi.listParticipantBusy`.
- Produces: one completed draft update or one cancellation update that clears the staged participants without saving an event.

- [x] **Step 1: Add failing mapping and component tests**

Cover `contactIdentityId` preservation, common/tag/group filtering over real contacts, search, disabled Next, required-contact alert, cancel behavior, complete behavior, and no direct create call.

- [x] **Step 2: Verify RED**

Run the focused Vitest files and confirm the missing workflow is the cause.

- [x] **Step 3: Implement the contact-selection page**

Use one glass header containing Back, search, Close, and Common/Tags/Groups tabs. Render real contacts with checkbox, avatar, name, and short metadata; keep bottom Cancel/Next actions distinct from the calendar step.

- [x] **Step 4: Wire the editor to open the participant flow**

Remove the embedded participant list from `CalendarEventEditorPage`. Keep `editorDraft` in `UnifiedUserCalendar`; the child receives the draft and emits complete/cancel updates only.

- [x] **Step 5: Verify GREEN**

Run focused mapping, workflow, and existing unified-calendar tests.

### Task 4: Controlled multi-lane confirmation on the shared timeline

**Files:**
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/components/scheduling/ScheduleDraftRangeBlock.tsx`
- Modify: `src/components/scheduling/CalendarParticipantFlow.tsx`
- Modify: `src/components/scheduling/CalendarParticipantFlow.test.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.formal.test.tsx`

**Interfaces:**
- Extends `DayTimeline` with an optional controlled draft range, `spanAllLanes`, live range callback, conflict-lane IDs, and custom action label.
- The participant flow maps current user plus selected identities to `UnifiedCalendarLane[]` and time-only API rows to `visibility: "busy_redacted"` events titled `已锁定`.

- [x] **Step 1: Add failing shared-timeline tests**

Cover one cross-lane selection block, top/bottom handles, 15-minute snapping, live conflict recomputation, per-lane red indication, non-blocking completion, privacy redaction, and time synchronization back to the editor.

- [x] **Step 2: Verify RED**

Run the focused component tests and confirm the controlled mode is absent.

- [x] **Step 3: Implement controlled draft-range support in `DayTimeline`**

Preserve existing uncontrolled create behavior. In controlled mode, span all participant lanes, update the same start/end values during move/resize, and show red warning state without disabling the action.

- [x] **Step 4: Implement the multi-participant confirmation page**

Render current user and selected contacts as lane headers, fetch busy ranges for the active draft date, show time-only locked blocks, and use Cancel/Complete Selection footer actions.

- [x] **Step 5: Verify GREEN and regressions**

Run focused and full Vitest suites, focused backend calendar tests, `npm run lint`, formal production build, backend build/lint, then authenticated browser acceptance on available non-5180 ports. Record unrelated baseline gates separately.

### Task 5: Local integration and cleanup

**Files:**
- Modify: `docs/order-state-machine.md`
- Modify: this plan to mark completed checkboxes.

- [x] **Step 1: Document the API, privacy boundary, and acceptance evidence**

- [x] **Step 2: Scan changed code for forbidden placeholders and new mock/fake paths**

Run: `rg -n "TODO|FIXME|not implemented|mock|fake" <changed-files>` and inspect matches in context.

- [x] **Step 3: Commit the completed batch**

Commit only the files owned by this branch with a scoped message.

- [x] **Step 4: Merge into local main without changing the 5180 runtime checkout**

Temporarily detach the 5180 worktree only if its source tree is clean apart from ignored/untracked dependencies, create a separate integration worktree for `main`, merge and verify there, then remove only the integration worktree and merged feature branch. Reattach the untouched 5180 worktree to the already-merged `main` ref only if doing so changes no tracked file.

- [x] **Step 5: Re-run final verification on local main and audit all worktrees**

Confirm `main` contains the merge, no owned changes are uncommitted, no remote mutation occurred, and port 5180 was never queried, killed, restarted, or reconfigured.
