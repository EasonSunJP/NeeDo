# Operations Live Data Screen — Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the formal Japan administrative-region, booking service-location, regional dashboard snapshot, cache, and SSE contracts that the later live-screen UI can consume.

**Architecture:** Add versioned Japanese administrative reference data and immutable booking service-location snapshots in MySQL, then compose one regional read model from the existing authoritative dashboard, order, payment, and ranking repositories. Serve it through a strictly validated cached snapshot endpoint and a shared Redis-backed SSE channel; this plan deliberately stops before creating the live-screen page.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7/MySQL 8, Redis 5, Zod, Jest/Supertest, existing NeeDo auth/RBAC/audit infrastructure.

## Global Constraints

- This is microstep A only; do not add `/admin/live-screen` or change the existing dashboard UI.
- First published country is exactly `JP`; accepted periods are `today | last7days | last30days`; timezone is `Asia/Tokyo`.
- Administrative source version is `N03-20260101`, based on Japan MLIT N03 data dated 2026-01-01.
- Store service location comes from a verified shop administrative assignment; home service location comes from structured codes supplied at booking time.
- Existing free-text `Shop.city`, `Shop.address`, and booking notes remain compatible but are never treated as authoritative region codes.
- Unresolved historical orders count only in the Japan-wide scope and are excluded from prefecture and municipality scopes.
- Snapshot and event responses must never contain customer name, phone, email, full address, note, access token, refresh token, OTP, or internal numeric relationship keys.
- JPY, production NDP, and Test NDP remain separate; refunds and reversals follow existing formal finance rules.
- Snapshot API and SSE require platform identity plus `backoffice:dashboard:read`; validators and OpenAPI are mandatory.
- No new sample business values, random events, parallel financial formulas, or database polling loops.
- Every task is committed separately and must preserve unrelated dirty-worktree changes.

---

## File Structure

### New backend files

- `backend/src/domain/administrative-region.ts` — region levels, locale-independent public references, and service-location input types.
- `backend/src/repositories/administrative-region.repository.ts` — region hierarchy lookup, shop assignment, and transactional snapshot resolution.
- `backend/src/services/administrative-region.service.ts` — hierarchy validation and public reference-list composition.
- `backend/src/validators/administrative-region.validator.ts` — strict country/parent/code validation.
- `backend/src/controllers/administrative-region.controller.ts` — request/response adaptation only.
- `backend/src/routes/administrative-region.routes.ts` — public read-only reference route.
- `backend/prisma/reference/jp-administrative-regions-2026.json` — generated lightweight official region catalogue, without boundary geometry.
- `backend/scripts/build-jp-administrative-catalog.ts` — deterministic N03 GeoJSON-to-catalogue generator.
- `backend/scripts/backfill-booking-service-locations.ts` — preview/apply/restore-safe historical backfill.
- `backend/src/domain/live-dashboard.ts` — regional scope, snapshot, ranking, trend, order summary, and event contracts.
- `backend/src/repositories/live-dashboard.repository.ts` — all regional SQL/Prisma reads under one evaluation boundary.
- `backend/src/services/live-dashboard-cache.service.ts` — Redis cache and process-local single-flight.
- `backend/src/services/live-dashboard-event.gateway.ts` — one shared Redis subscription and filtered SSE fan-out.
- `backend/src/services/live-dashboard.service.ts` — scope resolution, audit, snapshot composition, and event subscription.
- `backend/src/validators/live-dashboard.validator.ts` — snapshot/SSE query schema.
- `backend/src/controllers/live-dashboard.controller.ts` — JSON and SSE response adaptation.
- `backend/scripts/check-live-dashboard-flow.ts` — rollback-safe real-MySQL/Redis checker.

### Existing backend files modified

- `backend/prisma/schema.prisma` and a new migration — regions, locales, verified shop locations, immutable booking locations, indexes, and relations.
- `backend/prisma/seed.ts` — upsert the generated JP catalogue.
- `backend/src/validators/booking.validator.ts` — require structured home-service region codes.
- `backend/src/repositories/booking.repository.ts` — write the immutable location in the booking transaction.
- `backend/src/services/booking.service.ts` — pass structured location and publish post-commit invalidation.
- `backend/src/validators/backoffice.validator.ts`, `backend/src/repositories/backoffice.repository.ts`, and `backend/src/services/backoffice.service.ts` — accept and audit verified shop assignments.
- `backend/src/routes/backoffice.routes.ts`, `backend/src/controllers/backoffice.controller.ts`, `backend/src/app.ts`, and `backend/src/api/openapi.ts` — register the two live endpoints and the reference endpoint.
- `backend/src/constants/permissions.constants.ts` — verify the existing dashboard permission remains the sole permission.
- `backend/src/server.ts` — construct and close the shared cache/event resources.
- `backend/package.json` — catalogue/backfill/checker scripts.

### Existing frontend files modified for the booking contract

- `src/features/booking/api.ts` — typed structured service location.
- `src/pages/user/FormalCheckoutPage.tsx` — prefecture/municipality selection for home service while retaining the detailed address for fulfillment.
- `src/i18n/translations.ts` — five-language labels and error copy.

### Tests

- `backend/tests/administrative-region-schema.test.ts`
- `backend/tests/administrative-region-catalog.test.ts`
- `backend/tests/administrative-region-validator.test.ts`
- `backend/tests/administrative-region-api.test.ts`
- `backend/tests/booking-service-location.test.ts`
- `backend/tests/booking-location-backfill.test.ts`
- `backend/tests/live-dashboard-validator.test.ts`
- `backend/tests/live-dashboard.repository.test.ts`
- `backend/tests/live-dashboard.service.test.ts`
- `backend/tests/live-dashboard-cache.test.ts`
- `backend/tests/live-dashboard-events.test.ts`
- `backend/tests/live-dashboard-api.test.ts`
- `backend/tests/live-dashboard-openapi.test.ts`
- `src/features/booking/api.test.ts`
- `src/pages/user/FormalCheckoutPage.test.ts`

---

### Task 1: Versioned administrative-region schema and catalogue

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260906120000_live_dashboard_administrative_regions/migration.sql`
- Create: `backend/src/domain/administrative-region.ts`
- Create: `backend/scripts/build-jp-administrative-catalog.ts`
- Create: `backend/prisma/reference/jp-administrative-regions-2026.json`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/administrative-region-schema.test.ts`
- Test: `backend/tests/administrative-region-catalog.test.ts`

**Interfaces:**
- Consumes: N03 properties `N03_001`, `N03_004`, `N03_005`, and `N03_007`, plus centroid data already represented by `src/data/japanCityData.ts`.
- Produces: `AdministrativeRegionRef`, `AdministrativeRegionLevel`, Prisma models `AdministrativeRegion`, `AdministrativeRegionLocale`, `ShopServiceLocation`, and `BookingServiceLocation`.

- [ ] **Step 1: Write failing schema and catalogue tests**

```ts
// backend/tests/administrative-region-schema.test.ts
import fs from "node:fs";
import path from "node:path";

const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

it("defines indexed region, shop assignment, and immutable booking location tables", () => {
  expect(schema).toContain("model AdministrativeRegion {");
  expect(schema).toContain("@@unique([countryCode, officialCode]");
  expect(schema).toContain("model AdministrativeRegionLocale {");
  expect(schema).toContain("@@unique([regionId, locale]");
  expect(schema).toContain("model ShopServiceLocation {");
  expect(schema).toContain("shopId             Int      @unique");
  expect(schema).toContain("model BookingServiceLocation {");
  expect(schema).toContain("bookingOrderId      Int      @unique");
  expect(schema).toContain("@@index([countryCode, admin1RegionCode, admin2RegionCode");
});

// backend/tests/administrative-region-catalog.test.ts
import catalog from "../prisma/reference/jp-administrative-regions-2026.json";

it("contains one JP country, 47 prefectures, Tokyo, and all 23 special wards", () => {
  expect(catalog.version).toBe("N03-20260101");
  expect(catalog.regions.filter((row) => row.level === "ADMIN1")).toHaveLength(47);
  expect(catalog.regions).toEqual(expect.arrayContaining([
    expect.objectContaining({ officialCode: "13", nameJa: "東京都", level: "ADMIN1" }),
    expect.objectContaining({ officialCode: "13104", nameJa: "新宿区", parentOfficialCode: "13" })
  ]));
  expect(catalog.regions.filter((row) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(row.officialCode))).toHaveLength(23);
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing-model/catalogue failure**

Run: `cd backend && npm test -- --runInBand tests/administrative-region-schema.test.ts tests/administrative-region-catalog.test.ts`

Expected: FAIL because the models and JSON file do not exist.

- [ ] **Step 3: Add the schema contract and migration**

Add these enums/models, using existing `ContentLocale` for locale rows:

```prisma
enum AdministrativeRegionLevel {
  COUNTRY
  ADMIN1
  ADMIN2

  @@map("administrative_region_level")
}

enum ServiceLocationSource {
  SHOP_LOCATION
  CUSTOMER_SERVICE_LOCATION

  @@map("service_location_source")
}

enum ServiceLocationResolutionStatus {
  VERIFIED
  UNRESOLVED

  @@map("service_location_resolution_status")
}

model AdministrativeRegion {
  id            Int                       @id @default(autoincrement())
  countryCode   String                    @map("country_code") @db.Char(2)
  officialCode  String                    @map("official_code") @db.VarChar(16)
  level         AdministrativeRegionLevel
  parentId      Int?                      @map("parent_id")
  centroidLat   Decimal?                  @map("centroid_lat") @db.Decimal(10, 7)
  centroidLng   Decimal?                  @map("centroid_lng") @db.Decimal(10, 7)
  source        String                    @db.VarChar(120)
  sourceVersion String                    @map("source_version") @db.VarChar(40)
  createdAt     DateTime                  @default(now()) @map("created_at")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  deletedAt     DateTime?                 @map("deleted_at")
  parent        AdministrativeRegion?     @relation("AdministrativeRegionTree", fields: [parentId], references: [id], onDelete: Restrict)
  children      AdministrativeRegion[]    @relation("AdministrativeRegionTree")
  locales       AdministrativeRegionLocale[]
  admin1Shops   ShopServiceLocation[]     @relation("ShopServiceAdmin1")
  admin2Shops   ShopServiceLocation[]     @relation("ShopServiceAdmin2")

  @@unique([countryCode, officialCode], map: "administrative_regions_country_code_key")
  @@index([countryCode, level, parentId, deletedAt], map: "administrative_regions_hierarchy_idx")
  @@map("administrative_regions")
}

model AdministrativeRegionLocale {
  id        Int           @id @default(autoincrement())
  regionId  Int           @map("region_id")
  locale    ContentLocale
  name      String        @db.VarChar(160)
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")
  deletedAt DateTime?     @map("deleted_at")
  region    AdministrativeRegion @relation(fields: [regionId], references: [id], onDelete: Restrict)

  @@unique([regionId, locale], map: "administrative_region_locales_region_locale_key")
  @@index([locale, deletedAt], map: "administrative_region_locales_locale_deleted_idx")
  @@map("administrative_region_locales")
}

model ShopServiceLocation {
  id             Int      @id @default(autoincrement())
  shopId         Int      @unique @map("shop_id")
  countryCode    String   @map("country_code") @db.Char(2)
  admin1RegionId Int      @map("admin1_region_id")
  admin2RegionId Int      @map("admin2_region_id")
  datasetVersion String   @map("dataset_version") @db.VarChar(40)
  verifiedAt     DateTime @map("verified_at")
  verifiedById   Int?     @map("verified_by_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")
  shop           Shop     @relation(fields: [shopId], references: [id], onDelete: Restrict)
  admin1Region   AdministrativeRegion @relation("ShopServiceAdmin1", fields: [admin1RegionId], references: [id], onDelete: Restrict)
  admin2Region   AdministrativeRegion @relation("ShopServiceAdmin2", fields: [admin2RegionId], references: [id], onDelete: Restrict)
  verifiedBy     User?    @relation(fields: [verifiedById], references: [id], onDelete: SetNull)

  @@index([countryCode, admin1RegionId, admin2RegionId, deletedAt], map: "shop_service_locations_scope_idx")
  @@index([verifiedById])
  @@map("shop_service_locations")
}

model BookingServiceLocation {
  id               Int       @id @default(autoincrement())
  bookingOrderId   Int       @unique @map("booking_order_id")
  countryCode      String    @map("country_code") @db.Char(2)
  admin1RegionCode String?   @map("admin1_region_code") @db.VarChar(16)
  admin1Name       String?   @map("admin1_name") @db.VarChar(160)
  admin2RegionCode String?   @map("admin2_region_code") @db.VarChar(16)
  admin2Name       String?   @map("admin2_name") @db.VarChar(160)
  source           ServiceLocationSource
  resolutionStatus ServiceLocationResolutionStatus @map("resolution_status")
  datasetVersion   String    @map("dataset_version") @db.VarChar(40)
  resolvedAt       DateTime? @map("resolved_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  deletedAt        DateTime? @map("deleted_at")
  bookingOrder     BookingOrder @relation(fields: [bookingOrderId], references: [id], onDelete: Restrict)

  @@index([countryCode, admin1RegionCode, admin2RegionCode, resolutionStatus, deletedAt], map: "booking_service_locations_scope_idx")
  @@map("booking_service_locations")
}
```

Add the inverse relations to `User`, `Shop`, and `BookingOrder`. Mirror the same names, columns, foreign keys, checks, and indexes in the SQL migration; add SQL `CHECK` constraints enforcing two uppercase ISO country-code characters, verified rows having both region codes, and admin2 never existing without admin1. Keep the database country-neutral for future imports; the first-release API validators are what restrict traffic to `JP`.

- [ ] **Step 4: Add deterministic catalogue generation and seed upserts**

Define the generated JSON shape in `administrative-region.ts`:

```ts
export type AdministrativeRegionLevel = "COUNTRY" | "ADMIN1" | "ADMIN2";
export interface AdministrativeRegionRef {
  countryCode: "JP";
  officialCode: string;
  level: AdministrativeRegionLevel;
  parentOfficialCode: string | null;
  nameJa: string;
  centroidLat: number | null;
  centroidLng: number | null;
  source: "MLIT N03";
  sourceVersion: "N03-20260101";
}
```

The generator must read `.data/n03/N03-20260101.geojson`, validate each `N03_007`, collapse duplicate MultiPolygon features by official code, derive prefecture code from the first two digits, sort `COUNTRY`, `ADMIN1`, `ADMIN2` by code, attach centroids from `japanCityData`, and write both the JSON catalogue and SHA-256 source/output checksums. Only `JA` locale rows are seeded from official names; other locales fall back to Japanese until formally supplied.

Add scripts:

```json
{
  "admin-regions:build": "tsx scripts/build-jp-administrative-catalog.ts",
  "admin-regions:verify": "tsx scripts/build-jp-administrative-catalog.ts --verify"
}
```

Run: `cd backend && npm run admin-regions:verify`

Expected: `Administrative catalogue verified: JP, 47 ADMIN1 regions, 1918 ADMIN2 regions, N03-20260101` with exit code 0.

- [ ] **Step 5: Generate Prisma client and rerun focused tests**

Run: `cd backend && npm run prisma:generate && npm test -- --runInBand tests/administrative-region-schema.test.ts tests/administrative-region-catalog.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260906120000_live_dashboard_administrative_regions/migration.sql backend/prisma/reference/jp-administrative-regions-2026.json backend/prisma/seed.ts backend/src/domain/administrative-region.ts backend/scripts/build-jp-administrative-catalog.ts backend/package.json backend/tests/administrative-region-schema.test.ts backend/tests/administrative-region-catalog.test.ts
git commit -m "feat: add Japan administrative region foundation"
```

### Task 2: Formal region lookup and verified shop assignment

**Files:**
- Create: `backend/src/repositories/administrative-region.repository.ts`
- Create: `backend/src/services/administrative-region.service.ts`
- Create: `backend/src/validators/administrative-region.validator.ts`
- Create: `backend/src/controllers/administrative-region.controller.ts`
- Create: `backend/src/routes/administrative-region.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Test: `backend/tests/administrative-region-validator.test.ts`
- Test: `backend/tests/administrative-region-api.test.ts`
- Test: `backend/tests/backoffice-api.test.ts`

**Interfaces:**
- Consumes: `AdministrativeRegionRef` and Prisma region models from Task 1.
- Produces: `AdministrativeRegionRepository.resolveVerifiedScope()`, `AdministrativeRegionService.listChildren()`, and `VerifiedServiceLocationInput`.

- [ ] **Step 1: Write failing hierarchy and API tests**

```ts
expect(administrativeRegionListQuerySchema.parse({ country: "JP" })).toEqual({ country: "JP" });
expect(administrativeRegionListQuerySchema.parse({ country: "JP", parent: "13" })).toEqual({ country: "JP", parent: "13" });
expect(administrativeRegionListQuerySchema.safeParse({ country: "US" }).success).toBe(false);

await request(app)
  .get("/api/v1/reference/administrative-regions?country=JP&parent=13&locale=ja")
  .expect(200)
  .expect(({ body }) => {
    expect(body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "13104", name: "新宿区", parentCode: "13", level: "admin2" })
    ]));
  });
```

Also add backoffice tests proving `{ serviceCountryCode: "JP", serviceAdmin1Code: "13", serviceAdmin2Code: "13104" }` writes one verified shop assignment and an invalid parent pair returns 400 without changing the shop.

- [ ] **Step 2: Run tests and confirm missing schemas/routes failure**

Run: `cd backend && npm test -- --runInBand tests/administrative-region-validator.test.ts tests/administrative-region-api.test.ts tests/backoffice-api.test.ts`

Expected: FAIL because the lookup and assignment contracts do not exist.

- [ ] **Step 3: Implement strict validators and repository/service boundary**

```ts
export const administrativeRegionListQuerySchema = z.object({
  country: z.literal("JP"),
  parent: z.string().regex(/^\d{2,5}$/).optional(),
  locale: z.enum(["zh-CN", "zh-TW", "ja", "en", "ko"]).default("ja")
}).strict();

export const verifiedServiceLocationSchema = z.object({
  serviceCountryCode: z.literal("JP"),
  serviceAdmin1Code: z.string().regex(/^\d{2}$/),
  serviceAdmin2Code: z.string().regex(/^\d{5}$/)
}).strict();

export interface VerifiedServiceLocationInput {
  countryCode: "JP";
  admin1Code: string;
  admin2Code: string;
}
```

`resolveVerifiedScope(input, tx?)` must query non-deleted admin1/admin2 rows, verify both are `JP`, verify admin2.parentId equals admin1.id, and return official Japanese names plus `N03-20260101`. `listChildren` returns only public codes/names/levels/centroids, choosing the requested locale and falling back to `JA` in SQL/service composition.

- [ ] **Step 4: Register the reference route and transactional shop assignment**

Register `GET /api/v1/reference/administrative-regions` before protected backoffice routes. Extend shop create/update bodies with the three fields as an all-or-none group. In the existing create/update transaction, upsert `ShopServiceLocation` only after hierarchy resolution; record `backoffice.shop.service_location.verify` with public shop number and region codes, not numeric relation IDs.

OpenAPI response item:

```ts
{
  code: { type: "string", example: "13104" },
  name: { type: "string", example: "新宿区" },
  level: { type: "string", enum: ["country", "admin1", "admin2"] },
  parentCode: { type: ["string", "null"], example: "13" },
  centroid: {
    oneOf: [
      { type: "object", required: ["lat", "lng"], properties: { lat: { type: "number" }, lng: { type: "number" } } },
      { type: "null" }
    ]
  }
}
```

- [ ] **Step 5: Run focused tests and OpenAPI test**

Run: `cd backend && npm test -- --runInBand tests/administrative-region-validator.test.ts tests/administrative-region-api.test.ts tests/backoffice-api.test.ts tests/openapi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/repositories/administrative-region.repository.ts backend/src/services/administrative-region.service.ts backend/src/validators/administrative-region.validator.ts backend/src/controllers/administrative-region.controller.ts backend/src/routes/administrative-region.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/src/validators/backoffice.validator.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts backend/tests/administrative-region-validator.test.ts backend/tests/administrative-region-api.test.ts backend/tests/backoffice-api.test.ts
git commit -m "feat: verify formal shop service regions"
```

### Task 3: Immutable booking service-location snapshots

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `backend/tests/booking-validator.test.ts`
- Test: `backend/tests/booking-service-location.test.ts`
- Test: `backend/tests/booking-api.test.ts`
- Test: `src/features/booking/api.test.ts`
- Test: `src/pages/user/FormalCheckoutPage.test.ts`

**Interfaces:**
- Consumes: `AdministrativeRegionRepository.resolveVerifiedScope()` and verified shop assignments from Task 2.
- Produces: `BookingServiceLocationInput`, `BookingCreateRepositoryInput.serviceLocation`, and one immutable `BookingServiceLocation` row per new booking.

- [ ] **Step 1: Write failing discriminated booking-validator tests**

```ts
const storeBooking = bookingCreateBodySchema.parse({
  serviceId: 1, scheduleSlotId: 2, fulfillmentMode: "store", paymentMethod: "onsite"
});
expect(storeBooking).not.toHaveProperty("serviceLocation");

const homeBooking = bookingCreateBodySchema.parse({
  serviceId: 1,
  scheduleSlotId: 2,
  fulfillmentMode: "home",
  paymentMethod: "onsite",
  serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
});
expect(homeBooking.serviceLocation.admin2Code).toBe("13104");
expect(bookingCreateBodySchema.safeParse({
  serviceId: 1, scheduleSlotId: 2, fulfillmentMode: "home", paymentMethod: "onsite"
}).success).toBe(false);
```

Repository tests must assert that the order and its location are created in the same transaction, a bad parent pair rolls back both, store mode resolves from `ShopServiceLocation`, and later shop-region edits do not mutate the booking snapshot.

- [ ] **Step 2: Run focused tests and verify contract failures**

Run: `cd backend && npm test -- --runInBand tests/booking-validator.test.ts tests/booking-service-location.test.ts tests/booking-api.test.ts`

Expected: FAIL because `serviceLocation` is not accepted or persisted.

- [ ] **Step 3: Implement the discriminated API contract**

```ts
const bookingBaseSchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  technicianServiceId: z.coerce.number().int().positive().optional(),
  scheduleSlotId: z.coerce.number().int().positive(),
  orderType: z.enum(["booking", "request"]).optional(),
  paymentMethod: z.enum(["onsite", "bank_transfer"]).default("onsite"),
  note: z.string().trim().max(500).optional(),
  affiliateCode: z.string().trim().min(1).max(40).optional(),
  affiliatePublicToken: z.string().trim().min(1).max(512).optional()
});

export const bookingCreateBodySchema = z.discriminatedUnion("fulfillmentMode", [
  bookingBaseSchema.extend({ fulfillmentMode: z.literal("store") }).strict(),
  bookingBaseSchema.extend({
    fulfillmentMode: z.literal("home"),
    serviceLocation: z.object({
      countryCode: z.literal("JP"),
      admin1Code: z.string().regex(/^\d{2}$/),
      admin2Code: z.string().regex(/^\d{5}$/)
    }).strict()
  }).strict()
]).refine((value) => Boolean(value.serviceId) !== Boolean(value.technicianServiceId), {
  message: "Exactly one of serviceId or technicianServiceId is required",
  path: ["serviceId"]
});
```

Mirror the same discriminated union in `CreateBookingInput`. Keep detailed home address in the existing note for fulfillment, but pass administrative codes separately.

- [ ] **Step 4: Persist the snapshot atomically**

Add this repository input:

```ts
export type BookingServiceLocationInput =
  | { source: "SHOP_LOCATION" }
  | {
      source: "CUSTOMER_SERVICE_LOCATION";
      countryCode: "JP";
      admin1Code: string;
      admin2Code: string;
    };
```

Inside the existing `BookingRepository.createBooking` transaction, resolve store mode from `slot.shop.serviceLocation`; resolve home mode from the supplied codes; create the booking; then create exactly one snapshot using official names. If the store has no verified assignment, throw stable `error.booking.service_location_unresolved` with HTTP 409. Never add update/delete methods for the snapshot to the normal booking repository port.

- [ ] **Step 5: Add formal selectors to checkout and run frontend tests**

For home mode, load prefectures with `country=JP`, then load municipalities with the selected prefecture code (for example `country=JP&parent=13`). Disable submit until both select values and the detailed address are present. On switching to store mode, clear structured home selection from the submitted payload without deleting the typed address from local component state.

Run: `npm test -- src/features/booking/api.test.ts src/pages/user/FormalCheckoutPage.test.ts && npm run i18n:audit`

Expected: PASS and i18n audit exits 0.

- [ ] **Step 6: Run backend tests and commit Task 3**

Run: `cd backend && npm test -- --runInBand tests/booking-validator.test.ts tests/booking-service-location.test.ts tests/booking-api.test.ts tests/openapi.test.ts`

Expected: PASS.

```bash
git add backend/src/validators/booking.validator.ts backend/src/services/booking.service.ts backend/src/repositories/booking.repository.ts backend/src/routes/booking.routes.ts backend/src/api/openapi.ts backend/tests/booking-validator.test.ts backend/tests/booking-service-location.test.ts backend/tests/booking-api.test.ts src/features/booking/api.ts src/features/booking/api.test.ts src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts src/i18n/translations.ts
git commit -m "feat: snapshot booking service regions"
```

### Task 4: Safe historical backfill

**Files:**
- Create: `backend/scripts/backfill-booking-service-locations.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/booking-location-backfill.test.ts`

**Interfaces:**
- Consumes: verified shop assignments and booking location tables.
- Produces: `buildBookingLocationBackfillPlan(client)` and `applyBookingLocationBackfill(client, plan, runId)`.

- [ ] **Step 1: Write failing classification and idempotency tests**

```ts
expect(plan.summary).toEqual({
  storeVerified: 2,
  homeVerified: 0,
  unresolved: 1,
  alreadyPresent: 1
});
await applyBookingLocationBackfill(client, plan, "test-run-1");
await applyBookingLocationBackfill(client, await buildBookingLocationBackfillPlan(client), "test-run-2");
expect(await client.bookingServiceLocation.count()).toBe(4);
```

Fixtures must cover: verified store order, unverified store order, home note containing an address but no structured evidence, already-backfilled order, and a failed transaction leaving zero partial rows.

- [ ] **Step 2: Run the test and confirm the script is missing**

Run: `cd backend && npm test -- --runInBand tests/booking-location-backfill.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement preview/apply safety**

The script must require `FORMAL_BACKEND_ENV_FILE`, reject environment/database/host values containing `prod`, `production`, `staging`, or `live`, default to preview, require both `--apply` and a count equal to the immediately preceding preview (for example preview count 123 requires `--confirm-count=123`) for writes, and print JSON summary. Store orders copy verified shop codes/names. Home orders without an existing structured record become `UNRESOLVED`; never parse the free-text note. Use `createMany({ skipDuplicates: true })` in bounded batches of 500 and a run-specific audit record. Every apply writes a manifest containing the exact newly inserted booking-order IDs and row checksums; `--restore-run=20260906T120000Z-abc123` may soft-delete only rows whose current checksum still matches that manifest and must refuse drifted rows.

Add:

```json
{
  "backfill:booking-service-locations": "tsx scripts/backfill-booking-service-locations.ts"
}
```

- [ ] **Step 4: Run preview tests and commit Task 4**

Run: `cd backend && npm test -- --runInBand tests/booking-location-backfill.test.ts`

Expected: PASS.

```bash
git add backend/scripts/backfill-booking-service-locations.ts backend/tests/booking-location-backfill.test.ts backend/package.json
git commit -m "feat: add safe booking location backfill"
```

### Task 5: Regional live-snapshot repository

**Files:**
- Create: `backend/src/domain/live-dashboard.ts`
- Create: `backend/src/repositories/live-dashboard.repository.ts`
- Test: `backend/tests/live-dashboard.repository.test.ts`

**Interfaces:**
- Consumes: booking location snapshots, existing dashboard/finance/ranking repositories, `DashboardWindow`.
- Produces: `LiveDashboardRepository.getSnapshotFacts(input)` and `LiveDashboardSnapshotFacts`.

- [ ] **Step 1: Write failing nationwide/Tokyo/Shinjuku repository tests**

```ts
const jp = await repository.getSnapshotFacts({
  scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
  period: "today",
  evaluatedAt
});
const tokyo = await repository.getSnapshotFacts({
  scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
  period: "today",
  evaluatedAt
});
const shinjuku = await repository.getSnapshotFacts({
  scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
  period: "today",
  evaluatedAt
});

expect(jp.coverage).toEqual({ total: 4, attributed: 3, unresolved: 1, completenessPercent: 75 });
expect(tokyo.orders.total).toBe(2);
expect(shinjuku.orders.total).toBe(1);
expect(jp.evaluatedAt).toEqual(tokyo.evaluatedAt);
```

Add fixtures proving refunded/reversed payments are excluded, JPY/NDP/Test NDP are separate, TOP10 limits are enforced, realtime orders are page 1/page size 20, and every query includes `deleted_at IS NULL`.

For non-order headline entities, keep the existing creation-date definition and apply geography through formal service occurrence: a newly created customer or technician contributes to a prefecture/municipality only when that identity has a non-deleted booking service-location snapshot in the selected scope. Identities with no attributable service occurrence remain visible only in the Japan-wide count. Tests must make this distinction explicit so a future implementation cannot fall back to profile city text.

- [ ] **Step 2: Run the test and confirm missing repository failure**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard.repository.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Define exact read-model types**

```ts
export type LiveDashboardPeriod = "today" | "last7days" | "last30days";
export interface LiveDashboardScope {
  countryCode: "JP";
  admin1Code: string | null;
  admin2Code: string | null;
}
export interface LiveMoney { jpy: number; ndp: number; testNdp: number; }
export interface LiveDashboardInput {
  scope: LiveDashboardScope;
  period: LiveDashboardPeriod;
  evaluatedAt: Date;
}
export interface LiveDashboardCoverage {
  total: number;
  attributed: number;
  unresolved: number;
  completenessPercent: number;
}
```

Define `LiveDashboardSnapshotFacts` with exact keys: `evaluatedAt`, `scope`, `children`, `headline`, `confirmedPayments`, `orders`, `realtimeOrders`, `activity`, `trend`, `serviceRanking`, `technicianRanking`, and `coverage`.

- [ ] **Step 4: Implement shared region SQL scope and one evaluation boundary**

Create one helper returning a Prisma SQL fragment:

```ts
const locationScope = (scope: LiveDashboardScope, alias = "location") => Prisma.sql`
  ${Prisma.raw(alias)}.country_code = ${scope.countryCode}
  ${scope.admin1Code ? Prisma.sql`AND ${Prisma.raw(alias)}.admin1_region_code = ${scope.admin1Code}` : Prisma.empty}
  ${scope.admin2Code ? Prisma.sql`AND ${Prisma.raw(alias)}.admin2_region_code = ${scope.admin2Code}` : Prisma.empty}
  AND ${Prisma.raw(alias)}.deleted_at IS NULL
`;
```

All order/payment/ranking queries must join `booking_service_locations` and use this helper. Nationwide scope includes `UNRESOLVED`; narrower scopes require `VERIFIED`. Reuse existing status/payment formula helpers or delegate to existing readers; do not copy different completion or finance semantics.

- [ ] **Step 5: Run repository tests and commit Task 5**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard.repository.test.ts tests/dashboard-finance.repository.test.ts tests/dashboard-operations-finance.repository.test.ts`

Expected: PASS.

```bash
git add backend/src/domain/live-dashboard.ts backend/src/repositories/live-dashboard.repository.ts backend/tests/live-dashboard.repository.test.ts
git commit -m "feat: compose regional live dashboard facts"
```

### Task 6: Validated cached snapshot API

**Files:**
- Create: `backend/src/validators/live-dashboard.validator.ts`
- Create: `backend/src/services/live-dashboard-cache.service.ts`
- Create: `backend/src/services/live-dashboard.service.ts`
- Create: `backend/src/controllers/live-dashboard.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/live-dashboard-validator.test.ts`
- Test: `backend/tests/live-dashboard-cache.test.ts`
- Test: `backend/tests/live-dashboard.service.test.ts`
- Test: `backend/tests/live-dashboard-api.test.ts`
- Test: `backend/tests/live-dashboard-openapi.test.ts`

**Interfaces:**
- Consumes: `LiveDashboardRepository.getSnapshotFacts()`.
- Produces: `GET /api/v1/backoffice/dashboard/live-snapshot` and `LiveDashboardCache.getOrCreate(scopeKey, factory)`.

- [ ] **Step 1: Write failing validator, cache, API, permission, and mismatch tests**

```ts
expect(liveDashboardQuerySchema.parse({ country: "JP" })).toEqual({ country: "JP", period: "today" });
expect(liveDashboardQuerySchema.safeParse({ country: "JP", admin2: "13104" }).success).toBe(false);
expect(liveDashboardQuerySchema.safeParse({ country: "US" }).success).toBe(false);

const [left, right] = await Promise.all([
  cache.getOrCreate("JP:-:-:today", factory),
  cache.getOrCreate("JP:-:-:today", factory)
]);
expect(factory).toHaveBeenCalledTimes(1);
expect(left).toEqual(right);
```

Supertest cases: 401 unauthenticated, 403 missing `backoffice:dashboard:read`, 400 illegal hierarchy, 200 success, no PII keys recursively, and stable `scope` echo.

- [ ] **Step 2: Run focused tests and confirm missing API/cache failures**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard-validator.test.ts tests/live-dashboard-cache.test.ts tests/live-dashboard.service.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-openapi.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement query validation and cache contract**

```ts
export const liveDashboardQuerySchema = z.object({
  country: z.literal("JP"),
  admin1: z.string().regex(/^\d{2}$/).optional(),
  admin2: z.string().regex(/^\d{5}$/).optional(),
  period: z.enum(["today", "last7days", "last30days"]).default("today")
}).strict().superRefine((value, context) => {
  if (value.admin2 && !value.admin1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["admin1"], message: "admin1 is required when admin2 is present" });
  }
});
```

Cache keys are built by `liveDashboardCacheKey(scope)` using colon-separated normalized values; for Shinjuku today the exact key is `dashboard:live:v1:JP:13:13104:today`, and missing levels use `-`. Redis TTL is 300 seconds with serialized `cachedAt`; in-process single-flight Map entries are removed in `finally`. On Redis unavailability, compute once through single-flight and return `cacheStatus: "degraded"`; never return invented data.

- [ ] **Step 4: Implement service/controller/route/OpenAPI**

The service resolves hierarchy before repository access, records `backoffice.dashboard.live_snapshot.read`, composes locale-aware breadcrumbs, and returns:

```ts
{
  scope,
  evaluatedAt: facts.evaluatedAt.toISOString(),
  cachedAt: cachedAt.toISOString(),
  freshnessSeconds,
  cacheStatus,
  children,
  headline,
  confirmedPayments,
  orders,
  realtimeOrders: { list, total, page: 1, page_size: 20 },
  activity,
  trend,
  serviceRanking,
  technicianRanking,
  coverage
}
```

Register route ordering so `/dashboard/live-snapshot` is declared before `/dashboard/metrics/:metricKey`. Apply `authenticate()`, `authorize(BACKOFFICE_ROUTE_PERMISSIONS.dashboard)`, and `validateRequest`.

- [ ] **Step 5: Run focused tests and commit Task 6**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard-validator.test.ts tests/live-dashboard-cache.test.ts tests/live-dashboard.service.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-openapi.test.ts tests/security-middleware.test.ts`

Expected: PASS.

```bash
git add backend/src/validators/live-dashboard.validator.ts backend/src/services/live-dashboard-cache.service.ts backend/src/services/live-dashboard.service.ts backend/src/controllers/live-dashboard.controller.ts backend/src/routes/backoffice.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/live-dashboard-validator.test.ts backend/tests/live-dashboard-cache.test.ts backend/tests/live-dashboard.service.test.ts backend/tests/live-dashboard-api.test.ts backend/tests/live-dashboard-openapi.test.ts
git commit -m "feat: serve cached regional live snapshots"
```

### Task 7: Shared SSE invalidation and compact order events

**Files:**
- Create: `backend/src/services/live-dashboard-event.gateway.ts`
- Modify: `backend/src/domain/live-dashboard.ts`
- Modify: `backend/src/services/live-dashboard.service.ts`
- Modify: `backend/src/controllers/live-dashboard.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/live-dashboard-events.test.ts`
- Test: `backend/tests/live-dashboard-api.test.ts`

**Interfaces:**
- Consumes: existing `RedisRealtimeEventBus` pattern and booking post-commit lifecycle notifications.
- Produces: `GET /api/v1/backoffice/dashboard/live-events`, `LiveDashboardEventPublisher.publish(event)`, monotonic event IDs, and cache invalidation.

- [ ] **Step 1: Write failing fan-out, privacy, heartbeat, and backpressure tests**

```ts
gateway.publish({
  id: "1700000000000-1",
  type: "order.changed",
  scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
  payload: { orderNo: "ND202609060001", status: "confirmed", serviceName: "整体", amountJpy: 9000 },
  createdAt: "2026-09-06T00:00:00.000Z"
});
expect(shinjukuResponse.write).toHaveBeenCalledWith(expect.stringContaining("event: order.changed"));
expect(osakaResponse.write).not.toHaveBeenCalledWith(expect.stringContaining("ND202609060001"));
expect(JSON.stringify(shinjukuResponse.write.mock.calls)).not.toMatch(/customer|address|phone|note/i);
```

Also assert one Redis subscription per process, 30-second heartbeat comments, `Last-Event-ID` accepted, a false `response.write()` disconnects the slow client, and invalidation deletes only matching country/ancestor region cache keys.

- [ ] **Step 2: Run tests and confirm missing gateway failure**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement event contract and shared transport**

```ts
export type LiveDashboardEvent =
  | { id: string; type: "order.changed"; scope: LiveDashboardScope; payload: { orderNo: string; status: string; serviceName: string; amountJpy: number }; createdAt: string }
  | { id: string; type: "metrics.invalidate"; scope: LiveDashboardScope; payload: { sections: Array<"headline" | "orders" | "trend" | "rankings"> }; createdAt: string };
```

Use one Redis pub/sub channel `needo:dashboard:live:v1`. Each app process owns one subscriber and filters events against connected scope keys. Cap serialized events at 32 KiB and queued replay history at 100 events/5 minutes. Event IDs use Redis stream-style timestamp-sequence strings. Send `retry: 5000`, one `connected` event, and `: heartbeat` every 30 seconds.

- [ ] **Step 4: Publish only after committed booking/payment/status mutations**

Add a best-effort publisher dependency to `BookingService`. After repository mutation returns successfully, publish `order.changed` plus `metrics.invalidate` using the immutable booking location. Publishing failure is logged and must not roll back the committed booking. Payment confirmation/refund and order status transitions use the same hook.

- [ ] **Step 5: Register protected fetch-stream endpoint and shutdown**

The controller keeps the Express response open and calls `liveDashboardService.subscribe(actor, context, query, lastEventId, response)`. Route authentication stays Bearer-header based; never support token query parameters. `server.ts` closes the event gateway and dedicated Redis publisher/subscriber clients during graceful shutdown.

- [ ] **Step 6: Run tests and commit Task 7**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts tests/booking-service.test.ts tests/manual-payment-service.test.ts tests/manual-payment-api.test.ts tests/openapi.test.ts`

Expected: PASS.

```bash
git add backend/src/domain/live-dashboard.ts backend/src/services/live-dashboard-event.gateway.ts backend/src/services/live-dashboard.service.ts backend/src/controllers/live-dashboard.controller.ts backend/src/routes/backoffice.routes.ts backend/src/services/booking.service.ts backend/src/app.ts backend/src/server.ts backend/src/api/openapi.ts backend/tests/live-dashboard-events.test.ts backend/tests/live-dashboard-api.test.ts
git commit -m "feat: stream regional dashboard changes"
```

### Task 8: Real-flow checker, documentation, and microstep-A acceptance

**Files:**
- Create: `backend/scripts/check-live-dashboard-flow.ts`
- Modify: `backend/package.json`
- Modify: `docs/backoffice-real-data.md`
- Modify: `README.md`
- Test: `backend/tests/live-dashboard-flow-script.test.ts`

**Interfaces:**
- Consumes: migration, catalogue, booking location, snapshot, cache, and SSE contracts from Tasks 1–7.
- Produces: rollback-safe `npm run check:live-dashboard` evidence and a handoff gate for microstep B.

- [ ] **Step 1: Write failing checker safety test**

```ts
expect(source).toContain("FORMAL_BACKEND_ENV_FILE is required");
expect(source).toContain("LIVE_DASHBOARD_CHECK_ROLLBACK");
expect(source).toContain("dashboard:live:v1:");
expect(source).toContain("backoffice:dashboard:read");
expect(source).not.toContain("Math.random");
```

- [ ] **Step 2: Run the test and confirm the checker is missing**

Run: `cd backend && npm test -- --runInBand tests/live-dashboard-flow-script.test.ts`

Expected: FAIL with missing script.

- [ ] **Step 3: Implement the rollback-safe checker and docs**

The checker must require a non-production formal env file, create isolated JP/Tokyo/Shinjuku and unresolved fixtures in one interactive transaction, validate database rows directly, request nationwide/Tokyo/Shinjuku snapshots through the formal service, assert Redis cache keys and SSE privacy, then throw/catch the private `LIVE_DASHBOARD_CHECK_ROLLBACK` sentinel so Prisma rolls back the transaction, and delete only run-prefixed Redis keys. Print separate JSON sections for schema, booking location, regional aggregates, finance separation, cache, SSE, cleanup, and final status.

Add:

```json
{
  "check:live-dashboard": "tsx scripts/check-live-dashboard-flow.ts"
}
```

Document endpoint parameters, locale fallback, backfill preview/apply commands, cache cadence, event types, privacy exclusions, and the explicit statement “microstep A contains no live-screen page”.

- [ ] **Step 4: Run automated acceptance**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- --runInBand tests/administrative-region-schema.test.ts tests/administrative-region-catalog.test.ts tests/administrative-region-validator.test.ts tests/administrative-region-api.test.ts tests/booking-service-location.test.ts tests/booking-location-backfill.test.ts tests/live-dashboard-validator.test.ts tests/live-dashboard.repository.test.ts tests/live-dashboard.service.test.ts tests/live-dashboard-cache.test.ts tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-openapi.test.ts tests/live-dashboard-flow-script.test.ts
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Run formal MySQL/Redis acceptance only with a complete non-production env**

Run: `cd backend && FORMAL_BACKEND_ENV_FILE=.env.dev npm run check:live-dashboard`

Expected: final JSON contains `"status":"passed"` and `"cleanup":{"database":"clean","redis":"clean"}`. If the formal env is incomplete, report the exact missing gate and do not substitute an in-memory test.

- [ ] **Step 6: Commit Task 8**

```bash
git add backend/scripts/check-live-dashboard-flow.ts backend/tests/live-dashboard-flow-script.test.ts backend/package.json docs/backoffice-real-data.md README.md
git commit -m "docs: verify live dashboard data foundation"
```

## Microstep-A Completion Gate

Do not start the UI plan until all of these are evidenced separately:

- Migration generated, reviewed, and applied to the intended non-production database.
- JP catalogue counts/checksums verified and Tokyo 23-ward hierarchy confirmed.
- New store and home bookings create immutable service-location snapshots.
- Historical backfill preview is reviewed; any apply run reports exact verified/unresolved counts.
- Nationwide, Tokyo, and Shinjuku snapshots match direct MySQL queries.
- Redis cache single-flight and invalidation pass without request storms.
- Bearer-authorized SSE passes permission, privacy, heartbeat, replay, and backpressure tests.
- Backend lint/test/build and frontend booking tests/i18n audit pass.
- Microstep A is committed independently; remote push, deployment, and production migration remain separately reported facts.
