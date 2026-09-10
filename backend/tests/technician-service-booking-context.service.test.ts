import { ERROR_CODES } from "../src/constants/error-codes";
import { TechnicianServiceBookingContextService } from "../src/services/technician-service-booking-context.service";

const now = new Date("2026-09-05T03:00:00.000Z");

describe("TechnicianServiceBookingContextService", () => {
  it("maps every hidden or unavailable target to one stable 404", async () => {
    const repository = { findContext: jest.fn(async () => null) };
    const service = new TechnicianServiceBookingContextService(repository, () => now);

    await expect(service.getContext(701)).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_SERVICE_BOOKING_CONTEXT_NOT_FOUND,
      message: "error.technician_service.booking_context_not_found",
      statusCode: 404
    });
    expect(repository.findContext).toHaveBeenCalledWith(701, now);
  });
});
