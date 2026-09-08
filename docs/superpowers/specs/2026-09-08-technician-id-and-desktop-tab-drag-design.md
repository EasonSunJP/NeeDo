# Technician Public ID And Desktop Tab Drag Design

## Goal

Ensure technician records shown in operations and merchant profile surfaces use the canonical `s##########` public identifier throughout the technician-facing response and UI. The underlying user's `u##########` primary identifier remains an internal persistence relationship and is not presented as the technician account ID. Make the horizontally overflowing formal profile tab rail draggable with a mouse in an installed desktop PWA without regressing click, touch, or keyboard behavior.

## Current cause

The database already stores an active `S` public identifier on the technician `UserIdentity`, but the backoffice repository maps the profile's top-level `needoId` from `User.needoId`. This exposes the user account identifier (`u`) in a technician-labelled field. The tab rail only enables CSS horizontal overflow; desktop browsers do not turn that into press-and-drag mouse scrolling.

## Backend contract

- `BackofficeTechnicianPayload.needoId` is the active, non-deleted technician identity public identifier whose kind is `S`.
- `BackofficeTechnicianDetailPayload.account.needoId` also uses the canonical `S` identifier in technician context, avoiding two visible IDs for one technician record.
- Technician list and detail reads require an active, non-deleted user and an active technician identity with an active, non-deleted `S` public identifier.
- Never fabricate an `s` identifier by replacing the prefix of a user ID, and never fall back to `u` for a technician-labelled field.
- The stored `User.needoId` remains `U`, and both `U` and `S` identifiers are login-capable under the existing identity model. No schema, migration, seed, or write-path change is required.

## Frontend interaction

`FormalTabs` will reuse the existing `useHorizontalDragScroll` hook. Pointer movement beyond its drag threshold changes `scrollLeft`; a click immediately following a real drag is suppressed. Ordinary clicks continue selecting tabs, touch retains vertical-gesture cancellation, and the existing ARIA tab roles and keyboard navigation remain unchanged.

## Verification

Add repository contract tests for canonical ID selection and formal-read filtering, plus a jsdom interaction test for mouse drag, drag-click suppression, and ordinary click selection. Run focused frontend/backend tests, lint/typecheck, builds, and a read-only local database check of the reported technician.
