import { ERROR_CODES } from "../constants/error-codes";
import type { TechnicianServiceBookingContextPayload } from "../types/technician-service-booking-context.types";
import { AppError } from "../utils/app-error";

export interface TechnicianServiceBookingContextRepositoryPort {
  findContext(id: number, now: Date): Promise<TechnicianServiceBookingContextPayload | null>;
}

export class TechnicianServiceBookingContextService {
  public constructor(
    private readonly repository: TechnicianServiceBookingContextRepositoryPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getContext(id: number): Promise<TechnicianServiceBookingContextPayload> {
    const context = await this.repository.findContext(id, this.now());
    if (!context) {
      throw new AppError({
        code: ERROR_CODES.TECHNICIAN_SERVICE_BOOKING_CONTEXT_NOT_FOUND,
        message: "error.technician_service.booking_context_not_found",
        statusCode: 404
      });
    }
    return context;
  }
}
