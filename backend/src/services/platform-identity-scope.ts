import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "./auth.service";

const platformIdentityTypes = new Set(["platform", "platform_admin"]);

export const assertActivePlatformIdentity = (actor: AuthenticatedAccessContext): void => {
  if (
    actor.currentIdentityType &&
    platformIdentityTypes.has(actor.currentIdentityType) &&
    (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform")
  ) {
    return;
  }
  throw new AppError({
    code: ERROR_CODES.IDENTITY_FORBIDDEN,
    message: "error.identity.forbidden",
    statusCode: 403
  });
};
