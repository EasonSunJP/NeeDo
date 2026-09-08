import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyBookingLocationBackfill,
  buildBookingLocationBackfillPlan,
  loadBookingLocationBackfillEnvironment,
  parseBookingLocationBackfillArguments,
  restoreBookingLocationBackfill,
  runBookingLocationBackfill,
  type BookingLocationBackfillClient,
  type BookingLocationCreateInput,
  type PersistedBookingLocation
} from "../scripts/backfill-booking-service-locations";

type OrderFixture = {
  id: number;
  deletedAt: Date | null;
  fulfillmentMode: string;
  note?: string | null;
  serviceLocation: { bookingOrderId: number } | null;
  shop: {
    serviceLocation: {
      countryCode: string;
      datasetVersion: string;
      verifiedAt: Date;
      deletedAt: Date | null;
      admin1Region: {
        id: number;
        level: "ADMIN1";
        officialCode: string;
        parentId: number | null;
        deletedAt: Date | null;
        locales: Array<{ name: string }>;
      };
      admin2Region: {
        id: number;
        level: "ADMIN2";
        officialCode: string;
        parentId: number;
        deletedAt: Date | null;
        locales: Array<{ name: string }>;
      };
    } | null;
  };
};

type AuditFixture = {
  id: number;
  action: string;
  targetType: string;
  metadata: unknown;
  deletedAt: Date | null;
};

const verifiedAt = new Date("2026-08-01T00:00:00.000Z");

const order = (id: number, overrides: Partial<OrderFixture> = {}): OrderFixture => ({
  id,
  deletedAt: null,
  fulfillmentMode: "store",
  serviceLocation: null,
  shop: {
    serviceLocation: {
      countryCode: "JP",
      datasetVersion: "jp-admin-2026-08",
      verifiedAt,
      deletedAt: null,
      admin1Region: {
        id: 13,
        level: "ADMIN1",
        officialCode: "13",
        parentId: null,
        deletedAt: null,
        locales: [{ name: "東京都" }]
      },
      admin2Region: {
        id: 13103,
        level: "ADMIN2",
        officialCode: "13103",
        parentId: 13,
        deletedAt: null,
        locales: [{ name: "港区" }]
      }
    }
  },
  ...overrides
});

const clone = <T>(value: T): T => structuredClone(value);

class FakeClient implements BookingLocationBackfillClient {
  public locations: PersistedBookingLocation[];
  public audits: AuditFixture[] = [];
  public bookingQueries: Array<Record<string, unknown>> = [];
  public createManyCalls: Array<{ data: BookingLocationCreateInput[]; skipDuplicates: boolean }> =
    [];
  public restoreUpdateBatchSizes: number[] = [];
  public failAuditCreate = false;
  public failRestoreUpdateBatch: number | null = null;
  public onTransactionStart: (() => void) | null = null;
  public transactionCount = 0;
  private nextLocationId = 1;

  public constructor(
    public readonly orders: OrderFixture[],
    locations: PersistedBookingLocation[] = []
  ) {
    this.locations = clone(locations);
    this.nextLocationId = Math.max(0, ...locations.map((item) => item.id)) + 1;
  }

  public bookingOrder = {
    findMany: async (input: unknown): Promise<OrderFixture[]> => {
      const args = input as {
        take?: number;
        cursor?: { id: number };
        skip?: number;
      };
      this.bookingQueries.push(clone(input as Record<string, unknown>));
      const active = this.orders
        .filter((item) => item.deletedAt === null)
        .sort((left, right) => left.id - right.id);
      const cursorIndex = args.cursor
        ? active.findIndex((item) => item.id === args.cursor!.id)
        : -1;
      const start = cursorIndex < 0 ? 0 : cursorIndex + (args.skip ?? 0);
      const page = active.slice(start, start + (args.take ?? active.length));
      return clone(
        page.map((item) => ({
          id: item.id,
          deletedAt: item.deletedAt,
          fulfillmentMode: item.fulfillmentMode,
          serviceLocation:
            this.locations.some((location) => location.bookingOrderId === item.id) ||
            item.serviceLocation !== null
              ? { bookingOrderId: item.id }
              : null,
          shop: item.shop
        }))
      );
    }
  };

  public bookingServiceLocation = {
    findMany: async (
      args: { where?: { bookingOrderId?: { in?: number[] } } } = {}
    ): Promise<PersistedBookingLocation[]> => {
      const ids = args.where?.bookingOrderId?.in;
      return clone(
        ids ? this.locations.filter((item) => ids.includes(item.bookingOrderId)) : this.locations
      );
    },
    createMany: async (args: {
      data: BookingLocationCreateInput[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }> => {
      this.createManyCalls.push(clone(args));
      let count = 0;
      for (const input of args.data) {
        if (this.locations.some((item) => item.bookingOrderId === input.bookingOrderId)) continue;
        const now = new Date("2026-09-06T12:00:00.000Z");
        this.locations.push({
          id: this.nextLocationId++,
          ...clone(input),
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        });
        count += 1;
      }
      return { count };
    },
    updateMany: async (args: {
      where: {
        bookingOrderId?: number;
        deletedAt?: null;
        updatedAt?: Date;
        OR?: Array<Partial<PersistedBookingLocation> & { bookingOrderId: number; deletedAt: null }>;
      };
      data: { deletedAt: Date };
    }): Promise<{ count: number }> => {
      const predicates =
        args.where.OR ??
        ([
          {
            bookingOrderId: args.where.bookingOrderId!,
            deletedAt: null,
            updatedAt: args.where.updatedAt!
          }
        ] as Array<
          Partial<PersistedBookingLocation> & {
            bookingOrderId: number;
            deletedAt: null;
          }
        >);
      this.restoreUpdateBatchSizes.push(predicates.length);
      if (this.failRestoreUpdateBatch === this.restoreUpdateBatchSizes.length) return { count: 0 };
      const normalizeComparable = (value: unknown): unknown =>
        Object.prototype.toString.call(value) === "[object Date]"
          ? new Date(value as Date).toISOString()
          : value;
      const equals = (left: unknown, right: unknown): boolean =>
        normalizeComparable(left) === normalizeComparable(right);
      const matches = this.locations.filter((item) =>
        predicates.some((predicate) =>
          Object.entries(predicate).every(([key, value]) =>
            equals(item[key as keyof PersistedBookingLocation], value)
          )
        )
      );
      for (const match of matches) {
        match.deletedAt = args.data.deletedAt;
        match.updatedAt = args.data.deletedAt;
      }
      return { count: matches.length };
    },
    count: async (): Promise<number> =>
      this.locations.filter((item) => item.deletedAt === null).length
  };

  public auditLog = {
    findFirst: async (args: {
      where: { action: string; targetType: string; metadata?: { path: string; equals: string } };
    }): Promise<AuditFixture | null> => {
      const runId = args.where.metadata?.equals;
      return clone(
        this.audits.find((audit) => {
          const metadata = audit.metadata as { runId?: string };
          return (
            audit.action === args.where.action &&
            audit.targetType === args.where.targetType &&
            (!runId || metadata.runId === runId)
          );
        }) ?? null
      );
    },
    create: async (args: {
      data: Omit<AuditFixture, "id" | "deletedAt">;
    }): Promise<AuditFixture> => {
      if (this.failAuditCreate) throw new Error("injected audit failure");
      const audit = { id: this.audits.length + 1, deletedAt: null, ...clone(args.data) };
      this.audits.push(audit);
      return clone(audit);
    }
  };

  public async $transaction<T>(
    callback: (transaction: BookingLocationBackfillClient) => Promise<T>
  ): Promise<T> {
    this.transactionCount += 1;
    const locationsBefore = clone(this.locations);
    const auditsBefore = clone(this.audits);
    const callsBefore = clone(this.createManyCalls);
    const restoreCallsBefore = clone(this.restoreUpdateBatchSizes);
    const transactionHook = this.onTransactionStart;
    this.onTransactionStart = null;
    transactionHook?.();
    try {
      return await callback(this);
    } catch (error) {
      this.locations = locationsBefore;
      this.audits = auditsBefore;
      this.createManyCalls = callsBefore;
      this.restoreUpdateBatchSizes = restoreCallsBefore;
      throw error;
    }
  }
}

const existingLocation = (bookingOrderId: number): PersistedBookingLocation => ({
  id: 50,
  bookingOrderId,
  countryCode: "JP",
  admin1RegionCode: "13",
  admin1Name: "東京都",
  admin2RegionCode: "13103",
  admin2Name: "港区",
  source: "SHOP_LOCATION",
  resolutionStatus: "VERIFIED",
  datasetVersion: "jp-admin-2026-08",
  resolvedAt: verifiedAt,
  createdAt: verifiedAt,
  updatedAt: verifiedAt,
  deletedAt: null
});

describe("booking service location historical backfill", () => {
  it("classifies only structured evidence and is idempotent", async () => {
    const alreadyPresent = existingLocation(5);
    const client = new FakeClient(
      [
        order(1),
        order(2),
        order(3, { shop: { serviceLocation: null } }),
        order(4, {
          fulfillmentMode: "home",
          note: "東京都港区六本木 1-2-3 を訪問してください"
        }),
        order(5, { serviceLocation: { bookingOrderId: 5 } })
      ],
      [alreadyPresent]
    );

    const plan = await buildBookingLocationBackfillPlan(client);

    expect(plan.summary).toEqual({
      storeVerified: 2,
      homeVerified: 0,
      unresolved: 1,
      alreadyPresent: 1
    });
    expect(plan.skipped).toEqual([{ bookingOrderId: 3, reason: "SHOP_LOCATION_NOT_VERIFIED" }]);
    expect(JSON.stringify(plan)).not.toContain("六本木");

    await applyBookingLocationBackfill(client, plan, "test-run-1");
    await applyBookingLocationBackfill(
      client,
      await buildBookingLocationBackfillPlan(client),
      "test-run-2"
    );

    expect(await client.bookingServiceLocation.count()).toBe(4);
    expect(client.locations.find((item) => item.bookingOrderId === 1)).toMatchObject({
      admin1RegionCode: "13",
      admin1Name: "東京都",
      admin2RegionCode: "13103",
      admin2Name: "港区",
      source: "SHOP_LOCATION",
      resolutionStatus: "VERIFIED"
    });
    expect(client.locations.find((item) => item.bookingOrderId === 4)).toMatchObject({
      admin1RegionCode: null,
      admin1Name: null,
      admin2RegionCode: null,
      admin2Name: null,
      source: "CUSTOMER_SERVICE_LOCATION",
      resolutionStatus: "UNRESOLVED",
      resolvedAt: null
    });
    expect(client.locations.some((item) => item.bookingOrderId === 3)).toBe(false);
  });

  it("normalizes historical home_visit without selecting or parsing free text", async () => {
    const first = new FakeClient([
      order(11, {
        fulfillmentMode: "home_visit",
        note: "東京都港区六本木 1-2-3"
      })
    ]);
    const second = new FakeClient([
      order(11, {
        fulfillmentMode: "home_visit",
        note: "大阪府大阪市の別の住所"
      })
    ]);

    const firstPlan = await buildBookingLocationBackfillPlan(first);
    const secondPlan = await buildBookingLocationBackfillPlan(second);

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.summary).toEqual({
      storeVerified: 0,
      homeVerified: 0,
      unresolved: 1,
      alreadyPresent: 0
    });
    expect(firstPlan.skipped).toEqual([]);
    expect(firstPlan.rows).toEqual([
      expect.objectContaining({
        bookingOrderId: 11,
        source: "CUSTOMER_SERVICE_LOCATION",
        resolutionStatus: "UNRESOLVED",
        admin1RegionCode: null,
        admin2RegionCode: null
      })
    ]);
    for (const query of first.bookingQueries) {
      expect(query).toMatchObject({
        take: 500,
        orderBy: { id: "asc" }
      });
      expect(query.select).not.toHaveProperty("note");
    }
    expect(JSON.stringify(firstPlan)).not.toContain("六本木");
    expect(JSON.stringify(secondPlan)).not.toContain("大阪市");
  });

  it("cursor-pages bookings in deterministic ID order with the exact safe projection", async () => {
    const client = new FakeClient(Array.from({ length: 501 }, (_, index) => order(index + 1)));

    await buildBookingLocationBackfillPlan(client);

    expect(client.bookingQueries).toHaveLength(2);
    expect(client.bookingQueries[0]).toMatchObject({
      take: 500,
      orderBy: { id: "asc" }
    });
    expect(client.bookingQueries[0]).not.toHaveProperty("cursor");
    expect(client.bookingQueries[0]).not.toHaveProperty("skip");
    expect(client.bookingQueries[1]).toMatchObject({
      take: 500,
      cursor: { id: 500 },
      skip: 1,
      orderBy: { id: "asc" }
    });
    for (const query of client.bookingQueries) {
      expect(query.select).toEqual({
        id: true,
        fulfillmentMode: true,
        serviceLocation: { select: { bookingOrderId: true } },
        shop: {
          select: {
            serviceLocation: {
              select: {
                countryCode: true,
                datasetVersion: true,
                verifiedAt: true,
                deletedAt: true,
                admin1Region: {
                  select: {
                    id: true,
                    level: true,
                    officialCode: true,
                    parentId: true,
                    deletedAt: true,
                    locales: {
                      where: { locale: "JA", deletedAt: null },
                      select: { name: true },
                      take: 1
                    }
                  }
                },
                admin2Region: {
                  select: {
                    id: true,
                    level: true,
                    officialCode: true,
                    parentId: true,
                    deletedAt: true,
                    locales: {
                      where: { locale: "JA", deletedAt: null },
                      select: { name: true },
                      take: 1
                    }
                  }
                }
              }
            }
          }
        }
      });
    }
  });

  it.each([
    ["deleted booking", (fixture: OrderFixture) => (fixture.deletedAt = new Date())],
    ["fulfillment mode", (fixture: OrderFixture) => (fixture.fulfillmentMode = "home_visit")],
    ["shop assignment", (fixture: OrderFixture) => (fixture.shop.serviceLocation = null)],
    [
      "region code",
      (fixture: OrderFixture) => (fixture.shop.serviceLocation!.admin2Region.officialCode = "13104")
    ],
    [
      "dataset version",
      (fixture: OrderFixture) => (fixture.shop.serviceLocation!.datasetVersion = "jp-admin-new")
    ],
    [
      "localized name",
      (fixture: OrderFixture) =>
        (fixture.shop.serviceLocation!.admin2Region.locales[0]!.name = "新宿区")
    ]
  ])("refuses %s source drift inside the write transaction", async (_label, mutate) => {
    const client = new FakeClient([order(1)]);
    const plan = await buildBookingLocationBackfillPlan(client);
    client.onTransactionStart = () => mutate(client.orders[0]!);

    await expect(applyBookingLocationBackfill(client, plan, "source-drift-run")).rejects.toThrow(
      "source plan drift"
    );
    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
    expect(client.createManyCalls).toEqual([]);
  });

  it("refuses a same-count source row swap inside the write transaction", async () => {
    const client = new FakeClient([order(1), order(2, { shop: { serviceLocation: null } })]);
    const plan = await buildBookingLocationBackfillPlan(client);
    client.onTransactionStart = () => {
      const verified = client.orders[0]!.shop.serviceLocation;
      client.orders[0]!.shop.serviceLocation = null;
      client.orders[1]!.shop.serviceLocation = clone(verified);
    };

    await expect(applyBookingLocationBackfill(client, plan, "same-count-swap")).rejects.toThrow(
      "source plan drift"
    );
    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
    expect(client.createManyCalls).toEqual([]);
  });

  it("uses bounded createMany batches and records exact inserted IDs with checksums", async () => {
    const client = new FakeClient(Array.from({ length: 501 }, (_, index) => order(index + 1)));
    const plan = await buildBookingLocationBackfillPlan(client);

    const result = await applyBookingLocationBackfill(client, plan, "test-run-501");

    expect(client.createManyCalls.map((call) => call.data.length)).toEqual([500, 1]);
    expect(client.createManyCalls.every((call) => call.skipDuplicates === true)).toBe(true);
    expect(result.manifest.rows).toHaveLength(501);
    expect(result.manifest.rows.map((row) => row.bookingOrderId)).toEqual(
      Array.from({ length: 501 }, (_, index) => index + 1)
    );
    expect(result.manifest.rows.every((row) => /^[a-f0-9]{64}$/u.test(row.checksum))).toBe(true);
    expect(client.audits).toHaveLength(1);
    expect(client.audits[0]).toMatchObject({
      action: "booking_service_location.backfill.apply",
      targetType: "booking_service_location_backfill_run"
    });
  });

  it("fails planning closed when the 5,000-row manifest limit would be exceeded", async () => {
    const client = new FakeClient(Array.from({ length: 5_001 }, (_, index) => order(index + 1)));

    await expect(buildBookingLocationBackfillPlan(client)).rejects.toThrow(
      "manifest row limit exceeded"
    );

    expect(client.transactionCount).toBe(0);
    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
  });

  it("bounds scan memory and preview output even when every booking is skipped", async () => {
    const client = new FakeClient(
      Array.from({ length: 10_001 }, (_, index) =>
        order(index + 1, { shop: { serviceLocation: null } })
      )
    );

    await expect(buildBookingLocationBackfillPlan(client)).rejects.toThrow(
      "booking scan limit exceeded"
    );

    expect(client.bookingQueries.every((query) => query.take === 500)).toBe(true);
    expect(client.transactionCount).toBe(0);
    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
  });

  it("rejects an oversized serialized manifest before opening the write transaction", async () => {
    const firstLargeId = 9_007_199_250_000_000;
    const client = new FakeClient(
      Array.from({ length: 3_000 }, (_, index) => order(firstLargeId + index))
    );
    const plan = await buildBookingLocationBackfillPlan(client);

    await expect(
      applyBookingLocationBackfill(client, plan, "serialized-byte-limit")
    ).rejects.toThrow("manifest serialized byte limit exceeded");

    expect(client.transactionCount).toBe(0);
    expect(client.createManyCalls).toEqual([]);
    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
  });

  it("rolls back inserted locations when the transaction audit fails", async () => {
    const client = new FakeClient([order(1), order(2)]);
    client.failAuditCreate = true;

    await expect(
      applyBookingLocationBackfill(
        client,
        await buildBookingLocationBackfillPlan(client),
        "test-run-failure"
      )
    ).rejects.toThrow("injected audit failure");

    expect(client.locations).toEqual([]);
    expect(client.audits).toEqual([]);
  });

  it("restores only unchanged manifest rows and refuses any drift atomically", async () => {
    const client = new FakeClient([order(1), order(2)]);
    await applyBookingLocationBackfill(
      client,
      await buildBookingLocationBackfillPlan(client),
      "20260906T120000Z-abc123"
    );
    client.locations.find((item) => item.bookingOrderId === 2)!.admin2Name = "変更済み";

    await expect(restoreBookingLocationBackfill(client, "20260906T120000Z-abc123")).rejects.toThrow(
      "checksum drift"
    );
    expect(client.locations.every((item) => item.deletedAt === null)).toBe(true);

    client.locations.find((item) => item.bookingOrderId === 2)!.admin2Name = "港区";
    const restored = await restoreBookingLocationBackfill(client, "20260906T120000Z-abc123");
    expect(restored.restoredBookingOrderIds).toEqual([1, 2]);
    expect(client.locations.every((item) => item.deletedAt !== null)).toBe(true);
    expect(client.restoreUpdateBatchSizes).toEqual([2]);
    expect(client.audits.at(-1)).toMatchObject({
      action: "booking_service_location.backfill.restore"
    });
  });

  it("batches restore CAS operations and rolls all batches back on a short count", async () => {
    const client = new FakeClient(Array.from({ length: 501 }, (_, index) => order(index + 1)));
    await applyBookingLocationBackfill(
      client,
      await buildBookingLocationBackfillPlan(client),
      "restore-batch-run"
    );
    client.failRestoreUpdateBatch = 2;

    await expect(restoreBookingLocationBackfill(client, "restore-batch-run")).rejects.toThrow(
      "concurrent checksum drift"
    );
    expect(client.restoreUpdateBatchSizes).toEqual([]);
    expect(client.locations.every((item) => item.deletedAt === null)).toBe(true);
    expect(client.audits).toHaveLength(1);
  });
});

describe("booking service location backfill CLI safety", () => {
  const envFile = "/tmp/booking-location-backfill.env";
  const fileSystem = (contents: string) => ({
    resolve: (value: string) => value,
    existsSync: (value: string) => value === envFile,
    readFileSync: () => contents
  });

  it("requires an explicit safe FORMAL_BACKEND_ENV_FILE without exposing credentials", () => {
    expect(() => loadBookingLocationBackfillEnvironment({}, fileSystem(""))).toThrow(
      "FORMAL_BACKEND_ENV_FILE is required"
    );
    expect(() =>
      loadBookingLocationBackfillEnvironment(
        { FORMAL_BACKEND_ENV_FILE: "/tmp/missing.env" },
        fileSystem("")
      )
    ).toThrow("does not exist");

    expect(
      loadBookingLocationBackfillEnvironment(
        { FORMAL_BACKEND_ENV_FILE: envFile },
        fileSystem(
          "NODE_ENV=test\nDEPLOY_ENV=local\nDATABASE_URL=mysql://needo:super-secret@127.0.0.1:3307/needo_backfill_test"
        )
      )
    ).toMatchObject({ databaseHost: "127.0.0.1", databaseName: "needo_backfill_test" });

    expect(
      loadBookingLocationBackfillEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile,
          DATABASE_URL: "mysql://runtime:runtime-secret@live-db.invalid/runtime_prod"
        },
        fileSystem(
          "NODE_ENV=test\nDEPLOY_ENV=local\nDATABASE_URL=mysql://needo:file-secret@127.0.0.1:3307/needo_file_test"
        )
      )
    ).toMatchObject({ databaseHost: "127.0.0.1", databaseName: "needo_file_test" });

    for (const unsafe of [
      "NODE_ENV=production\nDATABASE_URL=mysql://needo:super-secret@127.0.0.1/needo_test",
      "DEPLOY_ENV=staging\nDATABASE_URL=mysql://needo:super-secret@127.0.0.1/needo_test",
      "NODE_ENV=test\nDATABASE_URL=mysql://needo:super-secret@live-db.internal/needo_test",
      "NODE_ENV=test\nDATABASE_URL=mysql://needo:super-secret@127.0.0.1/needo_prod_test",
      "NODE_ENV=test\nDATABASE_URL=mysql://needo:super-secret@127.0.0.1/needo_livedev"
    ]) {
      try {
        loadBookingLocationBackfillEnvironment(
          { FORMAL_BACKEND_ENV_FILE: envFile },
          fileSystem(unsafe)
        );
        throw new Error("unsafe environment unexpectedly accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain("super-secret");
      }
    }
  });

  it.each([
    ["NODE_ENV", "prod"],
    ["NODE_ENV", "production"],
    ["DEPLOY_ENV", "staging"],
    ["DEPLOY_ENV", "live"],
    ["APP_ENV", "prod"],
    ["APP_ENV", "production"],
    ["ENVIRONMENT", "staging"],
    ["ENVIRONMENT", "live"]
  ])("rejects inherited protected %s=%s without exposing file credentials", (key, value) => {
    try {
      loadBookingLocationBackfillEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile,
          [key]: value,
          DATABASE_URL: "mysql://runtime:runtime-secret@127.0.0.1/runtime_test"
        },
        fileSystem(
          "NODE_ENV=test\nDEPLOY_ENV=local\nDATABASE_URL=mysql://needo:file-secret@127.0.0.1:3307/needo_backfill_test"
        )
      );
      throw new Error("unsafe inherited environment unexpectedly accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("protected environment");
      expect((error as Error).message).not.toContain("file-secret");
      expect((error as Error).message).not.toContain("runtime-secret");
    }
  });

  it("defaults to preview and requires --apply plus the exact immediately built count", async () => {
    expect(parseBookingLocationBackfillArguments([])).toEqual({ mode: "preview" });
    expect(() => parseBookingLocationBackfillArguments(["--confirm-count=2"])).toThrow(
      "--confirm-count requires --apply"
    );

    const previewClient = new FakeClient([order(1), order(2)]);
    const preview = await runBookingLocationBackfill(previewClient, []);
    expect(preview).toMatchObject({ mode: "preview", writeCount: 0 });
    expect(previewClient.locations).toEqual([]);

    await expect(
      runBookingLocationBackfill(new FakeClient([order(1), order(2)]), ["--apply"])
    ).rejects.toThrow("--confirm-count=2 is required");
    await expect(
      runBookingLocationBackfill(new FakeClient([order(1), order(2)]), [
        "--apply",
        "--confirm-count=1"
      ])
    ).rejects.toThrow("--confirm-count=2 is required");

    const applyClient = new FakeClient([order(1), order(2)]);
    const applied = await runBookingLocationBackfill(
      applyClient,
      ["--apply", "--confirm-count=2"],
      "test-cli-run"
    );
    expect(applied).toMatchObject({ mode: "apply", writeCount: 2 });
  });

  it("wires only the preview-first script command", () => {
    const backendRoot = resolve(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(existsSync(resolve(backendRoot, "scripts/backfill-booking-service-locations.ts"))).toBe(
      true
    );
    expect(packageJson.scripts["backfill:booking-service-locations"]).toBe(
      "tsx scripts/backfill-booking-service-locations.ts"
    );
  });
});
