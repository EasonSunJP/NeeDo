import { disconnectPrisma, prisma } from "../src/prisma/client";
import {
  auditDatabaseIndexes,
  type DatabaseForeignKeyRow,
  type DatabaseIndexRow,
  type DatabaseTableRow
} from "../src/services/database-index-audit.service";

async function main(): Promise<void> {
  const [tables, foreignKeys, indexes, softDeleteTables] = await Promise.all([
    prisma.$queryRaw<DatabaseTableRow[]>`
      SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME <> '_prisma_migrations'
      ORDER BY TABLE_NAME
    `,
    prisma.$queryRaw<DatabaseForeignKeyRow[]>`
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName,
        CONSTRAINT_NAME AS constraintName
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `,
    prisma.$queryRaw<DatabaseIndexRow[]>`
      SELECT
        TABLE_NAME AS tableName,
        INDEX_NAME AS indexName,
        COLUMN_NAME AS columnName,
        SEQ_IN_INDEX AS sequenceInIndex,
        NON_UNIQUE AS nonUnique
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `,
    prisma.$queryRaw<DatabaseTableRow[]>`
      SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'deleted_at'
      ORDER BY TABLE_NAME
    `
  ]);
  const result = auditDatabaseIndexes({ tables, foreignKeys, indexes, softDeleteTables });

  console.log(JSON.stringify(result, null, 2));

  if (result.missingPrimaryKeys.length > 0 || result.unindexedForeignKeys.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
