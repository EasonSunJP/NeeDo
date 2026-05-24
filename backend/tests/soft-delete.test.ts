import { createSoftDeleteData, withNotDeleted } from "../src/utils/soft-delete";

describe("soft delete helpers", () => {
  it("adds the deletedAt null filter to list and lookup queries", () => {
    expect(withNotDeleted({ status: "active" })).toEqual({
      status: "active",
      deletedAt: null
    });
  });

  it("always overrides a caller-provided deletedAt filter", () => {
    expect(withNotDeleted({ deletedAt: new Date("2026-01-01T00:00:00.000Z") })).toEqual({
      deletedAt: null
    });
  });

  it("creates a timestamped soft delete update payload", () => {
    const deletedAt = new Date("2026-05-25T00:00:00.000Z");

    expect(createSoftDeleteData(deletedAt)).toEqual({ deletedAt });
  });
});
