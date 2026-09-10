/* global process */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260911160000_overdue_appointment_gate/migration.sql");
const repository = read("src/repositories/booking.repository.ts");
const service = read("src/services/booking.service.ts");
const route = read("src/routes/booking.routes.ts");
const openapi = read("src/api/openapi.ts");
const payroll = read("src/repositories/payroll.repository.ts");
const ledger = read("src/services/ledger.service.ts");

assert.match(schema, /overdueAppointmentGateEnabled\s+Boolean\s+@default\(false\)/);
assert.match(schema, /model OrderOverdueResolution/);
assert.match(schema, /requestFingerprint[\s\S]*version\s+Int\s+@default\(1\)/);
assert.match(schema, /reviewerUserId\s+Int\?/);
assert.match(schema, /authorType\s+OrderReviewAuthorType/);
assert.match(migration, /order_reviews_rating_check` CHECK \(`rating` BETWEEN 0 AND 5\)/);
assert.match(migration, /order_reviews_author_check/);
assert.match(migration, /UNIQUE INDEX `order_overdue_resolutions_booking_order_key`/);
assert.match(migration, /order:overdue-resolution:create/);
assert.match(repository, /FOR UPDATE[\s\S]*findFulfillmentOrder/);
assert.match(repository, /findBlockingOverdueAppointment/);
assert.match(repository, /overdueResolutionToDb/);
assert.match(repository, /authorType: "SYSTEM"/);
assert.match(repository, /rating: 0/);
assert.match(repository, /paymentStatus === "CONFIRMED"/);
assert.match(repository, /platformFeeAmountNdpSnapshot !== 500/);
assert.match(repository, /cRequestFeeHoldNdp !== 500/);
assert.match(repository, /platformFeePayerType/);
assert.match(repository, /compensationBasisVersion/);
assert.match(service, /settleBookingCompletion/);
assert.match(service, /suppressCustomerReward: input\.resolution !== "actually_completed"/);
assert.match(ledger, /rewardDisabled = input\.suppressCustomerReward === true/);
assert.match(ledger, /rewardDisabled \? "disabled"/);
assert.match(repository, /settlementStatus: "ready_for_payroll"/);
assert.match(payroll, /CUSTOMER_NO_SHOW/);
assert.match(payroll, /TECHNICIAN_NO_SHOW/);
assert.match(route, /"\/orders\/:id\/overdue-resolution"/);
assert.match(openapi, /resolveOverdueAppointment/);

process.stdout.write("overdue appointment gate contract: ok\n");
