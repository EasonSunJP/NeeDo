import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PlatformAccessPolicyPort } from "../services/platform-access-policy.service";

const bypassPrefixes = ["/auth/", "/backoffice/"];

export const createPlatformMaintenanceMiddleware =
  (policy: Pick<PlatformAccessPolicyPort, "assertPublicBusinessAccess">): RequestHandler =>
  async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    if (bypassPrefixes.some((prefix) => request.path.startsWith(prefix))) {
      next();
      return;
    }
    try {
      await policy.assertPublicBusinessAccess();
      next();
    } catch (error) {
      next(error);
    }
  };
