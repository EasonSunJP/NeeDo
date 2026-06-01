import { describe, expect, it } from "vitest";
import { buildTrendCoordinates, buildTrendPolylineFromIndexes } from "./technicianWorkTrendChart";

describe("technician work trend chart geometry", () => {
  it("keeps segmented polylines on the same coordinates as the visible nodes", () => {
    const coordinates = buildTrendCoordinates([120, 80, 20, 20], {
      bottom: 40,
      height: 136,
      left: 14,
      right: 14,
      top: 14,
      width: 300
    });

    const solidPolyline = buildTrendPolylineFromIndexes(coordinates, [0, 1]);
    const dashedPolyline = buildTrendPolylineFromIndexes(coordinates, [1, 2, 3]);

    expect(solidPolyline).toBe(`${coordinates[0]!.x},${coordinates[0]!.y} ${coordinates[1]!.x},${coordinates[1]!.y}`);
    expect(dashedPolyline).toBe(`${coordinates[1]!.x},${coordinates[1]!.y} ${coordinates[2]!.x},${coordinates[2]!.y} ${coordinates[3]!.x},${coordinates[3]!.y}`);
    expect(dashedPolyline.startsWith(`${coordinates[0]!.x},`)).toBe(false);
  });
});
