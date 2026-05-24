# 02 — 后端工程底座、环境变量、Docker Dev

> 本文档用于指导 Codex 执行 Step 02。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

建立可运行的 backend/ 工程，但不写具体业务模块。只做服务启动、配置、日志、健康检查、基础中间件和 Docker dev。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/01_REPO_AUDIT_AND_BASELINE.md`

---

## 3. 本步必须做

- 新增 backend/ 目录。
- 初始化 Node.js 22 + Express + TypeScript strict。
- 增加 config/env 读取，禁止硬编码。
- 接入 helmet、cors 白名单、rate limit、统一错误处理。
- 增加 health check：GET /api/v1/health。
- 增加 Swagger/OpenAPI 基础入口。
- 增加 Dockerfile 与 docker-compose.dev.yml，包含 backend、mysql、redis。
- 补齐 .env.dev.example。

---

## 4. 本步禁止做

- 不要写 Auth。
- 不要写 User Management。
- 不要写 Booking/NDP/IM/Social。
- 不要创建业务表。
- 不要改前端 UI。

---

## 5. 交付物

- `backend/package.json`
- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/config/*`
- `backend/src/middlewares/*`
- `backend/src/routes/health.routes.ts`
- `backend/src/api/openapi.ts`
- `backend/Dockerfile`
- `docker/docker-compose.dev.yml`
- `.env.dev.example 或 backend/.env.dev.example`

---

## 6. 验收标准

- [ ] backend 可以单独启动。
- [ ] GET /api/v1/health 返回统一响应结构。
- [ ] 配置全部来自环境变量。
- [ ] Docker dev 可以启动 mysql/redis/backend。
- [ ] 后端 lint/test/build 通过。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/00_MASTER_MICRO_STEP_PLAN.md、docs/02_BACKEND_SCAFFOLD_ENV_DOCKER.md。本次只执行 Step 02：后端工程底座、环境变量、Docker Dev。请新增 backend/ 工程，使用 Node.js 22 + Express + TypeScript strict，配置 env、统一响应、统一错误处理、helmet、CORS 白名单、rate limit、日志、Swagger/OpenAPI 基础入口和 GET /api/v1/health。请提供 Dockerfile 与 docker/docker-compose.dev.yml，dev compose 至少包含 backend、mysql、redis。不要写 Auth、User Management、Booking、NDP、IM、Social，也不要改前端 UI。完成后运行 backend lint/test/build，并更新 README 或 docs/environment.md。
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
