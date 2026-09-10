import { ERROR_CODES } from "../constants/error-codes";
import type {
  CalendarEventCreateInput,
  CalendarEventPayload,
  CalendarEventRepositoryPort,
  CalendarEventUpdateInput,
} from "../repositories/calendar-event.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type PersonalScopeResolver = Pick<PersonalIdentityScopeService, "resolve">;

export class CalendarEventService {
  public constructor(
    private readonly repository: CalendarEventRepositoryPort,
    private readonly audit: AuditInputFactory,
    private readonly personalIdentityScope?: PersonalScopeResolver,
  ) {}

  public async list(
    actor: AuthenticatedAccessContext,
    input: Omit<Parameters<CalendarEventRepositoryPort["list"]>[0], "ownerIdentityId">,
  ) {
    const ownerIdentityId = await this.resolveOwnerIdentityId(actor);
    return this.repository.list({ ...input, ownerIdentityId });
  }

  public async listParticipantBusy(
    actor: AuthenticatedAccessContext,
    input: Omit<Parameters<CalendarEventRepositoryPort["listParticipantBusy"]>[0], "viewerIdentityId">,
  ) {
    const viewerIdentityId = await this.resolveOwnerIdentityId(actor);
    const result = await this.repository.listParticipantBusy({ ...input, viewerIdentityId });
    if (result.outcome === "ok") return result;
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.calendar_event.participant_forbidden",
      statusCode: 403,
    });
  }

  public async create(
    actor: AuthenticatedAccessContext,
    input: Omit<CalendarEventCreateInput, "ownerIdentityId" | "idempotencyKey">,
    idempotencyKey: string,
    context: AuthRequestContext,
  ): Promise<CalendarEventPayload> {
    const ownerIdentityId = await this.resolveOwnerIdentityId(actor);
    const result = await this.repository.create(
      { ...input, ownerIdentityId, idempotencyKey },
      this.audit.createInput({
        actor,
        context,
        action: "calendar_event.create",
        targetType: "CalendarEvent",
        targetId: null,
        metadata: { ownerIdentityId },
      }),
    );
    return this.requireMutation(result);
  }

  public async update(
    actor: AuthenticatedAccessContext,
    id: number,
    input: Omit<CalendarEventUpdateInput, "ownerIdentityId" | "id">,
    context: AuthRequestContext,
  ): Promise<CalendarEventPayload> {
    const ownerIdentityId = await this.resolveOwnerIdentityId(actor);
    const result = await this.repository.update(
      { ...input, id, ownerIdentityId },
      this.audit.createInput({
        actor,
        context,
        action: "calendar_event.update",
        targetType: "CalendarEvent",
        targetId: id,
        metadata: { expectedVersion: input.expectedVersion },
      }),
    );
    return this.requireMutation(result);
  }

  public async remove(
    actor: AuthenticatedAccessContext,
    id: number,
    expectedVersion: number,
    context: AuthRequestContext,
  ): Promise<CalendarEventPayload> {
    const ownerIdentityId = await this.resolveOwnerIdentityId(actor);
    const result = await this.repository.remove(
      { id, expectedVersion, ownerIdentityId },
      this.audit.createInput({
        actor,
        context,
        action: "calendar_event.delete",
        targetType: "CalendarEvent",
        targetId: id,
        metadata: { expectedVersion },
      }),
    );
    return this.requireMutation(result);
  }

  private async resolveOwnerIdentityId(actor: AuthenticatedAccessContext): Promise<number> {
    if (
      actor.currentIdentityType === "technician" &&
      actor.currentIdentityScopeType === "technician_profile" &&
      actor.currentIdentityScopeId &&
      actor.currentIdentityId
    ) {
      return actor.currentIdentityId;
    }

    if (
      actor.currentIdentityType === "customer" &&
      actor.currentIdentityScopeType === "customer_profile" &&
      actor.currentIdentityScopeId &&
      actor.currentIdentityId
    ) {
      return actor.currentIdentityId;
    }

    if (this.personalIdentityScope) {
      const personal = await this.personalIdentityScope.resolve(actor);
      if (
        personal.identityType === "customer" &&
        personal.scopeType === "customer_profile" &&
        personal.scopeId &&
        personal.identityId
      ) {
        return personal.identityId;
      }
    }

    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.auth.identity_forbidden",
      statusCode: 403,
    });
  }

  private requireMutation(
    result: Awaited<ReturnType<CalendarEventRepositoryPort["create"]>>,
  ): CalendarEventPayload {
    if (result.outcome === "ok") return result.event;
    if (result.outcome === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.calendar_event.not_found",
        statusCode: 404,
      });
    }
    throw new AppError({
      code: ERROR_CODES.SCHEDULE_CONFLICT,
      message:
        result.outcome === "version_conflict"
          ? "error.calendar_event.version_conflict"
          : "error.calendar_event.idempotency_conflict",
      statusCode: 409,
    });
  }
}
