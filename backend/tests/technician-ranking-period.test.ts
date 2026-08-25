import * as backofficeServiceModule from "../src/services/backoffice.service";
import * as backofficeValidatorModule from "../src/validators/backoffice.validator";

type RankingPeriod = "today" | "last7days" | "last30days" | "month" | "custom" | "all";

type ResolveTechnicianRankingWindow = (
  input: { period?: RankingPeriod; from?: string; to?: string },
  now?: Date
) => {
  period: RankingPeriod;
  timeZone: "Asia/Tokyo";
  fromDate: string | null;
  toDate: string | null;
  fromInclusive: Date | null;
  toExclusive: Date | null;
};

const resolver = (
  backofficeServiceModule as unknown as {
    resolveTechnicianRankingWindow?: ResolveTechnicianRankingWindow;
  }
).resolveTechnicianRankingWindow;

type RankingQuerySchema = {
  parse: (value: unknown) => {
    period: RankingPeriod;
    sortBy: "revenue" | "completedOrders" | "workingDays";
    sortOrder: "asc" | "desc";
    from?: string;
    to?: string;
  };
};

const querySchema = (
  backofficeValidatorModule as unknown as {
    technicianRankingQuerySchema?: RankingQuerySchema;
  }
).technicianRankingQuerySchema;

describe("technician ranking period resolver", () => {
  it("defaults to the current Tokyo calendar month", () => {
    expect(resolver).toEqual(expect.any(Function));
    if (!resolver) return;

    expect(resolver({}, new Date("2026-08-25T16:30:00.000Z"))).toEqual({
      period: "month",
      timeZone: "Asia/Tokyo",
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
      fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
      toExclusive: new Date("2026-08-31T15:00:00.000Z")
    });
  });

  it.each([
    ["today", "2026-08-26", "2026-08-26", "2026-08-25T15:00:00.000Z", "2026-08-26T15:00:00.000Z"],
    ["last7days", "2026-08-20", "2026-08-26", "2026-08-19T15:00:00.000Z", "2026-08-26T15:00:00.000Z"],
    ["last30days", "2026-07-28", "2026-08-26", "2026-07-27T15:00:00.000Z", "2026-08-26T15:00:00.000Z"]
  ] as const)("resolves %s using inclusive Tokyo calendar days", (period, fromDate, toDate, from, to) => {
    expect(resolver).toEqual(expect.any(Function));
    if (!resolver) return;

    expect(resolver({ period }, new Date("2026-08-25T16:30:00.000Z"))).toEqual({
      period,
      timeZone: "Asia/Tokyo",
      fromDate,
      toDate,
      fromInclusive: new Date(from),
      toExclusive: new Date(to)
    });
  });

  it("keeps both custom boundary dates inclusive", () => {
    expect(resolver).toEqual(expect.any(Function));
    if (!resolver) return;

    expect(
      resolver(
        { period: "custom", from: "2026-05-02", to: "2026-05-05" },
        new Date("2026-08-25T16:30:00.000Z")
      )
    ).toEqual({
      period: "custom",
      timeZone: "Asia/Tokyo",
      fromDate: "2026-05-02",
      toDate: "2026-05-05",
      fromInclusive: new Date("2026-05-01T15:00:00.000Z"),
      toExclusive: new Date("2026-05-05T15:00:00.000Z")
    });
  });

  it("uses open bounds for all history", () => {
    expect(resolver).toEqual(expect.any(Function));
    if (!resolver) return;

    expect(resolver({ period: "all" })).toEqual({
      period: "all",
      timeZone: "Asia/Tokyo",
      fromDate: null,
      toDate: null,
      fromInclusive: null,
      toExclusive: null
    });
  });
});

describe("technician ranking query schema", () => {
  it("defaults to current month ordered by completed service revenue", () => {
    expect(querySchema).toBeDefined();
    if (!querySchema) return;

    expect(querySchema.parse({})).toMatchObject({
      period: "month",
      sortBy: "revenue",
      sortOrder: "desc"
    });
  });

  it("accepts a complete custom date interval", () => {
    expect(querySchema).toBeDefined();
    if (!querySchema) return;

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
    expect(querySchema).toBeDefined();
    if (!querySchema) return;

    expect(() => querySchema.parse(value)).toThrow();
  });
});
