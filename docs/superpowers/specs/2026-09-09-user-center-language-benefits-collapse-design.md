# User center language and benefits collapse design

## Goal

Correct the customer information card's language labels and make the membership-benefits card compact by default without changing the formal membership contract.

## Language display

- The formal profile `languages` array remains authoritative; the UI does not invent a language or mutate the database merely by reading it.
- Known locale aliases are normalized for display: for example, `ja` and `日本語` both render as one `日本語` chip, `zh` and `中文` as one `中文` chip, and `en` and `English` as one `English` chip.
- Aliases are compared case-insensitively and after trimming. Unknown non-empty labels remain visible so user data is not silently discarded.
- The same normalized labels initialize the profile editor, preventing the code/name pair from appearing as separate selections. A later explicit save may persist the user's selected canonical labels through the existing formal PATCH flow.

## Membership-benefits interaction

- The card is collapsed after every mount. Its header remains visible and is the expansion control.
- Once the formal benefit payload is ready, the right side reads `<effective count>/<total count>已开启` in Simplified Chinese; the label is localized for all five supported interface languages.
- The enabled count is the number of entries whose server-authoritative `effective` field is `true`. The total is `payload.list.length`.
- Clicking the collapsed card header expands the existing benefit list. Existing effective, unavailable, and disabled row semantics are unchanged.
- The expanded list ends with a plain-text `收起` button. It has no capsule background or bordered container and collapses the list when activated.
- Loading and retryable error states stay visible and do not fabricate counts.

## Accessibility and boundaries

- The header control exposes `aria-expanded` and `aria-controls`; the list has the matching id.
- The bottom collapse action is a semantic button even though it is visually plain text.
- No API, schema, migration, mock, deployment, or staging change is included.

## Verification

- A regression test proves duplicate code/name language aliases render once and edit as one selection.
- Component tests prove the benefits card starts collapsed, shows the effective/total summary, expands on header click, retains honest status rows, and collapses from the plain-text action.
- Focused tests, full frontend tests, lint, and formal build must pass before local merge to `main`.
