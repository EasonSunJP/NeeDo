import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange matched booking conversion schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql"
    ),
    "utf8"
  );

  it("links one participant to one booking with immutable snapshots", () => {
    expect(schema).toContain('BOOKINGS_CREATED  @map("bookings_created")');
    expect(schema).toContain("bookingOrderId         Int?      @unique");
    expect(schema).toContain("serviceNameSnapshot    String");
    expect(schema).toContain("serviceDurationSnapshot Int");
    expect(schema).toContain("activeReservationKey  String?");
    expect(schema).toContain("fulfillmentAddressSnapshot Json?");
    expect(migration).toContain("exchange_match_participants_booking_state_chk");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(migration).toContain("UPDATE `exchange_match_participants` AS `participant`");
    expect(migration).toContain("exchange:matching:book-own");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')");
    expect(migration).toContain(
      "WHERE `roles`.`code` IN ('admin', 'technician', 'merchant_staff')"
    );
  });
});
