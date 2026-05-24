# 09 — 前端第一批去 Mock

> 本文档用于指导 Codex 执行 Step 09。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

只替换基础浏览链路的 mock：首页、搜索、分类、详情、设置账户基础信息，不碰交易、IM、Social。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/MOCK_RETIREMENT_MAP.md`
- `docs/08_CORE_READ_API_AND_API_CONTRACTS.md`

---

## 3. 本步必须做

- 为首页、搜索、分类、店铺详情、技师详情、用户资料创建 API adapter。
- 保留 UI 结构，替换数据来源。
- 增加 loading / error / empty 状态。
- 将旧 mock 标记为 legacy fallback，不能继续扩张。
- 确保三端入口不被破坏。
- 更新 MOCK_RETIREMENT_MAP。

---

## 4. 本步禁止做

- 不要改 Booking checkout。
- 不要改订单状态。
- 不要改钱包。
- 不要改 IM/Social。
- 不要重构主题 token。

---

## 5. 交付物

- `src/features/*/api adapter 更新`
- `首页/搜索/分类/详情接真实 API`
- `loading/error/empty 状态`
- `docs/MOCK_RETIREMENT_MAP.md 更新`
- 前端测试

---

## 6. 验收标准

- [ ] 核心浏览页面从 API 读数据。
- [ ] 断网或错误时有合理错误态。
- [ ] mock 没有新增。
- [ ] 旧 UI 视觉基本保持。
- [ ] 前端 build 通过。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/09_FRONTEND_MOCK_RETIREMENT_BATCH1.md。本次只执行 Step 09：前端第一批去 Mock。请只替换首页、搜索、分类、店铺详情、技师详情、用户资料等基础浏览链路的数据来源，接入 Step 08 的真实 API。请保留现有 UI、路由、主题 token 和三端入口，增加 loading/error/empty 状态，并更新 docs/MOCK_RETIREMENT_MAP.md。不要改 Booking、订单、钱包、排班、IM、Social。完成后运行前端 lint/test/build。
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
