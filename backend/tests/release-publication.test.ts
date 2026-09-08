import {
  editReleaseSchema,
  manualReleaseSchema,
  prepareReleasePublication,
  releaseDateRange,
  releaseTimelineQuerySchema
} from "../src/domain/release-publication";

const first = "1".repeat(40),
  second = "2".repeat(40),
  third = "3".repeat(40);
const manifest = (
  revision: string,
  commits: Array<{ revision: string; summary: string; parents: string[] }>
) => ({ sourceRevision: revision, commits });
const a = { revision: first, summary: "初始版本", parents: [] };
const b = { revision: second, summary: "补齐服务排行筛选", parents: [first] };
const c = { revision: third, summary: "增加版本时间线", parents: [second] };
const input = {
  deploymentId: "ed27a5b5-46ed-4b8d-b6d9-58e98fe55456",
  environment: "local",
  publishedAt: "2026-09-07T01:00:00.000Z",
  sourceRevision: third,
  previousRevision: second,
  current: manifest(third, [c, b, a]),
  previous: manifest(second, [b, a])
};

describe("release publication evidence", () => {
  it("records only changes since the previous release using the actual publication timestamp", () => {
    expect(prepareReleasePublication(input, new Date("2026-09-07T01:01:00Z"))).toMatchObject({
      publishedAt: input.publishedAt,
      changes: [c.summary],
      kind: "release",
      sourceRevision: third
    });
  });
  it("records a rollback as its own release without inventing new changes", () => {
    expect(
      prepareReleasePublication(
        {
          ...input,
          sourceRevision: second,
          previousRevision: third,
          current: input.previous,
          previous: input.current
        },
        new Date("2026-09-07T01:01:00Z")
      )
    ).toMatchObject({ kind: "rollback", changes: [b.summary] });
  });
  it("marks an initial baseline honestly instead of pretending all historical commits just shipped", () => {
    expect(
      prepareReleasePublication(
        { ...input, previous: null, previousRevision: null },
        new Date("2026-09-07T01:01:00Z")
      )
    ).toMatchObject({ kind: "baseline", changes: [c.summary] });
  });
  it("recovers the prior commit boundary on the first deployment that enables release notes", () => {
    expect(
      prepareReleasePublication(
        { ...input, previous: null, previousRevision: first },
        new Date("2026-09-07T01:01:00Z")
      )
    ).toMatchObject({ kind: "release", changes: [c.summary, b.summary] });
  });
  it("rejects mismatched revision, future dates and empty change text", () => {
    expect(() => prepareReleasePublication({ ...input, sourceRevision: first })).toThrow();
    expect(() => prepareReleasePublication(input, new Date("2026-09-06T00:00:00Z"))).toThrow();
    expect(() =>
      prepareReleasePublication({ ...input, current: manifest(third, [{ ...c, summary: "" }]) })
    ).toThrow();
  });
  it("validates bounded server pagination", () => {
    expect(releaseTimelineQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(() => releaseTimelineQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => releaseTimelineQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => releaseTimelineQuerySchema.parse({ environment: "prod" })).toThrow();
  });
  it("accepts an inclusive Tokyo calendar period and rejects reversed dates", () => {
    const query = releaseTimelineQuerySchema.parse({
      page: "2",
      pageSize: "30",
      from: "2026-09-01",
      to: "2026-09-07"
    });
    expect(query).toEqual({ page: 2, pageSize: 30, from: "2026-09-01", to: "2026-09-07" });
    expect(releaseDateRange(query)).toEqual({
      gte: new Date("2026-08-31T15:00:00.000Z"),
      lt: new Date("2026-09-07T15:00:00.000Z")
    });
    expect(() => releaseTimelineQuerySchema.parse({ from: "2026-02-30" })).toThrow();
    expect(() =>
      releaseTimelineQuerySchema.parse({ from: "2026-09-08", to: "2026-09-07" })
    ).toThrow();
  });
  it("validates manual records and keeps deployment evidence out of corrections", () => {
    expect(
      manualReleaseSchema.parse({
        deploymentId: input.deploymentId,
        version: "v2026.09.07",
        publishedAt: "2026-09-07T01:00:00.000Z",
        changes: ["修复时间线"],
        reason: "补录正式发布回执"
      }).sourceRevision
    ).toBeNull();
    expect(
      editReleaseSchema.parse({
        version: "v2",
        changes: ["更正发布说明"],
        reason: "原说明不完整",
        expectedVersion: 1
      })
    ).toEqual({
      version: "v2",
      changes: ["更正发布说明"],
      reason: "原说明不完整",
      expectedVersion: 1
    });
    expect(() =>
      editReleaseSchema.parse({
        version: "v2",
        changes: ["更正"],
        reason: "原记录有误",
        expectedVersion: 1,
        sourceRevision: third
      })
    ).toThrow();
  });
});

import { analyticsRankingQuerySchema } from "../src/validators/analytics-ranking.validator";
it.each([10, 50, 100])("accepts ranking page size %s", (pageSize) => {
  expect(analyticsRankingQuerySchema.parse({ pageSize }).pageSize).toBe(pageSize);
});
