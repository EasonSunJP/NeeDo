import { ERROR_CODES } from "../constants/error-codes";

interface AppErrorOptions {
  code: number;
  message: string;
  statusCode: number;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;

  public constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
  }
}

export const createInternalError = (cause: unknown): AppError =>
  new AppError({
    code: ERROR_CODES.INTERNAL,
    message: "error.internal_server_error",
    statusCode: 500,
    cause
  });
