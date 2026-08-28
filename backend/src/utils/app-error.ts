import { ERROR_CODES } from "../constants/error-codes";

interface AppErrorOptions {
  code: number;
  message: string;
  statusCode: number;
  data?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;
  public readonly data: unknown | null;

  public constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.data = options.data ?? null;
  }
}

export const createInternalError = (cause: unknown): AppError =>
  new AppError({
    code: ERROR_CODES.INTERNAL,
    message: "error.internal_server_error",
    statusCode: 500,
    cause
  });
