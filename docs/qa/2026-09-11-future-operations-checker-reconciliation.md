# Future Operations Checker Reconciliation — 2026-09-11

Scope: local `127.0.0.1:3307/needo_dev` only. The investigation and checker are read-only; no Availability, ScheduleSlot, BookingOrder, history, financial, audit, or catalog row was changed.

## Root cause

The old checker treated the complete six-month technician/date window as exclusive to `lifedance_future_ops_2026_09_2027_02_v1`. That assumption became false after formal scheduling and booking activity was added. It also regenerated the plan from current catalog IDs even though persisted booking/service references are immutable history and the separately owned stale-slot repair may replace only safe future Slot inventory.

The corrected checker identifies the dataset through stable facts:

- Availability: technician, shop, start/end, active state;
- ScheduleSlot: the matched dataset Availability lineage plus technician, shop, and start/end;
- BookingOrder: namespace, order number, customer, technician, shop, start/end, status, and persisted `slotKey`;
- histories and notifications: namespace and immutable event facts.

Mutable catalog IDs and later Slot occupancy are reported, not rewritten.

## Preview manifest totals

| Classification | Availability | ScheduleSlot | BookingOrder |
|---|---:|---:|---:|
| Deterministic dataset matched | 41,193 | 41,193 | 18,513 |
| Coexisting formal records | 10,561 | 82,264 | 3 |

All 10,561 coexisting Availability rows are `SHOP / SHOP_ONLY`, active, and not schedule-control windows. Their target-month distribution is 1,501 / 1,860 / 1,800 / 1,860 / 1,860 / 1,680 from September 2026 through February 2027. One was created on 2026-09-01; 10,560 were created in the 2026-09-06 formal schedule-generation batch. The preview groups every row by source, owner, shop, month, creation pattern, and Slot fan-out.

The 82,264 coexisting Slot rows split into:

- 1 created on 2026-09-01;
- 43,403 created by the 2026-09-06 later operational schedule batch;
- 38,860 carrying `stale-slot-repair:d13a6336-877d-444d-a3d2-b0cf80276783`, owned by `codex/repair-stale-schedule-slots`.

Their current catalog classification is 81,100 published-service rows and 1,164 deleted-service history rows. A total of 82,262 are available/unbooked; the two booked rows retain Booking or Exchange Claim/Match relations. The preview groups every Slot by lineage, Availability source, technician owner, shop, service and technician-service state, month, creation batch, status, booked count, and protected relation counts. One dataset-lineage Slot has a legitimate later occupancy transition and is reported separately instead of being mistaken for a missing seed Slot.

## Exact booking evidence

| Booking | State | JST service time | Overlap | Protected evidence |
|---|---|---|---|---|
| `46397 / ND202609021800398191` | `COMPLETED` | 2026-09-03 14:00–15:00 | none | settled financial `18850`, captured wallet hold `215`, reviews `43` and `44`, five status-history events |
| `46540 / ND202609042208537783` | `PENDING` | 2026-09-07 14:00–15:00 | none | one persisted status-history event |
| `50591 / ND202609081128273495` | `PENDING` | 2026-09-09 12:00–13:00 | overlaps `LDF26-0001198` (also `PENDING`, 12:00–13:30) | pending-only soft conflict; no settlement, hold, or review |

Only the third row overlaps another booking. Both rows are `PENDING`, so this is a visible soft conflict rather than a confirmed/in-service hard lock. No repair is justified for any of the three records.

## Commands

```bash
cd backend
npm run check:future-operations -- --preview
npm run check:future-operations
```

The preview prints `coexistenceManifest`, `conflictEvidence`, and `repairDecision`. The default command still fails if the namespaced dataset itself is incomplete, duplicated, internally inconsistent, financially contaminated, or changes its historical baseline; valid coexisting operations no longer cause `Availability count mismatch.`
