import { loadTechnicianReviewTagSummary } from "../src/repositories/technician-review-tag-summary.repository";

describe("loadTechnicianReviewTagSummary", () => {
  it("folds fixed aliases, keeps four zero-count rows, and aggregates normalized custom text", async () => {
    const groupBy = jest.fn(async () => [
      { label: "魅力值", _count: { _all: 1 }, _min: { createdAt: new Date("2026-01-01T00:00:00.000Z") } },
      { label: "魅力max", _count: { _all: 2 }, _min: { createdAt: new Date("2026-02-01T00:00:00.000Z") } },
      { label: "Care", _count: { _all: 1 }, _min: { createdAt: new Date("2026-01-02T00:00:00.000Z") } },
      { label: "ｃａｒｅ", _count: { _all: 2 }, _min: { createdAt: new Date("2026-01-03T00:00:00.000Z") } },
      { label: "手法細致", _count: { _all: 1 }, _min: { createdAt: new Date("2026-01-04T00:00:00.000Z") } }
    ]);

    await expect(loadTechnicianReviewTagSummary({ orderReviewTag: { groupBy } } as never, 31))
      .resolves.toEqual({
        special: [
          { code: "appeal_max", label: "魅力max", count: 3 },
          { code: "service_max", label: "服务max", count: 0 },
          { code: "emotion_max", label: "情绪max", count: 0 },
          { code: "energy_max", label: "元气max", count: 0 }
        ],
        custom: [
          { label: "Care", count: 3 },
          { label: "手法細致", count: 1 }
        ]
      });

    expect(groupBy).toHaveBeenCalledWith({
      by: ["label"],
      where: {
        deletedAt: null,
        orderReview: {
          targetType: "TECHNICIAN",
          technicianProfileId: 31,
          deletedAt: null
        }
      },
      _count: { _all: true },
      _min: { createdAt: true }
    });
  });
});
