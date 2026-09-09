# Service Detail Reviews Design

## Goal

Make the service detail page show only persisted reviews that belong to the selected published service, using the requested reviewer-and-bubble layout, while removing the page-local dark edge masks.

## Scope

- Keep the existing React, TypeScript, Vite, Express, Prisma, and MySQL architecture.
- Add a public paginated read endpoint at `GET /api/v1/services/:id/reviews`.
- Query customer-authored technician reviews whose completed booking references the selected service.
- Apply the newest non-deleted operations amendment to public rating, comment, and tags.
- Return only public reviewer identity fields: display name and avatar URL.
- Return active review media from `MediaAsset` records whose `entityType` is `order_review` and whose `entityId` is the review ID.
- Do not add mock reviews, static review counts, fabricated images, or a new upload workflow.
- Do not change the review-writing schema in this micro-step.

## Public Contract

Each review contains `id`, `title`, `comment`, `rating`, `createdAt`, `reviewer`, and `mediaAssets`. The title is the first effective persisted tag; if no tag exists, the API returns `null` and the client uses its localized generic review heading. The endpoint returns the standard `{ list, total, page, page_size }` envelope and accepts validated `page` and `pageSize` query parameters.

The endpoint resolves numeric service IDs and public service UUIDs. A missing or unpublished service returns the existing `error.service.not_found` response instead of revealing review data.

## UI

The summary badge uses the review endpoint's `total`, never `usageCount`. Every returned row renders:

1. Reviewer avatar on the left.
2. Reviewer display name with the review date directly below it.
3. A speech bubble containing a bold title, body text, and any returned images.
4. The rating at the bubble's lower-left corner.

Loading, failure, and empty states stay inside the review section. The page removes its bottom `ClientEdgeMask` and removes only this page's dark glass fill from the fullscreen header; the shared header component and other pages remain unchanged.

## Verification

- Repository tests prove service scoping, completed-order scoping, soft-delete filtering, amendment precedence, media filtering, ordering, and pagination.
- API tests prove validation, UUID resolution, public projection, and 404 behavior.
- Frontend tests prove the API call, real total usage, requested card structure, no `service.sales` review badge, and no page-local edge mask.
- Run frontend tests, backend tests, lint/typecheck, builds, and mobile browser acceptance on an unused non-5180 port.

