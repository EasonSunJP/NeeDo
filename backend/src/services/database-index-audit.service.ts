export interface DatabaseTableRow {
  tableName: string;
}

export interface DatabaseForeignKeyRow {
  tableName: string;
  columnName: string;
  constraintName: string;
}

export interface DatabaseIndexRow {
  tableName: string;
  indexName: string;
  columnName: string;
  sequenceInIndex: number;
  nonUnique: number;
}

export interface DatabaseIndexAuditInput {
  tables: DatabaseTableRow[];
  foreignKeys: DatabaseForeignKeyRow[];
  indexes: DatabaseIndexRow[];
  softDeleteTables?: DatabaseTableRow[];
}

export interface DatabaseIndexAuditResult {
  tableCount: number;
  indexCount: number;
  foreignKeyCount: number;
  missingPrimaryKeys: string[];
  unindexedForeignKeys: string[];
  duplicateIndexes: string[];
  softDeleteIndexWarnings: string[];
}

const byName = (left: string, right: string): number => left.localeCompare(right);

export function auditDatabaseIndexes(input: DatabaseIndexAuditInput): DatabaseIndexAuditResult {
  const leadingIndexColumns = new Set(
    input.indexes
      .filter((index) => Number(index.sequenceInIndex) === 1)
      .map((index) => `${index.tableName}.${index.columnName}`)
  );
  const primaryKeyTables = new Set(
    input.indexes.filter((index) => index.indexName === "PRIMARY").map((index) => index.tableName)
  );
  const missingPrimaryKeys = input.tables
    .map((table) => table.tableName)
    .filter((tableName) => !primaryKeyTables.has(tableName))
    .sort(byName);
  const unindexedForeignKeys = input.foreignKeys
    .filter(
      (foreignKey) => !leadingIndexColumns.has(`${foreignKey.tableName}.${foreignKey.columnName}`)
    )
    .map(
      (foreignKey) =>
        `${foreignKey.tableName}.${foreignKey.columnName} (${foreignKey.constraintName})`
    )
    .sort(byName);

  const indexColumns = new Map<string, DatabaseIndexRow[]>();
  input.indexes.forEach((index) => {
    if (index.indexName === "PRIMARY") {
      return;
    }

    const key = `${index.tableName}.${index.indexName}`;
    indexColumns.set(key, [...(indexColumns.get(key) ?? []), index]);
  });
  const signatures = new Map<string, string[]>();
  indexColumns.forEach((columns, key) => {
    const [tableName] = key.split(".");
    const orderedColumns = [...columns]
      .sort((left, right) => Number(left.sequenceInIndex) - Number(right.sequenceInIndex))
      .map((column) => column.columnName)
      .join(",");
    const nonUnique = Number(columns[0]?.nonUnique ?? 1);
    const signature = `${tableName}:${nonUnique}:${orderedColumns}`;
    signatures.set(signature, [
      ...(signatures.get(signature) ?? []),
      key.slice(tableName.length + 1)
    ]);
  });
  const duplicateIndexes = Array.from(signatures.entries())
    .filter(([, names]) => names.length > 1)
    .flatMap(([signature, names]) => {
      const [tableName, , columns] = signature.split(":");
      const sortedNames = [...names].sort(byName);
      return sortedNames
        .slice(1)
        .map(
          (name, index) => `${tableName}: ${sortedNames[index]} and ${name} both index (${columns})`
        );
    })
    .sort(byName);
  const softDeleteIndexWarnings = (input.softDeleteTables ?? [])
    .map((table) => `${table.tableName}.deleted_at`)
    .filter((column) => !leadingIndexColumns.has(column))
    .sort(byName);

  return {
    tableCount: input.tables.length,
    indexCount: new Set(input.indexes.map((index) => `${index.tableName}.${index.indexName}`)).size,
    foreignKeyCount: input.foreignKeys.length,
    missingPrimaryKeys,
    unindexedForeignKeys,
    duplicateIndexes,
    softDeleteIndexWarnings
  };
}
