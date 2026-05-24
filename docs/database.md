# Database

## Step 03 Scope

Step 03 establishes the database foundation only. It configures Prisma, MySQL 8.0,
Redis, pagination helpers, repository base helpers, and soft delete conventions.

This step does not create Booking, NDP, IM, Social, Auth, User Management, or
other business tables. The only migration in this step is an empty foundation
migration so Prisma can initialize migration history safely.

## Step 04 Scope

Step 04 adds the User Management database layer only. It creates the account,
identity, role, permission, login-log, and audit-log tables, plus the initial
system role and permission seed.

This step does not create Auth APIs, OTP flows, frontend login pages, Booking,
NDP, IM, Social, or any business workflow tables.

## Step 05 Scope

Step 05 adds Auth, OTP, JWT, Refresh Token, Logout, and `/auth/me` behavior
against the Step 04 User Management tables. It writes `login_logs` for login
attempts and `audit_logs` for logout, but it does not add or modify database
tables and does not create a new Prisma migration.

## User Management Tables

Step 04 migration:

```text
backend/prisma/migrations/20260525010000_step04_user_management_seed/migration.sql
```

Tables introduced:

- `users`: login account, email/phone identifiers, bcrypt password hash, active
  status, last login timestamp, and soft-delete metadata.
- `user_identities`: account identity records such as `platform`, `customer`,
  `technician`, `merchant`, `broker`, or `scout`, with optional scoped access.
- `roles`: system and future custom RBAC roles.
- `permissions`: permission catalog for API, menu, page, and button controls.
- `user_roles`: scoped user-to-role assignments.
- `role_permissions`: role-to-permission assignments.
- `login_logs`: login attempt audit trail for later Auth work.
- `audit_logs`: actor/action/target audit trail for protected mutations.

All Step 04 tables include `id`, `createdAt`, `updatedAt`, and `deletedAt`
fields mapped to snake_case columns. Association columns are indexed, and
soft-deleted rows remain available for audit and restore flows.

## Runtime Services

- Database: MySQL 8.0.
- Character set: `utf8mb4`.
- Collation: `utf8mb4_unicode_ci`.
- Redis: Redis 7.2 for cache/session-style infrastructure in later steps.
- Prisma schema: `backend/prisma/schema.prisma`.
- Prisma config: `backend/prisma.config.ts`.
- Prisma MySQL runtime adapter: `@prisma/adapter-mariadb`.

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

Before running the Step 04 seed, set a local super-admin password:

```bash
ADMIN_DEFAULT_PASSWORD=replace-with-a-local-secret
```

The seed also supports optional `ADMIN_DEFAULT_EMAIL` and
`ADMIN_DEFAULT_USERNAME`. The password is never hardcoded in source and is stored
only as a bcrypt hash with 12 rounds.

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

Run the Step 04 migration after updating the User Management schema:

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:migrate:dev
```

Run the User Management seed:

```bash
cd backend
ENV_FILE=.env.dev ADMIN_DEFAULT_PASSWORD=replace-with-a-local-secret npm run prisma:seed
```

Do not edit an applied migration. If schema changes are required in a future
step, create a new migration.

## Seeded User Management Data

`backend/prisma/seed.ts` initializes:

- Roles: `admin`, `operator`, `finance`, `support`, `merchant_owner`,
  `merchant_staff`, `technician`, `customer`, `broker`, `scout`, `viewer`.
- Permission modules: `auth`, `user`, `role`, `permission`, `menu`,
  `dashboard`.
- Super administrator account: default email `admin@example.com`, platform
  identity, global admin role, and bcrypt-hashed password from
  `ADMIN_DEFAULT_PASSWORD`.

The seed is idempotent: rerunning it restores deleted system roles, permissions,
role-permission assignments, the admin account, the admin platform identity, and
the admin role assignment.

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
