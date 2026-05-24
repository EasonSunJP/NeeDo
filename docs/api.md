# NeeDo API Contract

> Current formal backend prefix: `/api/v1`.

All formal APIs return the shared envelope:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

Paginated list APIs return:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

## Step 08 Core Read APIs

These APIs are read-only and database-backed. They do not create bookings, schedules, wallets, IM, Social records, or frontend mock replacements.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/v1/categories` | Paginated public category list | Public |
| `GET` | `/api/v1/services` | Paginated public service cards | Public |
| `GET` | `/api/v1/services/:id` | Public service detail | Public |
| `GET` | `/api/v1/home/recommendations` | Home recommendation rows | Public |
| `GET` | `/api/v1/search` | Service search with filters | Public |
| `GET` | `/api/v1/shops/:id` | Public shop detail | Public |
| `GET` | `/api/v1/technicians/:id` | Public technician detail | Public |
| `GET` | `/api/v1/profiles/customers/:id` | Public customer profile without account credentials | Public |

### Common Query Parameters

`GET /categories`

| Name | Type | Notes |
|---|---|---|
| `page` | integer | Defaults to `1`. |
| `pageSize` | integer | Defaults to `20`, max `100`. |
| `parentId` | integer | Optional category parent filter. |

`GET /services` and `GET /search`

| Name | Type | Notes |
|---|---|---|
| `keyword` | string | Matches service, category, shop, or technician text. |
| `categoryId` | integer | Filters by category. |
| `shopId` | integer | Filters by shop. |
| `technicianId` | integer | Filters by technician profile. |
| `city` | string | Filters by city. |
| `serviceMode` | string | Example: `store`, `onsite`. |
| `minPrice` / `maxPrice` | number | Validated so min cannot exceed max. |
| `sort` | enum | `recommended`, `rating_desc`, `price_asc`, `price_desc`, `newest`. |
| `page` / `pageSize` | integer | Same pagination contract as above. |

`GET /home/recommendations`

| Name | Type | Notes |
|---|---|---|
| `city` | string | Optional city filter for service/shop/technician rows. |
| `limit` | integer | Defaults to `6`, max `20`. |

### Stable DTOs

`Category`

- `id`, `code`, `name`, `nameJa`, `nameEn`, `parentId`, `iconUrl`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`

`ServiceCard`

- `id`, `name`, `description`, `category`, `shop`, `technician`, `city`, `priceAmount`, `currency`, `durationMinutes`, `coverUrl`, `reviewSummary`

`ShopDetail`

- Includes `ShopCard` fields plus `description`, `phone`, `latitude`, `longitude`, `mediaAssets`, `services`, `technicians`, `createdAt`, `updatedAt`

`TechnicianDetail`

- Includes `TechnicianCard` fields plus `bio`, `serviceArea`, `yearsExperience`, `mediaAssets`, `services`, `createdAt`, `updatedAt`

`CustomerProfile`

- `id`, `displayName`, `city`, `bio`, `avatarUrl`, `membershipLevel`, `reviewSummary`, `createdAt`, `updatedAt`
- Account credentials and private fields such as `email`, `phone`, `passwordHash`, tokens, and OTP values are never returned.

Full machine-readable OpenAPI is served at `/api/v1/openapi.json` when `OPENAPI_ENABLED=true`.
