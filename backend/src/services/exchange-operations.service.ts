import { ERROR_CODES } from "../constants/error-codes";
import type {
  ExchangeOperationsDetail,
  ExchangeOperationsMatchMode,
  ExchangeOperationsPage,
  ExchangeOperationsPostStatus,
  ExchangeOperationsPostType
} from "../types/exchange-operations.types";
import { AppError } from "../utils/app-error";
import type { ExchangeOperationsListQuery } from "../validators/exchange-operations.validator";

export interface ExchangeOperationsRepositoryListInput {
  type?: ExchangeOperationsPostType;
  status?: ExchangeOperationsPostStatus;
  matchMode?: ExchangeOperationsMatchMode;
  publisherIdentityType?: string;
  keyword?: string;
  page: number;
  pageSize: number;
  now: Date;
  showTestNdpData?: boolean;
}

export interface ExchangeOperationsRepositoryPort {
  list(input: ExchangeOperationsRepositoryListInput): Promise<ExchangeOperationsPage>;
  findDetail(
    postId: number,
    now: Date,
    showTestNdpData?: boolean
  ): Promise<ExchangeOperationsDetail | null>;
}

export class ExchangeOperationsService {
  public constructor(
    private readonly repository: ExchangeOperationsRepositoryPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public list(
    query: ExchangeOperationsListQuery,
    showTestNdpData = true
  ): Promise<ExchangeOperationsPage> {
    return this.repository.list({
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.matchMode ? { matchMode: query.matchMode } : {}),
      ...(query.publisherIdentityType
        ? { publisherIdentityType: query.publisherIdentityType }
        : {}),
      ...(query.keyword ? { keyword: query.keyword } : {}),
      page: query.page,
      pageSize: query.page_size,
      now: this.now(),
      showTestNdpData
    });
  }

  public async detail(postId: number, showTestNdpData = true): Promise<ExchangeOperationsDetail> {
    if (!Number.isSafeInteger(postId) || postId <= 0) throw this.notFound();
    const detail = await this.repository.findDetail(postId, this.now(), showTestNdpData);
    if (!detail) throw this.notFound();
    return detail;
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.exchange.post_not_found",
      statusCode: 404
    });
  }
}
