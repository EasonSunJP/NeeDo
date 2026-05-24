# Database

## Step 03 Scope

Step 03 establishes the database foundation only. It configures Prisma, MySQL 8.0,
Redis, pagination helpers, repository base helpers, and soft delete conventions.

This step does not create Booking, NDP, IM, Social, Auth, User Management, or
other business tables. The only migration in this step is an empty foundation
migration so Prisma can initialize migration history safely.

## Runtime Services

- Database: MySQL 8.0.
- Character set: `utf8mb4`.
- Collation: `utf8mb4_unicode_ci`.
- Redis: Redis 7.2 for cache/session-style infrastructure in later steps.
- Prisma schema: `backend/prisma/schema.prisma`.
- Prisma config: `backend/prisma.config.ts`.

The Docker dev stack already starts MySQL with UTF8MB4 defaults:

```bash
docker compose --env-file backend/.env.dev -f docker/docker-compose.dev.yml up --build
```

## Environment

Create a local backend env file before running Prisma commands:

```bash
cd backend
cp .env.dev.example .env.dev
```

Prisma reads `.env`, `.env.dev`, or the file named by `ENV_FILE`.

For local host-based Prisma commands, `DATABASE_URL` should point to the exposed
MySQL host port. For Docker-internal backend runtime, it can point to the compose
service name `mysql`.

## Prisma Commands

Generate Prisma Client:

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:generate
```

Run development migrations:

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:migrate:dev -- --name step03_database_foundation
```

Do not edit an applied migration. If schema changes are required in a future
step, create a new migration.

## Soft Delete Rules

Business tables introduced in future steps must include:

- `id`
- `createdAt`
- `updatedAt`
- `deletedAt`

Deletes are soft deletes by default. Repository list and lookup helpers must add
`deletedAt: null`, and delete flows must update `deletedAt` instead of removing
rows.

## Pagination Rules

List APIs must be paginated. The backend helper normalizes invalid page input,
caps page size at 100, and returns the shared API shape:

```json
{
  "list": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

## Repository Boundary

`BaseRepository` only provides data-access helpers:

- `findById`
- `findPage`
- `softDelete`

Business logic, validation, state machines, Auth, RBAC, and audit behavior belong
in later steps and must not be mixed into the base repository.
