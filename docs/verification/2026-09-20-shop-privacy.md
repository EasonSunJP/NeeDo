# 店铺隐私保存与身份关系回归

## 修复范围

店铺展示页曾把隐私开关保存到 `MerchantIdentityProfile.visibility`，而搜索和详情按
`Shop.visibility` 授权。现在展示页复用已存在的店铺隐私 GET/PUT 接口，按账号、身份、
店铺隔离异步请求，并保留失败重试、失败回退和 A → B → A 延迟响应保护。
商户信息卡、顾客和技师个人资料的隐私设置保持独立；不复制、迁移或自动同步旧值。

服务端仍在 Prisma 分页和计数前过滤，数字 ID 与公开 ID 详情都执行相同授权。
商户账户的原始身份范围不再被当前店铺覆盖；所选店铺单独参与店主判定，正式商户关系
继续按原账户范围查询。搜索、详情、预约入口/时段、收藏分享和预约创建复用同一投影。
顾客资料接口保留其原有按所选店铺判断关系的行为。

本次没有新表、migration、新接口或公开响应结构变更。现有 RBAC、店铺范围、Zod、
事务审计和 404 拒绝契约继续适用。

## 自动化验证

- 修改实现前，店铺 UI 回归 13 项失败，显示保存仍走商户个人资料接口。
- 商户账户范围与店主判定的新增测试先失败后通过。
- 审查发现的顾客 network 访问连带回归也先用 HTTP 测试复现，再修复。
- 前端相关 5 个套件、58 项测试通过：店铺展示、隐私运行时交互、商户信息卡、
  core-read adapter 和 pricing-mode adapter。
- 后端聚焦 9 个套件、55 项测试通过：搜索/详情 API、共享查询策略、身份投影、
  隐私服务、路由/RBAC/OpenAPI 和缓存。
- 周边后端 7 个套件、114 项测试通过：core-read 仓储、定价导航、收藏仓储/服务、
  预约服务、顾客隐私和技师资料服务。
- `npm run lint`、`npm run build`、`npm --prefix backend run lint`、
  `npm --prefix backend run build` 通过；前后端 TypeScript 检查包含在这些命令中。

主要命令：

```sh
npm test -- src/pages/mobile/MerchantPortalPrivacy.runtime.test.tsx src/pages/mobile/MerchantPortalPage.test.tsx src/features/pricing-mode/api.test.ts src/features/core-read/api.test.ts src/components/merchant/MerchantIdentityInfoCard.test.tsx
npm --prefix backend test -- --runTestsByPath tests/core-read-api.test.ts tests/core-read-shop-visibility.test.ts tests/shop-visibility-viewer.test.ts tests/shop-visibility.service.test.ts tests/shop-visibility-api.test.ts tests/shop-visibility-route-contract.test.ts tests/shop-visibility-openapi.test.ts tests/shop-visibility.repository.test.ts tests/observability.test.ts --runInBand
npm --prefix backend test -- --runTestsByPath tests/core-read.repository.test.ts tests/pricing-mode-service.test.ts tests/entity-engagement.repository.test.ts --runInBand
npm --prefix backend test -- --runTestsByPath tests/entity-engagement.service.test.ts tests/customer-profile-visibility.repository.test.ts tests/technician-profile.service.test.ts tests/booking-service.test.ts --runInBand
```

## 真实本地 MySQL

`shop-visibility.integration.test.ts` 使用明确指定的
`SHOP_VISIBILITY_INTEGRATION_DATABASE_URL`。写入前只允许本机 `needo_dev` / `needo_test`，
主矩阵在独立事务里创建资料并完整回滚；原有精确店铺好友测试清理其创建的记录。
两个集成用例通过，并核对回滚后店铺和账号均无残留。

矩阵同时核对真实搜索列表、总数、直接策略、数字 ID 和公开 ID 详情：

| 访问身份/关系 | public | privateAll | limited | network |
| --- | --- | --- | --- | --- |
| 匿名、无关系身份 | 可见 | 不可见 | 不可见 | 不可见 |
| 当前店铺的店主身份 | 可见 | 可见 | 可见 | 可见 |
| 与店铺身份双向有效好友 | 可见 | 不可见 | 可见 | 可见 |
| 仅与店铺技师身份为好友 | 可见 | 不可见 | 不可见 | 不可见 |
| 当前技师身份与店铺有效从属 | 可见 | 不可见 | 不可见 | 可见 |
| 当前顾客身份有效店铺关系 | 可见 | 不可见 | 不可见 | 可见 |
| 当前身份正式业务联系人 | 可见 | 不可见 | 不可见 | 可见 |
| 当前 scout 身份有效介绍关系 | 可见 | 不可见 | 不可见 | 可见 |
| 当前商户账户有效店铺关系 | 可见 | 不可见 | 不可见 | 可见 |

同账号切换回无关系顾客身份不能借用技师、店主、scout 或商户账户关系。
额外覆盖单向好友、拉黑、删除、另一店铺关系、停用店铺身份、结束会员关系、
过期技师从属、撤销/过期介绍关系以及过期商户关系。顾客资料设为 privateAll 时，
同账号公开技师仍可读取，私密店铺关联不在技师详情中泄露。

## 真实本地页面与 API

开发分支在 `5190` 前端和 `3110` API 验证；API 使用当前 worktree 编译产物，
已验证数据库为 `127.0.0.1:3307/needo_dev`，Redis 为本机独立 logical DB。
只创建专用临时账号、店铺和好友关系，正常密码登录，无 mock 或鉴权绕过。

从店铺展示页完成 `public → privateAll → limited → network → public`，
刷新后 limited 保留。每次切换都通过真实 API 核对匿名、店主、店铺好友和非好友的
搜索总数、数字 ID/公开 ID 详情。禁止访问统一返回 `404 / error.shop.not_found / data:null`。
public 恢复后匿名和所有登录身份均可搜索和访问详情。

数据库回查确认四次保存的 previous/next visibility 审计链完整，店铺保存人正确；
同账号顾客和商户个人资料保持原有 `privateAll`。缓存头分别为匿名
`public, no-cache` 和登录 `private, no-store`。

本记录不代表 staging、production 或安装版 iPhone/Android PWA 验收；未连接远程环境。

## 本地 main 与 5180 最终验收

开发提交 `af2ceaeb` 已合并本地 main（合并提交 `ca2be8c8`）。合并后在 main
工作目录重新执行前端 58 项、后端 169 项和真实 MySQL 2 项，共 229 项全部通过；
前后端 lint、类型检查和 build 再次通过。

实际监听 5180 的 Vite 及 3000/3001/3002 API 均运行于 main 工作目录
`.worktrees/staging-release-cc999f09`；Vite 代理分别指向本机 3000/3002/3001。
后端使用经核实的 LOCAL 环境文件。合并后 watch 进程已加载更新，无需替换或清理
旧的、带未提交日志的 `main-runtime-5180` worktree。

5180 正常密码登录后，从页面完整执行
`public → privateAll → limited → network → public`，刷新后 limited 保留。
每个模式再次核对匿名、店主、好友、非好友的搜索总数及两种 ID 的详情授权。
数据库回查确认新增四条完整审计记录，顾客与商户个人资料仍为 privateAll。
本批次临时页面、5190/3110 服务、3 个账号、1 家店铺、对应关系和登录经验记录
已清理，相关刷新会话已撤销；回查临时账号和店铺残留均为零。

已知范围外现象：正常登录跳转期间控制台有一条空图片 `src` 的 React 提示；
店铺隐私控件、保存与访问结果未受影响，本次未扩展修改图片渲染。
