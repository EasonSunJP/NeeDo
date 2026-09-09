import { Router } from "express";
import type { AppConfig } from "../config/env";
import type { AppDependencies } from "../app";
import { CALENDAR_EVENT_PERMISSIONS } from "../constants/permissions.constants";
import { CalendarEventController } from "../controllers/calendar-event.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AuthRepository } from "../repositories/auth.repository";
import { CalendarEventRepository } from "../repositories/calendar-event.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CalendarEventService } from "../services/calendar-event.service";
import { PersonalIdentityScopeService } from "../services/personal-identity-scope.service";
import {
  calendarParticipantBusyQuerySchema,
  calendarEventCreateBodySchema,
  calendarEventDeleteQuerySchema,
  calendarEventIdParamSchema,
  calendarEventListQuerySchema,
  calendarEventUpdateBodySchema,
} from "../validators/calendar-event.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createCalendarEventRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = dependencies.calendarEventService ?? new CalendarEventService(
    dependencies.calendarEventRepository ?? new CalendarEventRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.personalIdentityScopeService ?? new PersonalIdentityScopeService(
      dependencies.authRepository ?? new AuthRepository(),
    ),
  );
  const controller = new CalendarEventController(service);

  router.get("/calendar-events", authenticate(), createAuthorizeMiddleware(CALENDAR_EVENT_PERMISSIONS.read),
    validateRequest({ query: calendarEventListQuerySchema }), controller.list);
  router.get("/calendar-events/participant-busy", authenticate(), createAuthorizeMiddleware(CALENDAR_EVENT_PERMISSIONS.read),
    validateRequest({ query: calendarParticipantBusyQuerySchema }), controller.listParticipantBusy);
  router.post("/calendar-events", authenticate(), createAuthorizeMiddleware(CALENDAR_EVENT_PERMISSIONS.write),
    validateRequest({ body: calendarEventCreateBodySchema }), controller.create);
  router.patch("/calendar-events/:id", authenticate(), createAuthorizeMiddleware(CALENDAR_EVENT_PERMISSIONS.write),
    validateRequest({ params: calendarEventIdParamSchema, body: calendarEventUpdateBodySchema }), controller.update);
  router.delete("/calendar-events/:id", authenticate(), createAuthorizeMiddleware(CALENDAR_EVENT_PERMISSIONS.write),
    validateRequest({ params: calendarEventIdParamSchema, query: calendarEventDeleteQuerySchema }), controller.remove);
  return router;
};
