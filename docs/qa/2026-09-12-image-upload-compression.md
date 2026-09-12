# Image upload compression acceptance — 2026-09-12

## Scope and tested revision

- Feature branch: `codex/image-compression-release-gates`
- Code revision tested before this evidence commit: `777391766b5f4b291d4bdb01f6f7cc0e61264c60`
- Remote actions: none; no push, pull, fetch, PR, deployment, SSH, or remote database write.
- Runtime image processing: local Sharp for tracked assets; originating browser/App for uploads; no TinyPNG or other external processor.

## Static image result and visual quality

- Registered raster files: 289.
- Source size: 86,719,554 bytes.
- Result size: 65,739,485 bytes.
- Saved: 20,980,069 bytes (24.19%).
- 72 PNG files use decoded-pixel-lossless optimization (SSIM 1.0).
- 215 files were retained because they did not meet the minimum safe savings rule.
- Only two JPEGs use accepted lossy output:
  - `public/images/上门维修1.jpg`: SSIM 0.997753.
  - `public/images/家政3.jpg`: SSIM 0.998147.
- Both JPEG pairs were visually compared at native dimensions; no visible contour damage, banding, text damage, color shift, or subject distortion was observed.
- An earlier palette-PNG candidate showed visible gradient banding and was rejected. PNG policy was tightened to decoded-pixel lossless before the final manifest was produced.

## Upload architecture acceptance

- Shared client optimizer covers avatar, IM, Social, carousel, official-notice images, shop presentation, technician service cover, and identity preview.
- Optimizer is worker-first, supports cancellation and explicit failure, strips encoder metadata, preserves Alpha through WebP, and does not upload the original when a public-image quality gate fails.
- Public upload profiles enforce SSIM 0.99 or 0.995 and purpose-specific byte/dimension limits.
- Server validation forces bounded decode and verifies actual MIME, dimensions, decoded pixels, frame count, byte count, and SHA-256 while returning the exact accepted input buffer without re-encoding.
- MediaAsset and IM registration dimensions come from server-verified metadata, not client claims.
- Identity material uses one multipart operation containing the untouched original plus a locally generated preview. The server validates both, compares direction-normalized 256-pixel references at SSIM >= 0.98, and persists both links in one optimistic database transaction.
- Identity originals remain private and authoritative for review/OCR. Ordinary application review evidence resolves to the preview when present; privileged reviewer repositories select originals. Existing rows remain `variant=original` through the additive default.
- No migration was applied to any database in this batch.

## Automated verification

- `npm ci`: passed; lockfile installation reproduced.
- `npm --prefix backend ci`: passed; Prisma Client generation passed.
- Static/staging Node tests: 38 passed.
- `npm run verify:production-images`: passed, 289 files and exact manifest hashes.
- Focused frontend image/identity tests: 109 passed.
- Full frontend with the existing slow-test allowance (`npx vitest run --testTimeout=20000 --maxWorkers=4`): 547 files, 3,650 tests passed.
- `npm run lint`: passed.
- `npm run verify:production-build`: build passed; production bundle audit passed after calibrating the i18n budget to the measured new localized upload-state copy.
- Focused backend public-media suites: 9 suites, 82 tests passed.
- Focused backend identity/schema/repository/OpenAPI suites: 10 suites, 75 tests passed.
- Backend ESLint, production TypeScript build, Prisma Client generation, and `prisma validate`: passed.

## Local runtime evidence away from 5180

- Frontend `5195`: PID 77387, cwd was this feature worktree, `/user.html` returned HTTP 200.
- Backend `3130`: PID 77203, cwd was this feature worktree, `/api/v1/health` and the frontend proxy returned HTTP 200.
- `/api/v1/ready` returned HTTP 503 because local MySQL at `127.0.0.1:3307` was unavailable (`ECONNREFUSED`); no database write or migration was attempted.
- Python Playwright was unavailable and the application browser webview did not attach, so rendered screenshot acceptance was not claimed. Static before/after inspection and automated decoded-pixel/SSIM verification remain the visual evidence for this batch.
- Authenticated upload flows were not manually submitted because no login credentials were entered. API/controller/service/storage behavior is covered by focused tests, including malformed bytes, MIME spoofing, frame/pixel/byte limits, relationship mismatch, optimistic conflict, zero persistence, and compensation deletion.
- Temporary 5195/3130 processes were stopped after checks. Port 5180 and its 3000/3001/3002 runtime were not touched during branch development.

## Known unrelated baseline issues

- Plain `npm test` can exceed the existing 5-second timeout in `ImChatRecordDetailPage.test.tsx` on a heavily loaded machine; the full suite passes with a 20-second test timeout.
- The complete backend 12-shard attempt encountered an existing `finance-center-api.test.ts` fixture missing `ndpCurrency`, plus unrelated 5-second API-test timeouts under load. All media-related suites, backend source build, and full-project TypeScript check passed.
- Dependency installation reports existing audit findings (root: two moderate and two high; backend: one high). Automated `npm audit fix` was not run because it could introduce unrelated or breaking dependency changes.
