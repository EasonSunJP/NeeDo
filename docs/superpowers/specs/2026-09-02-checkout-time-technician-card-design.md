# Checkout Time Dropdown and Technician Detail Card Design

Date: 2026-09-02  
Status: Approved for implementation

## Context

The formal customer checkout currently renders every available schedule slot from a 21-day response as a long list below the appointment summary. This mixes dates and times, makes the checkout excessively tall, and cannot represent unavailable times because the public availability query and the page both discard blocked, booked, or full slots.

The same checkout also renders a bespoke technician card. Its click target navigates to `/technicians/:id`, but the frontend does not define that route, so the user falls through to the search experience instead of reaching a technician detail page.

## Goals

1. Make the existing time summary card the trigger for a same-day time dropdown.
2. Show formal unavailable slots in the dropdown as visible but disabled options.
3. Remove the cross-day expanded slot list from checkout.
4. Reuse the shared technician simple-card design instead of maintaining checkout-only card markup.
5. Hide follower count, following count, level, and management-only actions in checkout.
6. Route the checkout technician card to a read-only public technician information-card page.
7. Give that page the title `详细信息卡`, a normal back action, and the shared close action in place of settings.
8. Preserve existing booking submission, authentication, and order navigation behavior.

## Non-goals

- Do not add or synthesize time slots that are absent from the formal schedule data.
- Do not change merchant or technician self-profile editing flows.
- Do not expose technician wallet, Test NDP balance, privacy controls, or other self-only fields to customers.
- Do not replace the social profile route for unrelated callers.
- Do not modify the existing `App.tsx` route table for this micro-step.
- Do not add mock, demo, or local-storage booking data.

## Root Causes

### Time list

`FormalCheckoutPage` requests a 21-day window, immediately filters the response to `status === "available"` and positive remaining capacity, stores only those rows, and then maps the entire stored list into visible buttons. The UI therefore loses unavailable rows and displays every remaining date.

### Technician navigation

The checkout technician button navigates to `/technicians/:id`. No frontend route owns that path. The supported user profile route is `/profiles/technician/:id`, but its default view is the social profile. Checkout needs an explicit information-card view without changing the default behavior for other callers.

## Selected Design

### 1. Formal slot data contract

Extend the public availability query with an optional boolean query parameter:

```text
includeUnavailable=true
```

The default remains `false`, preserving all existing consumers. When omitted or false, the repository keeps the current `AVAILABLE` and remaining-capacity predicates. When true, it returns all non-deleted formal schedule slots in the requested service/shop/date scope, including available, booked, blocked, and full rows, while retaining the existing published-service, published-shop, suspension, and date-range protections.

The checkout requests only the selected Tokyo calendar day rather than a 21-day window. The response remains paginated and uses the existing schedule-slot payload; no synthetic time values are created.

### 2. Checkout slot state

Keep the selected Tokyo date independent from `selectedSlotId` so a date can still be displayed when every slot is unavailable.

Derive:

- `sameDaySlots`: every formal slot whose Tokyo date equals the selected date, sorted by start time and stable ID.
- `bookableSameDaySlots`: same-day rows whose status is available and remaining capacity is positive.
- `selectedSlot`: the selected ID only when it is still bookable.

Initial selection rules:

1. Prefer the route's exact `date` and `time` when that slot is bookable.
2. Otherwise select the first bookable slot on the route's date.
3. Never silently jump to a later date.
4. If the selected day has no bookable slot, keep the date visible and leave the booking action disabled.

### 3. Time dropdown interaction

The current time card becomes a button with an expanded-state indicator.

When opened:

- Render a compact dropdown immediately below the two-column time/people row.
- Display time only (`HH:mm`), never repeat the date.
- Mark the selected time with the existing primary green treatment.
- Render booked, blocked, and full options in a muted gray disabled state.
- Prevent disabled options from changing `selectedSlotId`.
- Close after a valid selection, on outside pointer interaction, and on Escape.
- Expose trigger and option state through `aria-expanded`, `aria-controls`, `role="listbox"`, `role="option"`, `aria-selected`, and disabled semantics.

The long cross-day list is removed completely.

### 4. Shared technician simple card

Use the existing shared `SocialProfileMiniCard` visual structure shown in the approved reference. Add general presentation controls to the shared component instead of copying its markup:

- hide social statistics;
- hide level;
- suppress action/share/management controls;
- make all interactive card regions open the same supplied detail callback.

Checkout builds the card data only from `CoreServiceDetail.technician` formal fields:

- avatar;
- display name;
- service rating;
- KYC/identity display;
- city or public address label.

Follower count, following count, level, fabricated acceptance data, and management tags are not rendered. The checkout section retains its `技师` heading. If no technician is assigned, the existing store-assignment empty state remains.

### 5. Technician information-card route

Checkout navigates to:

```text
/profiles/technician/:id?view=card
```

`ProfileDetailPage` recognizes `entityType=technician` with `view=card` and renders a dedicated, read-only formal technician information-card scene. The default `/profiles/technician/:id` behavior remains unchanged for social-profile callers.

The scene:

- loads `GET /api/v1/technicians/:id` through `coreReadApi.getTechnicianDetail`;
- uses `MobileFullscreenHeader` with title `详细信息卡`;
- keeps a normal left back button;
- uses the shared right-side close button, never a settings button;
- returns to the previous checkout history entry when possible, with a safe user-home fallback;
- renders only public formal fields;
- provides loading, not-found, API-error, and retry states;
- does not display bottom navigation over the full-screen detail scene.

The body reuses the existing public technician information-card presentation where its fields are backed by the formal response. Unavailable public fields are omitted or shown as unavailable; they are not invented.

## Error and Empty States

- Availability request failure keeps the existing checkout retry surface.
- A selected day with no schedule rows shows the existing no-slot state.
- A day with schedule rows but no bookable rows shows all rows disabled and keeps confirmation disabled.
- Technician detail API failure stays on the detail page and offers an in-place retry and close action.
- Missing technician data keeps the current `由店铺安排技师` checkout state.

## Compatibility and Isolation

- `includeUnavailable` is opt-in and cannot change existing availability callers.
- The social technician profile remains the default route view.
- No changes are made to technician self-profile editing, merchant staff management, or their currently modified files.
- Booking creation continues to submit the selected formal `scheduleSlotId`; the server remains authoritative for final availability and concurrency conflicts.

## Verification

### Backend

- Validator accepts `includeUnavailable=true|false` and rejects invalid values.
- Default repository query retains current public availability filters.
- Opt-in query returns booked, blocked, and full formal rows while preserving publication, suspension, scope, and time protections.
- API response remains paginated and uses the existing envelope.

### Frontend automated tests

- Checkout requests the selected Tokyo day with `includeUnavailable=true`.
- Dropdown contains only that day's times.
- Unavailable/full options are disabled and cannot be selected.
- Valid selection updates the formal slot ID and closes the dropdown.
- Cross-day long-list markup is absent.
- Technician card contains no followers, following, or level.
- Every technician card click target opens `?view=card` rather than search.
- Detail view loads the formal technician API and has `详细信息卡`, back, and close controls without settings.
- Booking submission and order-detail navigation regressions remain green.

### Browser acceptance on the standard runtime

At the standard local frontend on port 5180 with the formal backend on port 3000:

1. Open checkout from the store's `立即预约` flow.
2. Click the time card and confirm only the selected day's times appear.
3. Confirm unavailable times are visible, gray, and inert.
4. Select another available time and confirm the summary updates.
5. Open the technician card and confirm the routed detail page loads instead of search.
6. Confirm the detail header title and close behavior.
7. Close back to checkout and complete a booking to confirm the selected slot is submitted.
8. Check console errors, failed requests, and horizontal overflow.
