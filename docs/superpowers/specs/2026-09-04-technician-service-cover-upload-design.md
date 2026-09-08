# 技师服务封面图上传设计

**日期：** 2026-09-04

**适用阶段：** Step 09 前端第一批去 mock，对现有正式技师服务写接口做一个独立增量

**状态：** 已完成；实现、自动化、正式 API/MySQL、浏览器文件选择、跨页面读取与清理终态均已验收

**关联设计：** `2026-09-03-technician-profile-detail-service-card-review-tags-design.md`

## 1. 目标

在技师个人中心的“添加服务”和“编辑服务”表单中补齐一张正式服务封面图的上传入口，并让上传结果继续通过现有 `TechnicianService.coverImageUrl` 字段进入统一服务信息卡。

本微步骤必须满足：

1. 每个技师服务只管理一张封面图。
2. 支持 JPEG、PNG、WebP，单张最大 8 MiB。
3. 新增服务时可以先选择并预览图片；服务文本记录创建成功后再上传封面。
4. 编辑服务时可以预览当前封面、选择替换或移除封面。
5. 上传、替换和移除都走正式 `/api/v1`、真实文件存储、Prisma、RBAC 和审计链路。
6. 所有页面上的统一服务信息卡继续只读取同一个 `coverImageUrl`，不新增第二套服务卡或图片字段。

## 2. 非目标

- 不增加服务图片画廊，不启用 `imagesJson` 的多图编辑。
- 不在本微步骤引入 S3、预签名 URL、图片 CDN 或外部对象存储迁移。
- 不在浏览器中把 base64/data URL 当作业务记录保存。
- 不改变服务排序、定价模式、预约、订单或评价逻辑。
- 不处理“技师资料 ID 与技师公开 ID 统一”；该项保持为后续独立高风险契约微步骤。
- 不重做统一服务信息卡的视觉结构。

## 3. 现有基础与设计选择

现有代码已经具备：

- `TechnicianService.coverImageUrl`；
- 通用 `MediaAsset` 正式记录；
- `ContentMediaFileStorage` 的 8 MiB 限制、JPEG/PNG/WebP MIME 与魔数校验、SHA-256 内容寻址存储和安全路径隔离；
- `/media/content/{sha256}.{ext}` 静态读取路径；
- 技师服务本人列表、创建、更新、删除、排序接口及 `technician:services:write` 权限。

因此采用“技师服务专用封面子资源接口 + 复用正式媒体存储”的方案。它比把 base64 放进服务 JSON 更安全、可测试；也比本阶段直接引入对象存储改造更小、更容易回滚。

严格的完整解码、单帧和 25,000,000 像素上限是封面调用专用的逐次校验 profile。共享存储的默认 profile 保留 Social 与运营内容媒体原有契约：不超过 8 MiB、声明 MIME 属于 JPEG/PNG/WebP 且匹配魔数。本微步骤不把封面限制扩散到这些范围外的上传链路。

## 4. 正式 API 契约

### 4.1 上传或替换封面

```text
PUT /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover
Content-Type: image/jpeg | image/png | image/webp
Body: raw binary, 1 byte to 8 MiB
Decoded pixels: at most 25,000,000
Frames/pages: exactly 1; animation and multi-page content are invalid
Permission: technician:services:write
```

成功返回 HTTP 200 和更新后的完整 `TechnicianServicePayload`。重复提交与当前封面完全相同的图片时，返回当前结果，不重复创建活动媒体记录。

### 4.2 移除封面

```text
DELETE /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover
Permission: technician:services:write
```

成功返回 HTTP 200 和 `coverImageUrl=null` 的完整 `TechnicianServicePayload`。服务本来就没有封面时按幂等成功处理。

### 4.3 校验与错误

- `shopId`、`serviceId` 使用 Zod 正整数参数校验。
- 只接受三种明确的图片 `Content-Type`；其他类型返回 HTTP 415 和稳定 i18n 错误键。
- 空 body、声明 MIME 与解码格式不匹配、仅有头部而无完整像素、损坏文件、APNG、JPEG MPF、多帧/动画内容，以及超过 25,000,000 解码像素时返回 HTTP 400。
- 超过 8 MiB 返回 HTTP 413。
- 服务不存在、已软删除或不属于当前技师作用域时返回同一个安全的 not-found 错误，不能泄露其他技师的服务是否存在。
- 未登录返回 401；无 `technician:services:write` 权限返回 403。
- Controller 只解析请求和响应；作用域、文件持久化、事务和审计均位于 Service/Repository。
- OpenAPI 必须描述二进制 request body、三种 MIME、成功响应和全部稳定错误。

封面 Service 向每次 `prepare` 和 `save` 传递同一个严格校验 profile，包括路由注入共享存储的情况；即使存储实现在 `save` 内部重新准备文件，也不能回退到默认校验。文件字节数与声明 MIME 先进行低成本校验。PNG 通过有明确条目上限的 chunk-header walk 拒绝 `acTL`、`fcTL`、`fdAT`；JPEG 通过有明确条目和 marker-padding 上限的 marker walk 拒绝 APP2 `MPF`。这些容器检查不计算 CRC、不解码像素，扫描预算耗尽时 fail closed。随后由维护中的 `sharp`/libvips 读取容器元数据，拒绝其他报告多个 frame/page 的输入，并在主 JavaScript 事件循环之外异步完整解码被接受的单帧。能够完整解码为声明的 JPEG、PNG 或 WebP 且不超过 25,000,000 像素的单帧图片才进入 checksum、存储和数据库事务阶段。

## 5. 身份、作用域与权限

服务端只从已认证 session 读取：

- `actor.userId`；
- 当前活动 `UserIdentity.id`；
- 当前活动技师身份及 `technician_profile` scope。

请求不能提交 `userId`、`identityId` 或 `technicianId`。Repository 在写入前锁定并验证目标 `TechnicianService`：

- `service.id = serviceId`；
- `service.shopId = shopId`；
- `service.technicianId = 当前技师资料 ID`；
- `service.deletedAt IS NULL`。

前端按钮可按权限隐藏，但不能代替服务端 RBAC 和作用域校验。

## 6. 数据写入与一致性

### 6.1 上传/替换

处理顺序固定为：

1. 验证认证、权限、参数、MIME、大小和文件魔数。
2. 在写文件前验证目标服务属于当前技师和店铺。
3. 使用现有内容寻址存储保存文件，得到 SHA-256、MIME 和正式 URL。
4. 在一个数据库事务中再次锁定并验证服务，处理当前封面记录，更新 `TechnicianService.coverImageUrl`，并写审计日志。
5. 返回从数据库重新投影的完整服务 DTO。

活动 `MediaAsset` 写为：

```text
entityType = technician_service
entityId = TechnicianService.id
shopId = TechnicianService.shopId
technicianProfileId = TechnicianService.technicianId
ownerUserId = actor.userId
ownerIdentityId = actor.currentIdentity.id
usageType = cover
url = /media/content/{sha256}.{ext}
mimeType = validated MIME
checksumSha256 = validated SHA-256
isActive = true
```

替换时，旧的活动封面 `MediaAsset` 在同一事务中设置 `isActive=false` 和 `deletedAt=now`；新的封面记录、服务 URL 和审计必须同时提交或同时回滚。

如果文件保存成功但数据库事务失败，服务层只在确认该物理文件是本次新建且没有任何活动 `MediaAsset` 引用时执行补偿删除；补偿失败写结构化警告，但不能覆盖原始业务错误。已经被其他正式记录引用的内容寻址文件不能删除。

本微步骤的“移除”含义是解除服务公开关联：卡片和 API 立即不再返回旧图。软删除的媒体历史用于审计和故障恢复；跨模块物理文件保留/清理策略不在本微步骤创建第二套后台任务。

### 6.2 相同图片重试

如果当前活动封面的 checksum、MIME 和 URL 与新文件一致：

- 不新增 `MediaAsset`；
- 不软删除当前记录；
- 不新增重复变更审计；
- 返回当前服务 DTO。

这让网络重试不会积累重复记录。

### 6.3 移除

移除在单个事务中：

1. 锁定并验证技师服务作用域；
2. 将当前活动 `usageType=cover` 媒体记录软删除并停用；
3. 将 `TechnicianService.coverImageUrl` 设为 `null`；
4. 写一次移除审计；
5. 返回更新后的完整服务 DTO。

若原本无封面，返回当前 DTO，不制造重复审计。

### 6.4 字段权威边界

- `coverImageUrl` 是所有统一服务卡的唯一封面读取字段。
- `MediaAsset` 是封面文件的所有权、MIME、checksum 和生命周期证据。
- `imagesJson` 保持不变，不用于本次单封面功能。
- 技师端表单不再提交任意远程 `coverImageUrl` 或 `images`；它只调用封面子资源接口。
- 现有服务创建/更新 JSON 契约的兼容字段是否移除，留给独立契约清理，不与本次用户可见修复捆绑；本次新增链路不会生成或信任任意远程 URL。

## 7. 审计

有效变更与服务更新处于同一个数据库事务。动作名称：

- `technician.service.cover.updated`
- `technician.service.cover.removed`

审计目标为 `TechnicianService`，metadata 只记录：

- `shopId`；
- `technicianProfileId`；
- 新旧 `MediaAsset.id`；
- 新旧 checksum；
- MIME；
- 文件字节数。

审计和日志不得记录原始图片、access token、refresh token 或请求 body。

## 8. 前端交互

### 8.1 编辑器结构

服务编辑器在“服务名称”之前增加“服务封面”区域：

- 无图：显示清晰的上传入口和“JPEG / PNG / WebP，最大 8 MiB”。
- 已有图：显示当前封面预览。
- 选择新图：立即显示本地预览，并提供“更换图片”。
- 已有图时提供“移除图片”；点击只标记草稿状态，真正移除发生在保存流程。
- 选择错误类型或超限文件时，在本地立即提示，同时服务端仍做最终校验。
- 取消编辑时释放 `URL.createObjectURL` 并丢弃图片草稿，不调用 API。

所有新增用户可见文案补齐现有五语言 i18n，不在组件内扩张新的中文硬编码。

### 8.2 新增服务保存流

1. 先校验并创建服务文本记录。
2. 没有选择封面时直接完成。
3. 选择了封面时，使用返回的真实 `serviceId` 调用封面 PUT。
4. 两步都成功后关闭编辑器并刷新正式列表。
5. 文本创建成功但封面上传失败时，不删除已创建服务，也不伪装整步失败；列表保留真实服务，编辑器保持可重试状态，并明确显示“服务已保存，封面上传失败，请重试”。

### 8.3 编辑服务保存流

1. 先保存服务名称、价格、时长、简介等文本字段。
2. 若选择替换图，再调用封面 PUT。
3. 若标记移除，再调用封面 DELETE。
4. 全部成功后关闭编辑器并刷新列表。
5. 文本已保存但图片操作失败时，明确显示部分成功状态，保留图片草稿供重试；不能把数据库中已成功的文本改动回滚成浏览器旧值。

保存过程中禁用重复提交、取消、删除服务和排序操作。

### 8.4 统一展示

上传成功后，不在技师页创建专用图片卡。以下实际服务信息卡继续通过共享 mapper 和 `UnifiedServiceInfoCard` 读取同一个 `coverImageUrl`：

- 技师个人中心；
- 技师公开详情页；
- 用户首页、搜索、分类结果中的正式服务信息卡；
- 店铺详情和其他已经迁移到共享服务卡的正式场景。

无封面时使用共享服务卡当前的诚实空状态；不引入假图或静态占位业务数据。

## 9. 分层和预计文件边界

后端预计增加独立的技师服务封面 Service/Repository 能力，并在现有 pricing-mode route/controller 中接入，保持：

```text
Route -> Controller -> Service -> Repository -> Prisma/MySQL
                         |
                         -> ContentMediaFileStorage
```

前端只扩展现有：

- `src/features/pricing-mode/api.ts` 的二进制上传/移除 adapter；
- `FormalTechnicianServicesPanel` 的单封面草稿和保存状态；
- 已有共享服务卡数据刷新，不新增另一套卡片组件。

如测试证明现有原始 body 错误映射可安全复用，应提取共享 helper；不得复制一套行为略有不同的 8 MiB/MIME 规则。

## 10. 测试策略

所有实现按 TDD 顺序先红后绿。

### 10.1 后端

- Storage：JPEG/PNG/WebP 成功，空文件、伪造 MIME、损坏魔数和超 8 MiB 失败。
- Service：本人服务上传、替换、相同图幂等、移除、无图移除幂等。
- Scope：跨技师、跨店铺、软删除服务均不能读取或修改。
- Repository：`MediaAsset`、`coverImageUrl`、旧图软删除和审计在同一事务。
- Compensation：数据库失败时只清理安全的本次新文件，不删除已有共享文件。
- API：401、403、400、404、413、415、200 响应和 raw binary 请求。
- OpenAPI：路径、权限、二进制 schema、MIME 与响应契约存在。

### 10.2 前端

- API adapter 发送 raw `File/Blob`，保留图片 MIME，不设置 JSON content type。
- 新建无图、新建有图、编辑替换、编辑移除均调用正确顺序。
- 取消编辑不调用 API，并释放本地 object URL。
- 本地拒绝错误格式和超限文件。
- 创建文本成功但上传失败时显示部分成功与重试状态。
- 编辑文本成功但图片失败时不恢复旧文本。
- 成功响应更新列表，统一服务卡立即显示新封面。
- 现有上移、下移、编辑和服务删除回归继续通过。

### 10.3 必跑验证

- 后端 targeted Jest/Supertest。
- 后端 lint 和 build。
- 前端 targeted Vitest。
- 前端 lint 和 production build。
- source policy：无新增 mock、data URL 持久化、第二套服务卡或任意远程封面写入。

## 11. 浏览器与真实数据验收

先证明前后端监听 PID、cwd、分支和代理目标，再使用真实技师登录态完成：

1. 新增服务时看到上传入口，选择合法图片可预览。
2. 保存后刷新页面，封面仍从正式 API 和数据库返回。
3. 编辑同一服务可替换图片，刷新后只显示新图。
4. 可移除封面，刷新后保持无图状态。
5. 非图片、伪造扩展名和超过 8 MiB 的文件都被拒绝。
6. 技师个人中心和公开详情页显示同一张封面。
7. 共享服务卡字段顺序、上移、下移和编辑按钮没有回归。
8. 移动宽度无横向溢出，控制台无新增错误。
9. 数据库核对服务 URL、活动/软删除媒体行和两种审计动作。

验收结束后删除或恢复仅为验收创建的服务和图片记录，不改动用户现有正式测试数据。

## 12. 回滚

本微步骤没有 schema migration。代码回滚时：

- 移除两个封面子资源路由和前端上传控件；
- 保留原有服务读写、排序和共享卡片；
- 已上传的 `coverImageUrl` 和 `MediaAsset` 仍是合法正式数据，不需要破坏性清理；
- 回滚不会删除用户已上传文件或服务记录。

## 13. 完成边界

只有自动化、真实 API/数据库、浏览器刷新持久化和跨页面共享卡显示都通过，才可将“服务封面图上传”标记为完成。完成本微步骤后再单独设计和实施“技师资料 ID 与技师公开 ID 统一”，最后才进入功能分支与 `main` 的合并与全量回归。

## 14. Cover Task 5 验收记录

2026-09-04 在隔离功能分支上完成以下正式证据：

- 后端 6 个目标套件共 57 项测试、后端 lint/build、前端 9 个目标文件共 154 项测试、前端 lint/build 均退出 0；Vite 仅保留既有 mixed-import 与大 chunk 警告。
- 功能前端使用显式备用端口并代理到同一 worktree 的正式后端；标准 5180 运行时未被替换或作为本次验收依据。
- 唯一验收服务通过正式 API 完成首次上传、替换和移除。MySQL 证明 `technician_services.cover_image_url` 跟随每次动作，替换/移除后的 `media_assets` 均为 inactive 且有 `deleted_at`，审计包含 `technician.service.cover.updated` 与 `technician.service.cover.removed`。
- 技师个人中心刷新后读取同一 `/media/content/...` URL；用户端技师公开详情页读取相同替换 URL；移除后刷新显示诚实无图状态。服务上移/下移与编辑控件可用，验收前顺序已恢复。
- 390 px 移动宽度下，独立刷新后的技师个人中心与公开详情页均无横向溢出，且各自干净标签页没有 console error。
- 验收结束后，仅按捕获的服务 ID 调用认证服务 DELETE API；MySQL 确认该行软删除，正式本人服务列表不再返回它，原有服务的排序值恢复为验收前值。

本轮状态为 `DONE_WITH_CONCERNS`，而不是完成：Chrome 扩展控制的文件选择器拒绝附加仓库图片，无法证明浏览器本地预览/替换上传；固定正式技师测试资料虽已有服务，但未提供新增表单所需的 `defaultCategoryId`，浏览器新增服务显示“当前没有可用的正式服务分类”。因此第 11 节第 1、3、5 项中的浏览器选图/本地校验链路仍待可用文件上传控制和正式分类前置数据补验。本轮不修改技师/资料 ID 格式，不合并 `main`，不声称部署。

## 15. 2026-09-07 main 浏览器闭环补验

此前 `DONE_WITH_CONCERNS` 的两项前置条件已经消除：当前正式测试技师可复用本人已有服务分类；受管 Node Playwright 可直接操作原生 `input[type=file]`，不依赖 Chrome 扩展文件选择器。

在本地 `main`、5180 前端和同工作树 3000 正式 API 上，使用 `admina@lifedance.com` 的真实技师与用户身份完成以下闭环：

- 新增服务表单显示唯一封面上传入口；非图片和超过 8 MiB 文件在前端被拒绝，合法 JPEG 生成可解码的 `blob:` 本地预览。
- 通过正式 POST 创建临时服务，再通过正式 PUT 上传封面；刷新技师个人中心后仍读取 `/media/content/...`。
- 对已有服务选择内容损坏但声明为 PNG 的文件，正式封面接口返回 400，页面保留“服务已保存，封面上传失败，请重试”的部分成功状态；换成合法 JPEG 后重试返回 200。
- 替换后的内容寻址 URL 与初始 URL 不同；技师个人中心与用户端 `/profiles/technician/s0000000002` 的共享服务卡读取同一 URL。
- 新服务上移和下移均返回 200，顺序恢复且未出现 `error.technician_service.invalid_order`。
- 移除封面返回 200；刷新技师端和用户详情页均保持诚实无图状态。390 px 视口 `scrollWidth === clientWidth`。
- 唯一预期控制台错误是损坏 PNG 请求产生的 HTTP 400；除此之外控制台 error 为 0。
- 验收服务 `1724` 最终通过正式 DELETE 软删除。MySQL 证明 `coverImageUrl=null`，两版 `MediaAsset` 均 `isActive=false` 且有 `deletedAt`，审计存在两次 `technician.service.cover.updated` 和一次 `technician.service.cover.removed`。
- 两次脚本诊断运行创建的服务 `1721`、`1722`，以及一次完整但因证据断言终止的服务 `1723`，也都通过限定的正式 UI 清理；数据库中所有 `封面验收-` 服务均已软删除，关联媒体无活动记录。
- 当前 HEAD 新鲜复验：前端相关 9 个文件 122 项测试、后端相关 6 个套件 69 项测试全部通过；前后端 lint 与 build 均退出 0。前端构建只保留既有 Zod 注释、SocialProfilePage mixed-import 和大 chunk 警告。

至此第 11 节的浏览器文件选择、预览、上传、替换、移除、跨页面一致性、错误校验、移动布局与数据库/审计清理全部有新鲜证据，本微步骤从 `DONE_WITH_CONCERNS` 更新为完成。本记录仍只证明本地 `main`，不代表远端 push、部署或生产 migration。
