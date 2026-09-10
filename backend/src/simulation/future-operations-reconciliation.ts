export interface ExpectedRowsReconciliation<T> {
  matchedRows: T[];
  coexistingRows: T[];
  missingExpectedKeys: string[];
}

export interface ClassificationManifest {
  total: number;
  dimensions: Record<string, Array<{ key: string; count: number }>>;
}

export const reconcileExpectedRows = <T>(
  actualRows: T[],
  expectedKeys: string[],
  keyOf: (row: T) => string
): ExpectedRowsReconciliation<T> => {
  const remaining = new Map<string, number>();
  for (const key of expectedKeys) {
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const matchedRows: T[] = [];
  const coexistingRows: T[] = [];
  for (const row of actualRows) {
    const key = keyOf(row);
    const count = remaining.get(key) ?? 0;
    if (count === 0) {
      coexistingRows.push(row);
      continue;
    }
    matchedRows.push(row);
    remaining.set(key, count - 1);
  }

  const missingExpectedKeys = [...remaining.entries()]
    .flatMap(([key, count]) => Array.from({ length: count }, () => key))
    .sort();
  return { matchedRows, coexistingRows, missingExpectedKeys };
};

export const buildClassificationManifest = <T>(
  rows: T[],
  dimensions: Record<string, (row: T) => string>
): ClassificationManifest => ({
  total: rows.length,
  dimensions: Object.fromEntries(
    Object.entries(dimensions).map(([name, keyOf]) => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const key = keyOf(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [
        name,
        [...counts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => ({ key, count }))
      ];
    })
  )
});
