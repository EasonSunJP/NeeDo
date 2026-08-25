import { resolveTechnicianRankingWindow } from "../src/services/backoffice.service";
import {
  technicianRankingQuerySchema,
  type BackofficeTechnicianRankingQuery,
  type TechnicianRankingQuery
} from "../src/validators/backoffice.validator";

const resolver = resolveTechnicianRankingWindow;
const querySchema = technicianRankingQuerySchema;

describe("technician ranking period resolver", () => {
  it("defaults to the current Tokyo calendar month", () => {
    expect(resolver({}, new Date("2026-08-25T16:30:00.000Z"))).toEqual({
      period: "month",
      timeZone: "Asia/Tokyo",
      timezone: "Asia/Tokyo",
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
      from: new Date("2026-07-31T15:00:00.000Z"),
      fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
      toExclusive: new Date("2026-08-31T15:00:00.000Z")
    });
  });

  it.each([
    ["today", "2026-08-26", "2026-08-26", "2026-08-25T15:00:00.000Z", "2026-08-26T15:00:00.000Z"],
    ["last7days", "2026-08-20", "2026-08-26", "2026-08-19T15:00:00.000Z", "2026-08-26T15:00:00.000Z"],
    ["last30days", "2026-07-28", "2026-08-26", "2026-07-27T15:00:00.000Z", "2026-08-26T15:00:00.000Z"]
  ] as const)("resolves %s using inclusive Tokyo calendar days", (period, fromDate, toDate, from, to) => {
    expect(resolver({ period }, new Date("2026-08-25T16:30:00.000Z"))).toEqual({
      period,
      timeZone: "Asia/Tokyo",
      timezone: "Asia/Tokyo",
      fromDate,
      toDate,
      from: new Date(from),
      fromInclusive: new Date(from),
      toExclusive: new Date(to)
    });
  });

  it("keeps both custom boundary dates inclusive", () => {
    expect(
      resolver(
        { period: "custom", from: "2026-05-02", to: "2026-05-05" },
        new Date("2026-08-25T16:30:00.000Z")
      )
    ).toEqual({
      period: "custom",
      timeZone: "Asia/Tokyo",
      timezone: "Asia/Tokyo",
      fromDate: "2026-05-02",
      toDate: "2026-05-05",
      from: new Date("2026-05-01T15:00:00.000Z"),
      fromInclusive: new Date("2026-05-01T15:00:00.000Z"),
      toExclusive: new Date("2026-05-05T15:00:00.000Z")
    });
  });

  it("uses open bounds for all history", () => {
    expect(resolver({ period: "all" })).toEqual({
      period: "all",
      timeZone: "Asia/Tokyo",
      timezone: "Asia/Tokyo",
      fromDate: null,
      toDate: null,
      from: null,
      fromInclusive: null,
      toExclusive: null
    });
  });
});

describe("technician ranking query schema", () => {
  it("defaults to current month ordered by completed service revenue", () => {
    expect(querySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      period: "month",
      sortBy: "revenue",
      sortOrder: "desc"
    });
  });

  it("accepts a complete custom date interval", () => {
    expect(
      querySchema.parse({ period: "custom", from: "2026-05-02", to: "2026-05-05" })
    ).toMatchObject({
      period: "custom",
      from: "2026-05-02",
      to: "2026-05-05"
    });
  });

  it.each([
    { period: "custom", from: "2026-05-02" },
    { period: "custom", to: "2026-05-05" },
    { period: "custom", from: "2026-05-06", to: "2026-05-05" },
    { period: "custom", from: "2026-02-30", to: "2026-03-01" }
  ])("rejects an invalid custom interval %#", (value) => {
    expect(() => querySchema.parse(value)).toThrow();
  });

  it("rejects unrecognized query fields", () => {
    expect(() => querySchema.parse({ unexpected: "value" })).toThrow();
  });

  it("accepts legacy ranking input before applying defaults", () => {
    const legacyInput: TechnicianRankingQuery = {};
    const parsed: BackofficeTechnicianRankingQuery = querySchema.parse(legacyInput);

    expect(parsed).toMatchObject({ page: 1, pageSize: 20, period: "month" });
  });
});
