# Anytime Service Test Default-On Implementation Plan

**Goal:** Make the audited `随时服务测试` capability enabled by default during the current test stage, while preserving every non-time fulfillment guard.

**Scope:** One additive database-default migration, the Prisma default, the booking repository's missing-setting fallback, focused regression tests, and the existing design/state-machine documentation. Existing active settings are switched through the protected settings API so a new immutable version and audit record are retained.

## Tasks

1. Add failing schema and fulfillment tests for a `TRUE` database default and enabled missing-setting fallback.
2. Add an additive migration and update the Prisma model/repository behavior.
3. Update the design and order-state-machine documentation with the test-stage default and production-disable warning.
4. Run focused tests, lint, typecheck, build, migration, and isolated-port API/UI acceptance.
5. Commit the isolated branch, integrate into local `main`, switch the active local setting through the audited API, and verify the final `main` runtime on port 5180.
