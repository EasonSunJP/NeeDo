# Exchange / Intelligence booking local closure — 2026-09-08

## Scope

This local batch closes the customer demand publication, merchant claim and
matching, merchant/technician Intelligence publication, and booking-from-
Intelligence paths. It also aligns the order-detail price with the immutable
booking snapshot and applies the shared mobile header to the merchant periodic
schedule view.

No remote environment was used or modified during this verification.

## Browser acceptance

- Customer demand `EIB-QA-20260908-DEMAND` was published as post `104` with a
  JPY 7,000 budget and a formal 1,000 Test NDP request-fee hold.
- Aoyama Care Studio claimed the request with `Shiatsu Recovery`, Mika Tanaka,
  schedule slot `171154`, and a JPY 6,500 quote. The request, claim, matching,
  service, shop, technician, and time projections all agreed.
- Merchant Intelligence post `105` retained publisher `b5720845863`, catalog
  price JPY 8,800, and campaign price JPY 6,500.
- Technician Intelligence post `106` retained publisher `s2433935375`, its
  technician-owned service, catalog price JPY 8,800, and campaign price JPY
  6,600.
- Intelligence booking order `50591` retained source post `21`, booked price
  and payment amount JPY 6,000, while the live catalog service remained JPY
  8,000. The order page displayed only JPY 6,000 on the service card, added the
  payment method to that card's tags, and omitted the redundant amount,
  payment, and source summary cards.
- The merchant periodic schedule fullscreen header displayed shared back and
  close controls with the schedule search field between them. Search, clear,
  back, and close interactions completed without a dead end.
- The mobile scheduling mode step pins `Save draft` and `Next` in the same
  max-width, horizontal inset, bottom safe-area frame as the home navigation;
  the flow content reserves matching bottom space so neither action obscures
  the final panel.

## Database and audit evidence

- Demand post `104`, its claim, and its request matching are all `MATCHED`.
- The claim references Aoyama Care Studio, Mika Tanaka, and Shiatsu Recovery.
- The demand financial and wallet-hold snapshots both contain 1,000 Test NDP.
- Order `50591` has `service_price_snapshot=6000`,
  `payment_amount_jpy=6000`, an Intelligence campaign price of 6,000, and a
  reserved schedule slot with `booked_count=1`.
- `exchange.claim.create` and `booking.exchange_intelligence.create` audit
  records were present for the accepted browser flows.

## Automated verification

- Frontend typecheck/lint: `npm run lint`
- Frontend production build: `npm run build`
- Frontend affected suites: 10 files / 97 tests passed
- Frontend full suite: 487 files / 3,315 tests passed
- Backend lint: `npm run lint`
- Backend build: `npm run build`
- Backend affected suites: 12 suites / 68 tests passed
- Backend full suite: all 771 test files completed in nine isolated batches;
  every runnable suite passed. The partitioned run replaced the monolithic
  process after it reached the 4 GB heap ceiling. One stale travel-fare checker
  type guard exposed during the batch run was repaired and its 3 tests passed
  on rerun.
- Prisma client generation and schema validation passed
- Prisma migration status: 155 migrations, database schema up to date
- Scratch-database Intelligence checker passed the full migration chain, three
  publications and four booking variants, including an onsite booking with a
  consumed route estimate, immutable travel-fare snapshot, customer service
  location, source/price snapshot, idempotency, transaction rollback,
  concurrency, notifications, seven audit records, 16 negative cases, and
  verified cleanup
- Formal Exchange data checker passed: 251 actors, 40 posts, 255 comments,
  1,543 likes, 312 shares, and zero legacy residue

The scoped tests, full frontend and backend test inventories, static checks,
builds, migration checks, scratch integration checker, and authenticated
browser acceptance above are the local release evidence for this batch.
