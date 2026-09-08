# Remove Exclusive Technician Constraint Design

## Goal

NeeDo no longer treats an employee-store relationship as exclusive or non-exclusive. A technician may have any number of current store affiliations, and working at only one store is represented only by having one current affiliation.

## Scope

This is one compatibility-preserving microstep. It removes the exclusive-relationship business rule from employee affiliation writes and merchant employee UI while keeping existing database rows readable. It does not redesign payroll, scheduling, pricing mode, booking source selection, settlement formulas, authentication, or store switching.

The same acceptance batch will then retain a real local MySQL fixture in which one test technician has at least three current store affiliations. The stores cover both merchant-priced and technician-priced booking sources, TEST_NDP checkout, offline cash receipt confirmation, immutable compensation snapshots, and merchant/operations finance projections.

## Business Rules

1. A technician may have three or more simultaneous current store affiliations.
2. NeeDo does not expose or enforce a dedicated/exclusive technician concept.
3. New and updated current affiliations use the single public relationship value `partner`.
4. Existing active rows stored as `EXCLUSIVE` remain readable but are projected as `partner` and may coexist with other current affiliations.
5. Creating or updating another current affiliation never fails because another store relationship exists.
6. The existing per-technician row lock and per-technician/per-store `activeKey` uniqueness remain. They protect concurrent writes and duplicate current relationships; they no longer enforce exclusivity.
7. Ending a relationship remains a historical soft transition and does not delete the row.
8. Pricing mode remains store-specific. A technician affiliated with several stores can therefore be booked through a store service in a merchant-priced store and through the technician portfolio in a technician-priced store.
9. Compensation remains store-specific and versioned. Each order snapshots the shop default or per-technician override selected for that store.

## Compatibility Contract

The Prisma enum and physical `relationship_type` column remain in this microstep to avoid a destructive migration and to preserve historical rows. They are legacy storage details, not a current product distinction.

- API mutation validation accepts only `partner` for an active relationship.
- API list/detail/schedule projections normalize legacy `exclusive` rows to `partner`.
- Merchant employee filters and forms do not offer an exclusive choice.
- Merchant UI labels all current technician relationships as `合作技师`.
- The obsolete `error.technician_affiliation.exclusive_conflict` path is removed from active request handling and OpenAPI documentation.
- Historical audit metadata containing `exclusive` remains unchanged; new audit records contain `partner`.

## Data And Request Flow

`PUT /api/v1/merchant-admin/employees/:needoId/affiliation` continues to resolve the store from the authenticated merchant identity. The repository locks the global technician profile, verifies the target store and technician identity, finds the current relationship for that store, and creates, updates, or ends only that store row. It does not inspect other stores to decide whether the write is allowed.

Employee list, detail, schedule, data-center, and directory projections normalize the stored legacy relationship value before returning it. Booking and schedule ownership continue to rely on the existence and work status of current affiliation rows, not the legacy relationship type.

## Real-Data Acceptance Fixture

The retained local fixture is idempotently identified by a stable `qa-multishop-pricing-settlement-20260909` marker and is permitted only when the configured MySQL host is loopback, the database name contains `dev`, `test`, or `local`, and neither runtime environment nor database name is production-looking.

It contains:

- one test customer with a TEST_NDP wallet;
- one test technician with one global technician profile and at least three active store affiliations;
- three published stores, with no exclusive relationship semantics;
- at least one merchant-priced store and at least one technician-priced store;
- independent shop services and a technician portfolio service with distinct names and prices;
- store-wide compensation rules and at least one per-technician override;
- completed TEST_NDP and offline-cash orders across both booking-source modes;
- booking source, price, compensation basis, payment, ledger, checkout, finance, history, and audit evidence retained after the check.

The checker fails closed before mutation outside the approved local environment. Re-running it reuses or verifies the same fixture rather than duplicating records or deleting prior evidence.

## Acceptance Assertions

Automated tests must prove:

- three current affiliations can coexist even when an old row was stored as `EXCLUSIVE`;
- public API responses and merchant UI expose only the collaboration relationship;
- merchant-priced navigation exposes store services and suppresses technician services;
- technician-priced navigation requires technician selection and exposes that technician's own service portfolio;
- a booking transaction rejects a service owner that does not match the store's current pricing mode;
- TEST_NDP checkout creates the exact customer debit and no production reconciliation;
- offline cash checkout creates receipt-confirmation evidence and no customer wallet debit;
- each order retains the correct store and technician settlement amounts from its snapshotted compensation basis;
- merchant finance data is limited to the selected store and matches its order evidence;
- operations finance data contains the same orders and amounts under global scope;
- the persistent fixture remains queryable after the checker exits.

## Error Handling

- Invalid identity, deleted store, ended relationship, and cross-store access keep their existing safe errors.
- Duplicate current relationships remain prevented by the existing unique active key.
- Invalid booking source, insufficient TEST_NDP, invalid cash receipt confirmation, and financial snapshot mismatches fail transactionally with no partial settlement.
- The checker prints stable public identifiers, order numbers, expected split amounts, and row counts without printing passwords, tokens, or database credentials.

## Non-Goals

- Dropping the legacy enum or column.
- Rewriting historical audit metadata.
- Changing customer-facing service prices.
- Changing compensation percentages or dashboard formulas.
- Pushing, deploying, or mutating staging/production data.

