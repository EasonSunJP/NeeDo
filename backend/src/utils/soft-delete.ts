export interface SoftDeleteData {
  deletedAt: Date;
}

export type RepositoryWhere = Record<string, unknown>;

export type NotDeletedWhere<TWhere extends RepositoryWhere = RepositoryWhere> = TWhere & {
  deletedAt: null;
};

export const withNotDeleted = <TWhere extends RepositoryWhere>(
  where: TWhere = {} as TWhere
): NotDeletedWhere<TWhere> => ({
  ...where,
  deletedAt: null
});

export const createSoftDeleteData = (deletedAt: Date = new Date()): SoftDeleteData => ({
  deletedAt
});
