import type { NextFunction, Request, Response } from "express";
import type { CalendarEventService } from "../services/calendar-event.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  calendarParticipantBusyQuerySchema,
  calendarEventCreateBodySchema,
  calendarEventDeleteQuerySchema,
  calendarEventIdParamSchema,
  calendarEventIdempotencyHeaderSchema,
  calendarEventListQuerySchema,
  calendarEventUpdateBodySchema,
} from "../validators/calendar-event.validator";

export class CalendarEventController {
  public constructor(private readonly service: CalendarEventService) {}

  public list = this.handle(async (request, response) => {
    const query = calendarEventListQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.service.list(getAuthenticatedAccess(response), {
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.page_size,
    })));
  });

  public listParticipantBusy = this.handle(async (request, response) => {
    const query = calendarParticipantBusyQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.service.listParticipantBusy(
      getAuthenticatedAccess(response),
      {
        participantIdentityIds: query.participant_identity_ids,
        from: query.from,
        to: query.to,
        page: query.page,
        pageSize: query.page_size,
      },
    )));
  });

  public create = this.handle(async (request, response) => {
    const body = calendarEventCreateBodySchema.parse(request.body);
    const idempotencyKey = calendarEventIdempotencyHeaderSchema.parse(request.headers)["idempotency-key"];
    response.status(201).json(successResponse(await this.service.create(
      getAuthenticatedAccess(response),
      body,
      idempotencyKey,
      getRequestContext(request),
    )));
  });

  public update = this.handle(async (request, response) => {
    const { id } = calendarEventIdParamSchema.parse(request.params);
    response.status(200).json(successResponse(await this.service.update(
      getAuthenticatedAccess(response),
      id,
      calendarEventUpdateBodySchema.parse(request.body),
      getRequestContext(request),
    )));
  });

  public remove = this.handle(async (request, response) => {
    const { id } = calendarEventIdParamSchema.parse(request.params);
    const { expected_version: expectedVersion } = calendarEventDeleteQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.service.remove(
      getAuthenticatedAccess(response), id, expectedVersion, getRequestContext(request),
    )));
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try { await handler(request, response); } catch (error) { next(error); }
    };
  }
}
