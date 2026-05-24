import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";
import { createSoftDeleteData, withNotDeleted, type RepositoryWhere } from "../utils/soft-delete";

export type RepositoryOrderBy = Record<string, unknown> | Record<string, unknown>[];

export interface RepositoryFindFirstArgs {
  where: RepositoryWhere;
}

export interface RepositoryFindManyArgs {
  where: RepositoryWhere;
  skip: number;
  take: number;
  orderBy?: RepositoryOrderBy;
}

export interface RepositoryCountArgs {
  where: RepositoryWhere;
}

export interface RepositoryUpdateArgs {
  where: {
    id: string;
  };
  data: {
    deletedAt: Date;
  };
}

export interface RepositoryDelegate<TRecord> {
  findFirst: (args: RepositoryFindFirstArgs) => Promise<TRecord | null>;
  findMany: (args: RepositoryFindManyArgs) => Promise<TRecord[]>;
  count: (args: RepositoryCountArgs) => Promise<number>;
  update: (args: RepositoryUpdateArgs) => Promise<TRecord>;
}

export interface RepositoryPageOptions extends PaginationInput {
  where?: RepositoryWhere;
  orderBy?: RepositoryOrderBy;
}

export class BaseRepository<TRecord> {
  public constructor(private readonly delegate: RepositoryDelegate<TRecord>) {}

  public findById(id: string): Promise<TRecord | null> {
    return this.delegate.findFirst({
      where: withNotDeleted({ id })
    });
  }

  public async findPage(options: RepositoryPageOptions = {}): Promise<PaginatedResponse<TRecord>> {
    const pagination = toPrismaPagination(options);
    const where = withNotDeleted(options.where);

    const [list, total] = await Promise.all([
      this.delegate.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: options.orderBy
      }),
      this.delegate.count({ where })
    ]);

    return buildPaginatedResponse(list, total, pagination);
  }

  public softDelete(id: string, deletedAt: Date = new Date()): Promise<TRecord> {
    return this.delegate.update({
      where: { id },
      data: createSoftDeleteData(deletedAt)
    });
  }
}
