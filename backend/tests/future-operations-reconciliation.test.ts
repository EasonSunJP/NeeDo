import {
  buildClassificationManifest,
  reconcileExpectedRows
} from "../src/simulation/future-operations-reconciliation";

describe("future operations reconciliation", () => {
  it("matches the expected multiset while retaining later coexisting rows", () => {
    const actual = [
      { id: 1, key: "planned-a" },
      { id: 2, key: "planned-b" },
      { id: 3, key: "later-real-operation" }
    ];

    const result = reconcileExpectedRows(actual, ["planned-a", "planned-b"], (row) => row.key);

    expect(result.matchedRows.map((row) => row.id)).toEqual([1, 2]);
    expect(result.coexistingRows.map((row) => row.id)).toEqual([3]);
    expect(result.missingExpectedKeys).toEqual([]);
  });

  it("does not hide a missing expected row behind a duplicate actual row", () => {
    const actual = [
      { id: 1, key: "planned-a" },
      { id: 2, key: "planned-a" }
    ];

    const result = reconcileExpectedRows(actual, ["planned-a", "planned-b"], (row) => row.key);

    expect(result.matchedRows.map((row) => row.id)).toEqual([1]);
    expect(result.coexistingRows.map((row) => row.id)).toEqual([2]);
    expect(result.missingExpectedKeys).toEqual(["planned-b"]);
  });

  it("classifies every coexisting row across each requested dimension", () => {
    const rows = [
      { source: "shop", owner: "tech-1", month: "2026-09" },
      { source: "shop", owner: "tech-1", month: "2026-10" },
      { source: "technician", owner: "tech-2", month: "2026-10" }
    ];

    const manifest = buildClassificationManifest(rows, {
      source: (row) => row.source,
      owner: (row) => row.owner,
      month: (row) => row.month
    });

    expect(manifest).toEqual({
      total: 3,
      dimensions: {
        source: [
          { key: "shop", count: 2 },
          { key: "technician", count: 1 }
        ],
        owner: [
          { key: "tech-1", count: 2 },
          { key: "tech-2", count: 1 }
        ],
        month: [
          { key: "2026-09", count: 1 },
          { key: "2026-10", count: 2 }
        ]
      }
    });
  });
});
