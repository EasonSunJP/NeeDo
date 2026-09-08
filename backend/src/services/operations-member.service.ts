import { hash } from "bcryptjs";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { OperationsMemberRepositoryPort } from "../repositories/operations-member.repository";
import type { OperationsMemberCreateInput } from "../validators/operations-member.validator";
import type { AuthenticatedAccessContext, AuthRequestContext } from "./auth.service";

export class OperationsMemberService {
  public constructor(private readonly repository: OperationsMemberRepositoryPort) {}

  public async create(input: OperationsMemberCreateInput, actor: AuthenticatedAccessContext, context: AuthRequestContext) {
    if (actor.currentIdentityType !== "platform" || actor.currentIdentityScopeType !== "global" || actor.currentIdentityScopeId != null || actor.isReadOnlyMerchantPreview ||
        !["user:create", "user:assign-role"].every((permission) => actor.permissions.includes(permission))) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.auth.forbidden", statusCode: 403 });
    }
    return this.repository.createWithAudit({
      username: input.username, email: input.email, reason: input.reason,
      passwordHash: await hash(input.password, 12), actorId: actor.userId, ...context
    });
  }
}
