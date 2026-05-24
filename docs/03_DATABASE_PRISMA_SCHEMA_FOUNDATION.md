# 03 — Prisma / MySQL / Redis 数据库地基

> 本文档用于指导 Codex 执行 Step 03。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

建立 Prisma、MySQL、Redis 的正式地基，定义通用数据库规则、迁移流程和 repository 基础，但不创建业务大模型。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/02_BACKEND_SCAFFOLD_ENV_DOCKER.md`

---

## 3. 本步必须做

- 安装并配置 Prisma。
- 创建 backend/prisma/schema.prisma。
- 配置 MySQL 8.0 UTF8MB4。
- 配置 Prisma client 实例。
- 配置 Redis client。
- 定义 BaseRepository / pagination helper / soft delete helper。
- 创建第一版空 migration 或基础系统表 migration。
- 创建 docs/database.md 初版。

---

## 4. 本步禁止做

- 不要创建完整订单/钱包/IM/Social 表。
- 不要写 User Management seed。
- 不要写 Auth API。
- 不要连接前端。

---

## 5. 交付物

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/prisma/client.ts`
- `backend/src/config/database.ts`
- `backend/src/config/redis.ts`
- `backend/src/repositories/base.repository.ts`
- `backend/src/utils/pagination.ts`
- `docs/database.md`

---

## 6. 验收标准

- [ ] prisma generate 成功。
- [ ] prisma migrate dev 成功。
- [ ] Redis 连接健康检查可用。
- [ ] 数据库文档说明 migration 使用方法。
- [ ] 没有业务逻辑混入 repository。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/03_DATABASE_PRISMA_SCHEMA_FOUNDATION.md。本次只执行 Step 03：Prisma / MySQL / Redis 数据库地基。请配置 Prisma、MySQL 8.0 UTF8MB4、Redis client、Prisma client、基础 repository helper、分页 helper、软删除规则和 docs/database.md。不要创建 Booking、NDP、IM、Social 等业务表，不要开发 Auth API，不要连接前端。完成后运行 prisma generate、prisma migrate dev、lint、test、build。
```

---

## 8. 完成后必须回复的内容

Codex 完成本步后，必须输出：

1. 本次修改的文件清单。
2. 新增或修改的接口清单。
3. 新增或修改的数据表 / migration 清单。
4. 运行过的命令和结果。
5. 已通过的验收项。
6. 未完成项与原因。

若某项没有完成，必须明确说明，不得假装完成。
