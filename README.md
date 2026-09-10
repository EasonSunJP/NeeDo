# NeeDo

面向日本市场的本地生活服务平台与商家管理系统，覆盖上门服务、门店预约、餐饮预约和 SaaS 后台运营。

分组成员、后台账号 LOG 与动态插页的接口及本地验证记录见 [Step 12 抽屉改进](docs/superpowers/plans/2026-09-07-operations-member-create.md)。

正式运营发布时间线、手动维护、日期搜索和审计规则见 [运营发布时间线](docs/operations-release-timeline.md)。

## Run

```bash
npm install
npm run dev
```

当前仓库只保留正式运行方式：

```bash
# 默认：启动前端、兼容 client API、运营 API 与商户 API
npm run dev

# 同上，名称更明确
npm run dev:formal

# 只启动前端
npm run dev:frontend

```

说明：

- 当前仓库已包含正式 `backend/` 工程；登录、Auth、RBAC、User Management 必须走真实 `/api/v1` 后端。
- 所有正式页面必须通过 `/api/v1`、Prisma 与真实数据库读取数据；禁止新增或启用浏览器 mock、静态演示 API、免登录账号。
- 首次运行前把 `backend/.env.dev.example` 复制为未跟踪的 `backend/.env.dev`，并启动本地 MySQL/Redis、应用 migration 与 seed。
- `npm run dev:formal` 会检查并启动四个独立监听：兼容 client API `3000`、运营 `ops-api` `3001`、商户 `merchant-api` `3002`、前端 `5180`。端口上若不是预期 NeeDo 服务会拒绝覆盖。
- 本地端口可分别用 `FORMAL_BACKEND_PORT`、`FORMAL_OPS_API_PORT`、`FORMAL_MERCHANT_API_PORT`、`FRONTEND_PORT` 覆盖；后端环境文件继续用 `FORMAL_BACKEND_ENV_FILE` 指定。
- IM/Social 媒体通过 `dev:formal` 启动时统一使用 Git 主检出目录的 `backend/runtime/im-media` 与 `backend/runtime/content-media`，切换 linked worktree 后仍读取同一批文件。环境变量或所选环境文件中的绝对 `IM_MEDIA_STORAGE_DIR` / `CONTENT_MEDIA_STORAGE_DIR` 可覆盖默认目录；自定义相对路径会被拒绝。非 Git 源码包使用项目绝对目录，并在启动日志中标出回退来源。
- 直接运行 `backend` 或生产部署时应显式配置媒体目录的绝对持久卷路径，生产环境会拒绝相对值。修改目录后须重启已运行的 API（启动器复用现有进程时不会更新其环境变量）。已有文件无需移动，禁止清理仍被数据库引用的 runtime 文件。
- 三个 API 进程共享 `DATABASE_URL` 指向的唯一 MySQL 数据源。运营与商户 API 默认分别使用 Redis logical DB `/1`、`/2`，可用 `FORMAL_OPS_API_REDIS_URL` 和 `FORMAL_MERCHANT_API_REDIS_URL` 配置，但两者不得相同。
- 本项目默认前端端口已改为 `5180`，避免占用其他项目正在使用的 `5173`、`5175` 和 `5176`。
- 如果 `5180` 已被占用，Vite 会自动切到下一个可用端口。
- Chrome 直接双击打开 `dist/*.html` 时，`file://` 模式通常不会正常执行 Vite 的 ES module 入口，表现就是白屏、进入页/聊天页/错误页背景都像“没了”。请改用 `npm run dev` 或 `npm run preview` 通过本地 HTTP 服务访问。

## Build

运营排行服务类型筛选、完整详情、时间/城市查询和 10/50/100 分页的本地 main 集成范围与验收命令见 [排行集成记录](docs/qa/2026-09-07-ranking-main-integration.md)。

```bash
npm run build
```

## Formal Auth Frontend

The recovered platform announcement backend, delivery guarantees, guarded local
MySQL acceptance command and explicitly pending merchant/UI scope are documented
in [Official notice delivery](docs/official-notice-delivery.md).

Step 07 has added the frontend side of formal Auth / RBAC while keeping the existing React / TSX / Vite stack. The frontend now calls `/api/v1/auth/*`, `/api/v1/users`, `/api/v1/roles`, and `/api/v1/permissions` through `src/api/httpClient.ts`.

Auth behavior:

- Development and production frontends use the same formal password or Google login chain. There is no passwordless or static-demo login path.
- The client login page has no portal selector. Email, bare ten-digit account IDs, and `u` IDs enter the user portal; `s` IDs enter the technician portal and `b` IDs enter the merchant portal after formal identity authorization. Google login and registration enter the user portal. Other identities remain available through the user settings identity switch. Legacy client login entries redirect to `user.html` before accepting credentials so the session stays in the same persistence scope.
- Access Token is kept in memory only.
- Refresh Token is persisted under `needo.auth.refresh-token` so a page refresh can restore the session through `/api/v1/auth/refresh` and `/api/v1/auth/me`.
- User / Role / Permission admin pages are backed by real APIs and gated by `menu:*`, `page:*`, and `button:*` permissions.
- Public email registration is a two-step verified flow: `POST /api/v1/auth/register`
  creates an email challenge and `POST /api/v1/auth/register/verify` creates the
  baseline customer only after the six-digit OTP is accepted.
  No User row is created before OTP verification. A normal account receives an immutable public ID
  (`u` plus ten digits); its initial nickname/display name equals that public ID
  and may later be edited without changing the login identifier.
- `POST /api/v1/auth/login` accepts `loginIdentifier` as either the verified
  email address or immutable NeeDoID plus password. A successful verification
  is not repeated on later password logins.
- Google Identity Services is an additional credential, not a replacement for
  NeeDo sessions. First Google use or authenticated linking requires email OTP;
  later use of the same linked Google subject signs in directly and receives
  NeeDo access/refresh tokens. Google-only registration is supported, and a
  Google-only user can set a password after email OTP verification.
- Merchant and operations accounts do not have public self-registration and continue to be created through protected management APIs.

Verify the registration transaction against the configured local, non-production MySQL database (the check rejects remote/production targets and removes only the uniquely named rows it creates):

```bash
npm --prefix backend run check:registration-flow
npm --prefix backend run check:google-auth-flow
```

Both checkers fail closed unless `NODE_ENV`/`DEPLOY_ENV`, `DATABASE_URL`, and
`REDIS_URL` identify an explicitly non-production local test runtime. They use
the real repositories, bcrypt, token/session stores, audit writes, and Redis
challenge state, then assert that every uniquely marked database row and Redis
key was removed. The Google checker injects only a deterministic credential
verifier and capture-only OTP delivery seam; it does not add a route, auth
bypass, or fake application API. See `docs/api.md` and `docs/environment.md`
for the public contract and provider configuration.

Set `VITE_API_BASE_URL` when the client API is served from a different origin. Operations admin uses `VITE_OPS_API_BASE_URL` (default `/ops-api/v1`) and merchant admin uses `VITE_MERCHANT_API_BASE_URL` (default `/merchant-api/v1`). Local Vite dev/preview proxies those prefixes to ports `3001` and `3002`, while other portals keep `/api/v1` on port `3000`; proxy targets can be overridden with `NEEDO_OPS_API_PROXY_TARGET`, `NEEDO_MERCHANT_API_PROXY_TARGET`, and `NEEDO_API_PROXY_TARGET`.

`ops-api` and `merchant-api` expose different administration route manifests and fail closed with the normal 404 envelope for the other administration namespace. Their access and refresh tokens carry different JWT audiences, so a token issued by one service is rejected by the other. Audience-less tokens created before this split remain accepted only by the compatibility `needo-backend` service until they expire; they cannot enter either new administration service. Portal-local browser auth envelopes remain separate, so signing in or out of one portal does not terminate another portal's ordinary session.

The shared Apifox login/register/captcha endpoints are legacy pre-login routes, not formal `/api/v1/auth/*` routes. Local development keeps the formal backend on `/api/v1` and routes only legacy captcha traffic through `VITE_LEGACY_AUTH_BASE_URL=/legacy-auth`; Vite proxies that prefix to `VITE_LEGACY_AUTH_PROXY_TARGET`. Formal password login must use `POST /api/v1/auth/login` so the returned access token can pass `/api/v1/auth/me`. The Apifox public pre-login bearer belongs in `VITE_API_PUBLIC_AUTHORIZATION` when legacy Apifox traffic needs it; keep the real value in local or deployment env files, not source.

Passwordless test-login shortcuts are not part of the formal login chain. Verified formal accounts sign in through `POST /api/v1/auth/login` with `email-or-NeeDoID + password`; seeded local/staging accounts must use their seeded email or NeeDoID. Their password comes from `TEST_USER_DEFAULT_PASSWORD`, falling back to `ADMIN_DEFAULT_PASSWORD` only for local development. Login pages do not bundle `VITE_TEST_LOGIN_*` credentials and do not expose test-account autofill or one-click login controls.

## Local Operations Simulation Data

### Historical June-August Dataset

The local-only simulation seed creates an isolated, deterministic cohort for real API and portal acceptance: 10 published shops, 100 published technicians (exactly 10 per shop), 100 customers, 30 services, 2,600 schedule slots, and three calendar months of completed, cancelled, in-service, confirmed, and pending bookings. Completed bookings include confirmed onsite payments and order-finance records; customers receive wallet seed-credit ledger entries, and every simulated booking creates a recipient notification. The same seed also writes 210 direct conversations, 860 dated messages, and 420 bidirectional contacts to the formal Prisma/MySQL IM tables. Every simulated customer receives one technician conversation and one shop-owner conversation; `sim.customer.100@needo.local` is expanded to 12 real linked contacts/conversations and 68 cross-month messages for focused IM acceptance. The shared `customer@example.com` preview account is kept as an active formal customer with a profile, wallet, and two real preview conversations.

Identity-switch acceptance data is deterministic and database-backed. Every simulated technician has `customer + technician + scout`; every simulated shop owner has `customer + technician + merchant_owner + scout`; ordinary simulated customers have `customer` only. The fixed `technician@example.com` and `merchant@example.com` accounts receive the equivalent switchable identities when formal test-account seeding is enabled, while `customer@example.com` remains customer-only. Customer is the default identity for the switchable technician and merchant test accounts.

The script refuses production/non-local deployments, remote MySQL hosts, and production-looking database names. It also requires `ALLOW_SIMULATION_SEED=true`. All formal test accounts use the same local password supplied through `SIMULATION_DEFAULT_PASSWORD`, or through the existing local `TEST_USER_DEFAULT_PASSWORD` when the simulation-specific value is not configured. No password is hardcoded or committed.

```bash
cd backend
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm run seed:simulation
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm run check:simulation-data
```

### Future Six-Month Local Operations Dataset

The historical June-August dataset remains unchanged. The future dataset reuses the existing 100 technician and 100 customer test accounts and covers 2026-09-01 through 2027-02-28 JST. It persists deterministic Availability, ScheduleSlot, BookingOrder, status-history, and notification records in the formal local MySQL database. Future bookings are limited to pending, confirmed, or cancelled and do not create completed finance, payroll, wallet-hold, or review records.

```bash
cd backend

# Read-only plan
npm run plan:future-operations

# Explicit local apply
npm run seed:future-operations

# Independent database reconciliation
npm run check:future-operations
```

The workflow rejects production or remote databases, does not create accounts, and refuses to overwrite non-matching schedule or booking data in the target window. Repeating an exact successful apply returns `noop` without adding rows. Passing the database checker establishes only the real-data prerequisite; the user, technician, and merchant schedule UI mock-retirement slices remain separate acceptance work.

### Formal NeeDo Exchange Dataset

NeeDo Exchange now uses authenticated, persisted routes under `/api/v1/exchange`: paginated demand/intelligence posts, post detail, comments, like/unlike, share recording, direct publication, and author-only withdrawal. Customer identities may publish demand; active technician and merchant identities may publish intelligence. The server resolves the current user, active identity, and public NeeDoID from the authenticated session; clients cannot submit actor IDs.

The local/test-only Exchange seed reuses existing active test users, identities, and public identifiers. It creates no account or shadow identity. A successful run contains exactly 20 demand posts and 20 intelligence posts; every post has 3–10 actor-linked comments, 10–66 unique actor-linked likes, and 2–15 unique actor-linked shares. The checker independently validates all totals, subtype ownership, actor joins, uniqueness, timestamps, and absence of old Exchange namespaces.

```bash
cd backend
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm run seed:formal-exchange-test
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm run check:formal-exchange-test
```

The user, merchant, and technician portals expose the same formal two-tab experience at `/needo`, `/merchant/needo`, and `/technician/needo`. UI controls are available in simplified Chinese, traditional Chinese, Japanese, English, and Korean; authored post/comment/claim-message text remains in its original language. Selective and Quick Request claiming/matching, exact budget increase, Selective target-count reduction, matched-order creation, per-order bilateral cancellation, and direct appointment booking from a published Intelligence post now have formal client/API slices. Manual matching close and half-fee settlement, complete appointment lifecycle expansion, service payment, and external payment remain explicitly deferred.

### Formal Intelligence service and booking

An Intelligence publisher must select one server-resolved catalog target: `shop:{serviceId}` for a merchant identity scoped to that shop, or `technician:{technicianServiceId}` for the owning public technician with a current active shop affiliation. The persisted Intelligence row stores exactly one Restrict-linked target plus the service name, duration, catalog price, campaign price, service mode, address, and area snapshots. Legacy unbound Intelligence remains readable but is explicitly not bookable.

The shared Intelligence detail renders the formal shop/technician profile card and formal service card. A live store-mode source exposes exactly one checkout link: `/checkout/{serviceId}?date={tokyoDate}&time={tokyoStartTime}&exchangePost={postId}` or `/checkout/technician-service/{technicianServiceId}?date={tokyoDate}&time={tokyoStartTime}&exchangePost={postId}`. Checkout reloads the source and catalog context, keeps only slots fully inside the source window, and submits the exact service selector plus `exchangeIntelligencePostId`; catalog and campaign prices are never accepted from the client. Booking locks the source and capacity, revalidates publisher/service/affiliation state, snapshots the campaign price and source evidence, persists initial history and audit rows, and emits the provider notification only on the first idempotent commit. Onsite Intelligence is deliberately fail-closed in both detail and direct checkout until the separately owned structured-address and route-estimate checkout slice is committed; it cannot fall through to an invalid 422 submission. The shared empty-image fallback uses the caller's fixed dimensions rather than `h-full w-full`, so shop and technician detail cards retain readable text columns at both 440 px and 320 px mobile widths.

The guarded acceptance command creates a dedicated local MySQL database and principal, applies this branch's complete migration chain from an empty database, verifies the seven physical columns, one CHECK, four indexes and three Restrict foreign keys, executes both shop and technician publication/booking paths, then deletes the database and principal. It also covers cross-shop and impersonated publication, legacy/closed/withdrawn/expired/unavailable sources, inactive affiliation, time-window and service mismatch, client price injection, referenced-service and source deletion, idempotency conflict/replay, injected transaction rollback, an explicit two-client capacity race, cards, snapshots, history, notifications, audit, and store-mode travel-state separation.

```bash
cd backend
FORMAL_BACKEND_ENV_FILE=.env.dev \
  npm run check:exchange-intelligence-booking-flow
```

When the local MySQL administrator authenticates through a Unix socket, set `EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH` to that verified socket (for example `/tmp/mysql.sock`). The checker verifies that the socket principal is exactly `root@localhost` before creating its random scratch database.

Local `needo_dev` has migration `20260905180000_exchange_intelligence_booking` applied. The guarded disposable-database proof applies the complete current repository migration chain in an isolated scratch database and verifies the Intelligence migration contract before exercising both publication and booking paths. The exact current seed/check totals and browser evidence are recorded only after the final local acceptance run. Staging migration, staging deployment, remote push, and post-deploy acceptance remain separate release gates.

### Formal Exchange Claim

Selective and Quick Request claims reuse the existing identity, shop affiliation, service, technician schedule, booking-conflict, RBAC, audit, and Request-terminal transaction authorities. No parallel matching, booking, order, wallet, ledger, or payment system is created. An active claim is a soft technician-time hold; claimant withdrawal, Request withdrawal, Request expiry, matching, and future matching close persist an appropriate terminal claim state and release or convert that hold through the matching authority.

The five authenticated endpoints are:

- `GET /api/v1/exchange/posts/{id}/claim-options` — paginated, provider-scoped shop/technician/service/schedule options.
- `POST /api/v1/exchange/posts/{id}/claims` — idempotent claim creation with server budget, capacity, and overlap validation.
- `GET /api/v1/exchange/posts/{id}/claims/mine` — current identity's persisted claim.
- `GET /api/v1/exchange/posts/{id}/claims` — paginated claims received by the Request owner only.
- `POST /api/v1/exchange/claims/{claimId}/withdraw` — claimant-only, idempotent pre-match withdrawal.

RBAC codes are `exchange:claim-options:list`, `exchange:claims:create`, `exchange:claims:read-own`, `exchange:claims:list-owned-request`, and `exchange:claims:withdraw-own`. Public claim states are `active`, `withdrawn`, `request_withdrawn`, `request_expired`, `matched`, `not_selected`, and `matching_closed`. Quote, service, shop, technician, and estimated time are server-authoritative; the provider message is optional and remains in its original language.

Run the guarded local claim-lifecycle fixture checker and concurrency proof from `backend/`. `ENV_FILE` is mandatory, remote/production-looking databases are rejected, and every checker fixture is identified and deleted by captured IDs:

```bash
ENV_FILE=.env.dev npm run check:exchange-selective-claim-flow
RUN_EXCHANGE_CLAIM_INTEGRATION=true ALLOW_EXCHANGE_CLAIM_DEV_INTEGRATION=true ENV_FILE=.env.dev \
  npm test -- --runTestsByPath tests/exchange-claim.repository.integration.test.ts --runInBand
```

The lifecycle checker creates its Request, schedule, service and identities as exact, namespaced Prisma fixtures, then exercises the real claim repository/service transaction boundary. It proves the claim state machine and cleanup, but does not by itself prove formal Request publication or its TEST_NDP hold; those remain browser/API acceptance responsibilities.

Migration `20260901100000_exchange_selective_claim` was applied and independently reconciled against the physical table, constraints, indexes, foreign keys, permissions, and role assignments. Withdrawal retries are persisted separately by `20260901130000_exchange_claim_withdraw_idempotency`, without rewriting the applied base migration. After synchronizing the latest local `main` at the 2026-09-07 Quick acceptance gate, Prisma found all 150 repository migrations applied on local `needo_dev`; no migration command or schema write was needed.

Claim creation and withdrawal remain separate from the final owner-selection command documented below. Neither flow creates a `BookingOrder`, moves wallet value, or reserves schedule capacity through `bookedCount`.

### Formal Selective Matching

Selective matching uses the one-to-one `ExchangeRequestMatching` aggregate, immutable `ExchangeMatchParticipant` reservation snapshots, and append-only `ExchangeMatchEvent` history. It reuses the existing Request, claim, identity, shop, service, technician, schedule, RBAC, notification, privacy, and audit authorities. It does not create a parallel booking or financial system.

The two authenticated endpoints are:

- `GET /api/v1/exchange/posts/{id}/matching` — Request-owner matching state, or the current matched participant's privacy-scoped result.
- `POST /api/v1/exchange/posts/{id}/matching/select` — Request-owner selection with `Idempotency-Key`, optimistic `expectedVersion`, and nullable exact adjustment confirmations.

An exact selection within budget still completes in one command. When the selected count is below the current target, the selected quote total exceeds the current budget, or both apply, the first command returns HTTP 409 with the current version and exact server-calculated target/budget values; it writes nothing. A second command must echo only those exact confirmations. The confirmed transaction persists `budget_increased` then `target_reduced` when applicable, followed by `selective_matched`, with a continuous version chain. It also creates Participant time reservations, changes selected claims to `matched`, changes all other active claims to `not_selected`, changes the Request and matching aggregate to `matched`, notifies selected and non-selected providers, and writes one audit entry. Stale versions, changed idempotency payloads, inexact or unnecessary confirmations, invalid claim sets, and schedule conflicts fail without partial writes.

Only the publisher and matched participants can read the matching result. A matched participant receives the filled Request address and publisher identity; non-selected providers keep the general public projection. No Exchange response exposes publisher telephone or email. Claim options, new claims, and Booking creation/confirmation now also treat active Match Participants as technician-time conflicts, while Participant creation does not increment `ScheduleSlot.bookedCount`.

Run the local-only, rollback-contained real-database flow checker from `backend/`:

```bash
ENV_FILE=.env.dev npm run check:exchange-selective-matching-flow
```

The checker creates its own marker-scoped Request, three providers, claims, publication hold, and schedule records inside one outer transaction. It invokes the real matching service, proves a combined target reduction and budget increase first returns an exact zero-write preview, then verifies the ordered adjustment/match event chain, terminal states, notifications, audit evidence, owner and participant privacy, idempotent replay, changed-payload conflict, retained publication hold, unchanged wallet/ledger values, unchanged schedule capacity, and zero Booking/financial-row creation. The outer transaction is deliberately rolled back and marker cleanup is independently verified. Independent target-only and budget-only paths remain covered by the service, repository, route, and UI suites.

Migration `20260901232000_exchange_selective_exact_matching` is additive and backfills one OPEN matching aggregate and OPENED event for every non-deleted Demand. On the accepted local database it was applied independently of unrelated pending migrations, then reconciled against the physical tables, backfill counts, checks, indexes, Restrict foreign keys, permissions, grants, and Prisma migration history.

This Selective matching slice does not perform manual close or half-fee settlement, `BookingOrder`, `Payment`, wallet, ledger, reconciliation, or external payment mutations. A successful adjusted match deliberately leaves the existing Request publication-fee hold unchanged for a later terminal lifecycle microstep. Matched-order conversion and bilateral cancellation are documented separately below.

### Formal Quick Matching

Quick matching reuses the same claim, matching, participant, event, notification, audit, privacy, schedule-conflict, and financial boundaries as Selective matching. The final provider claim atomically matches all active claims only when their count exactly reaches `effectiveTargetProviderCount` and their quote total is within `effectiveBudgetMaxJpy`. No subset choice is exposed. Once the target count is reached, further claims are rejected even when the owner still needs to approve an over-budget total.

The authenticated matching read remains `GET /api/v1/exchange/posts/{id}/matching`. An over-budget Quick Request exposes the exact current claim count, selected quote total, current effective budget, required maximum, and required increase to its owner. The only write command is `POST /api/v1/exchange/posts/{id}/matching/quick/confirm-budget`, with `Idempotency-Key`, optimistic `expectedVersion`, action `increase_to_selected_total`, and the exact server-calculated `confirmedBudgetMaxJpy`. Changed payloads, stale versions, inexact amounts, non-owner access, and unnecessary confirmations fail closed.

An exact confirmation changes only `ExchangeRequestMatching.effectiveBudgetMaxJpy`, then completes the all-claim match in the same transaction. It appends one ordered `BUDGET_INCREASED` event followed by exactly one `QUICK_MATCHED` event, creates one Participant per claim, marks every active claim and the Request/matching aggregate matched, and emits scoped notification/audit evidence. The original Demand budget remains immutable; all owner-facing budget summaries use the persisted effective matching budget after confirmation.

Quick matching does not create `BookingOrder`, `OrderFinancial`, payment, ledger, reconciliation, or schedule-capacity writes. The Request publication-fee hold stays active and the Request financial projection stays `HELD`. Run the rollback-contained checker and the explicitly enabled two-connection concurrency proof from `backend/`:

```bash
ENV_FILE=.env.dev npm run check:exchange-quick-matching-flow
RUN_EXCHANGE_QUICK_MATCHING_INTEGRATION=true ALLOW_EXCHANGE_QUICK_MATCHING_DEV_INTEGRATION=true ENV_FILE=.env.dev \
  npm test -- --runInBand --runTestsByPath tests/exchange-quick-matching.repository.integration.test.ts
```

Authenticated browser acceptance covered automatic within-budget matching, exact over-budget confirmation, third-provider capacity closure, persisted information-card contents and fallback avatars, reload, privacy, and 320 px, 440 px, and desktop layouts without horizontal overflow. The captured browser fixtures were reconciled and removed by exact IDs; no Booking/payment rows or financial balance movement occurred. See `docs/verification/2026-09-07-exchange-quick-matching.md`.

### Exchange matched booking conversion

`POST /api/v1/exchange/posts/:id/matching/bookings` converts every persisted matched participant into one independent `PENDING` Request order in one idempotent transaction. The command uses the matched quote, service and time snapshots, transfers each temporary participant reservation into formal slot capacity, replaces only ordinary unprotected pending orders for non-Black customers, and creates no service payment or Exchange publication-fee settlement.

Run the rollback-contained local proof with:

```bash
cd backend
ENV_FILE=.env.dev npm run check:exchange-booking-conversion-flow
```

Migration `20260903100000_exchange_matched_booking_conversion` is applied on the accepted local `needo_dev` database. The physical columns, unique and non-unique booking-order indexes, Restrict foreign key, participant booking-state check, Prisma migration record, and `exchange:matching:book-own` grants for `admin`, `customer`, and `merchant_owner` were reconciled directly. The rollback checker and two-connection concurrency proof both completed with zero marker users, posts, or audit rows left behind.

Local formal-browser acceptance used the isolated `3100/3101/3102/5181` runtime and the persisted Admin2 Demand `62`. After the fixture was moved to a conflict-free future slot, the owner created Request order `ND202609042208537783` through the UI, reloaded the post and order-detail pages, and replayed the exact persisted idempotency key without creating a duplicate. Database reconciliation confirmed one `PENDING` order, one initial status-history row, transferred slot capacity, the participant booking link, one provider notification, and no `OrderFinancial` row. The generic cancellation endpoint remained blocked, while the matched provider could read only its own participant result. Native order links now use `#/orders/:id` and `#/technician/orders/:id`, keeping navigation inside the existing HashRouter. Mobile acceptance at 440 px and 320 px found no horizontal overflow or console errors. This evidence is local only; no production migration, deployment, or push was performed.

Exchange-linked orders cannot use the generic cancel endpoint. The later bilateral-cancellation slice now reads and mutates the exact persisted per-order cancellation state from the Exchange and formal customer/provider order details, while ordinary orders retain their existing generic cancellation control. Its guarded local proof applied all 130 migrations to a disposable MySQL database, passed eight concurrency and finance scenarios, and removed the dedicated database and principal without modifying `needo_dev`. Authenticated customer/provider browser acceptance also passed at 320/440 px with reload persistence and no horizontal overflow. Applying the two additive migrations to an authorized app environment, remote push, deployment, and post-deploy smoke remain explicit release gates. Service payment, payment refunds, responsibility penalties, wallet reconciliation, and external payment are not part of this conversion or cancellation UI slice.

The verified conversion is now merged into local `main`. See [the 2026-09-05 main acceptance record](docs/verification/2026-09-05-exchange-booking-main-acceptance.md) for complete regression counts, owner/provider/unauthorized browser checks, and the `5180` runtime proof.

### Exchange Test NDP Foundation

Exchange fee work now has a single-wallet Test NDP foundation. Migration `20260830210000_exchange_test_ndp_foundation` adds server-authoritative account classification and an explicit `NDP | TEST_NDP` currency to the existing Wallet/Ledger, reconciliation, hold, and order-financial records; it does not create a second wallet or ledger system. `NDP` remains formally settleable. `TEST_NDP` is local/test value and is blocked from top-up, withdrawal, payout, external payment, and formal settlement/export paths.

Every current local account is classified as a test account and is calibrated to exactly `100,000 TEST_NDP` available through idempotent, audited ledger transactions. `GET /api/v1/wallets/me` returns the active wallet currency, while `GET /api/v1/wallets/me/summary` returns separate formal and Test NDP balances. Paginated operations account management exposes the classification, separate balances, and permission-gated classification action. `GET /api/v1/backoffice/finance/ndp-summary` returns paired formal/Test NDP metrics; the formal value remains primary, Test NDP is secondary, and `settleableNdp` includes formal NDP only. Formal reconciliation and settlement CSV queries enforce `NDP` on the server.

Run the guarded local preview/checks from `backend/` with the ignored `.env.dev` configuration:

```bash
npm run check:test-ndp-foundation -- --phase=preflight
npm run backfill:test-ndp
npm run prisma:migrate:deploy
npm run backfill:test-ndp -- --apply
npm run check:test-ndp-foundation -- --phase=postflight
```

These commands reject production-like targets. The Exchange Request publication fee and its operations-configured default of 1,000 NDP are reused by publication. Selective claiming adds no wallet or ledger movement; matching, booking, and payment remain separate later microsteps.

The isolated formal Social seed updates the 210 simulation accounts plus the six fixed role-entry accounts without replacing booking/order data. It assigns realistic shop and person names, persists 15 posts per account (text, single image, multi-image, video, and quote), and creates exactly 36 mutual friends per account across shop service accounts, technicians, and general users.

```bash
cd backend
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true SIMULATION_DEFAULT_PASSWORD=<shared-local-test-password> npm run seed:formal-social-test
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true SIMULATION_DEFAULT_PASSWORD=<shared-local-test-password> npm run check:formal-social-test
```

The account CSV is written to ignored `outputs/NeeDo_正式测试账号_2026-08-25.csv`. Create the formatted XLSX companion with the command below. On first run it creates an ignored local tooling virtual environment under `backend/.data/` and installs the pinned `openpyxl` version from `backend/requirements-simulation.txt`:

```bash
cd backend
npm run export:simulation-accounts-xlsx
```

Both account files contain `account_type`, `needo_id`, `nickname`, `email`, and `password`. They are local credentials and must never be committed, published, or used in production.

## Formal Local Acceptance And Release

The normal local formal entry is `npm run dev`, which starts the Express/MySQL/
Redis backend and the Vite frontend together. After startup, use the role-specific
entries below instead of the static-demo build:

- Operations: `http://127.0.0.1:5180/pf-admin.html#/admin`
- Merchant: `http://127.0.0.1:5180/store-admin.html#/merchant-admin`
- Customer: `http://127.0.0.1:5180/user.html#/`
- Technician: `http://127.0.0.1:5180/technician.html#/technician`

Run `npm run verify:production-build` before handoff. The complete local,
staging, production, rollback, deferred-provider, and credential-handling gates
are in `docs/production-release-checklist.md`. Local acceptance is a release
candidate check; it is not evidence of a public deployment or any 1k–100k
capacity tier.

All portals require a formal authenticated session. Local preview, acceptance, and production use the same authorization path.

### Formal Social single reply acceptance

The canonical Social reply surface is the post detail page in every portal. Historical reply URLs immediately replace themselves with that detail route and focus the fixed chat-style composer; they never mount a second reply UI. A direct detail link hydrates its parent with `GET /api/v1/social/posts/:id` and loads every reply page through the first-class `replyToPostId` list filter, so older posts and threads beyond the 100-item bootstrap window remain complete across realtime refreshes. The additive migration is `20260831000000_social_reply_relation`. Run the guarded local checks before and after applying it:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:social-reply-relations -- --phase=preflight
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:social-reply-relations -- --phase=postflight
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

The checker rejects production-like or remote databases. Preflight writes its recoverable legacy snapshot only under ignored `backend/.data/`; postflight requires the same total post count, the expected backfilled relations, zero orphan relations, and the reply index and foreign key.

Use this route matrix with authenticated formal accounts. In each row, verify the header is `回复动态`, the reply icon count equals `回复列表`, every reply is an independent card, both historical routes replace to the canonical detail, and the bottom composer retains avatar, emoji, and the shared `+` actions `相册 / 拍照 / 位置`.

| Portal | Canonical detail | Historical reply deep link | Historical compose link |
|---|---|---|---|
| Customer | `user.html#/moments/posts/:postId` | `user.html#/moments/posts/:postId/replies` | `user.html#/moments/compose?replyToPostId=:postId` |
| Merchant | `merchant.html#/merchant/moments/posts/:postId` | `merchant.html#/merchant/moments/posts/:postId/replies` | `merchant.html#/merchant/moments/compose?replyToPostId=:postId` |
| Technician | `technician.html#/technician/moments/posts/:postId` | `technician.html#/technician/moments/posts/:postId/replies` | `technician.html#/technician/moments/compose?replyToPostId=:postId` |

Submit text, a judgement sticker, an image, and a location through the formal API, then reload. The detail count and list total must match; the judgement must remain an SVG image, the uploaded media and location must remain visible inside their reply cards, and unstructured plain text such as `Pending` must remain text. Repeat at 440×956 and 320×956 while checking horizontal overflow, the last card above the fixed composer, console errors, and failed requests. Before judging the result, confirm ports 5180 and 3000 belong to the intended worktree/runtime; a listener from another worktree is not valid acceptance evidence.

Local acceptance recorded on 2026-08-31 used `needo_dev`: preflight found 51,818 posts and four valid legacy reply relations; postflight kept the same post total, backfilled all four relations, reported zero orphans, and found the required index and foreign key. The final isolated regression run passed 255 frontend files / 1,577 tests and 326 backend suites / 2,166 tests, with 10 suites / 38 environment-conditional backend tests reported as skipped. Authenticated user, merchant, and technician routes were checked at mobile widths; the four formal reply types were submitted to post `64773`, and reload showed the authoritative count and list total both at seven with sticker, image, and location presentation preserved. A final isolated merchant-browser check opened older post `64000` directly; the runtime issued both `GET /api/v1/social/posts/64000` and `GET /api/v1/social/posts?page=1&pageSize=100&replyToPostId=64000`, then rendered the canonical detail instead of the not-found state.

### Formal Social interaction acceptance

Likes, bookmarks, unique views, and friend shares are persisted by migration `20260831150000_social_post_interactions`; the timeline no longer increments these counters in browser-only state. `PUT/DELETE /api/v1/social/posts/:id/like` and `PUT/DELETE /api/v1/social/posts/:id/bookmark` return the authoritative post, `POST /api/v1/social/posts/:id/view` counts one active identity only once, and `POST /api/v1/social/posts/:id/shares` requires an `Idempotency-Key` plus 1–20 unique formal-friend user IDs. Every route requires `social-post:interact`; friend sharing additionally requires `message:create` and creates a real direct-conversation `social-post-card` message instead of a public repost.

`GET /api/v1/social/posts?bookmarked=true&page=1&pageSize=20` is the formal source for the customer-center `/me/favorites` page. Timeline, detail, and favorites consume the same returned `counters` and `viewerInteraction` fields. The SSE event `social.post.interaction.updated` refreshes the relevant formal post, while `message.created` delivers a newly shared card to sender and recipient. Legacy media-envelope counters remain a read-only baseline for existing seeded posts; new interaction rows are added to that baseline without rewriting old media JSON.

Before local data acceptance, confirm the backend and frontend listeners belong to the intended checkout and inspect migration status first. Apply the additive migration only when the repository history, `_prisma_migrations`, and physical schema are reconciled:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
# Run only after the read-only checks are consistent:
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

The 2026-08-31 local `needo_dev` Social migration is now applied. The successful `_prisma_migrations` row has checksum `408ae19a...`, matching the committed migration; the earlier overlong-index attempt is recorded as rolled back. Read-only physical-schema checks found all four tables, their foreign keys and shortened unique share index, and the five intended role grants. `prisma migrate status` reports all 80 repository migrations applied. The database still contains unrelated migration history that is absent from this checkout; this acceptance did not repair, delete, or reinterpret those rows and must not be used as authority to copy that unrelated schema into this repository.

Local acceptance used the formal `sim.customer.100@needo.local` identity, post `64774`, one bilateral friend, backend `3000`, frontend `5180`, MySQL `3307`, and Redis `6379`. It verified authoritative like/unlike persistence, favorites add/remove, one unique view per identity, one `social-post-card` message in the existing friendship conversation, idempotent replay without a duplicate count/message, actor interaction SSE, and recipient message SSE. The guarded checker then deleted the exact temporary interaction, message, share, and audit rows and restored the conversation and participant snapshots. At 440×956, the browser verified detail-view count persistence across reload, the `/me/favorites` entry and refresh persistence, the 12-friend forwarding selector and send-button gate, no horizontal overflow, and zero console errors; the browser-created bookmark/view and their audits were also removed by exact ID.

### Formal friend verification

Adding a contact now uses the persisted Step 13 friend-request flow rather than direct Contact creation. Search opens the target's formal identity profile first; a request remains actionable for exactly 72 hours by database UTC time. Repeating the same pending request does not refresh its timestamp or notification, while rejection permits immediate reapplication and expiry permits a newly notified request. Acceptance atomically creates reciprocal Contact and Follow rows.

Deleting a friendship physically removes both Contact directions and both Follow directions. It also removes only the deleter's participant row from the friendship conversation, so the deleter loses the one-to-one conversation and history entry while the other account retains its history. A retained non-friend conversation cannot send new messages: the backend returns `error.im.not_friends` before message, unread, or SSE writes. Re-acceptance creates a new participant history boundary and does not restore the deleter's old history. Manual Social follow/unfollow remains independent from Contact after friendship creation.

The chat information page reads the same formal directory profile and renders the contact's customer, technician, shop, or safe account identity card. The customer portal omits the credit summary from this chat-settings card, while technician and merchant/shop portals retain it; this does not change the customer's own personal-center credit display. City is not rendered in chat settings, and customer basic information always keeps gender, age, and height with explicit private/not-set states. Points, usage count, and the personal-profile privacy toggle are not included. A retained conversation whose friendship was removed shows the formal add-friend action instead of an empty friend-action area. Full state, API, migration, and acceptance rules are documented in [`docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`](docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md#616-好友验证双向解除与身份资料卡2026-08-30).

### Formal per-conversation chat translation

One-to-one contact information includes a default-off “聊天内容自动翻译” preference owned by the authenticated active identity's `ConversationParticipant`. The formal backend translates eligible visible user text and image/video captions through `POST /api/v1/im/conversations/:conversationId/messages/translations`; successful results are cached in `im_message_translations` without changing the original `Message`. Manual translation applies only to the long-pressed message and can hide/show its cached translation. Automatic translation disables the manual action, batches eligible messages, and still renders every original above its translated block. System content, file names, cards, withdrawn/expired content, and judgement stickers never enter the provider.

Provider configuration is backend-only and documented in [`docs/environment.md`](docs/environment.md#im-translation-provider). The default `disabled` mode requires no key and returns a sanitized unavailable response for eligible external translations. `deepl` mode fails startup unless an HTTPS API base URL and non-placeholder server-side key are present; the key is never sent to the browser. No mock translation path is enabled.

### Formal chat-record forwarding, favorites, and multiselect

Single and multiple forwarding use the same immutable chat-record bundle. The server snapshots 1–100 currently visible messages, copies eligible protected media, and creates one `chat-record` delivery message; the card opens a read-only fullscreen timeline. One sender shows that sender's chat history, two senders show both, and three or more show the localized group-chat title. “我的收藏” stores one complete bundle per favorite and opens the same detail page.

Long-press actions use a compact fixed 4×2 layout with manual translation and multiselect while retaining the existing glass sheet, arrow, reaction row, and explicit unfiltered dim underlay. Multiselect provides fixed upper/lower range buttons and a glass bottom bar for forward, copy, favorite, and delete. Batch delete writes only the active identity's deletion tombstones; it does not remove shared messages or affect the peer. Formal routes, permissions, paging, access boundaries, and verification status are in [`docs/realtime.md`](docs/realtime.md) and [`docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`](docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md).

Contact identity cards normalize stored language aliases to full labels such as `日本語`, `中文`, `English`, `한국어`, `ไทย`, `Tiếng Việt`, and `Español`, deduplicate equivalent aliases, retain unknown non-empty formal values, and wrap pills on narrow screens. Friendship classification now requires reciprocal active Contact rows whose source is `friend_request`; technician-application contacts do not suppress a real pending request. An active incoming request remains on the independent `拒绝` / `添加好友` action page, while an outgoing request remains read-only. Technician languages and the public-profile fallback are returned only from eligible persisted public profiles. The complete behavior, automated evidence, current production-build gate, migration, and still-pending database/browser acceptance are recorded in [`docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`](docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md#621-单聊自动翻译语言能力与待处理好友资料修复2026-08-31).

## Formal Merchant Employee Affiliations

Merchant employee identity is now founded on one global technician profile, its canonical `s##########` NeeDoID, and shop-scoped `TechnicianShopAffiliation` rows. The protected `/api/v1/merchant-admin/employees` list/detail/profile/affiliation routes derive the shop only from the active authenticated identity; profile edits are field-limited and audited, while affiliation writes enforce exclusive-versus-partner rules inside a locked database transaction and preserve ended relationships as history.

The additive migration, dry-run-first legacy backfill, RBAC/audit contract, local verification commands, compatibility boundary, and non-destructive rollback procedure are documented in [`docs/employee-affiliation.md`](docs/employee-affiliation.md). The merchant “员工列表” and “员工详细信息卡” now use the canonical employee APIs and NeeDoID; the legacy technician endpoints remain only as compatibility surfaces outside this merchant page. The same employee card reads, edits, and previews the current shop-scoped compensation rule through `/api/v1/merchant-admin/employees/:needoId/compensation-profile`, and shows the latest persisted payslip totals without exposing internal shop, technician, or actor IDs. Actual payment is still a manual finance record; this workflow never initiates a bank transfer.

All new user-, merchant-, and technician-facing public profile links use the
technician's canonical lowercase `s##########` NeeDoID. Numeric
`TechnicianProfile.id` values remain internal relation keys for services,
bookings, schedules, and compatibility lookups; they must not be displayed as
the technician account identifier or used to construct a new public profile
URL. A legacy numeric profile URL remains readable and is replaced with the
canonical scoped URL after the formal detail API resolves the entity.

## Operations Technician Ranking

The operations technician ranking is available at
`/pf-admin.html#/admin/technicians?module=ranking`. It reads the formal
`/api/v1/backoffice/technician-rankings` aggregate instead of calculating totals
in the browser. The default period is the current Tokyo calendar month, with
today, last 7 days, last 30 days, custom inclusive dates, and all-history
switches. Revenue is completed-order service value (including extension value),
completed orders count each booking once, and a Tokyo date with at least one
completed order counts as one working day. CSV export uses the same filters and
metric definitions as the visible ranking.

The formal list and CSV endpoints both require `backoffice:technicians:list`
and write separate ranking-list or ranking-export audit events. The CSV export
uses the current server-side filters and sort order, is capped at 5,000 rows,
and neutralizes spreadsheet formula prefixes before returning UTF-8 CSV content.
Verify the aggregate independently against a local non-production MySQL
database with the read-only checker below; it rejects production flags, remote
hosts, and production-like database names before querying.

```bash
ENV_FILE=.env.dev npm --prefix backend run check:technician-ranking-flow
```

Browser acceptance remains a separate release gate: use the operations entry to
exercise periods, filters, sorting, paging, CSV export, error/empty states, and
the formal technician detail drawer against the running API.

## Formal Schedule Inventory

Merchant and technician schedule portals now maintain customer-bookable inventory through identity-scoped `/api/v1/*/schedule/slots` APIs. The backend derives the shop or technician profile from the active authenticated identity, validates explicit-offset ISO timestamps, prevents overlapping technician slots, and updates matching availability records transactionally. Personal calendar notes remain a separate, non-bookable compatibility lane.

Verify schedule scope, exact UTC storage, overlap handling, and concurrent capacity behavior against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:schedule-flow
```

The check refuses production flags and remote database hosts, creates uniquely named temporary records, and removes those records after verification.

## Formal Manual Payments

Booking orders now persist the selected `onsite` or `bank_transfer` method and a formal payment lifecycle: `pending → confirmed → refundPending → refunded`. Merchant routes derive the shop from the active identity; backoffice routes require platform payment-write permission. Confirmation records the exact JPY amount, confirmer, time, reference and note, while cancellation moves an already confirmed payment to `refundPending`. Identical confirmation and refund retries are idempotent, and the order-finance timeline is synchronized transactionally.

Verify the migration, merchant scope, amount validation, idempotent retries, cancellation and refund synchronization against local MySQL:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:manual-payment-flow
```

The check refuses production or remote database targets and deletes only the uniquely named records it creates.

## Multi-shop Pricing and Settlement Acceptance

Technician affiliations now expose one public relationship type: `partner`. A technician can hold active partnerships with three or more shops; legacy database rows that still store `EXCLUSIVE` are read as partnerships and do not block another shop affiliation. Merchant-priced shops expose only persisted shop services, while technician-priced shops first expose persisted technicians and then that technician's shop-scoped services.

Run the retained real-data acceptance only against an explicitly selected local backend environment:

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/backend/.env.dev npm --prefix backend run check:multishop-pricing-settlement
```

The checker refuses staging, production, remote MySQL hosts, and production-like database names. It creates or reuses the stable marker `qa-multishop-pricing-settlement-20260909`, retains one technician partnered with three shops, and retains four completed orders covering merchant/technician service ownership and both `TEST_NDP` and offline-cash settlement. It verifies immutable booking pricing snapshots, ledger or cash-receipt evidence, exact technician/shop splits, identical merchant/operations finance projections, and approved merchant/technician/operations payroll projections. Accepted rows are not rolled back or deleted; rerunning the command must reuse and revalidate the same IDs.

For retained multi-round verification of the technician's real order automation, run:

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/backend/.env.dev npm --prefix backend run check:technician-order-automation
```

This checker uses the same loopback and non-production guards, then persists and reuses marker `qa-technician-order-automation-20260909`. It proves Booking auto-accept and Request auto-apply for matching rules, manual fallback with recorded reasons for non-matching rules, repeated-trigger idempotency, and background blocking for a technician whose current shop count is zero. Request automation creates a formal claim only and preserves user selection; it never auto-completes matching.

The technician personal center now links to `入住店铺`. The page lists all current affiliations with the original application shop first and provides `追加` for a separate shop-partnership application. Initial technician approval creates both the technician identity and its first partnership; later approvals preserve that identity and primary shop while adding another partnership. If dismissal or resignation leaves zero current affiliations, the identity remains selectable, but authentication retains only login/navigation, self-profile read, and shop-application permissions until a shop approves a new partnership.

## Formal NDP Top-up and Withdrawal Review

Customer, technician, and merchant identities can submit NDP top-up or withdrawal requests through the formal wallet API. The backend derives the target user or shop wallet from the active identity; clients cannot select another wallet owner. Operations and finance review requests through protected backoffice APIs. Approval atomically changes the available NDP balance, writes one immutable ledger entry, creates finance reconciliation and audit evidence, and links the request to that transaction. Rejection does not change the wallet, duplicate approval is idempotent, and insufficient withdrawals roll back completely.

External bank/card/payout APIs remain deferred. The current production workflow records the manually verified bank reference and review note.

Verify this lifecycle against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:wallet-adjustment-flow
```

The check refuses production flags and remote database hosts, covers idempotent create/review, approved top-up and withdrawal, insufficient-balance rollback, rejection without mutation, ledger entries and reconciliation, then removes its uniquely named records.

## Formal Booking Platform Fee Debt and Reward

Booking confirmation now resolves the persisted shop policy and snapshots the fee switch, 500 NDP amount, policy/global versions, payer identity, and exact payer wallet inside the confirmation transaction. A disabled shop policy creates no hold or wallet/ledger movement and also disables the 100 NDP customer reward. A shop payer uses its shop wallet; a technician payer uses that technician user's global wallet, so later shop changes do not move the debt.

When the payer wallet is short, the first confirmation returns a structured conflict without partial writes. A second request must include the matching preview plus a unique explicit-confirmation key; only then may the complete 500 NDP hold make the payer's available balance negative. Cancellation returns the original hold. Completion consumes the stored snapshot, records the outstanding shortfall, and either grants the 100 NDP reward immediately or keeps it pending for exactly seven days. Only an approved top-up allocates debt FIFO. Settlement before the deadline grants the reward once; the bounded background worker marks overdue pending rewards expired, and a later top-up settles debt without restoring the reward.

Migration `20260829010000_booking_platform_fee_debt_reward` is additive and has been applied to the formal local `needo_dev` database. Verify the real service/repository flow with a local non-production database:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:booking-platform-fee-debt-flow
```

The checker rejects production flags, remote MySQL hosts, and production-looking database names. It creates uniquely marked real users, customer/technician profiles, shops, services, schedule slots, bookings, wallets, holds, ledger entries, adjustments, and audits; exercises disabled/shop/technician payer, rollback, explicit and consecutive overdrafts, cancellation, immediate/delayed/expired reward, and replay behavior. It also uses real MySQL barriers to force both completion-first and top-up-first races. Settlement locks the payer wallet before reading the complete `OrderFinancial` row with `FOR UPDATE`; top-up and expiry use the same locking read, and reward deadlines use `CURRENT_TIMESTAMP(3)`. The current check creates 7 users, 9 shops, and 10 bookings, then proves exact pre/post aggregate equality after marker-only cleanup.

The additive Booking slice uses migration `20260829130000_order_acceptance_pause`. It introduces persisted merchant-group/shop acceptance pauses with separate operations, merchant, and shop authorities. Active pauses leave availability visible and still allow a customer to create a `PENDING` order, but block only `PENDING → CONFIRMED` before settlement. All active authorities must release their own pause before confirmation can proceed. Ordinary customers are serialized on the real User row and atomically replace all older `PENDING` orders; `membershipLevel=black` is the only multiple-PENDING exception. Replacement cancellation, slot capacity release, status history, affiliate invalidation, and the new order share one transaction, including rollback when the new slot cannot be committed.

Before formal apply, the guarded local checker below was run against `needo_dev`. It dry-ran the DDL, validated its 17 columns, four foreign keys, and four checks, transactionally rolled back the permission DML, ran real repository/service scenarios, proved exact marker cleanup, and dropped the dry-run table without recording the migration. Use it only on a fresh local non-production schema where the migration has not yet been applied:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:order-acceptance-control-migration
```

Migration `20260829130000_order_acceptance_pause` has now been applied through Prisma to the formal local `needo_dev` database. `prisma migrate status` reports all 61 repository migrations up to date. The post-apply real-flow command composes the acceptance-control and Affiliate checkout checkers: it covers membership-unlink/confirmation serialization plus multi-order same-task Affiliate budget reuse, then proves exact fixture cleanup and zero financial or ledger drift:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:order-acceptance-control-flow
```

This evidence is local database acceptance only; it is not a production deployment. Do not bypass Prisma migration history or copy only an external step's SQL without its matching schema and code.

## Formal Customer Reservations

Numeric checkout routes load the formal service detail and current bookable schedule inventory, then create the reservation through the authenticated Booking API. A successful submission navigates directly to the persisted numeric order without copying it into browser storage. The customer reservation list reads only the paginated Booking API. Numeric reservation detail routes load the formal order, payment state, and complete status history from the backend, and customer cancellation is submitted through the protected order-status endpoint. Browser-local order creation, hiding, deletion, review mutation, and mock-order merging are not used in this formal lane. Legacy nonnumeric demo links remain isolated compatibility.

The technician portal's visible order tab is also identity-scoped to the formal order API. Technicians accept pending orders, start confirmed service, complete active service, or cancel eligible orders through the protected state-machine endpoints. Every returned status history is rendered from the database; the formal panel does not use the legacy service-session store or browser-local order mutations.

Authenticated customer identities now receive an API-backed “My” page. `GET /api/v1/customer-profile/me` resolves the profile solely from the active customer identity, and `PATCH /api/v1/customer-profile/me` persists a non-empty, Zod-validated partial edit with `customer-profile:read` / `customer-profile:write` permissions. Clients cannot select a profile ID. Successful writes use the `customer_profile.self_update` audit action and return the current persisted profile so the card updates without a browser-storage merge. Each reservation-status counter uses the paginated API `total`, and available/frozen NDP balances come from `GET /api/v1/wallets/me`.

On `/me`, the information card switches in place between normal and editable state. The top-right control is an edit action normally and a red X while editing; cancelling discards only the current draft. The ordinary user bottom navigation is disabled for the view, loading, error, editing, and saving states. Editing shows the single viewport-fixed “保存并退出编辑模式” action with safe-area spacing, while NDP, usage count, credit score, NeeDo ID, and membership level remain read-only. Profile reads and writes always use the formal authenticated API.

Shop membership is a separate, shop-scoped relationship from the NeeDo platform-level `CustomerProfile.membershipLevel`. Merchant membership routes live under `/api/v1/merchant-admin/shop-memberships`, `/api/v1/merchant-admin/shop-membership-candidates`, `/api/v1/merchant-admin/shop-membership-cards`, `/api/v1/merchant-admin/shop-membership-activities`, and `/api/v1/merchant-admin/shop-membership-analytics`; every query derives the shop from the active authenticated `shop` identity. Customer self-service reads use `/api/v1/customer-profile/me/shop-memberships` and never accept a user or profile ID. `merchant_owner` receives view, create, analytics, operation-log, card-plan, issuance, card-adjustment, stored-value top-up, and card-refund permissions; `merchant_staff` may redeem an eligible completed order but cannot refund it. Creating a shop membership requires a persisted booking relationship and writes audit evidence transactionally. Card plans, formal issuance, post-issuance customer-approved corrections, immediate offline-paid stored-value top-ups, completed-order redemption, NDP reward settlement, and redemption refund are database-backed. An adjustment takes effect only after the owning customer explicitly approves it within 72 hours, and expiry never auto-approves; a top-up credits only exact paid principal and never creates NDP. Redemption consumes immutable paid principal or uses and applies the published NDP reward plus platform fee without freezing funds. Refund is allowed only after the linked Booking payment is formally refunded: it restores the exact original card consumption, cancels a pending reward or reverses a paid customer reward and platform fee through a balanced ledger transaction, and preserves visible negative customer/platform balances for automatic offset by future credits. The `TEST` badge marks feature maturity only.

Customer avatars are accepted only as bounded JPEG, PNG, or WebP data URLs, stored under a SHA-256 content hash, and exposed as immutable files under `/media/customer-avatars/:contentHash.ext`; original browser data URLs are never stored in MySQL. Configure `CUSTOMER_AVATAR_STORAGE_DIR` (local default: `runtime/customer-avatars`) and `CUSTOMER_AVATAR_PUBLIC_BASE_URL` (local default: `http://localhost:3000/media/customer-avatars`). Production requires an HTTPS avatar public base URL.

The operations dashboard now renders the protected backoffice aggregate for metrics, orders, schedule inventory, financial totals, shops, and technicians. Headline technician volume uses an exact scoped database count rather than the six-row preview list length. City trends, field jobs, risk scores, and merchant-health scoring stay visibly disabled until formal aggregate contracts exist; the production dashboard no longer substitutes demo metrics for these modules.

The operations timeline route is an explicit production capability gate. It does not present sample events, owners, cities, priorities, or handling states as persisted work. Activation requires formal event and incident records, audited assignment and resolution state machines, cross-city RBAC, and server-side filter, pagination, aggregate, and export contracts.

The platform dispatch route is also an explicit capability gate. An operations identity is never redirected into a merchant-scoped dispatch workspace. Cross-shop dispatch remains unavailable until persisted dispatch jobs, assignments and exceptions; assignment/reassignment/escalation state machines; cross-shop technician availability and conflict locks; platform RBAC, audit, SLA, pagination, aggregate and export contracts are complete.

The formal travel-fare lane is database-backed. A merchant can read and publish immutable, selected-shop fare-policy versions with strictly increasing driving-distance bands; operations can read redacted provider readiness and paginated current/scheduled policy visibility. A home checkout submits a structured Japanese address and selected schedule slot to `POST /api/v1/bookings/travel-estimates`, displays the server-owned distance, matching band and JPY fare, and cannot submit until the unconsumed estimate is valid. Booking atomically revalidates the same slot, consumes the estimate, and snapshots the policy, band, route evidence, normalized fulfillment address, and fare. Store checkout remains unchanged and rejects estimate injection.

Geoapify is the first provider. Set `TRAVEL_ROUTE_PROVIDER=geoapify` and supply `GEOAPIFY_API_KEY` manually in the formal backend environment; validated settings include `GEOAPIFY_API_BASE_URL`, `TRAVEL_ROUTE_TIMEOUT_MS`, `TRAVEL_ROUTE_MAX_RETRIES`, `TRAVEL_ROUTE_CACHE_TTL_SECONDS`, `TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS`, and `TRAVEL_ESTIMATE_TTL_SECONDS`. Route-provider runtime health is shared across the client and operations API processes through `TRAVEL_ROUTE_HEALTH_REDIS_URL`, with an expiring observation controlled by `TRAVEL_ROUTE_HEALTH_TTL_SECONDS`; every process must point this setting at the same Redis database. Until a real key is present, the provider-status API reports `unconfigured` and estimate creation returns `error.travel.provider_unconfigured`; after configuration it reports `configured` until a request is observed, then `healthy`, `rate_limited`, or `unavailable` with a redacted observation time. If the shared health store cannot be read, the status request fails closed with the stable Redis dependency error; a failed health write never changes the underlying route result. The system never substitutes bundled city tables, static distances, simulated routes, or fabricated fares. Credentials, raw provider payloads, normalized-address inputs, and address-hash inputs are excluded from route-estimate/provider/operations responses and audit logs; the authenticated customer's own order detail may return its persisted fulfillment-address snapshot.

Checkout uses `base + accepted add-ons + travel fare - discount`, then the existing snapshotted NDP conversion. Operations recognizes travel fare only from completed, payment-evidenced, non-refunded, non-reversed, snapshot-consistent checkouts; detail rows omit the customer address. The additive migrations are `20260905150000_shop_travel_fare_routing`, `20260905160000_route_estimate_schedule_slot_binding`, and `20260905170000_order_checkout_travel_fare_total`. First run the read-only status command and inspect the exact pending set. Run `migrate:deploy` only when every pending migration belongs to the approved release; never use an unrelated migration to unblock this checker. A local, non-production formal MySQL acceptance run is rollback-only and restores its baseline:

```bash
ENV_FILE=/absolute/path/to/backend/.env.dev npm --prefix backend run prisma:status
ENV_FILE=/absolute/path/to/backend/.env.dev npm --prefix backend run prisma:migrate:deploy
AUTH_TOKEN_AUDIENCE=needo-backend FORMAL_BACKEND_ENV_FILE=/absolute/path/to/backend/.env.dev npm --prefix backend run check:shop-travel-fare-flow
```

The checker refuses remote or production-looking databases, verifies migration/schema/RBAC evidence, uses a deterministic routing-provider seam without pretending to be a live Geoapify response, creates and settles the order through the production Booking and Ledger services, proves single estimate consumption, Booking snapshot and checkout arithmetic, completion recognition, refund exclusion, and redacted audits inside a rollback-only transaction. A separate dedicated-fixture phase runs two competing production Booking repository transactions against the same estimate, requires exactly one order and snapshot plus one consumed result, deletes only its captured fixture IDs, and compares the full baseline. Live Geoapify acceptance remains gated only by manual key provisioning.

The operations demand and information routes are explicit production exchange capability gates. They do not assemble records, publisher identities, contacts, interactions, payment, or fulfillment data from the mobile demo feed. Activation requires persisted exchange posts, demands, offers, and replies; audited moderation and publication state machines; scoped identity/contact privacy; and matching, booking, payment, pagination, and export contracts.

The operations Afirieito route remains an explicit UI capability gate. Formal operations APIs can list, inspect, approve, and reject persisted affiliate tasks; the formal affiliate marketplace can issue one stable promotion code and signed URL per task/user; Booking Checkout persists validated attribution, allocation, and customer-discount price snapshots; service completion settles fixed NDP rewards; and the backend automatically ends due tasks and releases only their unallocated frozen budget. The route still does not mount the browser-local CPS workspace or expose unverified GMV, ROI, promoter, risk, reward, or settlement metrics. Activating the complete Afirieito UI still requires completed-order reversal, fraud, aggregate, export, and UI microsteps. The independent business CPS compatibility portal remains isolated and is not presented as formal operations data.

### Formal Affiliate Alliance Invitations

The user Affiliate alliance page now uses real APIs for reciprocal-contact candidate discovery, owner member lists, sent/received invitations, partner/subordinate hierarchy assignment, accept/reject, exact 72-hour expiry, least-privilege membership, and conditional wallet visibility. All transitions are persisted and audited; cross-alliance acceptance is protected by the single-active-membership constraint. See [the alliance foundation](docs/affiliate-alliance-foundation.md) and [the invitation workflow](docs/affiliate-alliance-invitations.md). This is one formal slice, not the completed Affiliate platform.

### Formal Affiliate Task Publishing and Review

The formal alliance-marketing foundation persists tasks, explicit shop/service scope snapshots, claims, hashed signed-link tokens, touches, one-attribution-per-order records, fixed-NDP rewards, task budget reservations, ledger links, and risk events. It extends wallets to support merchant-account ownership and seeds role-specific affiliate menu/page/button permissions.

Merchant accounts and current-shop identities now have formal paginated APIs to create and edit unfunded drafts, inspect their tasks, and submit a task for review. Drafts never mutate a wallet. Submit revalidates the publisher's active shop/service scope, refreshes immutable display snapshots, snapshots the effective Affiliate fee rule, then atomically freezes commission budget plus fee reserve, creates a budget reservation and ledger link, writes reconciliation/audit evidence, and moves the task to `pending_review`. A concurrent or repeated submit cannot duplicate the freeze.

Every task now persists independent Japanese, English, Korean, Traditional Chinese, and Simplified Chinese name/description rows. Creating a draft from any selected source language copies that first value to all five rows; subsequent edits affect only the selected language unless the merchant explicitly requests synchronization to all languages. The optimistic task lock protects every language edit, and each change is audited. Submission requires publishable task content in at least one language; when every language is missing or blank, it returns `error.affiliate.task_content_required` before any NDP is frozen. Marketplace search matches every active language. Task cards and detail pages select the authored value for the user's current application language, and use the task's formal compatibility snapshot if that language is absent; they never machine-translate authored content.

Operations users can list/detail tasks and approve or reject a pending task. Approval produces `scheduled` or `active` from the task window. Rejection atomically returns the complete unused frozen budget to available NDP, retains the historical reserved amount for budget conservation, marks the reservation released, and writes one release ledger/reconciliation/audit trail. Insufficient funds, stale optimistic locks, invalid merchant membership, invalid service scope, and transaction failures roll back without partial writes.

The Affiliate fee is added to the publisher's commission budget and never deducted from the promoter's advertised reward. At the default 10% rate, a 2,000,000 NDP task freezes 2,200,000 NDP. Each completed 10,000 NDP reward captures 11,000 from the publisher's frozen wallet, credits 10,000 to the claimant, and credits 1,000 to the platform wallet in one reconciled transaction. Task, reservation, reward, ledger, and audit rows retain the immutable split. Later fee-rule versions never rewrite an existing task snapshot.

Formal endpoints:

- `GET|POST /api/v1/merchant-admin/affiliate/tasks`
- `GET|PATCH /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `PUT /api/v1/merchant-admin/affiliate/tasks/:taskId/locales/:locale`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/submit`
- `GET /api/v1/backoffice/affiliate/tasks`
- `GET /api/v1/backoffice/affiliate/tasks/:taskId`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/approve`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/reject`
- `GET /api/v1/backoffice/affiliate/fee-rules`
- `POST /api/v1/backoffice/affiliate/fee-rules`

Verify the complete transaction flow against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-publishing-flow
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-localization-flow
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-platform-fee-flow
```

The check refuses production flags and remote database hosts, verifies draft/no-freeze, shop and merchant-account freezes, refreshed snapshots, insufficient-funds rollback, membership isolation, review state, full rejection release, idempotency, ledger/reconciliation/audit evidence, and removes only its uniquely identified rows.

The localization checker refuses remote, staging, and production-looking targets; verifies initial five-language copy, independent editing, explicit synchronize-all, rejection with no freeze when every language lacks content, successful one-language submission with exactly one budget freeze, translation audit evidence, and exact marker-only cleanup. This task-localization microstep does not yet activate the merchant/shop task-management editor. Manual pause/resume or early-end controls, completed-order reversal, dashboards, metrics, exports, and the complete merchant UI remain capability-gated. No formal affiliate task or metric is seeded into production data.

The Affiliate platform-fee checker additionally rejects production flags, remote MySQL, and production-like database names. It proves exact gross freeze/capture, three-wallet settlement, shop override immutability, multi-shop rate mismatch before wallet mutation, split rejection/expiry release, idempotent rule/freeze/settlement evidence, and exact row-count plus wallet-balance restoration through a rolled-back fixture transaction.

### Formal Affiliate Marketplace Claims And Signed Links

Any active identity with the affiliate marketplace permissions can browse currently eligible, fully funded tasks and claim one. Claiming is idempotent per task/user: the first request creates a Claim and returns `201`; later or concurrent requests return the same persisted Claim with `200`. Each Claim receives one non-guessable `NDO-...` promotion code and an HMAC-signed URL. Only the token hash is persisted, sensitive claimant and budget fields are excluded from public views, and Claim creation writes one token-free audit record without allocating or settling any reward budget.

Formal endpoints:

- `GET /api/v1/affiliate/tasks`
- `GET /api/v1/affiliate/tasks/:taskId`
- `POST /api/v1/affiliate/tasks/:taskId/claims`
- `GET /api/v1/affiliate/claims`
- `GET /api/v1/affiliate/claims/:claimId`
- `GET /api/v1/affiliate/resolve/:publicToken`

Runtime configuration requires a dedicated secret and the public affiliate landing-page base URL. Production rejects placeholder/shared secrets, non-HTTPS public URLs, and example hosts:

```bash
AFFILIATE_LINK_SECRET=<dedicated-random-secret-at-least-32-characters>
AFFILIATE_PUBLIC_BASE_URL=https://app.needo.jp/afirieito
```

Verify the formal contract against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-marketplace-claim-flow
```

The guarded check rejects remote and production-looking databases, verifies marketplace filtering, first/concurrent/duplicate claiming, stable code and URL reconstruction, tamper rejection, current-user Claim isolation, unchanged wallet balances, audit evidence, and exact marker cleanup. Claim creation itself does not allocate or settle reward budget; those changes occur only in Booking Checkout and the service-completion transaction.

The protected mobile Affiliate experience now consumes those formal endpoints on `/afirieito`, `/afirieito/plan`, and `/afirieito/tasks/:taskId`. Its announcement carousel remains independent from the ordinary user-home carousel; recommended-task cards, search, server pagination, task detail, public store navigation, IM directory prefill, and idempotent participation all use persisted API data. See [Affiliate marketplace mobile UI](docs/affiliate-marketplace-mobile-ui.md) for the data/privacy boundary, verification evidence, and remaining formal microsteps.

### Formal Affiliate Checkout Attribution And Customer Discounts

Booking creation accepts an optional explicit promotion code or signed affiliate public token. When both are supplied, the explicit code wins. The Booking transaction locks the Claim, Task, budget reservation, and schedule slot; revalidates task time/state, claimant separation, shop/service scope, minimum order amount, and remaining reward allocation; then persists one Touch, one active Attribution, Claim/Task counters, the allocated reward amount, and the order's original price, discount, and final-price snapshots atomically.

Customer discounts support no discount, fixed integer JPY, or basis-point percentage with an optional JPY cap. The discount changes the customer's Booking price only; it never reduces the frozen NDP reward budget. A valid Checkout allocates exactly one future fixed-NDP reward but does not move wallet balances and does not create an `AffiliateReward`. A pre-completion cancellation invalidates the Attribution and releases that allocation in the same order-state transaction.

Formal endpoints:

- `POST /api/v1/affiliate/codes/validate`
- `POST /api/v1/bookings` with optional `affiliateCode` / `affiliatePublicToken`
- `POST /api/v1/bookings/:bookingId/actions` with `cancel` releasing active attribution

Verify the transaction contract against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-checkout-attribution-flow
```

The guarded check verifies fixed, capped-percent, and no-discount snapshots; explicit-code priority; self-attribution, scope, minimum, task-state, and budget rejection; concurrent last-budget and last-slot safety; cancellation invalidation and exact allocation release; unchanged wallet balances; zero pre-completion Rewards; token-free audits; and marker-owned cleanup.

Checkout itself still does not move reward wallet balances. The following service-completion microstep now performs that settlement. Automatic task-end unfreezing is a separate completed backend microstep; completed-order reward reversal, dashboard aggregates, and the merchant, shop, marketplace, or Afirieito UI remain subsequent capability-gated microsteps.

### Formal Affiliate Service-Completion Rewards

Only an order transition from `inService` to `completed` can settle an affiliate reward. The order transaction first runs the existing Booking finance settlement and then locks the Attribution, Task, Claim, and BudgetReservation before settling the snapshotted fixed NDP amount. The publisher's frozen NDP decreases, the claimant's existing User wallet available NDP increases, allocated budget becomes captured budget, and the same transaction writes Reward, two wallet-ledger entries, reconciliation, affiliate transaction links, and audits. No separate affiliate wallet or balance source exists.

The settlement idempotency key is stable per task and Booking. Repeated or concurrent completion cannot duplicate money, Reward, counters, or audit evidence. Claim/customer completion limits invalidate the current Attribution and release its allocation without blocking the service order's completion. Snapshot mismatch, missing finance links, or insufficient frozen NDP is a financial-integrity error and rolls back the complete order transition.

Formal endpoint:

- `POST /api/v1/orders/:id/complete`

Verify the full transaction contract against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```

The guarded check verifies zero Reward before completion, exact publisher/claimant wallet deltas, allocated-to-captured conservation, Reward and ledger/reconciliation/audit links, repeated and concurrent idempotency, claim/customer limit release, frozen-shortage rollback, and exact marker cleanup. Completed-order reversal/recovery, aggregate APIs, exports, and complete affiliate UI remain capability-gated.

### Formal Affiliate Task Expiry Budget Release

The formal backend runs the affiliate-task expiry worker immediately at startup and then at a configured interval. At `now >= taskEndsAt`, it moves eligible `scheduled`, `active`, `paused`, or `budget_exhausted` tasks to `ended`, preventing new claims and attribution while releasing only the currently unallocated frozen NDP to the original publisher wallet. Each task is independently transactionally processed; multi-instance correctness relies on task/reservation row locks, guarded aggregate updates, and ledger idempotency rather than one process timer.

Attributions that were valid before expiry retain their `allocatedNdp`: a later service completion can still capture and settle that allocation. If a later cancellation or limit invalidation releases an allocation after the task has ended, the worker deliberately rescans ended tasks with newly unallocated NDP and returns the new increment on a later run. The scanner keeps forward and bounded revisit cursors, so newly eligible lower IDs cannot starve behind full higher-ID pages. Expiry and formal booking-transition repositories retry retryable transaction conflicts at most three times; the guarded acceptance does not replay race losers itself. The release idempotency key is cumulative rather than per-worker-run:

```text
affiliate-task:<taskId>:expiry-release:to:<releasedAfterNdp>
```

Runtime configuration is validated at startup:

- `AFFILIATE_TASK_EXPIRY_INTERVAL_MS`: default `300000` (5 minutes); minimum `60000`.
- `AFFILIATE_TASK_EXPIRY_BATCH_SIZE`: default `100`; integer range `1..500`.

Verify expiry, preserved allocations, later incremental release, concurrency idempotency, ledger/reconciliation/audit evidence, and exact marker cleanup against a local non-production MySQL database:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-expiry-flow
```

The guarded check rejects production/staging targets, remote MySQL hosts, and production-looking database names. It creates only uniquely marked fixtures and removes only those fixtures after the check. This backend microstep adds no public API, schema, permission, merchant/shop/marketplace/Afirieito UI, aggregate/export, fraud operation, manual early-end control, or completed-order refund reversal; those capabilities remain separately gated.

The operations carousel and avatar-ornament routes are explicit content-publication capability gates. They do not publish browser-stored slides or generated grant records. Activation requires versioned carousel and ornament records, audited draft/review/publish/rollback or grant/revoke lifecycles, complete MediaAsset write controls, portal-scoped reads, RBAC, pagination, and export contracts.

The official-notice list and compose routes are explicit delivery capability gates. They do not show bundled update history or browser-stored drafts, attachments, target accounts, and schedules as sent notices. The existing Notification table remains available for recipient-side event notifications; administrator broadcasts additionally require persisted notices, audience snapshots, per-recipient delivery attempts, idempotent workers, retry and failure receipts, attachment storage, RBAC, and audit evidence.

The operations support route is an explicit support-case capability gate. It does not publish unverified hard-coded email, LINE, phone or hours, and it does not expose inert copy/on-call actions as working support. Activation requires persisted tickets, messages, attachments and on-call policies; audited assignment, SLA, escalation, resolution, close and reopen states; tenant RBAC, PII masking, attachment authorization, delivery receipts, search, pagination, SLA aggregates and exports. Official contact channels must come from reviewed versioned configuration.

The operations and merchant overview/analytics surfaces are now each a single formal “数据大盘”. Operations uses `/admin` and `GET /api/v1/backoffice/dashboard`; merchant uses `/merchant-admin` and `GET /api/v1/merchant-admin/dashboard`. The old `/admin/analytics` and `/merchant-admin/analytics` routes and their duplicate pages are retired. Both APIs accept the strict Tokyo-calendar periods `today | last7days | last30days | week | month | year | custom`; only `custom` accepts inclusive `from`/`to` dates, with a maximum of 366 days. Operations alone accepts an exact persisted `city`; merchant requests cannot submit `city` or `shopId`.

The named Dashboard payload contains `filter`, comparison `summary`, `series.buckets`, separated formal/Test NDP `finance`, `shop`, `membership`, and signed `scope`. Operations shows five core metrics and three trend pairs; platform wallet stock and withdrawals remain explicitly platform-global and are not changed by the city filter. Merchant shows the real shop/billing/current-wallet card, four core metrics, order/GMV and profit trends, schedule-hour bars, NDP cost split, and frozen NDP. `shopEstimatedGrossProfitJpy` is service GMV minus technician gross income minus the shop-borne NDP amount; technician gross income is base pay plus commission plus minimum-guarantee adjustment plus bonus minus deduction. Membership is intentionally `{ memberCount:null, memberDataStatus:"not_available", completedCustomerCount }` until the membership-card data source exists: the large value stays unavailable while the small “利用者数” is the real distinct count of customers with at least one completed order in the selected period.

The shared merchant-admin shell is the single shop-scoped Dashboard resource owner. Requests are isolated by account, active identity, signed shop, query, and preview scope; stale requests cannot replace a newer shop/query result. A multi-shop merchant loads `GET /api/v1/merchant-admin/manageable-shops` and switches through `POST /api/v1/auth/merchant-shop/switch`. The backend revalidates active membership and RBAC, rotates both tokens, revokes the old session credentials, signs the selected public shop ID, and writes `auth.merchant_shop.switch`; every merchant service then follows the same resolved shop. Single-shop identities cannot use the list to broaden their scope. Exact fields, formulas, Tokyo boundaries, city exceptions, RBAC, audit actions, and the no-migration boundary are documented in `docs/backoffice-real-data.md`.

The operations and merchant inventory routes are explicit production capability gates. They do not render sample stock, low-stock alerts, replenishment suggestions, purchase drafts, or browser-local inventory mutations. Activation requires formal item, location, and stock-movement tables; transactional purchase, transfer, count, receipt, and issue state machines; idempotency, inventory locking, RBAC, and audit evidence; plus alert, aggregate, and export contracts.

The operations and merchant floor-control routes are also explicit production capability gates. They do not expose sample rooms, beds, workstations, utilization, revenue, booking occupancy, or browser-local layout edits. Activation requires versioned floor-area and resource records, shop-scoped draft/publish/rollback APIs, coordinate validation, optimistic locking, RBAC and audit evidence, and live occupancy derived from formal Booking and Schedule data.

The common Booking order API now enforces the same active-identity boundary for reads and state transitions: customers see their own orders, merchant identities see only their current shop, technician identities see only their assigned profile, and only global platform identities can operate across shops. Out-of-scope detail and mutation requests are returned as not found.

Operations and merchant order aggregates now carry the persisted manual-payment state instead of returning a hard-coded unpaid value, so confirmed payments, refund-pending orders, and refunded orders remain accurate on every formal admin surface.

## Current Scope

- 用户端 Web App：深色首页、分类、搜索、服务列表、服务详情、店铺列表、店铺详情、下单流程、订单、用户中心、客服入口。
- 端侧移动应用：用户端、商户端、技师端共享白天 / 黑夜两套视觉主题，客户端主题与语言设置集中在统一的设置中心。
- 运营后台：数据大盘、Data Center、Orders、Field Jobs、CRM、Marketing、Finance、Reviews、Merchants、Roles、Travel Settings。
- 店铺后台：数据大盘、订单中心、调度中心（排班当前周期确认 / 排班：手动、自动、智能）、场控布局、库存管理、财务结算、人员与顾客、门店设置。
- 复用组件：按钮、标签、指标卡、筛选器、表格、详情抽屉、Tabs、后台 Layout、移动端 Shell。
- Legacy mock compatibility：旧页面仍有兼容数据；Auth、User Management、主数据、正式可预约排班、用户正式预约列表/详情、线下收款和 NDP 充值提现审核已迁移到 API/Prisma，禁止新增正式业务 mock。
- 多语言：用户端与后台端支持日本語、English、한국어、繁體中文、简体中文五语切换，语言偏好会保存在本地；正式公告、规则和预约/联盟营销等可发布内容使用独立的服务端语言版本。
- 后台主题：运营控制台支持黑夜 / 白天两套视觉主题，可在后台顶部随时切换。

## 2026-04 Frontend UI Rebuild

这一轮重点只处理前端 UI 层，不重做底层业务逻辑、不重做数据库结构，也不改动底部导航的入口数量、顺序和主交互逻辑。

### 本次重做范围

- 用户端首页：`/`
- 搜索页：`/search`
- 服务详情页：`/services/:id`
- 店铺详情页：`/stores/:id`
- 用户 / 技师 / 店铺资料页：`/profiles/:entityType/:id`
- 预约页：`/checkout/:serviceId`
- 预约列表页：`/orders`
- 预约详情页：`/orders/:orderId`
- 我的页：`/me`
- 设置中心及子页：
  - 用户端
    - `/me/settings`
    - `/me/settings/theme`
    - `/me/settings/language`
    - `/me/settings/portal`
    - `/me/settings/home-shortcuts`
    - `/me/settings/verification`
    - `/me/settings/service-range`
    - `/me/settings/account`
    - `/me/settings/notifications`
    - `/me/settings/help`
    - `/me/settings/about`
  - 技师端
    - `/technician/settings`
    - `/technician/settings/theme`
    - `/technician/settings/language`
    - `/technician/settings/portal`
    - `/technician/settings/profile`
    - `/technician/settings/verification`
    - `/technician/settings/service-range`
    - `/technician/settings/account`
    - `/technician/settings/notifications`
    - `/technician/settings/help`
    - `/technician/settings/about`
  - 商户端
    - `/merchant/settings`
    - `/merchant/settings/theme`
    - `/merchant/settings/language`
    - `/merchant/settings/portal`
    - `/merchant/settings/profile`
    - `/merchant/settings/verification`
    - `/merchant/settings/account`
    - `/merchant/settings/notifications`
    - `/merchant/settings/help`
    - `/merchant/settings/about`
- 动态页：`/moments`
- IM 模块的聊天 / 通讯录 / 信息页：继续沿用既有路由，但已统一接入新主题 token 与顶部栏风格

### 已从全屏浮层改为真实新页面的内容

- 我的页资料编辑：统一由 `/me` 个人中心内的信息卡编辑模式承载；旧 `/me/settings/profile` 仅保留兼容重定向
- 订单详情：从订单列表覆盖式全屏层迁移到 `/orders/:orderId`
- 订单中的关联资料查看：统一改为跳转到对应资料页 / 服务页 / 店铺页
- 首页中的预约确认、位置选择等旧式全屏流程：收敛回真实搜索页、详情页与预约页
- 动态页中资料详情覆盖层：改为直接跳转真实资料页

### 双主题 token 设计

主题不再复制两套页面代码，而是基于同一套组件与 token 切换：

- `noir-gold`
  - 黑金版
  - 高级灰黑背景 + 柔和金色主色
  - 对应旧语义 `night`
- `vital-mono`
  - 活力黑白版
  - 白色主界面 + 深黑模块 + 亮蓝点缀
  - 对应白天语义 `day`
- `jade-light`
  - 白绿版
  - 清爽白底 + 克制绿色主色
  - 对应旧语义 `day`
- `neon-pink`
  - 霓虹粉紫版
  - 深蓝黑底 + 粉紫霓虹高光 + 柔和玻璃卡
  - 对应旧语义 `night`

当前核心 token 维度包括：

- `--client-bg`
- `--client-bg-soft`
- `--client-surface`
- `--client-elevated`
- `--client-line`
- `--client-text`
- `--client-muted`
- `--client-primary`
- `--client-primary-soft`
- `--client-accent`
- `--client-warm`
- `--client-shadow`
- `--client-overlay`

### 统一组件骨架

本轮新增并统一复用的用户端页面骨架位于：

- `src/components/client-ui/AppScaffold.tsx`
- `src/components/client-ui/SettingsDirectory.tsx`
- `src/features/settings/UnifiedSettingsPages.tsx`
- `src/features/settings/portalSettingsState.ts`

主要负责：

- 固定顶部导航：`AppTopBar`
- 页面壳层与响应式容器：`PageScaffold`
- 首屏主视觉区：`HeroHeader`
- 统一分组区块：`SectionBlock`
- 统一列表项：`UnifiedListItem`
- 固定底部操作区：`StickyBottomBar`
- 设置入口行：`SettingsEntryRow`
- 设置目录页与二级设置页：`SettingsHomePage`、`SettingsSection`、`SettingsListItem`、`SettingsDetailPage`、`SettingsRadioListPage`
- 三端统一设置模块：`UnifiedSettingsPage`、`UnifiedSettingsThemePage`、`UnifiedSettingsLanguagePage`、`UnifiedSettingsPortalPage`、`UnifiedSettingsProfilePage`

### 响应式适配策略

采用 mobile-first，但不再把桌面端限制在手机壳宽度里：

- 手机
  - 单列为主
  - 底部导航保留原结构
  - 详情页和设置页使用完整页面跳转
- 平板
  - 首页、详情页、预约页、设置页开始使用自然双列
  - 信息区与操作区横向展开
- 桌面 / Web 宽屏
  - 页面主容器放宽到 `max-w-[1480px]`
  - 底部导航独立居中，但内容区按宽屏重新组织
  - 首页、详情页、预约页采用左右分栏，不再把所有内容挤成窄列

### 各端布局变化规则

- 首页：
  - 手机为纵向 section 流
  - 平板 / 桌面拆成主视觉 + 推荐内容的多列布局
- 详情页：
  - 手机以主图 + 摘要 + section 纵向展开
  - 平板 / 桌面拆成信息列 + 预约 / 关联内容列
- 预约页：
  - 手机以步骤流为主
  - 平板 / 桌面拆成配置列 + 确认列
- 设置页：
  - 首页改为目录式总览
  - 二级页承接主题、语言、身份、通知等详细操作

### 设置中心结构

设置统一从【我的】页右上角齿轮进入：

- 外观与系统
  - UI 切换：`/me/settings/theme`
  - 语言切换：`/me/settings/language`
  - 身份切换：`/me/settings/portal`
  - 常用入口（仅用户端）：`/me/settings/home-shortcuts`
- 个人资料与认证
  - 资料编辑
  - 本人验证 / 店铺资质：`/me/settings/verification`
  - 服务范围（技师端）：`/me/settings/service-range`
- 账户与安全
  - 账户与安全：`/me/settings/account`
- 通知与隐私
  - 通知设置：`/me/settings/notifications`
- 其他
  - 帮助与反馈：`/me/settings/help`
  - 关于 NeeDo：`/me/settings/about`

### 三端设置页统一重构

当前已经把用户端、技师端、商户端的设置页真正收口到同一套模块体系里，不再只是共用右上角齿轮按钮。

#### 重构前的差异

- 用户端已经有独立设置路由与目录式首页：`/me/settings*`
- 技师端仍把设置塞在 `我的` 页 hash 区域里：`/technician/me#settings`
- 商户端仍把偏好、经营开关、资料按钮堆在 `我的` 页内部：`/merchant/me`
- 主题、语言之外的很多设置能力仍然是三端各自实现

#### 统一后的模块结构

- 页面与路由统一由 `src/features/settings/UnifiedSettingsPages.tsx` 承载
- 三端共有设置状态统一由 `src/features/settings/portalSettingsState.ts` 管理
- 通用设置骨架继续复用 `src/components/client-ui/SettingsDirectory.tsx`
- 用户端 `src/pages/user/UserSettingsPages.tsx` 现在只是对统一模块的轻量封装，不再维护独立页面逻辑

#### 已直接复用用户端模块的功能

- UI 切换
- 语言切换
- 身份切换
- 账户与安全
- 通知设置
- 帮助与反馈
- 关于 NeeDo
- 验证 / 资质页骨架

#### 作为技师 / 商户独有项保留的能力

- 技师端保留：
  - 服务范围
  - 接单 / 位置 / 日程提醒开关
  - 技师资料编辑内容
- 商户端保留：
  - 店铺信息维护
  - 店铺资质
  - 店铺上线 / 自动确认 / 即时预约 / 评价提醒等经营开关
  - 店铺 PC 后台入口

这些独有能力不再单独设计页面，而是挂到同一套设置首页、同一套详情页骨架和同一套列表项样式下。

#### 三端显示项配置方式

- `portal="user"`
  - 显示用户端基础设置和常用入口
- `portal="technician"`
  - 复用用户端公共设置
  - 追加服务范围与技师工作相关开关
- `portal="merchant"`
  - 复用用户端公共设置
  - 追加店铺信息维护、店铺资质与经营开关

最终效果是：

- 用户端设置页 = 基准实现
- 技师端设置页 = 基准实现 + 技师独有项
- 商户端设置页 = 基准实现 + 商户独有项
- 三端设置首页、子页、状态展示与跳转逻辑都由同一套模块维护

### 本轮整合掉的重复能力

- 把主题、语言、身份切换从分散入口收口到设置中心
- 把技师端 `我的` 页里的内嵌设置区替换成统一设置路由
- 把商户端 `我的` 页里的偏好面板、经营开关和资料入口替换成统一设置路由
- 把商户端首页营业状态改为读取统一设置状态，而不是单页本地状态
- 把用户资料编辑收口到 `/me` 个人中心的信息卡编辑模式，避免重复维护第二套用户编辑页
- 把订单详情从列表覆盖层收口为真实详情页
- 把首页里重复的碎片入口合并为首屏主操作区 + 常用筛选区
- 把详情页里过多的重卡片整理为自然 section + 轻分隔结构
- 把 IM 模块的顶部栏、列表项和信息卡统一接入新主题 token

### 参考视觉方向

- 黑金版重点参考图 1：
  - 首页主视觉、店铺 / 资料详情页、固定底部 CTA 的高级深色表达
- 白绿版重点参考图 2：
  - 搜索页、预约页、设置页、动态页和高频浏览列表的清爽秩序感

## 2026-04 Social Module Rebuild

这一轮把旧 `MomentsPage` 的近况卡片流，重构成了接近 X / Twitter 结构的统一社交模块。重点不是单页换皮，而是把时间线、发帖、帖子详情、个人主页、店铺主页、技师主页、互动状态和关注关系收口到同一套前端状态流里。

## 2026-04 Technician Schedule Rebuild

本轮新增了技师端【我的日程】的独立重构实现，只重做技师端 `我的日程`，不改 `排班设置` 的三步结构、不改底部导航，也不改自动化排班逻辑本身。

### 代码位置

- 技师日程领域模型：`src/features/technician-schedule/model.ts`
- 技师日程共享状态：`src/state/technicianScheduleStore.ts`
- 技师日程页面与独立路由页：`src/features/technician-schedule/route-pages.tsx`
- 技师端入口接入：`src/pages/mobile/TechnicianPortalPage.tsx`
- 技师端独立路由：
  - `/technician/schedule`
  - `/technician/schedule/new`
  - `/technician/schedule/events/:eventId`
  - `/technician/schedule/events/:eventId/edit`
  - `/technician/schedule/shifts/:shiftId/transfer`

### 新的我的日程页面结构

`我的日程` 现在固定为下面这套顺序：

1. 4 项状态摘要
   - 已确定勤务时间
   - 已预约
   - 空闲
   - 待定
2. 标题 `日程表`
3. 视图切换 `日 / 周 / 月`
4. 当前周期日期栏
5. 简报
6. 日程展示区

旧的 `查看当前日程状态` 原有字段、旧统计块和 `列表视图` 入口已经从 `我的日程` 主结构中移除。

### 4 项状态摘要计算逻辑

顶部 4 项摘要按当前视图周期动态计算，统一按小时显示，并保留 1 位小数：

- 已确定勤务时间
  - 来源：店铺最终确认的班次区间
  - 计算：当前周期内确认班次区间并集的总时长
- 已预约
  - 来源：预约 / 订单占用区间
  - 计算：当前周期内预约区间并集的总时长
- 空闲
  - 来源：技师自己设定的 `可上班` 行程
  - 计算：`可上班区间 - 已预约区间`
- 待定
  - 来源：预约落在店铺确认班次外的部分
  - 计算：`已预约区间 - 已确定勤务时间区间`

实现里对时间段做了并集 / 差集处理，不是简单用卡片数量相减。

### 日 / 周 / 月切换逻辑

- 默认视图：`日`
- 日视图
  - 日期栏显示单日，例如 `2026年4月18日`
  - 左右切换为前一天 / 后一天
- 周视图
  - 使用周一到周日
  - 日期栏显示完整周范围，例如 `2026年4月14日 - 2026年4月20日`
  - 左右切换为前一周 / 后一周
- 月视图
  - 日期栏显示当前年月，例如 `2026年4月`
  - 左右切换为前一月 / 后一月

周 / 月视图都保留“选中某一天看当天详情”的交互：

- `仅显示行程`
  - 展示选中日期的紧凑日程列表
- `显示全部时间`
  - 展示选中日期的完整时间轴，支持点击空白时间新增行程

### 简报计算逻辑

简报跟随当前视图周期同步更新，包含 3 项：

- 一共有多少单
  - 统计当前周期内预约记录数量
- 是否有撞车
  - 检测当前周期内非背景时段是否出现时间重叠
  - 包含预约与阻塞类行程的时间冲突
- 预计流水
  - 汇总当前周期内预约金额
  - 若金额缺失则显示 `待接入`

### 新建行程页结构

点击空白时间会进入完整新页面，不再是简单小浮层。页面结构包括：

1. 顶部固定导航
   - 关闭
   - 保存
2. 标题输入
3. 日期 / 开始时间 / 结束时间 / 全天 / 重复
4. 高频快捷类型
   - 可上班
   - 请假
   - 锁定
   - 休息
   - 移动
5. 同步对象选择
6. 备注 / 地点 / 提醒 / 可见性等扩展字段

### 同步规则

新增行程时按是否落在店铺确认班次内决定默认同步逻辑：

- 在店铺已确认时间内
  - 默认自动勾选店铺为同步对象
  - 用户仍可继续添加同事 / 好友等其他同步对象
- 在店铺已确认时间外
  - 不默认同步店铺
  - 完全由用户自己选择同步对象

同步对象选择器当前接入了：

- 店铺
- 同店同事
- 部分好友 / 联系人 mock 数据

### 转让流程与候选逻辑

点击确认班次或确认班次内的行程，会进入只读查看页：

- 不能直接改时间
- 不能直接改类型
- 不能直接改同步对象
- 可以进入 `转让给同事`

转让流程规则如下：

- 候选人范围只允许同一家商户员工 / 技师
- 候选人可多选
- 可设置 `需要转让给几个人`
- 允许“候选人数 > 定员”
- 系统按最快接受顺序占位
- 同事点击接受时会再次校验
  - 当前是否有时间冲突
  - 当前是否已满员
- 满员后继续接受会返回 `接受转让失败`

当前实现的转让状态：

- `transfer_pending`
  - 转让中，发起人仍保留班次
- `transfer_completed`
  - 已转让，发起人班次转灰，只读展示
- `transfer_failed`
  - 所有邀请处理完但未满员
- `transfer_cancelled`
  - 发起人取消转让

邀请状态包括：

- `pending`
- `accepted`
- `rejected`
- `failed_conflict`
- `failed_capacity`
- `cancelled`

候选人冲突判断会检查：

- 已确认班次
- 已预约
- 已锁定
- 已请假
- 已休息
- 已移动
- 其他阻塞类行程

### 当前数据联动方式

当前仓库仍是前端 + 本地 mock state 结构，没有独立真实后端。本次 `我的日程` 重构继续走“可计算、可写回、可持久化”的共享状态，而不是静态页面：

- 技师 / 店铺 / 同事名单来自现有实体数据
- 预约金额沿用现有订单 mock 数据
- 新增行程、同步对象、转让请求、邀请状态都写入 `technicianScheduleStore`
- 页面刷新后会从本地存储恢复

### 2026-04 技师端日程页紧凑化与主题统一补充

本轮补充只处理技师端日程相关页面的 UI 结构与视觉显色，不改排班逻辑、日程逻辑、统计含义、新增行程规则或转让规则。

#### 本轮统一处理的页面

- `我的日程`
- `排班设置`
- `新增行程 / 编辑行程`
- `行程详情`
- `转让给同事`
- 技师端入口中的日程主切换壳层

#### 已完成的紧凑化 section

- 顶部 4 项状态摘要
  - 改成单行 4 列紧凑摘要
  - `已确定勤务时间` 改名为 `确定上班`
  - 保留 1 位小数与 `小时` 单位
- `日程表`
  - 标题与 `日 / 周 / 月` 切换合并到同一行
  - 周期切换栏压缩为更低高度
- `简报`
  - `共有多少单` 改为 `单数`
  - `是否有撞车` 改为 `状态`
  - `单数 + 状态 + 预计流水` 改成单行摘要
- `日程展示区`
  - 标题与 `仅显示行程 / 显示全部时间` 合并到同一行
  - 原双大按钮改成单个 segmented toggle
- `排班设置`
  - 入口切换壳层与步骤切换按钮收口到统一暗色 token
  - 规则、生效范围、一键排班、按日微调、确认结果等 section 改为更紧凑的深色容器
- `新增 / 编辑行程`、`详情`、`转让`
  - 表单卡片、信息卡片、候选列表、状态块统一减小 padding 与无效留白

#### 标题说明改造

原来技师端日程相关页面里常见的“大标题 + 下一行小字说明”结构，已统一改成：

- 只保留主标题
- 标题右侧使用圈 `i`
- 点击后以轻量说明浮层展示原说明

本轮已覆盖的说明型标题包括：

- `日程表`
- `日程展示区`
- `确认班次规则`
- `时间设置`
- `同步对象`
- `备注与其他字段`
- `转让定员`
- `候选同事`
- `排班设置` 中的规则范围、生成器、按日微调等主 section

#### 单行摘要调整

- 状态摘要：
  - `确定上班 / 已预约 / 空闲 / 待定`
  - 统一压成单行 4 项 dashboard summary
- 简报：
  - `单数`
  - `状态`
  - `预计流水`
  - 统一压成单行，其中 `预计流水` 使用更长卡片

#### 显色与高亮修正

技师端日程相关页面不再使用旧的浅底 `bg-white / bg-paper / bg-moss` 组合，而是统一回到 client 主题 token，重点包括：

- `--client-bg`
- `--client-surface`
- `--client-elevated`
- `--client-line`
- `--client-text`
- `--client-muted`
- `--client-primary`
- `--client-primary-soft`
- `--client-accent`
- `--client-warm`

统一规则：

- 页面背景、容器、输入框、切换器统一使用 client 主题 token
- `noir-gold` 与 `jade-light` 共用同一套日程组件与结构，只切换主题 token
- 选中态、激活态统一使用 `primary` 与 `primary-soft`
- 分隔与描边统一使用 `line`
- 语义色不跟主题切换而改变，只跟日程状态语义绑定

#### 日程语义色映射

- `可排班时间`
  - 淡蓝色
- `确认勤务时间`
  - 蓝色
- `确定的行程`
  - 绿色
- `撞车的行程`
  - 红色
- `未确定行程`
  - 红色
  - 同时使用虚线边框
- `其他行程`
  - 黄色

这套语义色同时用于：

- 日程列表卡片
- 完整时间轴中的时间块
- 月视图里的行程小块
- 日程相关 badge / 状态标签

#### 过往行程变暗规则

- 所有已过去的日程块，都在原有语义色基础上叠加 `50%` 黑色
- 只降低明度和视觉优先级，不改变原本属于哪一种语义色
- 适用于：
  - 过往可排班
  - 过往确认勤务
  - 过往确定行程
  - 过往撞车行程
  - 过往未确定行程
  - 过往其他行程

#### 黑金 / 白绿共用方式

- 技师端入口日程壳层与 `src/features/technician-schedule/route-pages.tsx` 统一改为读取当前 `ClientThemeProvider`
- `我的日程`、`新增 / 编辑行程`、`详情`、`转让` 不再写两套页面
- 黑金版和白绿版共用同一套结构、组件、交互与语义色 helper
- 仅背景、容器、文本、描边、主高亮等主题 token 跟随 `noir-gold / jade-light` 切换

#### 新增 / 编辑行程页补充

- 顶部右上角保存改为底部居中的悬浮主按钮
- 保存按钮在滚动时保持固定于底部浮层区，不再挤占顶部导航主操作位
- `行程种类` 扩展为 9 个紧凑 icon chip：
  - `可上班 / 请假 / 锁定 / 休息 / 移动 / 会议 / 会食 / 约会 / 假期`
- `同步对象` 移到页面最底部
- `同步对象` 默认折叠，并在折叠态显示当前同步摘要

#### 本轮紧凑化细节

- 顶部 4 个状态摘要继续保持单行 4 列
- 小时数字缩小并使用更紧的 baseline，对齐 `小时` 小字，避免截断和错位
- `简报` 中的 `状态` 改为与 `单数 / 预计流水` 一致的摘要结构，不再嵌套独立小框
- `正常` 状态固定使用绿色
- `日程展示区` 的 segmented toggle 文案改为 `仅行程 / 全时间`
- `日程展示区` 标题与切换控件继续放在同一行，标题左、切换右

### 架构位置

- 统一 social 状态层：`src/features/social/context.tsx`
- 数据结构定义：`src/features/social/types.ts`
- 前后端接口契约映射：`src/features/social/contracts.ts`
- 路由路径工具：`src/features/social/paths.ts`
- 通用渲染组件导出：`src/features/social/components/SocialUi.tsx`
- 统一社交 UI 实现：`src/features/social/components/UnifiedSocialUi.tsx`
- 统一 Composer UI 实现：`src/features/social/components/UnifiedComposerUi.tsx`
- 页面入口：
  - `src/features/social/pages/SocialTimelinePage.tsx`
  - `src/features/social/pages/SocialComposerPage.tsx`
  - `src/features/social/pages/SocialPostDetailPage.tsx`
  - `src/features/social/pages/SocialProfilePage.tsx`
  - `src/features/social/pages/SocialRelationshipsPage.tsx`
  - `src/features/social/pages/SocialSearchPage.tsx`
  - `src/features/social/pages/SocialNotificationsPage.tsx`
  - `src/features/social/pages/SocialRepostPage.tsx`
  - `src/features/social/pages/SocialMediaViewerPage.tsx`

### 统一核心模块

当前 social 模块已经不再按用户 / 技师 / 店铺拆三套 UI，而是统一到一套模块里：

- `UnifiedTimelinePage`
  - 实际落点：`src/features/social/pages/SocialTimelinePage.tsx`
- `UnifiedPostItem`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostItem`
- `UnifiedPostDetailPage`
  - 实际落点：`src/features/social/pages/SocialPostDetailPage.tsx`
- `UnifiedComposerPage`
  - 实际落点：`src/features/social/pages/SocialComposerPage.tsx`
  - 组合子模块：
    - `ComposerTopBar`
    - `ComposerTextArea`
    - `ComposerMediaPicker`
    - `ComposerMediaGrid`
    - `ComposerSettingList`
    - `ComposerSettingItem`
    - `ComposerVisibilitySelector`
    - `ComposerMentionSelector`
    - `ComposerLocationSelector`
- `UnifiedSocialProfilePage`
  - 实际落点：`src/features/social/pages/SocialProfilePage.tsx`
- `UnifiedProfileTopBar`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileTopBar`
- `UnifiedProfileHeader`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileHeader`
- `UnifiedTimelineTabs`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedTimelineTabs`
- `UnifiedMediaBlock`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedMediaBlock`
- `UnifiedProfileTabs`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileTabs`
- `UnifiedInteractionBar`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedInteractionBar`
- `UnifiedReplyFeed`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedReplyFeed`
- `UnifiedFollowButton`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedFollowButton`
- `UnifiedPostText`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostText`
- `UnifiedPostTextRenderer`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostTextRenderer`

三端差异只允许通过以下维度生效：

- `scope = user / merchant / technician`
- `entityType = user / technician / shop`
- 关注、发帖、资料 CTA 的权限配置
- `extraProfileFields` 和 `postType` 的字段映射
- 页面侧栏与扩展 section 的可见性

### 页面清单

- 动态首页：
  - 用户端 `/moments`
  - 商户端 `/merchant/moments`
  - 技师端 `/technician/moments`
- 发动态页：`.../moments/compose`
- 帖子详情页：`.../moments/posts/:postId`
- 回复串页：`.../moments/posts/:postId/replies`
- 转发 / 引用流程页：`.../moments/posts/:postId/repost`
- 媒体查看页：`.../moments/posts/:postId/media/:mediaId`
- 搜索页：`.../moments/search`
- hashtag 结果页：`.../moments/tags/:tag`
- 草稿列表页：`.../moments/drafts`
- 通知页：`.../moments/notifications`
- 统一资料页：
  - 用户 `/profiles/user/:id`
  - 技师 `/profiles/technician/:id`
  - 店铺 `/profiles/shop/:id`
- 关注 / 粉丝列表：
  - `.../profiles/:entityType/:id/followers`
  - `.../profiles/:entityType/:id/following`

### 时间线结构

- 顶部栏固定，右侧保留搜索与通知入口
- 顶部 tabs 固定吸附，默认使用 `推荐 / 关注`
- 主内容区使用连续单列时间线，不再给每条动态套独立厚卡片
- 时间线顶部保留轻量发帖入口，列表主体通过细分隔线自然堆叠
- 桌面端保留左右侧栏，但中心仍是 Twitter/X 式中轴主流

### Post Item 结构

统一 `UnifiedPostItem` 按下面顺序渲染：

1. 轻量上下文行：转发、回复、置顶、公告等关系提示
2. 左侧头像列
3. 第一行身份信息：显示名称、认证、handle、时间、更多菜单
4. 正文区：支持 `@mention`、`#hashtag`、URL 和长文折叠
5. 引用动态区：引用卡片整体可点进原帖
6. 媒体区：图片 / 视频统一走 `UnifiedMediaBlock`
7. 互动栏：回复、转发、点赞、浏览、收藏、分享

补充规则：

- 时间线正文默认超过约 240 字会折叠，详情页自动展开全文
- post item 内不再塞关注按钮，避免干扰信息主链路
- 引用动态永远在媒体之前，和 Twitter/X 的组织顺序保持一致

### 媒体展示规则

- 单图：使用单一大矩形媒体块，保持自然裁切，不拉伸
- 双图：双列并排，统一高度
- 三图：左大右双小
- 四图：`2 x 2` 网格
- 四图以上：第四格叠加 `+N`
- 视频：时间线展示封面、居中播放按钮、角标时长；详情和媒体页再进入实际播放
- 媒体查看页：使用独立深色新页面，支持缩略图切换和前后浏览

### 主页结构

- 顶部固定导航
- 头图 `cover`
- 头像跨越头图与正文交界
- 右上主操作按钮：编辑资料 / 关注 / 发私信 / 业务动作
- 基础资料：名称、认证、handle、bio、位置、生日 / 成立日、加入时间、关注 / 粉丝
- 用户 / 技师 / 店铺扩展字段不再拆成顶部大卡片，而是收进同一套 header 的轻量扩展信息行里
- tabs 固定吸附，默认使用 `动态 / 回复 / 媒体 / 喜欢`

### Profile Header 补齐内容

- `UnifiedProfileTopBar` 现在使用固定置顶双层标题结构：
  - 第一行显示当前主页名称
  - 第二行显示 `X 件动态 / X posts`
  - 左侧保留返回按钮，右侧保留搜索按钮
- `UnifiedProfileHeader` 现在严格按下面顺序组织：
  1. 头图 cover
  2. 头像与右侧主按钮
  3. 名称 / 认证 / handle
  4. 简介与扩展说明
  5. 地区 / 生日或成立日 / 加入时间
  6. 关注 / 粉丝统计
- 头像不再单独漂在资料区里，而是压在头图底部边缘，并带页面背景描边，保证与 cover 分层明确
- 头像统一走 `src/components/ui/AvatarImage.tsx`，当前规范为圆角正方形头像，不再使用圆形头像
- tabs 不再混在大卡片导航里，而是在资料区下方自然承接时间线

### 头图与头像关系

- 头图位于固定顶部导航下方，宽度撑满资料主列
- 头图底部预留头像压叠空间
- 头像使用统一 `AvatarImage` 模块的大尺寸圆角正方形规格，并通过 `border-[color:var(--client-bg)]` 做外圈描边
- 右侧按钮区与头像形成对角平衡，避免漂浮进头图中央

### Tabs 结构与吸附逻辑

- 初始状态下，tabs 位于资料区与关注统计区之后
- 滚动时，tabs 到达顶部后吸附到 `UnifiedProfileTopBar` 下方
- 顶部导航与 tabs 共同构成固定区域
- 下方时间线继续在其下面滚动，不会与 tabs 重叠错位
- 当前版本已确保 `动态 / 回复 / 媒体 / 喜欢` 4 个 tab 与统一时间线 item 结构直接衔接

### 用户 / 技师 / 店铺扩展方式

- 用户主页：
  - 默认显示名称、认证、handle、bio、地区、生日、加入时间、关注关系与动态 tabs
- 技师主页：
  - 通过 `headline + extraProfileFields` 扩展服务标签、最近可约、语言等信息
- 店铺主页：
  - 通过 `headline + extraProfileFields` 扩展营业状态、地址摘要、预约入口等信息
- 三种身份继续共用同一套 `UnifiedProfileTopBar + UnifiedProfileHeader + UnifiedProfileTabs` 骨架

### Tabs 逻辑

- 时间线 tabs：`推荐 / 关注`
- 主页 tabs：`动态 / 回复 / 媒体 / 喜欢`
- 搜索 tabs：`综合 / 用户 / 动态 / 媒体 / 标签`
- 关注关系页：`粉丝 / 关注`
- 所有 tabs 都统一成 Twitter/X 式文本 tab + 底部指示条，不再使用胶囊按钮

### Composer Page 结构

- 发动态页现在是独立新页面，不再是面板式表单，也不是覆盖式弹窗
- 顶部固定栏统一为：
  - 左侧 `取消`
  - 右侧 `发表 / 回复 / 保存`
- 页面主体严格按下面顺序组织：
  1. 大文本输入区
  2. 媒体预览与添加区
  3. 所在位置 / 提醒谁看 / 谁可以看 设置列表
- 页面主体通过 `MobileShell(navItems=[])` 渲染，发帖时不再复用底部导航壳

### Composer 媒体区规则

- 正式发动态页只接受 JPEG、PNG、WebP 图片；单张上限 8 MiB，一条动态最多 9 张
- 用户选择图片后立即通过 `POST /api/v1/social/media` 上传；上传完成前不可发布，失败项保留预览并支持重试或删除
- 发布请求只提交服务端返回的 `mediaAssetPublicId`，不得提交 `blob:` 预览地址或任意媒体 URL
- 编辑已发布动态时，原动态绑定的规范图片资产可直接复用；新增图片仍需先完成正式上传，保存通过 `PATCH /api/v1/social/posts/:id` 提交
- 已上传媒体统一显示为圆角缩略图块
- 媒体区始终保留一个 `+` 添加位，结构与缩略图块尺寸一致
- 每个媒体块支持删除，点击缩略图可直接预览原图
- 视频上传不属于当前正式存储合同，发布页不提供视频选择

### Composer 设置项规则

- `所在位置`
  - 进入轻量地点选择页
  - 支持当前地区快捷选项与搜索
- `提醒谁看`
  - 只读取当前登录账号在正式数据库中的未拉黑联系人，不使用时间线作者或平台目录补位
  - 支持按联系人备注、用户名和 NeeDoID 搜索并多选
  - 发布时提交联系人用户 ID；服务端再次校验联系人仍属于当前账号并在同一事务中写入动态和提醒通知
  - 返回后在右侧显示名称摘要或人数摘要
- 所有设置选择页复用聊天窗口同源的 `MobileFullscreenHeader` 液态玻璃容器，返回按钮、标题和说明入口位于同一头部内
- `谁可以看`
  - 当前支持 `公开 / 仅关注可见 / 仅好友可见 / 仅自己可见`
  - 进入轻量选择页完成切换

### Composer 草稿规则

- 新动态在输入文本、添加媒体、修改可见范围、位置或提醒对象后会自动保存到本地草稿
- 点击取消时：
  - 无内容直接返回
  - 有内容时提示“放弃或保留草稿后退出”
- 再次进入同一路径时，会恢复对应草稿
- 编辑已有动态时仍会提示是否放弃修改，但不会覆盖正式草稿列表
- 编辑保存只允许动态作者本人；正文、图片、地点、可见范围和提醒联系人均以正式接口成功结果为准，失败时停留在编辑页

### Icon 规范

- 动态模块内互动 icon 统一采用线性、低干扰、信息优先的样式
- 激活态统一使用现有品牌色 token，不复用 Twitter 官方红绿蓝状态色
- 视频入口统一带居中播放 icon，置顶提示使用轻量 pin icon

### 三端统一方式

- 用户端、商户端、技师端都走同一组 social page 与 UI 组件
- 路由差异只通过 `scopePrefix(user / merchant / technician)` 生成
- 数据差异只通过 `entityType`、`extraProfileFields`、权限和 CTA 映射处理
- 发帖、详情、资料、搜索、媒体、关系、草稿全部共享同一个 social store

### 保留的品牌 UI 规则

这次是把“结构与交互”重构成接近 Twitter / X，而不是直接换 Twitter 皮肤。当前实现明确保留了原有 App 的：

- 主题 token：继续使用 `--client-*` 双主题 token，不改品牌主色体系
- 视觉语言：继续沿用当前圆角、阴影、字体层级和明暗主题表达
- 路由外壳：继续使用现有 `PageScaffold + AppTopBar + MobileShell`
- 业务入口：底部导航入口数量、顺序和主交互逻辑不变

当前调整的是：

- 时间线改为连续主列信息流，而不是近况卡片流 / 商品卡片流
- 主页补齐为 `固定顶部导航 + 头图 + 头像压叠 + 资料区 + 关注统计 + sticky tabs + 动态流` 的统一 profile 结构
- 详情页改为主帖 + 数据汇总 + 互动条 + 回复串
- 发帖页重构为原生社交产品风格的新页面结构，并补齐媒体区、设置项列表和草稿离开逻辑

### 统一 Social Profile 结构

三种身份不再各自维护三套社交主页骨架，全部走统一 `SocialProfile`：

- 共享字段：
  - `id`
  - `entityType`
  - `displayName`
  - `handle`
  - `avatar`
  - `coverImage`
  - `bio`
  - `location`
  - `birthday`
  - `joinedAt`
  - `verifiedStatus`
  - `followerCount`
  - `followingCount`
  - `extraProfileFields`
- 用户差异：
  - 会员等级
  - 语言
  - 积分 / 下次预约信息
- 店铺差异：
  - 营业状态
  - 地址摘要
  - 营业时间
  - 预约入口
  - 公告 / 媒体焦点
- 技师差异：
  - 服务标签
  - 最近可预约状态
  - 语言
  - 预约入口

页面层只识别 `entityType + extraProfileFields`，不再按用户 / 技师 / 店铺分三套 social 页面。

### 帖子数据结构

统一 `SocialPost` 已覆盖这次需要的 item 类型：

- 纯文本动态
- 单图动态
- 多图动态
- 视频动态
- 回复动态
- 转发动态
- 引用转发
- 店铺公告型动态
- 技师日常型动态
- 置顶动态

核心字段包括：

- `authorId`
- `authorType`
- `text`
- `media`
- `hashtags`
- `mentions`
- `quotePostId`
- `repostPostId`
- `replyToPostId`
- `likeCount`
- `replyCount`
- `repostCount`
- `bookmarkCount`
- `viewCount`
- `isPinned`
- `visibility`
- `status`
- `postType`

### 互动状态流

当前实现采用浏览器内 mock social store，但接口命名已对齐 REST 合同，方便后续替换真实后端：

- 首页：
  - `GET /social/timeline/for-you`
  - `GET /social/timeline/following`
- 发帖：
  - `POST /social/posts`
  - `PATCH /social/posts/:id`
  - `DELETE /social/posts/:id`
- 互动：
  - `POST /social/posts/:id/like`
  - `POST /social/posts/:id/repost`
  - `POST /social/posts/:id/bookmark`
  - `POST /social/posts/:id/reply`
  - `POST /social/posts/:id/quote`
- 资料页：
  - `GET /social/profiles/:entityType/:id`
  - `GET /social/profiles/:entityType/:id/posts`
  - `GET /social/profiles/:entityType/:id/replies`
  - `GET /social/profiles/:entityType/:id/media`
  - `GET /social/profiles/:entityType/:id/likes`
- 关注：
  - `POST /social/follows`
  - `DELETE /social/follows/:entityType/:id`
  - `GET /social/profiles/:entityType/:id/followers`
  - `GET /social/profiles/:entityType/:id/following`
- 搜索：
  - `GET /social/search`
  - `GET /social/search/users`
  - `GET /social/search/posts`
  - `GET /social/search/tags/:tag`

当前 store 已支持：

- 点赞 / 收藏 / 转发 / 分享状态同步
- 回复计数、转发计数、点赞计数、浏览计数联动
- 草稿保存
- 关注 / 取消关注
- 主页置顶 / 取消置顶
- 帖子内关注按钮与主页关注按钮状态同步
- follow feed
- hashtag 时间线页
- reply / like / repost / quote / follow / mention 通知流

### 多端适配策略

- 手机：
  - 单列主时间线
  - 顶部栏固定
  - 底部导航保持现有结构
  - 发帖入口同时保留流内入口和右下角 FAB
- 平板：
  - 主内容列更宽，tabs 和时间线保持单主列逻辑
  - 搜索、资料页和详情页开始出现右侧辅助信息列
- 桌面：
  - 动态首页采用左资料摘要 + 中时间线 + 右趋势 / 通知预览
  - 资料页和详情页采用主列 + 侧栏结构
  - 内容宽度仍跟随当前产品外壳，不脱离原主题系统
  - 主页媒体 tab 会切到媒体墙，而不是简单拉伸手机单列

### 统一入口说明

- 旧 `src/pages/mobile/MomentsPage.tsx` 已改为新的 social timeline 入口包装器。
- 旧 `src/pages/user/ProfileDetailPage.tsx` 已改为统一 social profile 页面包装器。
- `src/shared/profile-detail/paths.ts` 里的店铺资料跳转，用户端也已改为 `/profiles/shop/:id`，不再回落到旧店铺详情页。
- IM 模块里的资料页跳转继续走 `src/features/im/role-config.ts` 中的 `resolveImProfilePath()`，统一回到同一套 social profile 路由。

### 当前实现边界

- 当前 social 模块的数据源仍是浏览器内 mock state，并未接真实服务端。
- link preview、热门榜单和更细的通知中心 UI 已预留接口与页面位置，但还没接真实抓取 / 排行数据。
- 资料编辑按钮当前仍只保留前端占位，后续可直接接入设置中心或 profile 编辑流。
- IM 内部仍保留一部分旧式信息展示块，但资料跳转路径已经先统一收口到了同一套 social profile 页面上。

## IM Module Redesign

2026-04 这一轮已对用户端 `通讯录 + 聊天` 做了完整重做，目标是把体验、信息架构和交互习惯统一收敛到“高度接近微信”的闭环，同时保留当前项目的视觉和技术栈。

当前落地范围：

- 统一基准实现：用户端 `src/features/im/*`
- 已切换到同一套模块：用户端、商户端、技师端的 `/messages`、`/contacts` 及其子页
- 角色差异不再通过独立页面实现，而是通过 `scope + role config` 做可见性、能力和资料跳转适配

### Scoped Routes

三端统一复用相同的页面骨架和交互逻辑，只是路由前缀不同：

- 用户端
  - `/messages`
  - `/messages/new`
  - `/messages/:conversationId`
  - `/messages/:conversationId/info`
  - `/messages/:conversationId/media`
  - `/contacts`
  - `/contacts/requests`
  - `/contacts/:contactId`
  - `/contacts/blacklist`
  - `/contacts/tags`
  - `/contacts/service-accounts`
  - `/im/search`
- 商户端
  - `/merchant/messages`
  - `/merchant/messages/new`
  - `/merchant/messages/:conversationId`
  - `/merchant/messages/:conversationId/info`
  - `/merchant/messages/:conversationId/media`
  - `/merchant/contacts`
  - `/merchant/contacts/requests`
  - `/merchant/contacts/:contactId`
  - `/merchant/contacts/blacklist`
  - `/merchant/contacts/tags`
  - `/merchant/contacts/service-accounts`
  - `/merchant/im/search`
- 技师端
  - `/technician/messages`
  - `/technician/messages/new`
  - `/technician/messages/:conversationId`
  - `/technician/messages/:conversationId/info`
  - `/technician/messages/:conversationId/media`
  - `/technician/contacts`
  - `/technician/contacts/requests`
  - `/technician/contacts/:contactId`
  - `/technician/contacts/blacklist`
  - `/technician/contacts/tags`
  - `/technician/contacts/service-accounts`
  - `/technician/im/search`

### Module Structure

- `src/features/im/model.ts`
  - IM 统一 schema、排序 / 搜索 / 摘要 / 分组纯函数
  - 纯数据变更逻辑：发消息、撤回、好友申请通过、建群等
- `src/features/im/seed.ts`
  - 按 `user / merchant / technician` 生成同一套联系人 / 会话 / 消息结构
  - 用户端种子继续作为基准，再补齐商户端与技师端的统一 schema seed
- `src/features/im/api.ts`
  - `/api/im/*` mock API 与实时事件模拟
  - 已改成 `scope-aware`，同一套 API 可按角色读取不同 mock 数据库
- `src/features/im/store.ts`
  - 三端共享的 IM 统一状态源
  - 管理会话、联系人、好友申请、消息缓存、草稿、本地搜索历史
- `src/features/im/scope.tsx`
  - 统一 `ImScopeProvider`
  - 给页面层注入 `user / merchant / technician`
- `src/features/im/role-config.ts`
  - 角色化配置层
  - 负责联系人可见范围、聊天能力、资料页跳转、统一路由前缀
- `src/features/im/components.tsx`
  - IM 模块共用 UI 原件：列表行、消息气泡、底部抽屉、详情块等
- `src/features/im/chat-home.tsx`
  - 三端共用的聊天首页 / 会话列表页模块
  - 统一承接标题区、搜索框、会话列表、会话 item、摘要、时间和未读角标
- `src/features/im/pages.tsx`
  - 统一通讯录 / 聊天页面
  - 用户端、商户端、技师端都复用这一套页面实现
- `src/pages/user/MessagesPage.tsx`
  - 用户端聊天入口兼容层
- `src/pages/user/ContactsPage.tsx`
  - 用户端通讯录入口兼容层

建议理解为两层：

- 统一核心模块
  - `UnifiedContactsModule` = `src/features/im/pages.tsx + components.tsx + store.ts + api.ts + model.ts`
  - `UnifiedChatModule` = 同一套模块内的聊天页、会话页、消息渲染与详情页
- 角色适配层
  - `ImScopeProvider`
  - `role-config.ts`
  - 路由前缀和资料页跳转适配

### Chat Home Refresh

这次只重构聊天首页 / 会话列表页，不改聊天房间页、不改底部导航、不改会话数据来源和跳转逻辑。

重构前扫描到的三端现状差异：

- 用户端
  - 通过 `src/pages/user/MessagesPage.tsx` 作为兼容入口，再进入统一 IM 页面
- 商户端
  - 在 `src/App.tsx` 里直接用 `ImScopeProvider scope="merchant"` 挂载统一 IM 页面
- 技师端
  - 在 `src/App.tsx` 里直接用 `ImScopeProvider scope="technician"` 挂载统一 IM 页面
- 三端在页面接入层和角色配置层存在轻量差异：
  - 路由前缀不同
  - 底部导航配置不同
  - 联系人可见范围和能力开关不同
- 但聊天首页 UI 入口已经是同一套：
  - 三端最终都会进入 `src/features/im/pages.tsx` 的 `ImConversationListPage`
  - 原会话首页主要由 `SwipeActionRow + ConversationRow` 组合，结构统一但仍然保留较重的卡片式层级

统一后的聊天首页模块结构：

- `UnifiedChatHomePage`
  - 顶部标题区、页面背景、统一搜索入口承载层
- `UnifiedConversationSearchBar`
  - 扁平化搜索框，保留搜索 icon 与占位文案
- `UnifiedConversationList`
  - 会话列表承载层
- `UnifiedConversationItem`
  - 三端共用的单条会话行
- `UnifiedConversationMeta`
  - 统一管理右侧时间与未读区域
- `UnifiedUnreadBadge`
  - 更克制的未读数 / 红点样式
- `UnifiedConversationPreviewText`
  - 统一草稿、@我、链接、系统摘要等预览文本表现

本次去掉或收敛的多余框体：

- 去掉会话列表外层的大圆角卡片堆叠
- 去掉会话 item 的重描边和重阴影
- 去掉列表与搜索区之间重复的容器包裹关系
- 去掉会话项内部依赖多层 box 建层级的写法
- 将列表主层改为轻分隔 + 留白，而不是一条一个厚重卡片
- 左滑容器改成支持扁平列表模式，保留交互，不再强制套卡片外框
- 聊天首页背景统一改为轻遮罩叠加 `public/images/chat_bg.png`
  - 素材来源：`dist/images/chat_bg.png`

保持不变的逻辑：

- 底部导航结构与入口顺序
- 会话排序逻辑
- 搜索业务逻辑
- 左滑置顶 / 已读 / 免打扰 / 删除逻辑
- 未读、草稿、置顶、免打扰、群聊和系统消息数据来源
- 会话点击跳转与房间页功能
- 路由前缀与后端 / mock API 接口

正式账号的左滑置顶、免打扰、已读/未读和个人删除状态由 `/api/v1/im/conversations/*` 持久化；删除只隐藏当前账号的会话，不会删除对方的会话或共享消息，新消息会使会话重新出现。

### Role-Based Config

角色差异不再拆成独立页面，而是集中在配置层：

- `roleType`
  - `user`
  - `merchant`
  - `technician`
- `contacts visibility config`
  - 控制联系人列表里可见的 `person / technician / store / service`
- `chat capability config`
  - 控制是否允许群聊、语音 / 视频入口、可发送的消息类型、可分享的名片类型
- `profile card config`
  - 控制聊天 / 通讯录点击资料卡后跳转到哪套统一资料页
- `message action config`
  - 控制会话详情页里黑名单、删除联系人、查找聊天记录、媒体记录等开关

### Mock API

三端 IM 当前统一走 `/api/im/*` mock 接口，后端未接入时也可以完整跑通。

正式运行模式不使用上述旧 mock 写入路径：聊天搜索只查询当前设备已加载的 IM store；添加好友通过分页 `/api/v1/im/directory` 和 `/api/v1/im/contacts`；删除好友通过 owner-scoped `DELETE /api/v1/im/contacts/:contactId` 软删除当前账号自己的联系人关系，不影响对方通讯录或共享聊天记录；图片消息通过会话成员校验后的 `/api/v1/im/conversations/:conversationId/media` 上传；消息到达由每标签页共享的 SSE 连接即时合并，断线或标签页恢复时只做一次受控补拉。联系人拉黑状态持久化在 `contacts.blocked_at`，并由服务端阻止被拉黑发送方继续写入直接会话消息。

正式 SSE 在每个可见浏览器标签页只保留一条共享连接。后端每个实例只使用一个 Redis Pub/Sub 订阅和一个发布连接，把定向事件转发到其他实例，不按用户轮询或创建 Redis 订阅；消息正文和未读状态继续以 MySQL 为权威。Redis 短暂异常时同实例投递继续可用，断线客户端通过既有 REST 补拉恢复；慢 SSE 客户端触发背压时会被主动断开，防止服务端无界缓存。

同一套接口通过 `scope` 区分角色视图：

- `scope=user`
- `scope=merchant`
- `scope=technician`

接口列表如下：

- 联系人
  - `GET /api/im/contacts`
  - `GET /api/im/contacts/:id`
  - `PATCH /api/im/contacts/:id/remark`
  - `POST /api/im/contacts/:id/block`
  - `DELETE /api/im/contacts/:id/block`
  - `DELETE /api/im/contacts/:id`
- 好友申请
  - `GET /api/im/friend-requests`
  - `POST /api/im/friend-requests/:id/accept`
  - `POST /api/im/friend-requests/:id/reject`
- 会话
  - `GET /api/im/bootstrap`
  - `GET /api/im/conversations`
  - `GET /api/im/conversations/:id`
  - `GET /api/im/conversations/:id/messages`
  - `POST /api/im/conversations`
  - `POST /api/im/conversations/:id/members`
  - `DELETE /api/im/conversations/:id/members/:userId`
  - `PATCH /api/im/conversations/:id/pin`
  - `PATCH /api/im/conversations/:id/mute`
  - `PATCH /api/im/conversations/:id/read`
  - `DELETE /api/im/conversations/:id`
  - `POST /api/im/conversations/:id/clear`
- 消息
  - `POST /api/im/messages/text`
  - `POST /api/im/messages/image`
  - `POST /api/im/messages/voice`
  - `POST /api/im/messages/video`
  - `POST /api/im/messages/file`
  - `POST /api/im/messages/location`
  - `POST /api/im/messages/contact-card`
  - `POST /api/im/messages/:id/recall`
  - `POST /api/im/messages/:id/resend`
  - `POST /api/im/messages/forward`
  - `GET /api/im/search`
- 上传
  - `POST /api/im/upload/init`
  - `POST /api/im/upload/complete`

### Realtime Events

当前 mock realtime 会通过浏览器事件总线模拟，并按 `scope` 隔离事件通道：

- `message.created`
- `message.updated`
- `message.recalled`
- `conversation.updated`
- `friend_request.created`
- `friend_request.updated`
- `contact.updated`
- `unread.updated`

### Local Persistence

- mock 数据库：`needo.im.mock-database.v2.<scope>`
- 草稿 / 搜索历史：`needo.im.ui.v2.<scope>`
- 会话列表滚动位置：`needo.im.messages.scroll.v2.<scope>`

### Config

IM 配置分成两层：

- 运行时基础配置
  - 保存在 `model.ts` / seed 输出的 `config`
- 角色适配配置
  - 保存在 `role-config.ts`

基础配置默认包括：

- `allowStrangerMessaging`
- `preserveConversationAfterDelete`
- `syncDraftAcrossDevices`
- `recallWindowMs`
- `separatorThresholdMs`

如果后续接真实后端，建议把它们迁移成服务端下发配置或实验开关。

### Compatibility And Migration

本次迁移后的处理方式：

- 用户端继续作为基准实现
- 商户端和技师端不再挂自己的独立聊天 / 通讯录页面
- 商户端和技师端当前主路由已经改为直接复用 `src/features/im/*`

当前保留的兼容层：

- `src/pages/user/MessagesPage.tsx`
- `src/pages/user/ContactsPage.tsx`
- `src/lib/messageCenter.ts`
  - 保留旧的深链与会话 ID 兼容，便于原有按钮和跳转继续工作

已退役的重复实现主链：

- 商户端原 `messages / contacts` 路由不再由 `MerchantPortalPage` 内部的独立消息页承接
- 技师端原 `messages / contacts` 路由不再由 `TechnicianPortalPage` 内部的独立消息页承接
- 三端统一改为通过 `ImScopeProvider + role-config + src/features/im/*` 进入同一套模块

### Test

```bash
npm test
```

当前已补的用例覆盖：

- 会话排序
- 联系人分组
- 草稿展示
- 发送状态与摘要更新
- 撤回逻辑
- 好友申请通过
- 搜索结果跳转定位所需的数据
- merchant / technician 作用域 seed 与兼容会话 ID
- 用户端统一资料元数据映射

### Replace With Real Backend

后续替换真实接口时，优先只改 `src/features/im/api.ts`：

- 保留 `store.ts` 作为页面与接口之间的统一状态层
- 保留 `model.ts` 作为前端视图模型与纯逻辑层
- 页面层不要直接读原始接口字段，尽量继续消费 store 和 model 输出

## Shift Planning System

当前仓库已经补齐一套可运行的“店铺开放排班 -> 技师反馈 -> 店铺最终确认”的闭环原型，并在保留手动 / 自动能力的基础上新增了“智能排班”第一版：

- 店铺后台调度中心：`/merchant-admin/dispatch-center`
  - 顶部横向导航里的一级入口是 `调度中心`
  - 默认进入 `排班当前周期确认`：`/merchant-admin/dispatch-center/current`
  - 二级切换只有两个核心子页：
    - `排班当前周期确认`：承接当前周期状态、异常和 confirmed_slots 投影
    - `排班`：`/merchant-admin/dispatch-center/schedule`，内部承载 `手动 / 自动 / 智能`
  - `调度中心` 内的二级切换条已做成 sticky，滚动内容时仍可快速切页
- 运营后台：
  - 已移除原先错误挂载的调度中心 / 场控布局 / 库存管理菜单
  - 旧入口保留兼容跳转到店铺后台对应新路径
- 技师端：`/technician/schedule`
  - 新增 `TechnicianShiftPlanningPanel`
  - 只允许在店铺开放时段内反馈，支持历史导入、个人规则、单日调整、已确认班表和通知
  - 新增 `我的排班偏好` 与 `自动提交反馈` 设置，供智能排班读取

核心代码位置：

- 状态与 mock workflow：`src/state/shiftPlanningStore.ts`
- 调度中心与智能排班状态：`src/features/dispatch-center/store.ts`
- 模板展开 / 状态解析 / 自动确认算法：`src/lib/shiftPlanning.ts`
- 智能排班引擎：`src/lib/scheduling/autoSchedulingEngine.ts`
- 数据结构：`src/types/shiftPlanning.ts`
- 调度中心壳层：`src/components/merchant-admin/MerchantDispatchCenterShell.tsx`
- 当前周期确认工作台：`src/components/merchant-admin/MerchantDispatchOverviewWorkspace.tsx`
- 智能排班工作台：`src/components/scheduling/SmartSchedulingWorkspace.tsx`
- 技师反馈面板：`src/components/scheduling/TechnicianShiftPlanningPanel.tsx`
- 技师智能偏好面板：`src/components/scheduling/TechnicianSmartPreferencePanel.tsx`
- 通用小时格编辑器：`src/components/scheduling/ShiftMatrixEditor.tsx`

智能排班当前包含：

- `限定免费` 角标展示与 billing / feature flag 字段预留
- 三档自动化等级：`recommend_only / semi_auto / full_auto`
- 需求预测、技师匹配评分、推荐班表、异常队列、质量评分、自动补人 / 自动减人入口、自动确认阈值
- 商户手机端轻量决策页、商户 PC 后台完整控制台、技师端偏好与自动提交反馈
- 用户端仍只读取最终 confirmed slots，智能草稿、推荐和异常待处理结果不会直接对用户可见

### Technician Schedule Refactor

`/technician/schedule` 这一轮已经从“一个过重的大页面”重构成两层清晰的信息架构：

- 一级固定插页
  - `我的日程`
  - `排班设置`
- `排班设置` 内部二级步骤插页
  - `排班规则设定`
  - `一键排班`
  - `确定排班`

#### 拆分前

- 技师端日程页把“看日程”“设规则”“模板编辑”“反馈提交”“确认结果”放在同一长页面里。
- `TechnicianShiftPlanningPanel` 和日 / 周 / 月时间轴直接串在一起，滚动后层级感很弱。
- “查看状态”和“配置反馈”没有明确职责边界。

#### 拆分后

- 顶部新增 sticky 一级插页，滚动时始终可见：
  - `我的日程` 负责查看和理解当前日程状态
  - `排班设置` 负责规则、生成和确认
- `排班设置` 再拆成三步：
  - `排班规则设定`
    - 配置技师个人规则、偏好、工时、休息、缓冲和是否接受高峰 / 临时排班
    - 商户强制继承字段保持灰色只读，并提示“该规则由商户统一设定，不可修改”
  - `一键排班`
    - 基于商户开放时段 + 商户强制规则 + 技师个人规则 + 历史模板生成可接受排班
    - 生成后仍可继续模板微调、按日微调，再提交反馈
  - `确定排班`
    - 只读展示商户最终确认后的排班结果、候补状态和确认 / 变更记录

#### 原内容迁移关系

- 移到 `我的日程`
  - 日视图
  - 周视图
  - 月视图
  - 列表视图
  - 当前周期状态、反馈状态、已确认 / 候补数量、同步通知摘要
  - 共享日程时间轴和列表浏览
- 移到 `排班设置`
  - 个人规则与偏好
  - 历史模板导入
  - 一键排班生成
  - 模板矩阵编辑
  - 单日微调
  - 排班反馈提交
  - 商户最终确认结果与变更记录

#### 一级 / 二级插页对应代码

- 技师端页面壳：`src/pages/mobile/TechnicianPortalPage.tsx`
  - 管理一级 sticky tabs：`我的日程 / 排班设置`
  - 管理日程视图切换：`日 / 周 / 月 / 列表`
- 技师端排班设置工作台：`src/components/scheduling/TechnicianShiftPlanningPanel.tsx`
  - 管理二级步骤：`排班规则设定 / 一键排班 / 确定排班`

#### 与后台互通的数据流

- 查看层
  - `src/state/scheduleStore.ts`
    - 继续提供技师共享日程、门店空档、已生成时段、计划标签
  - `src/state/shiftPlanningStore.ts`
    - 提供当前开放周期、技师反馈状态、最终确认结果、通知任务
- 设置层
  - `src/lib/shiftPlanning.ts`
    - 负责模板展开、规则合并、一键排班生成、最终确认算法
  - `saveTechnicianResponse`
    - 保存技师规则、模板矩阵、按日微调和反馈提交状态
  - `runAutoConfirm`
    - 继续负责商户最终确认逻辑

#### 当前实现说明

- 一级 tabs 和二级步骤 tabs 都已做成清晰的分层导航。
- `我的日程` 不再承载大段规则表单。
- `排班设置` 已补上一键生成逻辑，不再只是手工编辑模板。
- 仍然是前端 mock workflow，但数据边界已经保持与商户端 / 后台端同一套状态结构，后续可直接替换成真实接口。

## Backoffice IA Refactor

店铺列表的详情抽屉包含「店铺 SaaS 情报」和「店铺展示」；展示复用用户端正式店铺组件，集团账户可选择旗下店铺。实现与验证说明见 [店铺详情抽屉](docs/shop-detail-drawer-tabs.md)。

2026-04 这一轮对后台职责边界做了重构，目标是把平台运营能力和单店经营能力拆清楚。

### 调整原则

- 平台级、跨店铺、全局规则、全局数据，归运营后台。
- 单店经营、单店排班、单店调度、单店库存、单店场控，归店铺后台。
- “看结果、看状态、看当下排班”的能力归 `排班当前周期确认`。
- “创建、配置和生成排班”的能力归 `排班`，内部再分 `手动 / 自动 / 智能`。

### 从运营后台迁移到店铺后台的功能

- 调度中心
- 场控布局
- 库存管理

### 本次导航结构调整前后对比

- 调整前
  - 顶部横向导航里没有独立的“调度中心”一级入口
  - “调度中心”和“排班一览”同时存在，且语义重叠
  - `排班一览` 还是一套独立多页实现
- 调整后
  - 顶部横向导航新增 `调度中心`
  - `调度中心` 成为排班模块唯一一级入口
  - `调度中心` 下只保留两个核心子页：
    - `排班当前周期确认`
    - `排班`
  - 原 `排班一览 / 自动化排班 / 手动排班` 同级结构已收口为当前结构
  - `排班` 内部用二级切换承载 `手动 / 自动 / 智能`

### 新菜单结构

- 店铺后台
  - 数据大盘
  - 订单中心
  - 调度中心
    - 排班当前周期确认
    - 排班
  - 场控布局
  - 库存管理
  - 财务结算
  - 技师管理 / 用户管理 / 评价中心
  - 门店设置
- 运营后台
  - 数据大盘 / 数据中心
  - 技师管理与审核
  - 订单 / 财务 / 营销 / 风控
  - 店铺与商家管理
  - 系统设置与权限管理

运营后台唯一“数据大盘”读取受 `backoffice:dashboard:read` 保护的正式数据库聚合，使用服务端东京日期分桶和具名比较字段，不生成演示折线或虚构增长率。旧分析页、旧数据大屏入口和旧 Dashboard 预览 payload 已退役。

运营实时大盘 microstep A 只包含数据地基：`/api/v1/backoffice/dashboard/live-snapshot` 与 `/api/v1/backoffice/dashboard/live-events` 以 `country=JP`、可选的逐级 `admin1`/`admin2`、`period=today|last7days|last30days` 查询；快照名称按 `Accept-Language`（`zh-CN`、`zh-TW`、`ja`、`en`、`ko`，默认日语）本地化。地区归属只读取 Booking 创建时保存的不可变服务发生地，未解析或缺失快照的旧订单进入全国总量与未解析覆盖率，不进入东京/新宿下钻。缓存 TTL 为 300 秒，区域事件以 generation fence 逐级失效；SSE 发送 5 秒 retry、30 秒 heartbeat，支持 `Last-Event-ID`，过期/缺失游标返回 409，客户端需重新取快照再连接，且事件白名单不暴露客户资料、地址、备注或内部数字 ID。完整合同见 `docs/backoffice-real-data.md`。

The compatibility backend and split operations/merchant servers share one live-dashboard runtime factory. Configure the same `LIVE_DASHBOARD_REDIS_URL` in every process for cache, generation and Stream keys; portal `REDIS_URL` remains isolated for auth/session state. Split startup fails closed without the shared setting. `dev:formal` supplies it to all three processes from `FORMAL_LIVE_DASHBOARD_REDIS_URL` (defaulting to the existing shared route-health target); shutdown closes the dedicated live clients. This wiring is not Redis connectivity acceptance.

Home booking codes must resolve to the official Japanese prefecture/municipality names in the normalized address bound to the accepted estimate. A mismatch is rejected before capacity or estimate consumption. Exchange conversion snapshots a verified store assignment transactionally; free-text home demands and unverified stores get explicit unresolved snapshots. Eligible unresolved or missing historical snapshots contribute to Japan-wide totals and unresolved coverage, never regional child metrics/drill-downs. No region is inferred from free text or current customer/technician residence.

历史 Booking 地点脚本默认 preview；apply 必须追加 `--apply --confirm-count=<preview-planned-count>`，恢复使用 `--restore-run=<run-id>`。最终本地 checker 必须同时显式传入 `FORMAL_BACKEND_ENV_FILE`、`LIVE_DASHBOARD_CHECK_ROLLBACK=true` 与本次运行唯一、可复现的小写 `LIVE_DASHBOARD_CHECK_RUN_ID`：`FORMAL_BACKEND_ENV_FILE=/absolute/path/to/.env.dev LIVE_DASHBOARD_CHECK_ROLLBACK=true LIVE_DASHBOARD_CHECK_RUN_ID=task8-local-a npm --prefix backend run check:live-dashboard`。microstep A contains no live-screen page；本地 commit、remote push、deployment、migration application、形式化 DB/Redis 验收与页面验收是互相独立的事实，本步骤不执行 push、部署或生产 migration。

运营实时数据大屏 microstep B 已增加受保护的 `/pf-admin.html#/admin/live-screen` 独立页面，通过正式 snapshot/SSE 展示 JP、都道府县与市区町村范围数据，并使用本地版本化 N03 2026 地图资源。入口从现有运营数据大盘以 `noopener,noreferrer` 新标签页打开，不传递 token；页面支持日间/深色运营主题、全屏、低频对账、自动滚动暂停、地图键盘下钻和正式区域选择回退。完整的本地 migration、MySQL/Redis checker、浏览器与自动化证据见 [运营实时数据大屏本地验收记录](docs/live-dashboard-acceptance.md)。该记录不代表远端 push、部署或生产 migration。

2026-09-07 响应式补充已完成本地验收：桌面流式单屏、手机竖屏隐藏地图但保留搜索/级联选择、全国本地搜索、可读引导线标签、缩放拖动还原及独立日期轴；20 个桌面与 3 个手机样本、正式 API 请求频率和密集区域证据见上述验收记录的“响应式地图与日期轴复验”。北海道等容量超限区域采用可访问的渐进名称披露，完整区域路径和搜索选择保持可用。

2026-09-10 地图交互补充将 Pointer Capture 延后到确认发生拖拽或双指缩放后，普通鼠标/触控点击继续由行政区域路径处理并下钻；缩放滑条 100% 端点统一调整为 20 倍。该补充只修改前端交互和测试，没有新增 API、数据库字段或 migration。

“数据管理中心”已改为正式数据只读入口，通过后端分页和关键词过滤读取订单、客户、技师、店铺、服务、排班与结算。库存、评价及历史全屏图表在正式表结构、RBAC、审计和分页合同完成前保持禁用，不再回退到浏览器 mock 或本地资料覆盖层。

独立“评价中心”同样采用能力门禁：Review 表与 migration、分页搜索 RBAC API、回复和风控审计日志完成前，只展示明确的上线条件，不展示模拟评分、评价内容、回复状态、差评预警或敏感评价数字。

商户后台唯一“数据大盘”按当前签名店铺隔离读取正式聚合；多店切换通过服务端 membership 校验和 token 轮换，不依赖客户端 `shopId`。会员卡功能尚未接通时保留 `memberCount=null`，但期间内完成订单的去重利用者数仍来自正式 API；不再复用旧经营驾驶舱或浏览器演示指标。

商户后台“订单中心”已接入按当前店铺强制隔离的服务端分页、正式订单状态机、线下收款确认和退款接口。取消订单、确认收款和确认退款采用二次点击确认；冲突、越权、网络失败和空数据都有明确状态，不再跳转到 mock 消息或调度流程。

商户店铺基础资料支持 `PATCH /api/v1/merchant-admin/shop`：店铺 ID 只从当前活动店铺身份取得，商户可更新名称、简介、城市、地址和电话，不能通过请求体切换店铺或修改平台推荐状态；每次修改都经过 Zod、RBAC 和审计日志。店铺前端和 PC 店铺后台复用同一个五语言展示编辑器及数据合同，使用 `GET /api/v1/merchant-admin/shop/presentation` 与按语言 `PUT /api/v1/merchant-admin/shop/presentation/locales/:locale`；经通用红框确认后，还可通过原子同步接口用当前语言图片和文字覆盖其余语言，五个语言记录同步后仍可分别编辑。首页轮播图和服务套餐图片先通过店铺范围的正式媒体接口上传，再以 `MediaAsset` 公共校验值保存引用；首次新增正式轮播图会替换不可持久化的页面兜底图。价格、币种、时长继续从正式 `Service` 读取，展示配置不能改写交易字段。

商户后台“人员与顾客”的员工列表现使用当前店铺范围的 `/api/v1/merchant-admin/employees` 正式分页 API，并以员工 NeeDoID 打开“员工详细信息卡”。基础资料、本店从属关系、日程、工资结算周期和薪酬规则均通过真实、受权限保护且有审计的接口读写；卡内工资统计来自当前店铺该员工最新的正式工资单及其订单财务来源，不回填演示金额，也不暴露内部店铺或技师 ID。商户页已移除旧技师全局审核、软删除和数字档案号展示。实际支付仍由财务人员在财务结算页手工登记，系统不会发起自动转账。客户仍只显示后端已有档案与真实预约数；旧组件推算的假头像、LTV、活跃分、流失风险和动态已移除。评价页在 Review 表、回复权限和审核链路完成前保持明确未启用。

商户移动端“员工”页使用统一全屏头部承载返回、员工搜索、关闭和“全部 / 员工 / 临时 / 审核”四个入口，并在该页面隐藏公共底部导航。“全部”合并正式员工与临时员工，“审核”只展示正式入驻申请队列。员工类型兼容接口会按实际分页大小读取完整结果，并以规范 NeeDoID 与店铺技师主档关联，避免首屏分页之外的员工被误报为缺少档案。移动端员工详情复用店铺后台 `EmployeeDetailCard`，因此基础资料、从属、日程、工资周期、薪酬与分成、结算及员工动态使用同一正式 API 和编辑权限；详情页仅调整移动端头部、内容宽度与扁平页签布局，不新增 mock 或独立数据副本。

运营“营销中心”已移除模拟优惠券、活动量、GMV、ROI、归因和页面内存创建。现有 `FeeCampaign` 只参与平台费用计算，不被冒充为用户营销模型；通用营销将在 Campaign/Coupon/Redemption 数据表、状态机、领取核销、归因审计和聚合导出合同完成后开放。

运营后台“订单中心”现在使用全平台正式分页、订单状态机及受保护的运营收款/退款接口。改期、派单、改价、打印和虚构聊天/时间线在正式合同上线前不再作为可用按钮展示，避免运营人员误以为操作已写入数据库。

“上门工单中心”已改为能力门禁：FieldJob 数据表、派工状态机、照片与异常记录、导航和审计链路完成前，不显示模拟地址、报价、技师和工单状态，也不开放不会落库的创建、派工、上传或完工操作。

运营后台旧“客户 CRM”入口现在统一进入受 `menu:user-management` 权限保护的正式客户档案工作区。当前只展示并维护数据库已有的姓名、邮箱、城市、会员等级、公开状态、预约数和创建时间；在正式聚合合同完成前，不再从浏览器数据推算 LTV、流失风险、标签、动态或下次预约。

### 权限点变化

- `store.scheduling.overview.view`
- `store.scheduling.current.view`
- `store.scheduling.today.view`
- `store.scheduling.technician-status.view`
- `store.scheduling.automation.edit`
- `store.scheduling.one-click.run`
- `store.scheduling.batch-confirm.run`
- `store.dispatch.view`
- `store.dispatch.manage`
- `store.stage-layout.view`
- `store.stage-layout.manage`
- `store.inventory.view`
- `store.inventory.manage`

权限实现位于 `src/auth/featurePermissions.ts`，路由级守卫位于 `src/App.tsx` 的 `RequireFeaturePermission`。

### 旧入口兼容方案

- `/merchant-admin/schedule` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/store?module=floorplan` -> `/merchant-admin/stage-layout`
- `/merchant-admin/store?module=inventory` -> `/merchant-admin/inventory`
- `/merchant-admin/store?module=finance` -> `/merchant-admin/finance`
- `/merchant-admin/scheduling` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/scheduling/overview/*` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/scheduling/automation/*` -> `/merchant-admin/dispatch-center/schedule?mode=auto`
- `/merchant-admin/dispatch-center/overview` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/dispatch-center/automation` -> `/merchant-admin/dispatch-center/schedule?mode=auto`
- `/merchant-admin/dispatch-center/manual` -> `/merchant-admin/dispatch-center/schedule?mode=manual`
- `/admin/dispatch` -> `/merchant-admin/dispatch-center/current`
- `/admin/floorplan` -> `/merchant-admin/stage-layout`
- `/admin/inventory` -> `/merchant-admin/inventory`

## Development Principles

- 用户端、技师端、店铺端：严格按手机优先开发。所有核心流程都需要以手机单手操作、信息易读、按钮易懂、层级清晰为标准来设计和验收。
- 前台三端：不仅要能在手机上显示，还要注重美观、易用、易懂。相同功能尽量复用同一套模块和交互，降低学习成本。
- 后台：优先适配 PC 端，保证运营、调度、数据管理等高密度场景的效率；在此基础上尽量兼容手机查看和轻操作。
- 前后台同一业务能力尽量共用同一套数据和规则，避免出现“前端能改、后台不同步”或“后台规则和前端展示不一致”的情况。

## Docs

- [项目结构](/Users/eason/Documents/New project/docs/PROJECT_STRUCTURE.md)
- [前端信息架构](/Users/eason/Documents/New project/docs/FRONTEND_IA.md)
- [核心数据模型](/Users/eason/Documents/New project/docs/DATA_MODEL.md)
- [自动排班系统说明](/Users/eason/Documents/New project/docs/SHIFT_PLANNING_SYSTEM.md)

## Detail Pages Refactor

2026-04 这一轮把 `用户 / 店铺 / 技师` 三类详细资料卡收敛到同一个 `profile-detail` 模块系统里。

统一的不是“长得完全一样”，而是：

- 同一套视图模型入口
- 同一套详情骨架入口
- 同一套底部操作与关闭方式
- 同一套从列表卡 / 聊天 / 动态 / 通讯录进入详情的维护方式

角色模板现在明确分成三类：

- `user-basic`
  - 参考微信个人资料页思路。
  - 只保留头像、昵称、地区、基础资料、标签 / 备注、个人介绍和联系入口。
  - 不再复用店铺 / 技师那种重商业化详情结构。
- `shop-business`
  - 保持店铺详情当前方向，继续参考 Tabelog 式商业详情。
  - 保留图片、名称、评分、地址、营业时间、服务项目、支付方式、标签与可预约信息。
- `technician-business`
  - 主体结构继续沿用当前聊天页点开后的技师详情。
  - “近期可约”部分已经替换成首页详情同源的 `RecentTwoWeekAvailability` 共享模块。

### Component Structure

- `src/types/detailProfile.ts`
  - 详情页统一视图模型。
  - 定义 `BaseDetailProfile`、`PersonalDetailProfile`、`ShopDetailProfile`。
  - 让 UI 只依赖统一的详情结构，不直接耦合旧的 mock/domain 字段。
- `src/lib/detailProfiles.ts`
  - 详情页字段映射层。
  - 提供 `buildUserDetailProfile`、`buildTechnicianDetailProfile`、`buildShopDetailProfile`。
  - 当前负责把现有 `Customer / Technician / Store` 数据整理成页面可直接消费的 summary / infoRows / intro / reviewSummary / serviceItems / teamMembers。
- `src/shared/profile-detail/UnifiedProfileDetail.tsx`
  - 新的统一详情入口。
  - 对外统一暴露：
    - `UnifiedProfileDetail`
    - `UnifiedProfileDetailBody`
    - `StickyActionBar`
    - `buildDefaultDetailActions`
- `src/shared/profile-detail/templates/user-basic.tsx`
  - 用户轻量资料模板入口。
- `src/shared/profile-detail/templates/shop-business.tsx`
  - 店铺详情模板入口。
- `src/shared/profile-detail/templates/technician-business.tsx`
  - 技师详情模板入口。
- `src/shared/profile-detail/sections/RecentTwoWeekAvailability.tsx`
  - 从首页详情抽出来的共享“两周预约”模块。
  - 首页详情和技师详情现在复用同一个 section，而不是各自维护。
- `src/components/mobile/EntityDetailPage.tsx`
  - 作为兼容层继续保留。
  - 内部已按 `user / technician / shop` 走不同 detail template 规则。

### Shared Blocks

- `GalleryCarousel`
  - 主图 + 缩略图 + 图片索引 + 左右切换 + 大图预览。
  - 现在缩略图区去掉了厚重边框，当前选中图只保留轻量高亮。
- `PersonalHeaderSummary`
  - 技师详情使用的主摘要区。
  - 继续沿用聊天页详情风格。
- `RecentTwoWeekAvailability`
  - 技师详情与首页详情共用的“最近两周预约”模块。
  - 首页仍然可以传入可交互版配置，详情页默认用同一套展示模块。
- `KeyInfoChips`
  - 技师详情的高价值信息 chip 组。
- `ProfileInfoList`
  - 技师 / 用户基础资料的轻量信息行。
  - 用分组标题、留白和极轻分隔线替代旧式表格感。
- `UserBasicDetailBody`
  - 用户专用的轻量资料模板。
  - 只保留基础资料、标签 / 备注和简介。
- `PersonalIntroSection`
  - 技师介绍区，支持长文展开 / 收起。
- `PersonalReviewSummarySection`
  - 技师页的评分、评价摘要和印象标签。
- `ProfileTagsSection`
  - 技师业务标签区，支持折叠 / 展开。
- `ShopHeaderSummary`
  - 店铺页专用首屏摘要区。
- `InfoTableSection`
  - 基本资料 / 规则信息 / 店铺详细信息的结构化信息表。
- `DetailBadgeCloud`
  - 快捷 badge、角色标签、评价标签，支持折叠。
- `IntroSection`
  - 介绍说明区，支持长文展开 / 收起。
- `ReviewSummarySection`
  - 评分、评价数、评价标签、最近评价摘要。
- `ShopCoreInfoBar`
  - 店铺营业状态、时间、地址、交通、支付、语言等核心信息条。
- `ShopServiceListSection`
  - 店铺服务项目区。
- `TeamSection`
  - 店铺团队 / 技师区。
- `MapSection`
  - 地址、交通说明、地标和地图跳转入口。

### Page Entry Points

- `src/components/mobile/MobileMessageCenter.tsx`
  - 聊天顶部资料卡点开后进入新的共享详情页。
  - 技师详情继续以这里原来的版本为主模板。
- `src/pages/mobile/MomentsPage.tsx`
  - 动态作者头像 / 名称点开后进入新的共享详情页。
- `src/pages/user/ProfileDetailPage.tsx`
  - 新增统一资料详情路由页，承接 `/profiles/:entityType/:id`。
- `src/pages/user/HomePage.tsx`
  - 首页旧的 `NearbyDetailOverlay` 不再自己维护另一套详情内容。
  - 现在改为复用统一 `DetailPageBody`，只保留首页特有的预约控制区。
- `src/pages/user/StoreDetailPage.tsx`
  - 店铺独立详情页已切到统一 `profile-detail` 入口。

### Field Mapping

- 用户页
  - `creditScore`：当前由 `Customer.activeScore / 10` 映射为 10 分制展示。
  - `commonPaymentMethods` / `preferredServiceTypes` / `verifiedStatus` / `region`：
    - 优先读取 `detailProfiles.ts` 内的 override。
    - 无 override 时走当前 domain 字段与默认兜底规则。
  - 当前用户页保留了：
    - `systemId`
    - `memberLevel`
    - `height`
    - `nextBookingAt`
    - `lastOrderAt`
  - 但渲染上只展示基础资料，不再把商业能力字段堆进用户详情模板。
- 技师页
  - `serviceScore`：当前由 `Technician.rating * 2` 统一到 10 分制。
  - `serviceTypes`：由 `Technician.skills` 映射。
  - `prepayRequired`：由 `Technician.paymentMethods` 是否包含 `prepay` 推导。
  - `paymentMethods`：当前统一映射成 `cash / offline / platform` 三类前端展示口径。
  - `recentTwoWeekAvailability`：
    - 不再走旧的聊天详情可约块。
    - 统一改为复用 `RecentTwoWeekAvailability`。
  - `serviceMode / workYears / startPrice / minUserCreditScore / availableSchedule`：
    - 优先读取 override。
    - 缺失时使用当前 mock 数据推导或兜底展示。
  - 当前个人页保留了：
    - `systemId`
    - `acceptRate`
    - `cancelRate`
    - `bidBudgetMin / bidBudgetMax`
    - `serviceAreas`
    - `canServeForeigners`
    - `paymentMethods`
- 店铺页
  - `shopScore`：当前由 `Store.rating * 2` 统一到 10 分制。
  - `categories / paymentMethods / languages / supportForeigner / reservable / holidayInfo / cancelPolicy / shopRules`：
    - 先由 `detailProfiles.ts` 内的店铺配置映射。
  - `serviceItems`：
    - 由店铺配置中的服务分类去筛选 `services`。
  - `teamMembers`：
    - 由 `technicians.filter((item) => item.storeId === store.id)` 生成。
  - `businessHours`：
    - 先把旧字符串规格化成结构化 `BusinessHourSlot[]`，供营业信息条和详细信息区复用。

### How To Extend

- 新增详情字段时，先判断它属于哪一层：
  - 原始业务字段：加在 domain / API response。
  - 详情页展示字段：优先加到 `src/types/detailProfile.ts`。
- 所有原始数据到页面展示的转换，统一放在 `src/lib/detailProfiles.ts`。
  - 不要在页面组件里直接拼业务逻辑。
  - 页面组件只消费 `DetailProfile`，尽量不直接读 `Customer / Technician / Store`。
- 如果只是增加一条展示信息：
  - 用户页通常放进 `basicInfoRows`、`capabilityRows`、`summaryBadges` 或 `introBlocks`。
  - 技师页通常放进 `basicInfoRows`、`capabilityRows`、`quickBadges`、`tags` 或 `introBlocks`。
  - 店铺页通常放进 `coreInfoItems`、`detailInfoRows`、`serviceItems`、`teamMembers` 或 `mapInfo`。
- 如果后续增加新的角色详情页：
  - 优先复用 `BaseDetailProfile` 思路。
  - 个人型角色继续走 `PersonalDetailProfile` 骨架，但渲染模板要明确区分 `user-basic` 和 `technician-business`。
  - 非个人型角色参考 `ShopDetailProfile`，继续挂到统一 `profile-detail` 系统下。

## Unified Profile Card Refactor

2026-04 这一轮把 `用户 / 店铺 / 技师` 三类简易资料卡继续收敛到同一个 `profile-card` 模块体系，首页“附近可预约”仍然是店铺 / 技师卡的基准视觉版本。

目标不是把所有场景强行做成同一张卡，而是统一：

- 同一套 schema
- 同一套 mapper
- 同一套样式规则
- 同一套交互入口
- 同一套 detailHeader 延展方式

### Module Structure

- `src/shared/profile-card/UnifiedProfileCard.tsx`
  - 简易资料卡统一入口。
  - 通过 `entityType + variant` 控制渲染。
- `src/shared/profile-card/variants/*`
  - `compact / list / share / nearby`
- `src/shared/profile-card/types.ts`
  - 对外提供更贴业务语义的类型别名：
    - `BaseProfileCardData`
    - `UserProfileData`
    - `ShopProfileData`
    - `TechnicianProfileData`
- `src/shared/info-card/types.ts`
  - 底层卡片数据结构实现。
- `src/shared/info-card/mappers.ts`
  - 负责把 `Customer`、`Store`、`Technician`、`DetailProfile` 映射成信息卡数据。
  - 对外提供：
    - `buildUserInfoCardData`
    - `buildShopInfoCardData`
    - `buildTechnicianInfoCardData`
    - `buildInfoCardDataFromDetail`
    - `buildInfoCardData`
- `src/shared/info-card/BaseInfoCard.tsx`
  - 统一渲染器。
  - 支持：
    - `nearby`
    - `list`
    - `compact`
    - `share`
    - `detailHeader`
- `src/shared/info-card/ShopInfoCard.tsx`
  - 店铺 wrapper。
- `src/shared/info-card/TechnicianInfoCard.tsx`
  - 技师 wrapper。
- `src/shared/profile-card/index.ts`
  - 新的 profile-card 统一导出入口。

### Variant Usage

- `nearby`
  - 首页 `HomePage` 的“附近可预约”店铺 / 技师卡。
- `list`
  - 搜索页 `SearchPage`
  - 分类页 `CategoryPage`
  - 店铺列表页 `StoreListPage`
  - 其他需要标准摘要卡的列表场景
- `compact`
  - 聊天窗口顶部资料卡 `ChatConversationInfoCard`
  - 通讯录 `ContactDirectorySection`
  - 通讯录快捷面板 `ContactShortcutPanel`
  - 商户端 / 技师端通讯录里的用户 / 店铺 / 技师联系人
- `detailHeader`
  - `EntityDetailPage` 里的店铺 / 技师详情头部摘要卡
  - 详情模板内部的首屏摘要头部
- `share`
  - 统一预留给聊天分享名片 / 动态嵌入卡，后续新增时直接走这一变体

### Field Mapping

- Base schema
  - `displayName / subtitle / badgeList / metricList / tags / metaLines / nextAvailability / detailPath`
  - 这些字段是所有变体共同消费的基础字段。
- 用户
  - `avatar / coverImage`：统一走 `Customer.avatar`
  - `rating`：统一映射成信用评分
  - `reviewCount`：暂时复用订单量 / 历史互动量
  - `detailPath`：统一走 `/profiles/user/:id`
- 店铺
  - `coverImage / avatar`：统一走 `Store.cover`
  - `status`：由 `Store.openStatus` 统一映射为 `营业中 / 可预约 / 暂未营业`
  - `priceLabel`：统一走 `Store.priceLabel`
  - `nextAvailability`：统一走 `Store.nextSlot`
  - `detailPath`：统一走 `/stores/:id`
- 技师
  - `coverImage / avatar`：统一走 `Technician.avatar`
  - `status`：统一由 `Technician.status` 映射为 `可预约 / 服务中 / 休息中`
  - `metaLines`：统一组织为技能、服务区域、接单率 / 取消率
  - `priceLabel`：优先用 `bidBudgetMin / bidBudgetMax`
  - `highlightChips`：统一汇总语言、外籍可接待、风格标签
  - `detailPath`：统一走 `/profiles/technician/:id`
- 详情页头部
  - 统一由 `buildInfoCardDataFromDetail` 从 `DetailProfile` 派生。
  - 这样首页卡、聊天卡、详情头卡使用的是同一套字段语义，而不是各自重新拼一遍文案。

### Migrated Entry Points

- `src/pages/user/HomePage.tsx`
  - “附近可预约”已切到统一 `nearby` 变体。
- `src/pages/user/SearchPage.tsx`
  - 店铺和技师列表卡统一走共享卡片。
- `src/pages/user/CategoryPage.tsx`
  - 分类页的店铺 / 技师概览卡统一走共享卡片，技师卡不再跳服务页。
- `src/components/mobile/ChatConversationInfoCard.tsx`
  - 用户 / 店铺 / 技师会话顶部资料卡改成共享 `compact` 变体。
  - 平台 / 客服等非实体联系人仍保留旧布局。
- `src/components/mobile/ContactDirectory.tsx`
  - 为目录联系人和快捷面板增加 `entityCardData / entityCardVariant`，让用户 / 店铺 / 技师联系人复用共享卡。
  - 当存在 `entityCardData.detailPath` 时，卡片点击优先进入统一详情页。
- `src/pages/user/ContactsPage.tsx`
  - 用户端通讯录中的店铺 / 技师联系人与快捷面板，已切到共享 `compact`。
- `src/pages/mobile/MerchantPortalPage.tsx`
  - 商户端通讯录里的用户 / 技师联系人已接入共享 `compact`，并走商户作用域的统一详情路由。
- `src/pages/mobile/TechnicianPortalPage.tsx`
  - 技师端通讯录里的用户 / 店铺 / 技师联系人已接入共享 `compact`，并走技师作用域的统一详情路由。

### Compatibility Layers

- `src/components/mobile/StoreCard.tsx`
  - 保留旧组件名，但内部已经转成 `ShopInfoCard` wrapper，方便旧调用逐步迁移。
- `src/components/mobile/ChatConversationInfoCard.tsx`
  - 保留旧组件名与旧入参。
  - 当会话类型是 `customer / store / technician` 时，内部自动切到共享 `compact`；其他类型继续走旧实现。
- `src/components/mobile/ContactDirectory.tsx`
  - 增加 `entityCardData` 兼容口，不强制所有联系人都变成信息卡。

### Deleted Duplicate Logic

- 首页“附近可预约”原先的店铺卡 / 技师卡内联结构已经不再单独维护。
- 搜索页和分类页里原本各自拼接的资料卡已经收口到共享模块。
- 聊天顶部资料卡与通讯录里的实体联系人卡，不再各自维护独立视觉规则。
- 技师卡从部分列表跳服务页、部分列表跳资料页的分叉逻辑已被收口。

### API Integration

当前实现仍基于 mock + 前端映射层，后续接真实接口时建议按下面方式替换：

- `GET /technicians/:id`
  - 返回后映射为 `buildTechnicianDetailProfile` 所需字段，或直接在 API adapter 内生成 `PersonalDetailProfile`。
- `GET /users/:id`
  - 返回后映射为 `buildUserDetailProfile` 所需字段。
- `GET /shops/:id`
  - 返回后映射为 `buildShopDetailProfile` 所需字段。
- `POST /favorites`
  - 对接顶部关注 / 收藏按钮与底部操作栏里的关注 / 收藏动作。
- `DELETE /favorites/:targetType/:targetId`
  - 对接取消关注 / 取消收藏。
- `GET /reviews/summary`
  - 写入 `reviewSummary.score`、`reviewSummary.reviewCount`、`reviewSummary.tags`、`reviewSummary.recentSummary`。
- `GET /shops/:id/services`
  - 直接替换 `serviceItems`。
- `GET /shops/:id/technicians`
  - 直接替换 `teamMembers`。

推荐做法是保留 `detailProfiles.ts` 作为“接口响应 -> 页面视图模型”的最后一层适配，这样 UI 可以继续稳定复用，不需要每接一个接口就改多个页面组件。

## 2026-04 Home / Me / Category Consolidation

这一轮继续围绕“统一结构，不重做品牌风格”推进首页、【我的】页、设置页和“所有服务类别”页。重点不是加新业务，而是把分类入口、设置入口、轮播和简卡都收口到更少的模块里。

### 齿轮 Icon 统一规则

- 三端首页和【我的】页右上角齿轮统一以用户端首页当前 `IconButton(icon="settings")` 为基准。
- `src/components/mobile/SettingsShortcutButton.tsx` 现在直接复用 `src/components/client-ui/AppScaffold.tsx` 里的 `IconButton`，不再维护另一套齿轮 svg、尺寸和容器样式。
- 统一后收敛范围包括：
  - 用户端首页 `src/pages/user/HomePage.tsx`
  - 用户端【我的】页 `src/pages/user/UserCenterPage.tsx`
  - 技师端首页 / 我的页 `src/pages/mobile/TechnicianPortalPage.tsx`
  - 商户端首页 / 我的页 `src/pages/mobile/MerchantPortalPage.tsx`
- 统一的是同一套图标本体、容器尺寸、点击热区、边框、背景和阴影；后续不要再新增其他齿轮风格。

### 用户端设置首页新增内容

- 用户端【我的】页已移除重复的“显示与语言”模块和首页分类配置模块，避免设置能力在多个页面重复出现。
- 用户端设置首页 `src/pages/user/UserSettingsPages.tsx` 保留“常用入口”目录项，并新增对应二级页 `/me/settings/home-shortcuts`。
- 这个区域只存在于用户端设置首页，技师端 / 商户端的设置结构暂时不跟进这一块。
- “常用入口”直接展示全部服务类别 icon，并复用现有 `CategoryIcon` 资源，不替换图标风格。

### 分类 Icon 替换逻辑

- 首页分类配置改由 `src/lib/homeCategories.ts` 统一管理。
- `homeCategoryOptions` 现在直接来自全部 `serviceCategories`，不再只维护少量首页专用分类。
- 选择规则：
  - 最多点亮 5 个。
  - 超过 5 个时会阻止继续选择，并提示“最多选择 5 个”。
  - 第 6 个首页入口固定保留“全部分类”。
- 首页展示规则：
  - 已点亮几个分类，首页就显示几个分类入口。
  - 第 6 个入口固定保留“全部分类”。
  - “恢复默认”会一键恢复默认的 5 个常用分类。
- 首页分类点击目标统一改为 `/categories?category=:id`，让首页分类区和“所有服务类别”页使用同一套分类语义。

### 所有服务类别页展开 / 收起逻辑

- `src/pages/user/CategoryPage.tsx` 已按新结构重排为：
  - 页面标题
  - 搜索框
  - “全部 / 收起”按钮
  - 分类 icon 区
  - 热门分类轮播
  - 可预约服务列表
- 分类 icon 区默认只显示两排，每排 6 个，共 12 个。
- 点击“全部”后会自然展开全部分类，容器高度不写死，跟随分类数量自动增长。
- 分类 icon 项已去掉旧的重型格子背景，名字改为单行，并通过负 margin 轻压在 icon 下部区域来压缩高度。
- 搜索框会实时过滤分类，但展开 / 收起规则仍按当前筛选结果生效。

### 热门分类轮播如何复用首页轮播模块

- 首页原本内联在 `HomePage.tsx` 里的轮播已抽成共享组件 `src/components/client-ui/FeatureCarousel.tsx`。
- 首页轮播现在通过这个共享模块渲染 3 张。
- “热门分类”模块也通过同一个 `FeatureCarousel` 渲染 6 张，只是数据源换成热门分类集合。
- 复用的是同一套：
  - 轮播滚动行为
  - 自动轮播逻辑
  - 指示器
  - 文案 / 按钮叠层结构
- 后续若要继续改轮播视觉，首页和热门分类必须一起走这一个组件，不要再回到页内各写一套。

### 店铺 / 技师简卡统一方式

- 新增统一入口组件：`src/shared/profile-card/UnifiedSimpleProfileCard.tsx`
- 这个组件按 `entityType` 分流到同一套 `BaseInfoCard` 渲染骨架，差异只保留在数据映射层。
- `ShopInfoCard` 和 `TechnicianInfoCard` 已改为转调 `UnifiedSimpleProfileCard`，不再各自直接拼装独立渲染器。
- 当前统一后的核心链路是：
  - 数据映射：`src/shared/info-card/mappers.ts`
  - 统一渲染：`src/shared/info-card/BaseInfoCard.tsx`
  - 统一简卡入口：`src/shared/profile-card/UnifiedSimpleProfileCard.tsx`
- 分类页的“可预约服务列表”现在优先用这套统一简卡来展示店铺和个人技师。

### 可预约服务列表联动

- “所有服务类别”页中的可预约服务列表不再固定展示同一批 mock 数据。
- 当前实现会随 `activeCategory` 切换同步刷新：
  - 同类服务摘要卡
  - 相关店铺候选
  - 相关个人技师候选
- 店铺 / 技师当前通过分类关键词、服务摘要、标签、简介和稳定 fallback 排序一起计算相关度，确保切换不同类别时，下方内容会变化。
- 后续如果后端补齐真实分类关联，只需要替换 `CategoryPage.tsx` 里的相关度来源，不需要重写列表 UI。

## 2026-04 Settings Directory Refactor

这一轮继续沿用现有主题、语言、身份和通知逻辑，但把设置页的信息架构重构成“目录首页 + 详细子页”的形式，目标是提高查找效率而不是新增复杂功能。

### 设置首页新信息架构

- 设置首页 `src/pages/user/UserSettingsPages.tsx` 现在只展示分组入口和当前状态，不再直接铺开大卡片和大量选项。
- 首页统一采用“左侧标题 + 右侧当前值 + 最右箭头”的目录式列表。
- 统一分组为：
  - 外观与系统
  - 个人资料与认证
  - 账户与安全
  - 通知与隐私
  - 其他

### 设置项与二级页映射

- `UI 切换` -> `/me/settings/theme`
- `语言` -> `/me/settings/language`
- `身份` -> `/me/settings/portal`
- `常用入口` -> `/me/settings/home-shortcuts`
- `资料编辑` -> `/me`（个人中心；旧 `/me/settings/profile` 自动重定向）
- `本人验证 / 店铺资质` -> `/me/settings/verification`
- `服务范围` -> `/me/settings/service-range`
- `账户与安全` -> `/me/settings/account`
- `通知设置` -> `/me/settings/notifications`
- `帮助与反馈` -> `/me/settings/help`
- `关于 NeeDo` -> `/me/settings/about`

### 从首页挪到二级页的简单功能

- 主题预览卡不再直接放在设置首页，改为集中在 `UserSettingsThemePage` 中选择。
- 语言切换不再使用首页大按钮，改为 `SettingsRadioListPage` 的紧凑单选列表。
- 身份切换不再占据首页大面积空间，改为独立单选页。
- 用户端首页分类 icon 配置不再直接显示在设置首页，而是移到“常用入口”二级页。

### 2026-09-10 用户资料入口修正

- 用户端设置首页的“资料编辑”直接进入 `/me` 个人中心，复用其中正式资料读取、编辑与保存流程。
- 删除设置模块内重复的用户资料编辑页面；技师与商户资料维护页不受影响。
- 旧 `/me/settings/profile` 作为本地历史链接兼容入口，仅重定向到 `/me`。
- 本次无数据库、migration 或 API 变更。

### 多身份显示差异

- 用户端首页显示：UI 切换、语言、身份、常用入口、资料编辑、本人验证、账户与安全、通知设置。
- 技师端首页显示：UI 切换、语言、身份、资料编辑、本人验证、服务范围、账户与安全、通知设置。
- 店铺端首页显示：UI 切换、语言、身份、资料编辑、店铺资质、账户与安全、通知设置。
- 三端共用同一套设置首页组件和列表结构，只通过当前身份控制条目显隐与文案差异。

运营/商户用户详情的用户LOG与履约时间线统一、审计 10/50 条正式分页、超过 10 行气泡展开/收起及本地验收记录见 [用户抽屉时间线验收](docs/qa/2026-09-06-user-drawer-timelines.md)。

### 预约 SOS 与后台求救通知

用户端与技师端的正式预约详情始终显示红色 SOS 胶囊按钮，不依赖服务状态或起止时间。点击将求救持久化；订单所属商户和具有对应权限的运营人员在统一的右上角工具栏查看待处理数量及分页列表。打开列表不会解除提醒，显式标记已处理后两端同步更新。

新增正式权限为 `sos:create`、`sos:list`、`sos:resolve`；部署需先应用 `20260906100000_booking_sos` migration 并生成 Prisma Client。接口定义见 `backend/src/api/sos.openapi.ts`，验收说明见 [预约 SOS 本地验收](docs/qa/2026-09-06-booking-sos.md)。

```bash
npm --prefix backend test -- --runInBand --runTestsByPath tests/sos.service.test.ts tests/sos-api.test.ts
npx vitest run src/features/sos
ENV_FILE=.env.dev npm --prefix backend run check:sos-flow
```

真实数据库检查仅接受已验证的本机开发环境，使用独立测试记录验证权限、并发幂等、审计事务与跨端通知，完成后自动清理。

### Technician work status and attendance

The technician status controls now persist audited work events. Merchant and operations projections use the same formal status. Monthly lateness/early-departure counts open paginated incident timelines with Tokyo date filters. Zero grace is applied to precise server timestamps. See [implementation and acceptance](docs/qa/technician-work-status-20260906/main-integration.md) for migrations, API routes, checks and runtime boundaries.

### Admin test contacts and six-month staffing

The local-first, audited two-account dataset and formal calendar acceptance are documented in [administrator contacts and six-month staffing](docs/qa/2026-09-06-admin-contacts-six-month-schedule.md). Appointment overview reads persisted scoped BookingOrders; staffing slots remain separate and display their actual availability state.

### User detail review facts and capsule tabs

Received service reviews in the operations and merchant user detail cards now include formal payment method/status, checkout ledger currency, accepted extra service time, separated tag groups, and review/booking notes. Detail categories share one capsule tab container. See [local review-card acceptance and XP unit finding](docs/qa/2026-09-06-user-review-detail.md).

The follow-up removes repeated membership facts, places adjustment controls inside the membership tab, consolidates merchant names, removes scout presentation, and adds server-side numeric ordering. See [user-directory follow-up acceptance](docs/qa/2026-09-06-user-directory-followup.md).

Managed-user lists and membership details now consume exact decimal `totalExp`, consistent with user experience summaries. See [EXP display correction and evidence](docs/qa/2026-09-06-experience-display.md).

### Application review and configurable eKYC requirements

Operations System Settings now exposes four versioned eKYC requirements, with only customer home bookings enabled by default. Merchant and technician applications restore review details and provide floating withdraw, retry or approved-identity switching actions. Technician shop selection uses formal shop IDs and standalone profile cards. See [implementation and local validation](docs/superpowers/plans/2026-09-07-ekyc-requirements.md).

### Technician booking and Request automation settings

The technician schedule entry keeps the existing formal “我的排班” calendar and adds separate Test-labelled “接单设置” and “抢单设置” tabs. Both settings are versioned, audited, scoped to the active technician identity and disabled by default. Rules use fail-safe AND evaluation: non-matching bookings remain pending, while matching Requests create a formal claim without automatic matching. Apply migration `20260909090000_technician_order_automation` before enabling the feature. The implementation and local verification plan is documented in [technician booking and Request automation](docs/superpowers/plans/2026-09-09-technician-booking-request-automation.md).
