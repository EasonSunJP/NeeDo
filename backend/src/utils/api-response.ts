import type { ApiErrorResponse, ApiSuccessResponse } from "../types/api-response";

export const successResponse = <TData>(data: TData): ApiSuccessResponse<TData> => ({
  code: 0,
  message: "success",
  data
});

export const errorResponse = (code: number, message: string): ApiErrorResponse => ({
  code,
  message,
  data: null
});
