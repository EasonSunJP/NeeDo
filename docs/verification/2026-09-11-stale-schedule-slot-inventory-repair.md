# Stale Schedule Slot Inventory Repair

## Scope and safety contract

This repair is a local-only Step 10 maintenance workflow. It rejects production and
staging environments, non-MySQL databases, remote hosts, and database names other than
`needo_dev` or `needo_test`. Every command requires an active administrator with the
`schedule:slots:write` permission.

The planner classifies a slot as protected when it is in the past, is not `AVAILABLE`,
has nonzero `bookedCount`, or has a BookingOrder, RouteEstimate, ExchangeClaim, or
ExchangeMatchParticipant relation. Protected rows and their order, financial, and audit
history are never changed.

For a future unused slot, replacement is allowed only when exactly one current mapping
has identical shop, technician, service name, category, canonical price, currency,
duration, and service mode. When both a shop service and technician service are present,
the new technician service must point to the selected shop service. Zero or multiple
candidates are reported as unmapped; the tool never invents a mapping.

## Commands

Run from `backend/` with an explicit ignored local environment file:

```bash
# Read-only preview. The output includes a SHA-256 planDigest and mutation check.
ENV_FILE=/absolute/path/to/backend/.env.dev \
  npm run repair:stale-schedule-slots -- \
  --preview --actor-email admin@lifedance.com

# Apply exactly the previewed database state.
ENV_FILE=/absolute/path/to/backend/.env.dev \
  npm run repair:stale-schedule-slots -- \
  --apply --plan-digest <preview-sha256> \
  --actor-email admin@lifedance.com

# Roll back one batch only while every generated replacement remains unused.
ENV_FILE=/absolute/path/to/backend/.env.dev \
  npm run repair:stale-schedule-slots -- \
  --rollback <batch-id> --actor-email admin@lifedance.com
```

Apply rebuilds and hashes the complete plan inside the same database transaction. A
digest drift, protected-state drift, count mismatch, permission failure, or database
safety failure aborts the transaction. Each changed original receives an immutable
`schedule_slot.stale_inventory_repair.apply` AuditLog containing its original snapshot,
reason codes, candidate count, replacement mapping, batch ID, and plan digest. Rollback
appends separate `schedule_slot.stale_inventory_repair.rollback` AuditLogs; it does not
delete prior audit history.

## Local database evidence

The initial read-only preview against `mysql://127.0.0.1:3307/needo_dev` produced plan
digest `b46723f5a2d5609790fa63d7237808afe4c1027778e7386d7fb901547e052c69`:

| Classification | Count |
| --- | ---: |
| Live slots scanned | 128,499 |
| Current | 46,078 |
| Stale | 82,421 |
| Protected history | 21,518 |
| Exact unique replacement | 60,903 |
| Unmapped removal | 0 |

The preview mutation assertion recorded 128,499 live slots and 0 repair AuditLogs both
before and after preview.

Controlled batch `e1d60475-39b0-49d6-9789-5e1cc94e9ae0` applied 60,903 replacements,
then rollback restored 60,903 originals and soft-deleted all 60,903 unused replacements.
The next preview reproduced the original digest and counts, proving reversibility while
retaining both apply and rollback audits.

Final local batch `d13a6336-877d-444d-a3d2-b0cf80276783` applied 60,903 exact
replacements and had zero unmapped removals. The post-apply read-only preview reported:

| Classification | Count |
| --- | ---: |
| Live slots scanned | 128,499 |
| Current | 106,981 |
| Stale | 21,518 |
| Protected history | 21,518 |
| Remaining replacement | 0 |
| Remaining removal | 0 |

That preview recorded 128,499 live slots and 182,709 retained repair AuditLogs both
before and after execution. The remaining stale rows are all protected history; none is
usable future inventory.

## API and rendered consumer evidence

The current branch backend was served from this worktree on port 3100 and the frontend
on the verified-free port 5191 with its `/api/v1` proxy pointing to 3100. Port 5180 was
not inspected, stopped, restarted, or modified.

Representative original slot `41483` was `AVAILABLE`, linked to deleted service `463`
and deleted technician service `1405`, and covered 2026-09-11 14:00-15:00 JST. Final
replacement slot `239892` preserved the same technician, shop, time, and capacity while
using exact current service `1087` and technician service `1925`.

`GET /api/v1/schedule/availability` for technician 28 returned HTTP 200, excluded slot
`41483`, included slot `239892`, and returned the replacement sources and time range.
The authenticated user consumer at
`/user.html#/schedule/technicians/28?date=2026-09-11` rendered the formal technician and
shop plus the 14:00-15:00 availability segment. Browser console verification contained
no errors or warnings.

## Test record

The implementation was developed RED-first. The repository scope test failed before the
public inventory predicate existed, and the domain/service/repository suites failed while
their modules were absent. Fresh final verification produced:

- focused repair suites: 4 suites, 49 tests passed;
- backend full suite: all 12 repository shards passed, totaling 794 suites and 5,816 tests
  passed, with 18 suites and 78 environment-conditional tests skipped;
- frontend full suite: 544 files and 3,593 tests passed;
- backend ESLint and TypeScript build passed;
- frontend TypeScript lint and formal Vite build passed;
- `git diff --check` passed and no repair file contains `TODO`, `FIXME`, or
  `not implemented`.

The shared host had unrelated test processes from other worktrees, so the final backend
proof kept the repository's 12-process shard isolation, ran shards sequentially, and used
a temporary `/tmp` Jest configuration with a 120-second timeout. This changed no tracked
file and all shard processes exited successfully.

No schema or migration was added. No remote, push, deployment, staging action, fake API,
mock inventory, or static price was used.
