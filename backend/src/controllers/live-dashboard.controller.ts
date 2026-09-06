import type { NextFunction, Request, Response } from "express";
import type { LiveDashboardLocale, LiveDashboardService } from "../services/live-dashboard.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  liveDashboardLastEventIdSchema,
  liveDashboardQuerySchema
} from "../validators/live-dashboard.validator";

const supportedLocales = new Set<LiveDashboardLocale>(["zh-CN", "zh-TW", "ja", "en", "ko"]);
const canonicalLocale = (value: string): LiveDashboardLocale | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "zh-cn" || normalized.startsWith("zh-hans")) return "zh-CN";
  if (normalized === "zh-tw" || normalized.startsWith("zh-hant")) return "zh-TW";
  const language = normalized.split("-")[0];
  return language && supportedLocales.has(language as LiveDashboardLocale)
    ? (language as LiveDashboardLocale)
    : null;
};

export const resolveLiveDashboardLocale = (header: string | undefined): LiveDashboardLocale => {
  for (const item of header?.split(",") ?? []) {
    const locale = canonicalLocale(item.split(";")[0] ?? "");
    if (locale) return locale;
  }
  return "ja";
};

export class LiveDashboardController {
  public constructor(private readonly service: LiveDashboardService) {}

  public snapshot = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getSnapshot(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              liveDashboardQuerySchema.parse(request.query),
              resolveLiveDashboardLocale(request.get("Accept-Language"))
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public events = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.service.subscribe(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        liveDashboardQuerySchema.parse(request.query),
        liveDashboardLastEventIdSchema.parse(request.get("Last-Event-ID") ?? null),
        response
      );
    } catch (error) {
      next(error);
    }
  };
}
