import { seedAdministrativeRegionCatalog } from "../prisma/seed";

const EXPECTED_BATCH_SIZE = 100;
const EXPECTED_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

interface StoredRegion {
  id: number;
  countryCode: string;
  officialCode: string;
  level: string;
  parentId: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  source: string;
  sourceVersion: string;
  deletedAt: Date | null;
}

interface StoredLocale {
  id: number;
  regionId: number;
  locale: string;
  name: string;
  deletedAt: Date | null;
}

const makeSeedClient = () => {
  const regions = new Map<string, StoredRegion>();
  const locales = new Map<string, StoredLocale>();
  const transactionOptions: unknown[] = [];
  const operationsPerTransaction: number[] = [];
  let nextRegionId = 1;
  let nextLocaleId = 1;
  let currentOperations = 0;

  const tx = {
    administrativeRegion: {
      upsert: jest.fn(async ({ where, create, update }) => {
        currentOperations += 1;
        const key = `${where.countryCode_officialCode.countryCode}:${where.countryCode_officialCode.officialCode}`;
        const existing = regions.get(key);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const created = { id: nextRegionId++, deletedAt: null, ...create } as StoredRegion;
        regions.set(key, created);
        return { ...created };
      }),
    },
    administrativeRegionLocale: {
      upsert: jest.fn(async ({ where, create, update }) => {
        currentOperations += 1;
        const key = `${where.regionId_locale.regionId}:${where.regionId_locale.locale}`;
        const existing = locales.get(key);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const created = { id: nextLocaleId++, deletedAt: null, ...create } as StoredLocale;
        locales.set(key, created);
        return { ...created };
      }),
    },
  };

  const client = {
    ...tx,
    $transaction: jest.fn(async (operation, options) => {
      transactionOptions.push(options);
      currentOperations = 0;
      const result = await operation(tx);
      operationsPerTransaction.push(currentOperations);
      return result;
    }),
  };

  return { client, locales, operationsPerTransaction, regions, transactionOptions };
};

it("seeds and restores the catalogue in bounded explicit transactions", async () => {
  const state = makeSeedClient();

  await seedAdministrativeRegionCatalog(state.client as never);

  expect(state.regions.size).toBe(1_966);
  expect(state.locales.size).toBe(1_966);
  expect(new Set([...state.locales.values()].map((row) => row.locale))).toEqual(new Set(["JA"]));
  expect(state.transactionOptions.length).toBeGreaterThan(1);
  expect(state.transactionOptions).toEqual(
    expect.arrayContaining([EXPECTED_TRANSACTION_OPTIONS]),
  );
  expect(state.transactionOptions).toEqual(
    state.transactionOptions.map(() => EXPECTED_TRANSACTION_OPTIONS),
  );
  expect(Math.max(...state.operationsPerTransaction)).toBeLessThanOrEqual(
    EXPECTED_BATCH_SIZE * 2,
  );

  const shinjuku = state.regions.get("JP:13104");
  expect(shinjuku).toBeDefined();
  const firstShinjukuId = shinjuku?.id;
  if (shinjuku) shinjuku.deletedAt = new Date("2026-01-01T00:00:00.000Z");
  const shinjukuLocale = state.locales.get(`${firstShinjukuId}:JA`);
  if (shinjukuLocale) {
    shinjukuLocale.deletedAt = new Date("2026-01-01T00:00:00.000Z");
    shinjukuLocale.name = "stale";
  }

  await seedAdministrativeRegionCatalog(state.client as never);

  expect(state.regions.size).toBe(1_966);
  expect(state.locales.size).toBe(1_966);
  expect(state.regions.get("JP:13104")).toMatchObject({
    id: firstShinjukuId,
    deletedAt: null,
  });
  expect(state.locales.get(`${firstShinjukuId}:JA`)).toMatchObject({
    name: "新宿区",
    deletedAt: null,
  });
});
