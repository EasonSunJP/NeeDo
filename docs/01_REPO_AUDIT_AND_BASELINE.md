# 01 — 仓库审计与基线保护

> 本文档用于指导 Codex 执行 Step 01。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

确认当前仓库真实技术栈、目录结构、启动方式、mock 边界和风险点，为后续开发建立不可破坏的基线。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/00_MASTER_MICRO_STEP_PLAN.md`

---

## 3. 本步必须做

- 检查 package.json、src/App.*、src/pages、src/features、src/state、src/shared。
- 确认当前前端实际框架，不得强行迁移。
- 整理 mock 数据源清单，标注哪些模块暂时保留、哪些准备替换。
- 新增或更新 docs/CURRENT_ARCHITECTURE_AUDIT.md。
- 新增或更新 docs/MOCK_RETIREMENT_MAP.md。
- 确认 npm run dev、npm run build、npm test 的当前状态。

---

## 4. 本步禁止做

- 不要新增后端业务代码。
- 不要新增数据库表。
- 不要替换 mock。
- 不要重构 UI。
- 不要改路由结构。

---

## 5. 交付物

- `docs/CURRENT_ARCHITECTURE_AUDIT.md`
- `docs/MOCK_RETIREMENT_MAP.md`
- `docs/STEP_01_BASELINE_CHECKLIST.md`

---

## 6. 验收标准

- [ ] 能清楚说明当前项目实际技术栈。
- [ ] 能列出 mock 来源和替换优先级。
- [ ] 能列出高风险模块。
- [ ] 现有 app 仍可启动和 build。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/00_MASTER_MICRO_STEP_PLAN.md。本次只执行 Step 01：仓库审计与基线保护。请不要写业务代码、不要新增数据库表、不要替换 mock、不要重构 UI。请检查 package.json、src/App.*、src/pages、src/features、src/state、src/shared，确认当前实际技术栈、启动命令、mock 边界、三端入口、后台入口和高风险模块。请新增或更新 docs/CURRENT_ARCHITECTURE_AUDIT.md、docs/MOCK_RETIREMENT_MAP.md、docs/STEP_01_BASELINE_CHECKLIST.md。完成后运行现有 lint/test/build 中可运行的命令，并说明哪些通过、哪些失败以及失败原因。
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
