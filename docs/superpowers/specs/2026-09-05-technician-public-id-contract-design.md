# 技师公开 ID 统一设计

**日期：** 2026-09-05

**适用阶段：** Step 09 前端第一批去 mock，对既有统一公开身份地基做最小前端切换

**状态：** 用户已选择并批准“只统一对外 ID，保留内部数字主键”

## 1. 目标

所有用户可见的技师账号、技师信息卡链接和技师公开详情页 URL 统一使用 canonical `s##########`。`TechnicianProfile.id` 继续作为数据库内部主键及订单、排班、服务等外键，不展示为技师账号，也不要求客户端用它构造新的公开资料链接。

## 2. 已核验现状

真实本地数据中，同一实体同时具有：

- `TechnicianProfile.id = 186`：内部资料主键；
- `PublicIdentifier.publicId = s0000000002`：对外技师 NeeDoID。

`GET /api/v1/technicians/:id` 已能按两者读取，并在响应中同时提供 `id` 与 `publicId`。问题来自前端部分正式卡片和详情链接仍使用 `id` 生成 `/profiles/technician/186`，导致用户看到内部主键格式。

## 3. 设计选择

采用“公开引用统一、内部关系不迁移”的方案：

1. 正式 `CoreTechnicianCard` 映射继续保留 `id` 供页面内部关联，并把 `publicId` 放在既有 `Technician.systemId`。
2. 新增共享解析函数，技师公开资料链接优先且只在格式有效时使用 `systemId`；legacy 非正式数据没有 canonical ID 时保留原 `id` 兼容，不能伪造 `s` ID。
3. 首页、分类搜索、服务详情、店铺技师卡、结账技师卡和订单技师卡改用共享公开资料链接解析。
4. 旧数字资料 URL 暂时可读；详情成功后用服务端返回的 `publicId` 替换为 canonical scoped URL，并保留 query string。
5. API 响应中的内部 `id` 不改名、不删除，避免破坏服务、订单、排班和定价请求的现有数字外键合同。

## 4. 明确不做

- 不把 `TechnicianProfile.id` 改为字符串主键。
- 不迁移 `BookingOrder`、`ScheduleSlot`、`TechnicianService` 等外键。
- 不把服务、订单、排班 API 的 `technicianProfileId` 请求字段改成公开 ID。
- 不执行统一身份回填；当前 dry-run 报告中的 User 33 主身份冲突和一个店铺客服公开 ID 待补属于独立数据修复。
- 不修改技师资料内容、服务卡布局、评价标签或隐私设置。

## 5. 安全与兼容边界

- canonical 技师 ID 必须匹配 lowercase `^s\d{10}$`。
- 不接受可编辑显示名、邮箱、手机号或内部自增号冒充公开 ID。
- scoped 路由保持三端结构：用户端 `/profiles/technician/:publicId`、商户端 `/merchant/profiles/technician/:publicId`、技师端 `/technician/profiles/technician/:publicId`。
- 历史数字链接只作为过渡兼容入口；页面加载正式数据后立即 `replace`，不增加一条浏览历史。
- 无法读取正式 `publicId` 时保持原错误/空状态，不能生成假 ID。

## 6. 验收

1. 共享路径单元测试证明内部 `186` 与 `s0000000002` 同时存在时，公开链接使用后者。
2. 首页、分类、服务、店铺、结账与订单的正式技师卡不再直接用内部资料 ID 生成资料链接。
3. 访问 `/profiles/technician/186?view=card` 并成功读取正式资料后，URL 被替换为 `/profiles/technician/s0000000002?view=card`。
4. 详情读取仍用数字内部 ID 加载关联服务，不改动服务/订单/排班数据合同。
5. 相关测试、完整前端测试、lint、build 通过；浏览器以真实 `s0000000002` 技师验证卡片跳转和刷新。

