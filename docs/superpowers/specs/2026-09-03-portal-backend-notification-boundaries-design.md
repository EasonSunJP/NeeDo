# NeeDo 独立后台服务与统一通知边界设计

## 目标

将运营后台与商户后台从当前同一个 Express 应用拆成两个可独立启动、部署、鉴权、限流和观测的后端服务，同时继续使用唯一正式 MySQL 数据源。两端提供相同产品形态的通知能力，但由服务端按发布者权限限定受众，并保证运营通知可以被用户端、技师端和商户后台收取。

本设计还恢复同一账号在用户端、商户端、技师端、联盟营销端、运营后台、商户后台和联盟营销后台同时保持登录的能力。普通登录不得撤销其他门户或设备的有效刷新会话。

## 已批准的架构决策

1. 运营后台使用独立 `ops-api` 服务。
2. 商户后台使用独立 `merchant-api` 服务。
3. 两个服务共享唯一正式 MySQL 数据源，不复制商户、店铺、会员、员工或通知主数据。
4. 两个服务拥有独立入口、配置、JWT audience、RBAC、限流、日志、健康检查和部署单元。
5. 共享数据库不代表共享写权限；每张业务表必须有明确写入所有者，跨所有权命令通过正式 API 或事务 outbox 传递。
6. 不新增 mock、浏览器本地假数据或双写数据库。

## 当前问题与根因

### 多门户登录

当前前端只使用 `frontend` 和 `backend` 两个持久化登录桶。`pf-admin.html`、`store-admin.html` 和 `afirieito-admin.html` 共用一个 `backend` envelope；任一后台写入新 envelope 时，其他后台收到 `storage` 事件并终止本地会话。

后端刷新令牌存储本身支持同一用户保存多个 JTI。根因是浏览器持久化作用域过粗，而不是后端只允许单会话。

### 商户通知

当前正式 `OfficialNotice`、`NoticeAudience`、`NoticeDelivery` 与 `Notification` 已能保存平台通知、冻结受众快照、投递和已读状态。运营后台已有正式发布 API；商户后台只有无行为的“通知”按钮，没有本店发布 API、RBAC 或列表页面。

### 商户员工

技师与店铺的正式关系保存在 `TechnicianShopAffiliation`。店主和商户后台账号可以通过店铺作用域身份识别，但总务、财务、司机、厨师等职务目前只是浏览器本地标签，不是正式数据库关系。通知系统不得以这些本地标签构造受众。

## 目标服务拓扑

```text
pf-admin.html
    -> ops-api
       -> shared MySQL
       -> shared Redis with ops namespace

store-admin.html
    -> merchant-api
       -> shared MySQL
       -> shared Redis with merchant namespace

user / technician / merchant / afirieito clients
    -> client-api
       -> shared MySQL
       -> recipient notice inbox

ops-api / merchant-api
    -> transactional outbox
       -> notice delivery worker
       -> Notification + NoticeDelivery
```

在完成独立进程切换前，现有 `backend/src/app.ts` 继续作为兼容入口，但新增路由不得再无条件挂载到所有服务。每个新服务必须通过显式路由清单创建应用，不能依赖请求路径前缀冒充服务隔离。

## 登录会话边界

浏览器持久化 envelope 按门户分别命名：

- `user`
- `merchant`
- `technician`
- `affiliate`
- `operations-admin`
- `merchant-admin`
- `affiliate-admin`

不同门户使用不同 localStorage key 和 Web Lock 名称。一个门户的登录、刷新或退出事件不得改变其他门户的内存凭证或持久化 envelope。同一门户的多个标签页仍共享该门户的退出状态。

服务端登录只创建新的刷新令牌 JTI；普通登录不得调用全用户撤销。只有密码重置、账号封禁、全局安全退出或 `sessionGeneration` 安全变更可以撤销全部会话。

## 正式员工与职务模型

需要新增店铺员工聚合，覆盖店主、管理员、技师、会计、司机、总务、厨师和自定义职务。建议结构：

- `ShopEmployee`：店铺、用户、任职状态、开始/结束时间、软删除、创建/更新审计字段。
- `ShopEmployeeRole`：稳定职务代码、五语言显示名、是否系统职务、是否技师职务。
- `ShopEmployeeRoleAssignment`：员工与职务的有效期关系。
- 技师员工必须关联现有 `TechnicianProfile` 和有效 `TechnicianShopAffiliation`，不能复制技师档案。

员工受众为本店所有有效 `ShopEmployee`；技师受众是员工受众中同时具有有效技师身份和有效店铺技师任职关系的子集。

## 通知发布者与受众

`OfficialNotice` 增加不可变发布范围快照：

- `issuerType`: `PLATFORM` 或 `SHOP`
- `issuerShopId`: 平台通知为空，商户通知必须为当前授权店铺
- `createdByIdentityId`

平台发布者可选择全平台、身份类型或精确用户。商户发布者只能选择以下服务端派生受众，客户端不得上传任意用户 ID：

1. `shop_card_holders`：本店 `ShopMembershipCard.status = ACTIVE`、未删除、`expiresAt` 为空或晚于发送时刻，并且所属会员关系有效的客户身份。
2. `shop_employees`：本店全部有效员工，包括店主、管理员、技师、会计、司机等。
3. `shop_technicians`：员工中的有效技师子集。

受众在发布事务内解析并写入 `NoticeAudience` 快照。之后员工离职或会员卡到期不会改写既有公告的历史收件人。

## 权限规则

### ops-api

- 可创建平台通知。
- 可选择平台范围受众。
- 可查看、审核、取消、归档和重试平台通知。
- 不得冒充店铺创建商户通知。

### merchant-api

- 只允许具有当前店铺通知发布权限的有效员工创建通知。
- 强制从鉴权上下文取得 `shopId`，拒绝请求体指定其他店铺。
- 只能选择三类本店派生受众。
- 只能查看和管理本店创建的通知。
- 不得选择全平台、其他店铺或任意用户 ID。

### 收件端

- 用户、技师和商户身份均通过自己的当前身份读取 `NoticeDelivery`。
- 已读写回同时更新 `NoticeDelivery.readAt` 与关联通知状态。
- 不同身份之间不共用已读状态。

## 数据一致性

运营后台和商户后台显示相同店铺时，名称、城市、状态、公开编号和归属关系必须来自同一行正式数据。双方可以展示不同的派生指标，但必须记录相同的 `shopId/publicId` 和计算时间窗口。

验收必须选择一个真实店铺，依次比对：

1. MySQL 正式记录。
2. `ops-api` 商户/店铺读取接口。
3. `merchant-api` 当前店铺和可管理店铺接口。
4. 运营后台页面。
5. 商户后台页面。

修改正式店铺字段后，另一端重新读取必须立即一致。任何缓存都必须以店铺版本或短 TTL 失效，不能维护第二份浏览器权威数据。

## 实施顺序

1. 多门户登录 envelope 隔离，恢复各端同时登录。
2. 建立 `ops-api` 与 `merchant-api` 独立应用工厂、端口和前端代理。
3. 正式化店铺员工与职务关系，迁移并停用浏览器本地员工职务权威。
4. 扩展通知发布者范围和商户受众解析，增加商户通知 API/RBAC/审计/outbox。
5. 恢复商户通知列表、创建、详情和收件入口。
6. 执行运营通知跨用户端/技师端/商户后台投递验收，以及同店铺跨后台数据一致性验收。

每一步独立测试、独立回滚；未通过当前步骤验收前不进入下一步。

## 验收标准

- 同一正式账号可同时登录所有有权限的门户，登录或退出其中一端不影响其他端。
- `ops-api` 和 `merchant-api` 是两个独立监听进程，健康检查、路由表和鉴权 audience 不同。
- 商户通知无法通过篡改请求选择全平台、其他店铺或任意用户。
- 平台通知定向商户身份后，商户后台能收取、展示并写回已读。
- 平台通知定向用户或技师后，对应前端能收取、展示并写回已读。
- 商户通知三类受众均来自正式数据库快照，且会员、员工、技师口径符合本设计。
- 同一店铺在 MySQL、运营 API、商户 API 和两个后台页面的关键字段一致。
- lint、相关单元/集成测试、生产构建、数据库迁移检查和真实浏览器验收全部通过。
