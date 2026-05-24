# 14 — 压测、监控、安全、上线准备

> 本文档用于指导 Codex 执行 Step 14。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

在核心功能可用后，建立生产上线能力，并分级验证从 1k 到 100k 访问峰值的承载策略。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

---

## 3. 本步必须做

- 补齐 staging/prod env。
- 补齐 Docker compose staging/prod 或部署脚本。
- 接入结构化日志、指标、Tracing、错误追踪。
- 设置健康检查、ready check、数据库连接池、Redis 连接池。
- 设计 k6/Artillery 压测脚本。
- 压测阶梯：1k、5k、10k、30k、100k 访问峰值。
- 设置限流、缓存、CDN 静态资源、数据库索引审计。
- 输出压测报告和扩容建议。

---

## 4. 本步禁止做

- 不要在核心功能未稳定前做假压测。
- 不要承诺 100k 并发已达标，除非有压测数据。
- 不要让 WebSocket、登录、搜索、订单写入混用同一指标口径。

---

## 5. 交付物

- `deploy/staging/prod 配置`
- observability 配置
- load-test 脚本
- `docs/performance.md`
- `docs/deployment.md`
- `docs/security.md`
- 压测报告

---

## 6. 验收标准

- [ ] staging 可部署。
- [ ] 关键接口有 P50/P95/P99。
- [ ] 错误率、慢查询、连接池指标可观察。
- [ ] 压测报告说明瓶颈。
- [ ] 达到或明确未达到每个并发阶梯。
- [ ] 有回滚和备份方案。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/14_PRODUCTION_LOAD_TEST_OBSERVABILITY.md。本次只执行 Step 14：压测、监控、安全、上线准备。请补齐 staging/prod 环境、部署配置、结构化日志、metrics、tracing、health/ready check、数据库连接池、Redis 连接池、缓存、限流、静态资源 CDN 建议、k6 或 Artillery 压测脚本和压测报告模板。请按 1k、5k、10k、30k、100k 访问峰值分级设计压测，不要在没有数据时声称已经支持 100k。完成后更新 docs/performance.md、docs/deployment.md、docs/security.md。
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
