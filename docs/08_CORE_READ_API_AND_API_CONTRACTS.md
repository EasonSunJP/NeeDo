# 08 — 基础业务读 API 与 API 契约

> 本文档用于指导 Codex 执行 Step 08。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

先做只读业务数据 API，为首页、搜索、分类、资料详情提供真实数据契约，不做交易写流程。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/MOCK_RETIREMENT_MAP.md`
- `docs/07_FRONTEND_AUTH_PERMISSION_INTEGRATION.md`

---

## 3. 本步必须做

- 定义基础业务模型：Category、Service、Shop、TechnicianProfile、CustomerProfile、MediaAsset、ReviewSummary。
- 实现只读接口：分类、首页推荐、搜索、店铺详情、技师详情、用户资料。
- 实现分页、筛选、排序。
- 准备 seed 数据，但不得作为 fake API；seed 用于开发环境真实数据库。
- 更新 OpenAPI。
- 提供 API adapter 契约给前端。

---

## 4. 本步禁止做

- 不要做下单。
- 不要做钱包。
- 不要做排班写入。
- 不要做 IM/Social。
- 不要批量替换全部前端 mock。

---

## 5. 交付物

- 业务基础 Prisma models
- `category/service/shop/technician/profile repository/service/controller/routes`
- OpenAPI 更新
- `docs/api.md 更新`
- `tests/core-read-api.test.ts`

---

## 6. 验收标准

- [ ] 只读 API 可以返回真实数据库数据。
- [ ] 所有列表分页。
- [ ] 搜索支持基本筛选。
- [ ] 详情页 API 字段稳定。
- [ ] 测试通过。

### 店铺可见性补充契约（2026-09-13）

- `Shop.visibility` 是店铺及店铺所属服务的唯一可见性来源，取值严格限定为 `public | privateAll | limited | network`。
- 匿名访问只允许 `public`；店主始终可见；`limited` 增加双向有效好友；`network` 再增加所选身份下的正式业务关系与介绍人关系。
- 搜索、首页、列表在数据库分页和计数前应用同一 Prisma 条件；详情、收藏、分享、预约入口、可用时段和预约创建复用同一直接判定，拒绝时返回 404，避免泄露资源存在性。
- 技师和顾客的个人资料可见性保持独立，但技师详情及距离计算不得泄露无权查看的关联店铺或店铺服务。
- 带 bearer 的可见性读响应使用 `private, no-store`；匿名可见性读使用 `public, no-cache` 并以 `Vary: Authorization` 隔离变体，每次复用前必须向源站重新验证，确保公开转私密立即生效。
- 商户通过 `GET/PUT /api/v1/merchant-admin/shops/:shopId/visibility` 读写当前店铺；写入必须同时通过店铺身份范围、RBAC、Zod 和同事务审计。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/08_CORE_READ_API_AND_API_CONTRACTS.md。本次只执行 Step 08：基础业务读 API 与 API 契约。请实现 Category、Service、Shop、TechnicianProfile、CustomerProfile、MediaAsset、ReviewSummary 等基础模型和只读 API，包括分类、首页推荐、搜索、店铺详情、技师详情、用户资料。允许提供开发 seed，但接口必须读取真实数据库。不要做下单、钱包、排班写入、IM/Social，也不要批量替换前端 mock。完成后运行 migration、seed、lint、test、build，并更新 OpenAPI/docs/api.md。
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
