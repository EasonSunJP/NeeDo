import request from "supertest";
import type { BookingRepositoryPort } from "../src/repositories/booking.repository";
import { createStep06Fixture } from "./helpers/step06-fixture";

const groupPublicId = "713382d3-7d99-44f7-a54e-a1745fca4848";
const revisionBody = {
  expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
  assignment: { technicianProfileId: 11, serviceIds: [101], scheduleSlotIds: [201], expectedPriceAmountJpy: 8_500 }
};

describe("group revision routes", () => {
  it("requires authentication, the existing permission, valid input, and purchaser identity", async () => {
    const reviseGroupOrder = jest.fn().mockResolvedValue({
      group: { publicId: groupPublicId, guests: [{ orders: [{ id: 12 }] }] }, replay: false
    });
    const fixture = await createStep06Fixture({
      bookingRepository: { reviseGroupOrder } as unknown as BookingRepositoryPort
    });
    const path = `/api/v1/bookings/groups/${groupPublicId}/orders/12`;
    await request(fixture.app).patch(path).send(revisionBody).expect(401);
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions([]);
    await request(fixture.app).patch(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-revision-key-0001").send(revisionBody).expect(403);
    fixture.replaceAdminPermissions(["booking:create"]);
    await request(fixture.app).patch(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-revision-key-0001")
      .send({ ...revisionBody, expectedUpdatedAt: "yesterday" }).expect(400);
    await request(fixture.app).patch(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-revision-key-0001").send(revisionBody).expect(403);
    expect(reviseGroupOrder).not.toHaveBeenCalled();
    fixture.users[0]!.identities[0]!.type = "customer";
    await request(fixture.app).patch(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-revision-key-0001").send(revisionBody).expect(200);
    expect(reviseGroupOrder).toHaveBeenCalledWith(expect.objectContaining({
      customerUserId: 1, groupPublicId, orderId: 12
    }));
  });

  it("validates versioned guest removal before invoking the repository", async () => {
    const removeGroupGuest = jest.fn().mockResolvedValue({ group: { publicId: groupPublicId, guests: [] }, replay: false });
    const fixture = await createStep06Fixture({
      bookingRepository: { removeGroupGuest } as unknown as BookingRepositoryPort
    });
    fixture.users[0]!.identities[0]!.type = "customer";
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions(["order:cancel"]);
    const path = `/api/v1/bookings/groups/${groupPublicId}/guests/31/remove`;
    await request(fixture.app).post(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-removal-key-0001")
      .send({ expectedOrders: [] }).expect(400);
    await request(fixture.app).post(path).set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "group-removal-key-0001")
      .send({ expectedOrders: [{ id: 12, updatedAt: "2026-10-01T00:00:00.000Z" }] }).expect(200);
    expect(removeGroupGuest).toHaveBeenCalledWith(expect.objectContaining({ customerUserId: 1, guestId: 31 }));
  });
});
