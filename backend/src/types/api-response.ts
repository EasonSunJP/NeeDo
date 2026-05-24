export interface ApiSuccessResponse<TData> {
  code: 0;
  message: "success";
  data: TData;
}

export interface ApiErrorResponse {
  code: number;
  message: string;
  data: null;
}
