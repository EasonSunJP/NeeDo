# Technician Application Queue and Special Tags Design

## Goal

Correct the merchant technician-application queue and align the technician personal-center special tags with the shared public information-card presentation.

## Scope

This is one Step 12/UI consistency micro-step. It changes the default merchant application query, the existing review-list presentation, and the shared technician review-tag view. It does not add a database table, migration, mock, API route, or new business state.

## Application queue behavior

- The unfiltered merchant queue returns `submitted`, `under_review`, `approved`, and `rejected` applications.
- `draft` and `withdrawn` applications are absent from the default queue. An explicit supported status query remains authoritative.
- An empty default result renders the exact copy `暂无申请` through the existing translation system.
- Submitted and under-review cards retain the right-side `>` affordance.
- Approved cards show a green check mark; rejected cards show a red cross.
- The status mark is presentation only. Every visible card remains one clickable button and opens the application detail.
- Search runs over the server-authoritative visible queue and does not reintroduce withdrawn records.

## Shared special-tag behavior

- `TechnicianReviewTagSummaryView` remains the sole renderer for the technician personal center and public technician information card.
- The special-tag group drops its outer framed panel. Each of the four fixed tags also drops its card border, background, pseudo-element sheen, and shadow.
- Each tag renders an icon, a compact count badge at the icon's upper-right, and a small label below the icon.
- Counts and canonical labels remain unchanged and accessible through the existing list/listitem and `aria-label` structure.
- Review-entry selection cards outside the shared profile summary retain their existing framed treatment.
- Profile colors use the existing tone mapping combined with `--client-primary`, `--client-accent`, `--client-warning`, `--client-text`, `--client-muted`, and `--client-bg` so light, dark, and scoped UI themes remain legible.

## Testing

- A repository regression test proves the default Prisma predicate excludes `draft` and `withdrawn` without breaking explicit status queries.
- A rendered review-page test proves the exact empty copy, all three right-side states, and detail opening after approval or rejection.
- Shared profile tests prove both surfaces use the borderless icon/badge/label structure while order-review selection stamps remain framed.
- Run related frontend and backend tests, lint/typecheck, and production builds before and after the local-main merge.

## Safety

- Work only in `codex/technician-application-tag-alignment` until verification and commit are complete.
- Do not use port 5180.
- Do not push, deploy, or change staging/production.
