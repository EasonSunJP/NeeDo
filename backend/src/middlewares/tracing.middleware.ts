import { randomBytes } from "crypto";
import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env";

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

const randomHex = (bytes: number): string => randomBytes(bytes).toString("hex");

const parseTraceId = (traceparent: string | undefined): string | undefined => {
  if (!traceparent) {
    return undefined;
  }

  const match = TRACEPARENT_PATTERN.exec(traceparent.trim().toLowerCase());
  if (!match || match[1] === "00000000000000000000000000000000") {
    return undefined;
  }

  return match[1];
};

export const createTracingMiddleware = (config: AppConfig): RequestHandler => {
  return (request, response, next) => {
    if (!config.TRACING_ENABLED) {
      next();
      return;
    }

    const traceId = parseTraceId(request.get("traceparent")) ?? randomHex(16);
    const spanId = randomHex(8);

    response.locals.traceId = traceId;
    response.locals.spanId = spanId;
    response.setHeader("x-trace-id", traceId);
    response.setHeader("traceparent", `00-${traceId}-${spanId}-01`);

    next();
  };
};
