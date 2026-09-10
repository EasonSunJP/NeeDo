import fs from "node:fs";
import path from "node:path";

const repositorySource = fs.readFileSync(
  path.resolve(__dirname, "../src/repositories/booking.repository.ts"),
  "utf8"
);

describe("Booking single pending replacement transaction contract", () => {
  it("serializes ordinary customer creation and replaces every old pending order", () => {
    expect(repositorySource).toContain("lockCustomerUser");
    expect(repositorySource).toContain("FOR UPDATE");
    expect(repositorySource).toContain('membershipLevel.toLowerCase() === "black"');
    expect(repositorySource).toContain('status: "PENDING"');
    expect(repositorySource).toContain('status: "CANCELLED"');
    expect(repositorySource).toContain('reason: "superseded_by_new_pending_order"');
    expect(repositorySource).toContain("bookedCount: { decrement: releaseCount }");
    expect(repositorySource).toContain("released.count !== 1");
    expect(repositorySource).toContain("supersededByBookingOrderId");
  });

  it("rolls the replacement transaction back when the new pending cannot be committed", () => {
    expect(repositorySource).toContain("BookingPendingReplacementUnavailableError");
    expect(repositorySource).toMatch(
      /error instanceof BookingPendingReplacementUnavailableError[\s\S]*return null/
    );
  });

  it("keeps a fresh server-time guard on the final atomic slot-capacity mutation", () => {
    expect(repositorySource).toMatch(
      /const slotUpdate[\s\S]*?where:\s*\{[\s\S]*?startsAt:\s*\{\s*gt:\s*new Date\(\)\s*\}/
    );
  });

  it("keeps black members on the multiple-pending path", () => {
    expect(repositorySource).toContain("isBlackMember");
    expect(repositorySource).toMatch(/!isBlackMember\s*\?/);
  });

  it("protects Exchange-linked pending orders in both the selection and conditional replacement", () => {
    const replacementBlock = repositorySource.match(
      /const supersededPendingOrders[\s\S]*?const conflict = await tx\.bookingOrder\.findFirst/
    )?.[0];

    expect(replacementBlock).toBeDefined();
    expect(replacementBlock).toMatch(/exchangeMatchParticipant:\s*\{\s*is:\s*null\s*\}/);
    expect(replacementBlock).toMatch(
      /updateMany\([\s\S]*?exchangeMatchParticipant:\s*\{\s*is:\s*null\s*\}/
    );
  });

  it("counts only unconverted Exchange participant reservations as booking conflicts", () => {
    expect(repositorySource).toMatch(
      /exchangeMatchParticipant\.findFirst\([\s\S]*?activeReservationKey:\s*\{\s*not:\s*null\s*\}/
    );
  });
});
