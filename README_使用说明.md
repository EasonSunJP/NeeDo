# NeeDo Codex 小步正式开发文档包 v4

这套文档用于把 NeeDo 从当前高保真 demo / mock workflow，逐步迁移为真实后端、真实数据库、真实权限、真实业务 API、可压测上线的正式产品。

## 使用方式

1. 把根目录 `AGENTS.md` 放到 NeeDo 仓库根目录。
2. 把 `docs/` 目录下所有文档复制到 NeeDo 仓库的 `docs/` 目录。
3. 先让 Codex 阅读：
   - `README.md`
   - `AGENTS.md`
   - `docs/00_MASTER_MICRO_STEP_PLAN.md`
4. 每次只复制一个 Step 的 Codex 命令给 Codex。
5. 当前 Step 没有验收通过，不要进入下一 Step。

## 推荐执行顺序

```text
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14
```

## 最重要的纪律

- 不要一次性让 Codex 执行所有步骤。
- 不要一次性替换所有 mock。
- 不要一次性做 Booking、钱包、IM、Social、压测。
- User Management 已改名，正式文件名为：`docs/User Management.md`。
- 旧文件 `用户管理.md` 只作为历史参考。

## 给 Codex 的命令

所有命令已经汇总在：

```text
docs/CODEX_COMMANDS_ALL_STEPS.md
```

建议一次只复制其中一个命令。
