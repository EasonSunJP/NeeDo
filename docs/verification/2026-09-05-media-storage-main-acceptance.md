# Media storage recovery — local main acceptance

Date: 2026-09-05 JST

## Outcome and scope

- Implementation commit: `ac3c11c7`. Local main activation: `0d3e8fd3`, preserving the concurrent dashboard commits through `f65eea38`.
- User approved local-main integration and local service restart. No remote push, deployment, seed or database migration was performed. No message/post content or metadata was manually rewritten. Normal authenticated UI read/view bookkeeping remains application-owned.
- Fixed worktree-relative media storage and native broken-media fallback UI. Ordinary-media expiry projection and encrypted opened-media caching remain the separately approved follow-up; no sender metadata, HTTP 404 or message age is interpreted as expiry.

## Runtime ownership

- Formal checkout: `/Users/eason/Documents/New project/.worktrees/main-agent-admin-integration`, branch `main`.
- Existing formal launcher was gracefully stopped and restarted with the existing `.env.dev` through `npm run dev:formal` in detached screen `needo-main-media-20260905`.
- Startup logs confirm shared absolute directories `/Users/eason/Documents/New project/backend/runtime/im-media` and `/Users/eason/Documents/New project/backend/runtime/content-media`.
- Standard frontend: 5180; client/operations/merchant APIs: 3000/3001/3002. Readiness returned HTTP 200 with healthy MySQL and Redis for all three APIs.
- Initial accepted listener PIDs were 29980/29983/29981/29982 respectively. A concurrent notification integration later advanced main to `77c848af` and watcher-restarted API children as 31096/31094/31095, preserving the shared media environment. PIDs are evidence snapshots, not reusable restart targets.
- This task's temporary 5184/57244 acceptance services were stopped after standard-port acceptance. Standard services remain running.

## Original records and file delivery

- Conversation 2571, voice 10802: 233436 bytes, rounded message label 15 seconds.
- Conversation 2571, image 10803: 114297 bytes, 1024 x 1024.
- Social post 64774: image sizes 114297 and 108950 bytes; both 1024 x 1024.
- Before activation, the original IM image returned 404 at the standard client API despite healthy readiness. After activation, all four files returned 200 from all three APIs and the frontend proxy; response SHA-256 matched the unchanged original bytes.
- Static responses carry `Cross-Origin-Resource-Policy: cross-origin`, allowing the existing absolute localhost media URLs to display in the frontend. JPEG MIME is `image/jpeg`. The existing Express WebM MIME remains `video/webm`; browser voice decoding/playback passed.
- An unknown valid Content hash returns 404 on all four origins and is not treated as expired.

## Additional original-file recovery

The authenticated chat also contained older voice 10799 (10-second label), whose file was not in the primary shared directory. The exact filename was found under `technician-profile-unification/backend/runtime/im-media`.

- Filename: `0c4e6004051a2f260377c380f06e875a4bd7a18810e80bdc8af35ebbf72dbd45.webm`.
- Formal record: conversation 2571, MIME `audio/webm`, size 147128 bytes; expiry/purge fields null.
- Source is WebM, size 147128 bytes, SHA-256 `b0689181f798ee6f29b7b2f83438dc5d376b40a93dd7525a54f09a03f7770899`.
- Added a no-overwrite byte-identical copy to shared IM storage; `cmp` passed. The source remains unchanged. No media was deleted or moved, and no database URL was rewritten.
- Standard API and frontend proxy then returned 200 with the same size/hash. The already-open chat's retry button recovered the audio player without refreshing the page.

## Authenticated browser acceptance

Used the existing authenticated in-app browser session at standard port 5180, with the original records rather than a fixture API.

- `/user.html#/messages/2571`: original image decoded at 1024 x 1024, displayed in the bubble and opened in the full-screen viewer. Original voice was played through its native control in the chat and reached `ended=true`, `currentTime=duration=14.460013`, `error=null`; the server-provided label remains 15 seconds.
- Older voice 10799 initially showed localized load-failed/retry feedback, not a broken 0:00 player or an expired label. After original-file recovery, retry replaced the feedback with a ready player (`readyState=4`, duration 9.060037, no error); native play was confirmed.
- `/user.html#/moments/posts/64774`: both original images loaded, both tile states became `ready`, and the viewer opened and switched from 1/2 to 2/2 with a decoded 1024 x 1024 image.
- Mobile check at 390 x 844: chat document width 390; Social document width 380. No horizontal document overflow. Existing layouts and controls were retained; viewport overrides were reset afterwards.
- Captured `warn`/`error` console logs for both original pages were empty. The earlier real missing-voice delivery failure was separately observed and recovered as described above.
- Chat and post tabs were retained as deliverables. Expired rendering is unit/component-tested only; this acceptance does not claim that the full expiry service or persistent local media cache has shipped.

## Automated checks

Executed on the merged local-main checkout: 17 frontend files / 334 tests and 7 backend suites / 161 tests passed (495 total). Coverage includes storage resolution, production path safety, IM/Social rendering and retry, formal metadata trust boundary, five-language copy, voice/Content/Social media APIs, realtime, notification schema, Exchange and admin route/build configuration.

Frontend lint and frontend/backend production builds passed. Vite's existing mixed static/dynamic SocialProfile import and large-bundle warnings remain. The earlier global i18n audit reports existing missing translations; the five new feedback entries have passing five-language checks, not a claim of global translation completeness.

## Rollback and deferred work

- Revert the focused implementation commit through the normal reviewed Git workflow if necessary; do not reset unrelated main commits.
- Reverting path resolution requires restarting the formal launcher. Do not delete shared runtime media still referenced by formal records. The recovered older voice's original source and shared copy are both retained.
- Full authoritative expiry projection, opened-media encrypted IndexedDB cache, recall/privacy eviction and cache controls remain the next lifecycle microstep.
