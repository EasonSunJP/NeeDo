# NeeDo

面向日本市场的本地生活服务平台与商家管理系统，覆盖上门服务、门店预约、餐饮预约和 SaaS 后台运营。

## Run

```bash
npm install
npm run dev
```

当前仓库的开发启动方式已经拆分为：

```bash
# 默认：同时启动前端 + mock backend
npm run dev

# 前端
npm run dev:frontend

# 本地 mock backend 状态服务
npm run dev:backend

# 一键同时启动前端 + mock backend
npm run dev:all
```

说明：

- 当前仓库已包含正式 `backend/` 工程；登录、Auth、RBAC、User Management 必须走真实 `/api/v1` 后端。
- 部分旧业务页面仍保留 legacy mock compatibility，例如 `src/features/im/api.ts`，不得继续扩张为新的正式实现。
- `npm run dev:backend` 提供的是本地 mock backend 状态服务，便于联调和健康检查，不代表真实业务后端已接入。
- 本项目默认前端端口已改为 `5180`，避免占用其他项目正在使用的 `5173`、`5175` 和 `5176`。
- 如果 `5180` 已被占用，Vite 会自动切到下一个可用端口。
- Chrome 直接双击打开 `dist/*.html` 时，`file://` 模式通常不会正常执行 Vite 的 ES module 入口，表现就是白屏、进入页/聊天页/错误页背景都像“没了”。请改用 `npm run dev` 或 `npm run preview` 通过本地 HTTP 服务访问。

## Build

```bash
npm run build
```

## Formal Auth Frontend

Step 07 has added the frontend side of formal Auth / RBAC while keeping the existing React / TSX / Vite stack. The frontend now calls `/api/v1/auth/*`, `/api/v1/users`, `/api/v1/roles`, and `/api/v1/permissions` through `src/api/httpClient.ts`.

Auth behavior:

- Access Token is kept in memory only.
- Refresh Token is persisted under `needo.auth.refresh-token` so a page refresh can restore the session through `/api/v1/auth/refresh` and `/api/v1/auth/me`.
- User / Role / Permission admin pages are backed by real APIs and gated by `menu:*`, `page:*`, and `button:*` permissions.

Set `VITE_API_BASE_URL` when the real backend is served from a different origin. Without it, frontend requests use the relative `/api/v1` prefix. Local Vite dev/preview proxies `/api/v1` to the formal backend at `http://127.0.0.1:3000` by default; override with `NEEDO_API_PROXY_TARGET` or `VITE_API_PROXY_TARGET` if needed.

Passwordless test-login shortcuts are not part of the formal login chain. Seeded local/staging test accounts sign in through `POST /api/v1/auth/login` with `email + password`; the seed password comes from `TEST_USER_DEFAULT_PASSWORD`, falling back to `ADMIN_DEFAULT_PASSWORD` only for local development.

## Current Scope

- 用户端 Web App：深色首页、分类、搜索、服务列表、服务详情、店铺列表、店铺详情、下单流程、订单、用户中心、客服入口。
- 端侧移动应用：用户端、商户端、技师端共享白天 / 黑夜两套视觉主题，客户端主题与语言设置集中在统一的设置中心。
- 运营后台：Dashboard、Analytics、Data Center、Orders、Field Jobs、CRM、Marketing、Finance、Reviews、Merchants、Roles、Travel Settings。
- 店铺后台：门店总览、订单中心、调度中心（排班当前周期确认 / 排班：手动、自动、智能）、场控布局、库存管理、财务结算、人员与顾客、UI装修、门店设置。
- 复用组件：按钮、标签、指标卡、筛选器、表格、详情抽屉、Tabs、后台 Layout、移动端 Shell。
- Mock 数据：覆盖核心实体与业务流程，后续可替换为 API/Prisma 数据源。
- 多语言：用户端与后台端支持中文、日本語、English 三语切换，语言偏好会保存在本地。
- 后台主题：运营控制台支持黑夜 / 白天两套视觉主题，可在后台顶部随时切换。

## 2026-04 Frontend UI Rebuild

这一轮重点只处理前端 UI 层，不重做底层业务逻辑、不重做数据库结构，也不改动底部导航的入口数量、顺序和主交互逻辑。

### 本次重做范围

- 用户端首页：`/`
- 搜索页：`/search`
- 服务详情页：`/services/:id`
- 店铺详情页：`/stores/:id`
- 用户 / 技师 / 店铺资料页：`/profiles/:entityType/:id`
- 预约页：`/checkout/:serviceId`
- 预约列表页：`/orders`
- 预约详情页：`/orders/:orderId`
- 我的页：`/me`
- 设置中心及子页：
  - 用户端
    - `/me/settings`
    - `/me/settings/theme`
    - `/me/settings/language`
    - `/me/settings/portal`
    - `/me/settings/home-shortcuts`
    - `/me/settings/profile`
    - `/me/settings/verification`
    - `/me/settings/service-range`
    - `/me/settings/account`
    - `/me/settings/notifications`
    - `/me/settings/help`
    - `/me/settings/about`
  - 技师端
    - `/technician/settings`
    - `/technician/settings/theme`
    - `/technician/settings/language`
    - `/technician/settings/portal`
    - `/technician/settings/profile`
    - `/technician/settings/verification`
    - `/technician/settings/service-range`
    - `/technician/settings/account`
    - `/technician/settings/notifications`
    - `/technician/settings/help`
    - `/technician/settings/about`
  - 商户端
    - `/merchant/settings`
    - `/merchant/settings/theme`
    - `/merchant/settings/language`
    - `/merchant/settings/portal`
    - `/merchant/settings/profile`
    - `/merchant/settings/verification`
    - `/merchant/settings/account`
    - `/merchant/settings/notifications`
    - `/merchant/settings/help`
    - `/merchant/settings/about`
- 动态页：`/moments`
- IM 模块的聊天 / 通讯录 / 信息页：继续沿用既有路由，但已统一接入新主题 token 与顶部栏风格

### 已从全屏浮层改为真实新页面的内容

- 我的页资料编辑：从页内全屏编辑浮层迁移到 `/me/settings/profile`
- 订单详情：从订单列表覆盖式全屏层迁移到 `/orders/:orderId`
- 订单中的关联资料查看：统一改为跳转到对应资料页 / 服务页 / 店铺页
- 首页中的预约确认、位置选择等旧式全屏流程：收敛回真实搜索页、详情页与预约页
- 动态页中资料详情覆盖层：改为直接跳转真实资料页

### 双主题 token 设计

主题不再复制两套页面代码，而是基于同一套组件与 token 切换：

- `noir-gold`
  - 黑金版
  - 高级灰黑背景 + 柔和金色主色
  - 对应旧语义 `night`
- `vital-mono`
  - 活力黑白版
  - 白色主界面 + 深黑模块 + 亮蓝点缀
  - 对应白天语义 `day`
- `jade-light`
  - 白绿版
  - 清爽白底 + 克制绿色主色
  - 对应旧语义 `day`
- `neon-pink`
  - 霓虹粉紫版
  - 深蓝黑底 + 粉紫霓虹高光 + 柔和玻璃卡
  - 对应旧语义 `night`

当前核心 token 维度包括：

- `--client-bg`
- `--client-bg-soft`
- `--client-surface`
- `--client-elevated`
- `--client-line`
- `--client-text`
- `--client-muted`
- `--client-primary`
- `--client-primary-soft`
- `--client-accent`
- `--client-warm`
- `--client-shadow`
- `--client-overlay`

### 统一组件骨架

本轮新增并统一复用的用户端页面骨架位于：

- `src/components/client-ui/AppScaffold.tsx`
- `src/components/client-ui/SettingsDirectory.tsx`
- `src/features/settings/UnifiedSettingsPages.tsx`
- `src/features/settings/portalSettingsState.ts`

主要负责：

- 固定顶部导航：`AppTopBar`
- 页面壳层与响应式容器：`PageScaffold`
- 首屏主视觉区：`HeroHeader`
- 统一分组区块：`SectionBlock`
- 统一列表项：`UnifiedListItem`
- 固定底部操作区：`StickyBottomBar`
- 设置入口行：`SettingsEntryRow`
- 设置目录页与二级设置页：`SettingsHomePage`、`SettingsSection`、`SettingsListItem`、`SettingsDetailPage`、`SettingsRadioListPage`
- 三端统一设置模块：`UnifiedSettingsPage`、`UnifiedSettingsThemePage`、`UnifiedSettingsLanguagePage`、`UnifiedSettingsPortalPage`、`UnifiedSettingsProfilePage`

### 响应式适配策略

采用 mobile-first，但不再把桌面端限制在手机壳宽度里：

- 手机
  - 单列为主
  - 底部导航保留原结构
  - 详情页和设置页使用完整页面跳转
- 平板
  - 首页、详情页、预约页、设置页开始使用自然双列
  - 信息区与操作区横向展开
- 桌面 / Web 宽屏
  - 页面主容器放宽到 `max-w-[1480px]`
  - 底部导航独立居中，但内容区按宽屏重新组织
  - 首页、详情页、预约页采用左右分栏，不再把所有内容挤成窄列

### 各端布局变化规则

- 首页：
  - 手机为纵向 section 流
  - 平板 / 桌面拆成主视觉 + 推荐内容的多列布局
- 详情页：
  - 手机以主图 + 摘要 + section 纵向展开
  - 平板 / 桌面拆成信息列 + 预约 / 关联内容列
- 预约页：
  - 手机以步骤流为主
  - 平板 / 桌面拆成配置列 + 确认列
- 设置页：
  - 首页改为目录式总览
  - 二级页承接主题、语言、身份、通知等详细操作

### 设置中心结构

设置统一从【我的】页右上角齿轮进入：

- 外观与系统
  - UI 切换：`/me/settings/theme`
  - 语言切换：`/me/settings/language`
  - 身份切换：`/me/settings/portal`
  - 常用入口（仅用户端）：`/me/settings/home-shortcuts`
- 个人资料与认证
  - 资料编辑
  - 本人验证 / 店铺资质：`/me/settings/verification`
  - 服务范围（技师端）：`/me/settings/service-range`
- 账户与安全
  - 账户与安全：`/me/settings/account`
- 通知与隐私
  - 通知设置：`/me/settings/notifications`
- 其他
  - 帮助与反馈：`/me/settings/help`
  - 关于 NeeDo：`/me/settings/about`

### 三端设置页统一重构

当前已经把用户端、技师端、商户端的设置页真正收口到同一套模块体系里，不再只是共用右上角齿轮按钮。

#### 重构前的差异

- 用户端已经有独立设置路由与目录式首页：`/me/settings*`
- 技师端仍把设置塞在 `我的` 页 hash 区域里：`/technician/me#settings`
- 商户端仍把偏好、经营开关、资料按钮堆在 `我的` 页内部：`/merchant/me`
- 主题、语言之外的很多设置能力仍然是三端各自实现

#### 统一后的模块结构

- 页面与路由统一由 `src/features/settings/UnifiedSettingsPages.tsx` 承载
- 三端共有设置状态统一由 `src/features/settings/portalSettingsState.ts` 管理
- 通用设置骨架继续复用 `src/components/client-ui/SettingsDirectory.tsx`
- 用户端 `src/pages/user/UserSettingsPages.tsx` 现在只是对统一模块的轻量封装，不再维护独立页面逻辑

#### 已直接复用用户端模块的功能

- UI 切换
- 语言切换
- 身份切换
- 账户与安全
- 通知设置
- 帮助与反馈
- 关于 NeeDo
- 验证 / 资质页骨架

#### 作为技师 / 商户独有项保留的能力

- 技师端保留：
  - 服务范围
  - 接单 / 位置 / 日程提醒开关
  - 技师资料编辑内容
- 商户端保留：
  - 店铺信息维护
  - 店铺资质
  - 店铺上线 / 自动确认 / 即时预约 / 评价提醒等经营开关
  - 店铺 PC 后台入口

这些独有能力不再单独设计页面，而是挂到同一套设置首页、同一套详情页骨架和同一套列表项样式下。

#### 三端显示项配置方式

- `portal="user"`
  - 显示用户端基础设置和常用入口
- `portal="technician"`
  - 复用用户端公共设置
  - 追加服务范围与技师工作相关开关
- `portal="merchant"`
  - 复用用户端公共设置
  - 追加店铺信息维护、店铺资质与经营开关

最终效果是：

- 用户端设置页 = 基准实现
- 技师端设置页 = 基准实现 + 技师独有项
- 商户端设置页 = 基准实现 + 商户独有项
- 三端设置首页、子页、状态展示与跳转逻辑都由同一套模块维护

### 本轮整合掉的重复能力

- 把主题、语言、身份切换从分散入口收口到设置中心
- 把技师端 `我的` 页里的内嵌设置区替换成统一设置路由
- 把商户端 `我的` 页里的偏好面板、经营开关和资料入口替换成统一设置路由
- 把商户端首页营业状态改为读取统一设置状态，而不是单页本地状态
- 把资料编辑从我的页内全屏层收口到独立设置页
- 把订单详情从列表覆盖层收口为真实详情页
- 把首页里重复的碎片入口合并为首屏主操作区 + 常用筛选区
- 把详情页里过多的重卡片整理为自然 section + 轻分隔结构
- 把 IM 模块的顶部栏、列表项和信息卡统一接入新主题 token

### 参考视觉方向

- 黑金版重点参考图 1：
  - 首页主视觉、店铺 / 资料详情页、固定底部 CTA 的高级深色表达
- 白绿版重点参考图 2：
  - 搜索页、预约页、设置页、动态页和高频浏览列表的清爽秩序感

## 2026-04 Social Module Rebuild

这一轮把旧 `MomentsPage` 的近况卡片流，重构成了接近 X / Twitter 结构的统一社交模块。重点不是单页换皮，而是把时间线、发帖、帖子详情、个人主页、店铺主页、技师主页、互动状态和关注关系收口到同一套前端状态流里。

## 2026-04 Technician Schedule Rebuild

本轮新增了技师端【我的日程】的独立重构实现，只重做技师端 `我的日程`，不改 `排班设置` 的三步结构、不改底部导航，也不改自动化排班逻辑本身。

### 代码位置

- 技师日程领域模型：`src/features/technician-schedule/model.ts`
- 技师日程共享状态：`src/state/technicianScheduleStore.ts`
- 技师日程页面与独立路由页：`src/features/technician-schedule/route-pages.tsx`
- 技师端入口接入：`src/pages/mobile/TechnicianPortalPage.tsx`
- 技师端独立路由：
  - `/technician/schedule`
  - `/technician/schedule/new`
  - `/technician/schedule/events/:eventId`
  - `/technician/schedule/events/:eventId/edit`
  - `/technician/schedule/shifts/:shiftId/transfer`

### 新的我的日程页面结构

`我的日程` 现在固定为下面这套顺序：

1. 4 项状态摘要
   - 已确定勤务时间
   - 已预约
   - 空闲
   - 待定
2. 标题 `日程表`
3. 视图切换 `日 / 周 / 月`
4. 当前周期日期栏
5. 简报
6. 日程展示区

旧的 `查看当前日程状态` 原有字段、旧统计块和 `列表视图` 入口已经从 `我的日程` 主结构中移除。

### 4 项状态摘要计算逻辑

顶部 4 项摘要按当前视图周期动态计算，统一按小时显示，并保留 1 位小数：

- 已确定勤务时间
  - 来源：店铺最终确认的班次区间
  - 计算：当前周期内确认班次区间并集的总时长
- 已预约
  - 来源：预约 / 订单占用区间
  - 计算：当前周期内预约区间并集的总时长
- 空闲
  - 来源：技师自己设定的 `可上班` 行程
  - 计算：`可上班区间 - 已预约区间`
- 待定
  - 来源：预约落在店铺确认班次外的部分
  - 计算：`已预约区间 - 已确定勤务时间区间`

实现里对时间段做了并集 / 差集处理，不是简单用卡片数量相减。

### 日 / 周 / 月切换逻辑

- 默认视图：`日`
- 日视图
  - 日期栏显示单日，例如 `2026年4月18日`
  - 左右切换为前一天 / 后一天
- 周视图
  - 使用周一到周日
  - 日期栏显示完整周范围，例如 `2026年4月14日 - 2026年4月20日`
  - 左右切换为前一周 / 后一周
- 月视图
  - 日期栏显示当前年月，例如 `2026年4月`
  - 左右切换为前一月 / 后一月

周 / 月视图都保留“选中某一天看当天详情”的交互：

- `仅显示行程`
  - 展示选中日期的紧凑日程列表
- `显示全部时间`
  - 展示选中日期的完整时间轴，支持点击空白时间新增行程

### 简报计算逻辑

简报跟随当前视图周期同步更新，包含 3 项：

- 一共有多少单
  - 统计当前周期内预约记录数量
- 是否有撞车
  - 检测当前周期内非背景时段是否出现时间重叠
  - 包含预约与阻塞类行程的时间冲突
- 预计流水
  - 汇总当前周期内预约金额
  - 若金额缺失则显示 `待接入`

### 新建行程页结构

点击空白时间会进入完整新页面，不再是简单小浮层。页面结构包括：

1. 顶部固定导航
   - 关闭
   - 保存
2. 标题输入
3. 日期 / 开始时间 / 结束时间 / 全天 / 重复
4. 高频快捷类型
   - 可上班
   - 请假
   - 锁定
   - 休息
   - 移动
5. 同步对象选择
6. 备注 / 地点 / 提醒 / 可见性等扩展字段

### 同步规则

新增行程时按是否落在店铺确认班次内决定默认同步逻辑：

- 在店铺已确认时间内
  - 默认自动勾选店铺为同步对象
  - 用户仍可继续添加同事 / 好友等其他同步对象
- 在店铺已确认时间外
  - 不默认同步店铺
  - 完全由用户自己选择同步对象

同步对象选择器当前接入了：

- 店铺
- 同店同事
- 部分好友 / 联系人 mock 数据

### 转让流程与候选逻辑

点击确认班次或确认班次内的行程，会进入只读查看页：

- 不能直接改时间
- 不能直接改类型
- 不能直接改同步对象
- 可以进入 `转让给同事`

转让流程规则如下：

- 候选人范围只允许同一家商户员工 / 技师
- 候选人可多选
- 可设置 `需要转让给几个人`
- 允许“候选人数 > 定员”
- 系统按最快接受顺序占位
- 同事点击接受时会再次校验
  - 当前是否有时间冲突
  - 当前是否已满员
- 满员后继续接受会返回 `接受转让失败`

当前实现的转让状态：

- `transfer_pending`
  - 转让中，发起人仍保留班次
- `transfer_completed`
  - 已转让，发起人班次转灰，只读展示
- `transfer_failed`
  - 所有邀请处理完但未满员
- `transfer_cancelled`
  - 发起人取消转让

邀请状态包括：

- `pending`
- `accepted`
- `rejected`
- `failed_conflict`
- `failed_capacity`
- `cancelled`

候选人冲突判断会检查：

- 已确认班次
- 已预约
- 已锁定
- 已请假
- 已休息
- 已移动
- 其他阻塞类行程

### 当前数据联动方式

当前仓库仍是前端 + 本地 mock state 结构，没有独立真实后端。本次 `我的日程` 重构继续走“可计算、可写回、可持久化”的共享状态，而不是静态页面：

- 技师 / 店铺 / 同事名单来自现有实体数据
- 预约金额沿用现有订单 mock 数据
- 新增行程、同步对象、转让请求、邀请状态都写入 `technicianScheduleStore`
- 页面刷新后会从本地存储恢复

### 2026-04 技师端日程页紧凑化与主题统一补充

本轮补充只处理技师端日程相关页面的 UI 结构与视觉显色，不改排班逻辑、日程逻辑、统计含义、新增行程规则或转让规则。

#### 本轮统一处理的页面

- `我的日程`
- `排班设置`
- `新增行程 / 编辑行程`
- `行程详情`
- `转让给同事`
- 技师端入口中的日程主切换壳层

#### 已完成的紧凑化 section

- 顶部 4 项状态摘要
  - 改成单行 4 列紧凑摘要
  - `已确定勤务时间` 改名为 `确定上班`
  - 保留 1 位小数与 `小时` 单位
- `日程表`
  - 标题与 `日 / 周 / 月` 切换合并到同一行
  - 周期切换栏压缩为更低高度
- `简报`
  - `共有多少单` 改为 `单数`
  - `是否有撞车` 改为 `状态`
  - `单数 + 状态 + 预计流水` 改成单行摘要
- `日程展示区`
  - 标题与 `仅显示行程 / 显示全部时间` 合并到同一行
  - 原双大按钮改成单个 segmented toggle
- `排班设置`
  - 入口切换壳层与步骤切换按钮收口到统一暗色 token
  - 规则、生效范围、一键排班、按日微调、确认结果等 section 改为更紧凑的深色容器
- `新增 / 编辑行程`、`详情`、`转让`
  - 表单卡片、信息卡片、候选列表、状态块统一减小 padding 与无效留白

#### 标题说明改造

原来技师端日程相关页面里常见的“大标题 + 下一行小字说明”结构，已统一改成：

- 只保留主标题
- 标题右侧使用圈 `i`
- 点击后以轻量说明浮层展示原说明

本轮已覆盖的说明型标题包括：

- `日程表`
- `日程展示区`
- `确认班次规则`
- `时间设置`
- `同步对象`
- `备注与其他字段`
- `转让定员`
- `候选同事`
- `排班设置` 中的规则范围、生成器、按日微调等主 section

#### 单行摘要调整

- 状态摘要：
  - `确定上班 / 已预约 / 空闲 / 待定`
  - 统一压成单行 4 项 dashboard summary
- 简报：
  - `单数`
  - `状态`
  - `预计流水`
  - 统一压成单行，其中 `预计流水` 使用更长卡片

#### 显色与高亮修正

技师端日程相关页面不再使用旧的浅底 `bg-white / bg-paper / bg-moss` 组合，而是统一回到 client 主题 token，重点包括：

- `--client-bg`
- `--client-surface`
- `--client-elevated`
- `--client-line`
- `--client-text`
- `--client-muted`
- `--client-primary`
- `--client-primary-soft`
- `--client-accent`
- `--client-warm`

统一规则：

- 页面背景、容器、输入框、切换器统一使用 client 主题 token
- `noir-gold` 与 `jade-light` 共用同一套日程组件与结构，只切换主题 token
- 选中态、激活态统一使用 `primary` 与 `primary-soft`
- 分隔与描边统一使用 `line`
- 语义色不跟主题切换而改变，只跟日程状态语义绑定

#### 日程语义色映射

- `可排班时间`
  - 淡蓝色
- `确认勤务时间`
  - 蓝色
- `确定的行程`
  - 绿色
- `撞车的行程`
  - 红色
- `未确定行程`
  - 红色
  - 同时使用虚线边框
- `其他行程`
  - 黄色

这套语义色同时用于：

- 日程列表卡片
- 完整时间轴中的时间块
- 月视图里的行程小块
- 日程相关 badge / 状态标签

#### 过往行程变暗规则

- 所有已过去的日程块，都在原有语义色基础上叠加 `50%` 黑色
- 只降低明度和视觉优先级，不改变原本属于哪一种语义色
- 适用于：
  - 过往可排班
  - 过往确认勤务
  - 过往确定行程
  - 过往撞车行程
  - 过往未确定行程
  - 过往其他行程

#### 黑金 / 白绿共用方式

- 技师端入口日程壳层与 `src/features/technician-schedule/route-pages.tsx` 统一改为读取当前 `ClientThemeProvider`
- `我的日程`、`新增 / 编辑行程`、`详情`、`转让` 不再写两套页面
- 黑金版和白绿版共用同一套结构、组件、交互与语义色 helper
- 仅背景、容器、文本、描边、主高亮等主题 token 跟随 `noir-gold / jade-light` 切换

#### 新增 / 编辑行程页补充

- 顶部右上角保存改为底部居中的悬浮主按钮
- 保存按钮在滚动时保持固定于底部浮层区，不再挤占顶部导航主操作位
- `行程种类` 扩展为 9 个紧凑 icon chip：
  - `可上班 / 请假 / 锁定 / 休息 / 移动 / 会议 / 会食 / 约会 / 假期`
- `同步对象` 移到页面最底部
- `同步对象` 默认折叠，并在折叠态显示当前同步摘要

#### 本轮紧凑化细节

- 顶部 4 个状态摘要继续保持单行 4 列
- 小时数字缩小并使用更紧的 baseline，对齐 `小时` 小字，避免截断和错位
- `简报` 中的 `状态` 改为与 `单数 / 预计流水` 一致的摘要结构，不再嵌套独立小框
- `正常` 状态固定使用绿色
- `日程展示区` 的 segmented toggle 文案改为 `仅行程 / 全时间`
- `日程展示区` 标题与切换控件继续放在同一行，标题左、切换右

### 架构位置

- 统一 social 状态层：`src/features/social/context.tsx`
- 数据结构定义：`src/features/social/types.ts`
- 前后端接口契约映射：`src/features/social/contracts.ts`
- 路由路径工具：`src/features/social/paths.ts`
- 通用渲染组件导出：`src/features/social/components/SocialUi.tsx`
- 统一社交 UI 实现：`src/features/social/components/UnifiedSocialUi.tsx`
- 统一 Composer UI 实现：`src/features/social/components/UnifiedComposerUi.tsx`
- 页面入口：
  - `src/features/social/pages/SocialTimelinePage.tsx`
  - `src/features/social/pages/SocialComposerPage.tsx`
  - `src/features/social/pages/SocialPostDetailPage.tsx`
  - `src/features/social/pages/SocialProfilePage.tsx`
  - `src/features/social/pages/SocialRelationshipsPage.tsx`
  - `src/features/social/pages/SocialSearchPage.tsx`
  - `src/features/social/pages/SocialNotificationsPage.tsx`
  - `src/features/social/pages/SocialRepostPage.tsx`
  - `src/features/social/pages/SocialMediaViewerPage.tsx`

### 统一核心模块

当前 social 模块已经不再按用户 / 技师 / 店铺拆三套 UI，而是统一到一套模块里：

- `UnifiedTimelinePage`
  - 实际落点：`src/features/social/pages/SocialTimelinePage.tsx`
- `UnifiedPostItem`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostItem`
- `UnifiedPostDetailPage`
  - 实际落点：`src/features/social/pages/SocialPostDetailPage.tsx`
- `UnifiedComposerPage`
  - 实际落点：`src/features/social/pages/SocialComposerPage.tsx`
  - 组合子模块：
    - `ComposerTopBar`
    - `ComposerTextArea`
    - `ComposerMediaPicker`
    - `ComposerMediaGrid`
    - `ComposerSettingList`
    - `ComposerSettingItem`
    - `ComposerVisibilitySelector`
    - `ComposerMentionSelector`
    - `ComposerLocationSelector`
- `UnifiedSocialProfilePage`
  - 实际落点：`src/features/social/pages/SocialProfilePage.tsx`
- `UnifiedProfileTopBar`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileTopBar`
- `UnifiedProfileHeader`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileHeader`
- `UnifiedTimelineTabs`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedTimelineTabs`
- `UnifiedMediaBlock`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedMediaBlock`
- `UnifiedProfileTabs`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedProfileTabs`
- `UnifiedInteractionBar`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedInteractionBar`
- `UnifiedReplyFeed`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedReplyFeed`
- `UnifiedFollowButton`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedFollowButton`
- `UnifiedPostText`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostText`
- `UnifiedPostTextRenderer`
  - 实际导出：`UnifiedSocialUi.tsx` 中的 `UnifiedPostTextRenderer`

三端差异只允许通过以下维度生效：

- `scope = user / merchant / technician`
- `entityType = user / technician / shop`
- 关注、发帖、资料 CTA 的权限配置
- `extraProfileFields` 和 `postType` 的字段映射
- 页面侧栏与扩展 section 的可见性

### 页面清单

- 动态首页：
  - 用户端 `/moments`
  - 商户端 `/merchant/moments`
  - 技师端 `/technician/moments`
- 发动态页：`.../moments/compose`
- 帖子详情页：`.../moments/posts/:postId`
- 回复串页：`.../moments/posts/:postId/replies`
- 转发 / 引用流程页：`.../moments/posts/:postId/repost`
- 媒体查看页：`.../moments/posts/:postId/media/:mediaId`
- 搜索页：`.../moments/search`
- hashtag 结果页：`.../moments/tags/:tag`
- 草稿列表页：`.../moments/drafts`
- 通知页：`.../moments/notifications`
- 统一资料页：
  - 用户 `/profiles/user/:id`
  - 技师 `/profiles/technician/:id`
  - 店铺 `/profiles/shop/:id`
- 关注 / 粉丝列表：
  - `.../profiles/:entityType/:id/followers`
  - `.../profiles/:entityType/:id/following`

### 时间线结构

- 顶部栏固定，右侧保留搜索与通知入口
- 顶部 tabs 固定吸附，默认使用 `推荐 / 关注`
- 主内容区使用连续单列时间线，不再给每条动态套独立厚卡片
- 时间线顶部保留轻量发帖入口，列表主体通过细分隔线自然堆叠
- 桌面端保留左右侧栏，但中心仍是 Twitter/X 式中轴主流

### Post Item 结构

统一 `UnifiedPostItem` 按下面顺序渲染：

1. 轻量上下文行：转发、回复、置顶、公告等关系提示
2. 左侧头像列
3. 第一行身份信息：显示名称、认证、handle、时间、更多菜单
4. 正文区：支持 `@mention`、`#hashtag`、URL 和长文折叠
5. 引用动态区：引用卡片整体可点进原帖
6. 媒体区：图片 / 视频统一走 `UnifiedMediaBlock`
7. 互动栏：回复、转发、点赞、浏览、收藏、分享

补充规则：

- 时间线正文默认超过约 240 字会折叠，详情页自动展开全文
- post item 内不再塞关注按钮，避免干扰信息主链路
- 引用动态永远在媒体之前，和 Twitter/X 的组织顺序保持一致

### 媒体展示规则

- 单图：使用单一大矩形媒体块，保持自然裁切，不拉伸
- 双图：双列并排，统一高度
- 三图：左大右双小
- 四图：`2 x 2` 网格
- 四图以上：第四格叠加 `+N`
- 视频：时间线展示封面、居中播放按钮、角标时长；详情和媒体页再进入实际播放
- 媒体查看页：使用独立深色新页面，支持缩略图切换和前后浏览

### 主页结构

- 顶部固定导航
- 头图 `cover`
- 头像跨越头图与正文交界
- 右上主操作按钮：编辑资料 / 关注 / 发私信 / 业务动作
- 基础资料：名称、认证、handle、bio、位置、生日 / 成立日、加入时间、关注 / 粉丝
- 用户 / 技师 / 店铺扩展字段不再拆成顶部大卡片，而是收进同一套 header 的轻量扩展信息行里
- tabs 固定吸附，默认使用 `动态 / 回复 / 媒体 / 喜欢`
### Profile Header 补齐内容

- `UnifiedProfileTopBar` 现在使用固定置顶双层标题结构：
  - 第一行显示当前主页名称
  - 第二行显示 `X 件动态 / X posts`
  - 左侧保留返回按钮，右侧保留搜索按钮
- `UnifiedProfileHeader` 现在严格按下面顺序组织：
  1. 头图 cover
  2. 头像与右侧主按钮
  3. 名称 / 认证 / handle
  4. 简介与扩展说明
  5. 地区 / 生日或成立日 / 加入时间
  6. 关注 / 粉丝统计
- 头像不再单独漂在资料区里，而是压在头图底部边缘，并带页面背景描边，保证与 cover 分层明确
- 头像统一走 `src/components/ui/AvatarImage.tsx`，当前规范为圆角正方形头像，不再使用圆形头像
- tabs 不再混在大卡片导航里，而是在资料区下方自然承接时间线

### 头图与头像关系

- 头图位于固定顶部导航下方，宽度撑满资料主列
- 头图底部预留头像压叠空间
- 头像使用统一 `AvatarImage` 模块的大尺寸圆角正方形规格，并通过 `border-[color:var(--client-bg)]` 做外圈描边
- 右侧按钮区与头像形成对角平衡，避免漂浮进头图中央

### Tabs 结构与吸附逻辑

- 初始状态下，tabs 位于资料区与关注统计区之后
- 滚动时，tabs 到达顶部后吸附到 `UnifiedProfileTopBar` 下方
- 顶部导航与 tabs 共同构成固定区域
- 下方时间线继续在其下面滚动，不会与 tabs 重叠错位
- 当前版本已确保 `动态 / 回复 / 媒体 / 喜欢` 4 个 tab 与统一时间线 item 结构直接衔接

### 用户 / 技师 / 店铺扩展方式

- 用户主页：
  - 默认显示名称、认证、handle、bio、地区、生日、加入时间、关注关系与动态 tabs
- 技师主页：
  - 通过 `headline + extraProfileFields` 扩展服务标签、最近可约、语言等信息
- 店铺主页：
  - 通过 `headline + extraProfileFields` 扩展营业状态、地址摘要、预约入口等信息
- 三种身份继续共用同一套 `UnifiedProfileTopBar + UnifiedProfileHeader + UnifiedProfileTabs` 骨架

### Tabs 逻辑

- 时间线 tabs：`推荐 / 关注`
- 主页 tabs：`动态 / 回复 / 媒体 / 喜欢`
- 搜索 tabs：`综合 / 用户 / 动态 / 媒体 / 标签`
- 关注关系页：`粉丝 / 关注`
- 所有 tabs 都统一成 Twitter/X 式文本 tab + 底部指示条，不再使用胶囊按钮

### Composer Page 结构

- 发动态页现在是独立新页面，不再是面板式表单，也不是覆盖式弹窗
- 顶部固定栏统一为：
  - 左侧 `取消`
  - 右侧 `发表 / 回复 / 保存`
- 页面主体严格按下面顺序组织：
  1. 大文本输入区
  2. 媒体预览与添加区
  3. 所在位置 / 提醒谁看 / 谁可以看 设置列表
- 页面主体通过 `MobileShell(navItems=[])` 渲染，发帖时不再复用底部导航壳

### Composer 媒体区规则

- 已上传媒体统一显示为圆角缩略图块
- 媒体区始终保留一个 `+` 添加位，结构与缩略图块尺寸一致
- 图片与视频继续走统一 social media schema，发布后沿用时间线媒体块
- 每个媒体块支持删除，点击缩略图可直接预览原图 / 原视频
- 当前上限默认为 6 个媒体位，便于手机、平板、桌面三端维持一致节奏

### Composer 设置项规则

- `所在位置`
  - 进入轻量地点选择页
  - 支持当前地区快捷选项与搜索
- `提醒谁看`
  - 进入联系人 / 用户轻量选择页
  - 支持搜索和多选
  - 返回后在右侧显示名称摘要或人数摘要
- `谁可以看`
  - 当前支持 `公开 / 仅关注可见 / 仅好友可见 / 仅自己可见`
  - 进入轻量选择页完成切换

### Composer 草稿规则

- 新动态在输入文本、添加媒体、修改可见范围、位置或提醒对象后会自动保存到本地草稿
- 点击取消时：
  - 无内容直接返回
  - 有内容时提示“放弃或保留草稿后退出”
- 再次进入同一路径时，会恢复对应草稿
- 编辑已有动态时仍会提示是否放弃修改，但不会覆盖正式草稿列表

### Icon 规范

- 动态模块内互动 icon 统一采用线性、低干扰、信息优先的样式
- 激活态统一使用现有品牌色 token，不复用 Twitter 官方红绿蓝状态色
- 视频入口统一带居中播放 icon，置顶提示使用轻量 pin icon

### 三端统一方式

- 用户端、商户端、技师端都走同一组 social page 与 UI 组件
- 路由差异只通过 `scopePrefix(user / merchant / technician)` 生成
- 数据差异只通过 `entityType`、`extraProfileFields`、权限和 CTA 映射处理
- 发帖、详情、资料、搜索、媒体、关系、草稿全部共享同一个 social store

### 保留的品牌 UI 规则

这次是把“结构与交互”重构成接近 Twitter / X，而不是直接换 Twitter 皮肤。当前实现明确保留了原有 App 的：

- 主题 token：继续使用 `--client-*` 双主题 token，不改品牌主色体系
- 视觉语言：继续沿用当前圆角、阴影、字体层级和明暗主题表达
- 路由外壳：继续使用现有 `PageScaffold + AppTopBar + MobileShell`
- 业务入口：底部导航入口数量、顺序和主交互逻辑不变

当前调整的是：

- 时间线改为连续主列信息流，而不是近况卡片流 / 商品卡片流
- 主页补齐为 `固定顶部导航 + 头图 + 头像压叠 + 资料区 + 关注统计 + sticky tabs + 动态流` 的统一 profile 结构
- 详情页改为主帖 + 数据汇总 + 互动条 + 回复串
- 发帖页重构为原生社交产品风格的新页面结构，并补齐媒体区、设置项列表和草稿离开逻辑

### 统一 Social Profile 结构

三种身份不再各自维护三套社交主页骨架，全部走统一 `SocialProfile`：

- 共享字段：
  - `id`
  - `entityType`
  - `displayName`
  - `handle`
  - `avatar`
  - `coverImage`
  - `bio`
  - `location`
  - `birthday`
  - `joinedAt`
  - `verifiedStatus`
  - `followerCount`
  - `followingCount`
  - `extraProfileFields`
- 用户差异：
  - 会员等级
  - 语言
  - 积分 / 下次预约信息
- 店铺差异：
  - 营业状态
  - 地址摘要
  - 营业时间
  - 预约入口
  - 公告 / 媒体焦点
- 技师差异：
  - 服务标签
  - 最近可预约状态
  - 语言
  - 预约入口

页面层只识别 `entityType + extraProfileFields`，不再按用户 / 技师 / 店铺分三套 social 页面。

### 帖子数据结构

统一 `SocialPost` 已覆盖这次需要的 item 类型：

- 纯文本动态
- 单图动态
- 多图动态
- 视频动态
- 回复动态
- 转发动态
- 引用转发
- 店铺公告型动态
- 技师日常型动态
- 置顶动态

核心字段包括：

- `authorId`
- `authorType`
- `text`
- `media`
- `hashtags`
- `mentions`
- `quotePostId`
- `repostPostId`
- `replyToPostId`
- `likeCount`
- `replyCount`
- `repostCount`
- `bookmarkCount`
- `viewCount`
- `isPinned`
- `visibility`
- `status`
- `postType`

### 互动状态流

当前实现采用浏览器内 mock social store，但接口命名已对齐 REST 合同，方便后续替换真实后端：

- 首页：
  - `GET /social/timeline/for-you`
  - `GET /social/timeline/following`
- 发帖：
  - `POST /social/posts`
  - `PATCH /social/posts/:id`
  - `DELETE /social/posts/:id`
- 互动：
  - `POST /social/posts/:id/like`
  - `POST /social/posts/:id/repost`
  - `POST /social/posts/:id/bookmark`
  - `POST /social/posts/:id/reply`
  - `POST /social/posts/:id/quote`
- 资料页：
  - `GET /social/profiles/:entityType/:id`
  - `GET /social/profiles/:entityType/:id/posts`
  - `GET /social/profiles/:entityType/:id/replies`
  - `GET /social/profiles/:entityType/:id/media`
  - `GET /social/profiles/:entityType/:id/likes`
- 关注：
  - `POST /social/follows`
  - `DELETE /social/follows/:entityType/:id`
  - `GET /social/profiles/:entityType/:id/followers`
  - `GET /social/profiles/:entityType/:id/following`
- 搜索：
  - `GET /social/search`
  - `GET /social/search/users`
  - `GET /social/search/posts`
  - `GET /social/search/tags/:tag`

当前 store 已支持：

- 点赞 / 收藏 / 转发 / 分享状态同步
- 回复计数、转发计数、点赞计数、浏览计数联动
- 草稿保存
- 关注 / 取消关注
- 主页置顶 / 取消置顶
- 帖子内关注按钮与主页关注按钮状态同步
- follow feed
- hashtag 时间线页
- reply / like / repost / quote / follow / mention 通知流

### 多端适配策略

- 手机：
  - 单列主时间线
  - 顶部栏固定
  - 底部导航保持现有结构
  - 发帖入口同时保留流内入口和右下角 FAB
- 平板：
  - 主内容列更宽，tabs 和时间线保持单主列逻辑
  - 搜索、资料页和详情页开始出现右侧辅助信息列
- 桌面：
  - 动态首页采用左资料摘要 + 中时间线 + 右趋势 / 通知预览
  - 资料页和详情页采用主列 + 侧栏结构
  - 内容宽度仍跟随当前产品外壳，不脱离原主题系统
  - 主页媒体 tab 会切到媒体墙，而不是简单拉伸手机单列

### 统一入口说明

- 旧 `src/pages/mobile/MomentsPage.tsx` 已改为新的 social timeline 入口包装器。
- 旧 `src/pages/user/ProfileDetailPage.tsx` 已改为统一 social profile 页面包装器。
- `src/shared/profile-detail/paths.ts` 里的店铺资料跳转，用户端也已改为 `/profiles/shop/:id`，不再回落到旧店铺详情页。
- IM 模块里的资料页跳转继续走 `src/features/im/role-config.ts` 中的 `resolveImProfilePath()`，统一回到同一套 social profile 路由。

### 当前实现边界

- 当前 social 模块的数据源仍是浏览器内 mock state，并未接真实服务端。
- link preview、热门榜单和更细的通知中心 UI 已预留接口与页面位置，但还没接真实抓取 / 排行数据。
- 资料编辑按钮当前仍只保留前端占位，后续可直接接入设置中心或 profile 编辑流。
- IM 内部仍保留一部分旧式信息展示块，但资料跳转路径已经先统一收口到了同一套 social profile 页面上。

## IM Module Redesign

2026-04 这一轮已对用户端 `通讯录 + 聊天` 做了完整重做，目标是把体验、信息架构和交互习惯统一收敛到“高度接近微信”的闭环，同时保留当前项目的视觉和技术栈。

当前落地范围：

- 统一基准实现：用户端 `src/features/im/*`
- 已切换到同一套模块：用户端、商户端、技师端的 `/messages`、`/contacts` 及其子页
- 角色差异不再通过独立页面实现，而是通过 `scope + role config` 做可见性、能力和资料跳转适配

### Scoped Routes

三端统一复用相同的页面骨架和交互逻辑，只是路由前缀不同：

- 用户端
  - `/messages`
  - `/messages/new`
  - `/messages/:conversationId`
  - `/messages/:conversationId/info`
  - `/messages/:conversationId/media`
  - `/contacts`
  - `/contacts/requests`
  - `/contacts/:contactId`
  - `/contacts/blacklist`
  - `/contacts/tags`
  - `/contacts/service-accounts`
  - `/im/search`
- 商户端
  - `/merchant/messages`
  - `/merchant/messages/new`
  - `/merchant/messages/:conversationId`
  - `/merchant/messages/:conversationId/info`
  - `/merchant/messages/:conversationId/media`
  - `/merchant/contacts`
  - `/merchant/contacts/requests`
  - `/merchant/contacts/:contactId`
  - `/merchant/contacts/blacklist`
  - `/merchant/contacts/tags`
  - `/merchant/contacts/service-accounts`
  - `/merchant/im/search`
- 技师端
  - `/technician/messages`
  - `/technician/messages/new`
  - `/technician/messages/:conversationId`
  - `/technician/messages/:conversationId/info`
  - `/technician/messages/:conversationId/media`
  - `/technician/contacts`
  - `/technician/contacts/requests`
  - `/technician/contacts/:contactId`
  - `/technician/contacts/blacklist`
  - `/technician/contacts/tags`
  - `/technician/contacts/service-accounts`
  - `/technician/im/search`

### Module Structure

- `src/features/im/model.ts`
  - IM 统一 schema、排序 / 搜索 / 摘要 / 分组纯函数
  - 纯数据变更逻辑：发消息、撤回、好友申请通过、建群等
- `src/features/im/seed.ts`
  - 按 `user / merchant / technician` 生成同一套联系人 / 会话 / 消息结构
  - 用户端种子继续作为基准，再补齐商户端与技师端的统一 schema seed
- `src/features/im/api.ts`
  - `/api/im/*` mock API 与实时事件模拟
  - 已改成 `scope-aware`，同一套 API 可按角色读取不同 mock 数据库
- `src/features/im/store.ts`
  - 三端共享的 IM 统一状态源
  - 管理会话、联系人、好友申请、消息缓存、草稿、本地搜索历史
- `src/features/im/scope.tsx`
  - 统一 `ImScopeProvider`
  - 给页面层注入 `user / merchant / technician`
- `src/features/im/role-config.ts`
  - 角色化配置层
  - 负责联系人可见范围、聊天能力、资料页跳转、统一路由前缀
- `src/features/im/components.tsx`
  - IM 模块共用 UI 原件：列表行、消息气泡、底部抽屉、详情块等
- `src/features/im/chat-home.tsx`
  - 三端共用的聊天首页 / 会话列表页模块
  - 统一承接标题区、搜索框、会话列表、会话 item、摘要、时间和未读角标
- `src/features/im/pages.tsx`
  - 统一通讯录 / 聊天页面
  - 用户端、商户端、技师端都复用这一套页面实现
- `src/pages/user/MessagesPage.tsx`
  - 用户端聊天入口兼容层
- `src/pages/user/ContactsPage.tsx`
  - 用户端通讯录入口兼容层

建议理解为两层：

- 统一核心模块
  - `UnifiedContactsModule` = `src/features/im/pages.tsx + components.tsx + store.ts + api.ts + model.ts`
  - `UnifiedChatModule` = 同一套模块内的聊天页、会话页、消息渲染与详情页
- 角色适配层
  - `ImScopeProvider`
  - `role-config.ts`
  - 路由前缀和资料页跳转适配

### Chat Home Refresh

这次只重构聊天首页 / 会话列表页，不改聊天房间页、不改底部导航、不改会话数据来源和跳转逻辑。

重构前扫描到的三端现状差异：

- 用户端
  - 通过 `src/pages/user/MessagesPage.tsx` 作为兼容入口，再进入统一 IM 页面
- 商户端
  - 在 `src/App.tsx` 里直接用 `ImScopeProvider scope="merchant"` 挂载统一 IM 页面
- 技师端
  - 在 `src/App.tsx` 里直接用 `ImScopeProvider scope="technician"` 挂载统一 IM 页面
- 三端在页面接入层和角色配置层存在轻量差异：
  - 路由前缀不同
  - 底部导航配置不同
  - 联系人可见范围和能力开关不同
- 但聊天首页 UI 入口已经是同一套：
  - 三端最终都会进入 `src/features/im/pages.tsx` 的 `ImConversationListPage`
  - 原会话首页主要由 `SwipeActionRow + ConversationRow` 组合，结构统一但仍然保留较重的卡片式层级

统一后的聊天首页模块结构：

- `UnifiedChatHomePage`
  - 顶部标题区、页面背景、统一搜索入口承载层
- `UnifiedConversationSearchBar`
  - 扁平化搜索框，保留搜索 icon 与占位文案
- `UnifiedConversationList`
  - 会话列表承载层
- `UnifiedConversationItem`
  - 三端共用的单条会话行
- `UnifiedConversationMeta`
  - 统一管理右侧时间与未读区域
- `UnifiedUnreadBadge`
  - 更克制的未读数 / 红点样式
- `UnifiedConversationPreviewText`
  - 统一草稿、@我、链接、系统摘要等预览文本表现

本次去掉或收敛的多余框体：

- 去掉会话列表外层的大圆角卡片堆叠
- 去掉会话 item 的重描边和重阴影
- 去掉列表与搜索区之间重复的容器包裹关系
- 去掉会话项内部依赖多层 box 建层级的写法
- 将列表主层改为轻分隔 + 留白，而不是一条一个厚重卡片
- 左滑容器改成支持扁平列表模式，保留交互，不再强制套卡片外框
- 聊天首页背景统一改为轻遮罩叠加 `public/images/chat_bg.png`
  - 素材来源：`dist/images/chat_bg.png`

保持不变的逻辑：

- 底部导航结构与入口顺序
- 会话排序逻辑
- 搜索业务逻辑
- 左滑置顶 / 已读 / 免打扰 / 删除逻辑
- 未读、草稿、置顶、免打扰、群聊和系统消息数据来源
- 会话点击跳转与房间页功能
- 路由前缀与后端 / mock API 接口

### Role-Based Config

角色差异不再拆成独立页面，而是集中在配置层：

- `roleType`
  - `user`
  - `merchant`
  - `technician`
- `contacts visibility config`
  - 控制联系人列表里可见的 `person / technician / store / service`
- `chat capability config`
  - 控制是否允许群聊、语音 / 视频入口、可发送的消息类型、可分享的名片类型
- `profile card config`
  - 控制聊天 / 通讯录点击资料卡后跳转到哪套统一资料页
- `message action config`
  - 控制会话详情页里黑名单、删除联系人、查找聊天记录、媒体记录等开关

### Mock API

三端 IM 当前统一走 `/api/im/*` mock 接口，后端未接入时也可以完整跑通。

同一套接口通过 `scope` 区分角色视图：

- `scope=user`
- `scope=merchant`
- `scope=technician`

接口列表如下：

- 联系人
  - `GET /api/im/contacts`
  - `GET /api/im/contacts/:id`
  - `PATCH /api/im/contacts/:id/remark`
  - `POST /api/im/contacts/:id/block`
  - `DELETE /api/im/contacts/:id/block`
  - `DELETE /api/im/contacts/:id`
- 好友申请
  - `GET /api/im/friend-requests`
  - `POST /api/im/friend-requests/:id/accept`
  - `POST /api/im/friend-requests/:id/reject`
- 会话
  - `GET /api/im/bootstrap`
  - `GET /api/im/conversations`
  - `GET /api/im/conversations/:id`
  - `GET /api/im/conversations/:id/messages`
  - `POST /api/im/conversations`
  - `POST /api/im/conversations/:id/members`
  - `DELETE /api/im/conversations/:id/members/:userId`
  - `PATCH /api/im/conversations/:id/pin`
  - `PATCH /api/im/conversations/:id/mute`
  - `PATCH /api/im/conversations/:id/read`
  - `DELETE /api/im/conversations/:id`
  - `POST /api/im/conversations/:id/clear`
- 消息
  - `POST /api/im/messages/text`
  - `POST /api/im/messages/image`
  - `POST /api/im/messages/voice`
  - `POST /api/im/messages/video`
  - `POST /api/im/messages/file`
  - `POST /api/im/messages/location`
  - `POST /api/im/messages/contact-card`
  - `POST /api/im/messages/:id/recall`
  - `POST /api/im/messages/:id/resend`
  - `POST /api/im/messages/forward`
  - `GET /api/im/search`
- 上传
  - `POST /api/im/upload/init`
  - `POST /api/im/upload/complete`

### Realtime Events

当前 mock realtime 会通过浏览器事件总线模拟，并按 `scope` 隔离事件通道：

- `message.created`
- `message.updated`
- `message.recalled`
- `conversation.updated`
- `friend_request.created`
- `friend_request.updated`
- `contact.updated`
- `unread.updated`

### Local Persistence

- mock 数据库：`needo.im.mock-database.v2.<scope>`
- 草稿 / 搜索历史：`needo.im.ui.v2.<scope>`
- 会话列表滚动位置：`needo.im.messages.scroll.v2.<scope>`

### Config

IM 配置分成两层：

- 运行时基础配置
  - 保存在 `model.ts` / seed 输出的 `config`
- 角色适配配置
  - 保存在 `role-config.ts`

基础配置默认包括：

- `allowStrangerMessaging`
- `preserveConversationAfterDelete`
- `syncDraftAcrossDevices`
- `recallWindowMs`
- `separatorThresholdMs`

如果后续接真实后端，建议把它们迁移成服务端下发配置或实验开关。

### Compatibility And Migration

本次迁移后的处理方式：

- 用户端继续作为基准实现
- 商户端和技师端不再挂自己的独立聊天 / 通讯录页面
- 商户端和技师端当前主路由已经改为直接复用 `src/features/im/*`

当前保留的兼容层：

- `src/pages/user/MessagesPage.tsx`
- `src/pages/user/ContactsPage.tsx`
- `src/lib/messageCenter.ts`
  - 保留旧的深链与会话 ID 兼容，便于原有按钮和跳转继续工作

已退役的重复实现主链：

- 商户端原 `messages / contacts` 路由不再由 `MerchantPortalPage` 内部的独立消息页承接
- 技师端原 `messages / contacts` 路由不再由 `TechnicianPortalPage` 内部的独立消息页承接
- 三端统一改为通过 `ImScopeProvider + role-config + src/features/im/*` 进入同一套模块

### Test

```bash
npm test
```

当前已补的用例覆盖：

- 会话排序
- 联系人分组
- 草稿展示
- 发送状态与摘要更新
- 撤回逻辑
- 好友申请通过
- 搜索结果跳转定位所需的数据
- merchant / technician 作用域 seed 与兼容会话 ID
- 用户端统一资料元数据映射

### Replace With Real Backend

后续替换真实接口时，优先只改 `src/features/im/api.ts`：

- 保留 `store.ts` 作为页面与接口之间的统一状态层
- 保留 `model.ts` 作为前端视图模型与纯逻辑层
- 页面层不要直接读原始接口字段，尽量继续消费 store 和 model 输出

## Shift Planning System

当前仓库已经补齐一套可运行的“店铺开放排班 -> 技师反馈 -> 店铺最终确认”的闭环原型，并在保留手动 / 自动能力的基础上新增了“智能排班”第一版：

- 店铺后台调度中心：`/merchant-admin/dispatch-center`
  - 顶部横向导航里的一级入口是 `调度中心`
  - 默认进入 `排班当前周期确认`：`/merchant-admin/dispatch-center/current`
  - 二级切换只有两个核心子页：
    - `排班当前周期确认`：承接当前周期状态、异常和 confirmed_slots 投影
    - `排班`：`/merchant-admin/dispatch-center/schedule`，内部承载 `手动 / 自动 / 智能`
  - `调度中心` 内的二级切换条已做成 sticky，滚动内容时仍可快速切页
- 运营后台：
  - 已移除原先错误挂载的调度中心 / 场控布局 / 库存管理菜单
  - 旧入口保留兼容跳转到店铺后台对应新路径
- 技师端：`/technician/schedule`
  - 新增 `TechnicianShiftPlanningPanel`
  - 只允许在店铺开放时段内反馈，支持历史导入、个人规则、单日调整、已确认班表和通知
  - 新增 `我的排班偏好` 与 `自动提交反馈` 设置，供智能排班读取

核心代码位置：

- 状态与 mock workflow：`src/state/shiftPlanningStore.ts`
- 调度中心与智能排班状态：`src/features/dispatch-center/store.ts`
- 模板展开 / 状态解析 / 自动确认算法：`src/lib/shiftPlanning.ts`
- 智能排班引擎：`src/lib/scheduling/autoSchedulingEngine.ts`
- 数据结构：`src/types/shiftPlanning.ts`
- 调度中心壳层：`src/components/merchant-admin/MerchantDispatchCenterShell.tsx`
- 当前周期确认工作台：`src/components/merchant-admin/MerchantDispatchOverviewWorkspace.tsx`
- 智能排班工作台：`src/components/scheduling/SmartSchedulingWorkspace.tsx`
- 技师反馈面板：`src/components/scheduling/TechnicianShiftPlanningPanel.tsx`
- 技师智能偏好面板：`src/components/scheduling/TechnicianSmartPreferencePanel.tsx`
- 通用小时格编辑器：`src/components/scheduling/ShiftMatrixEditor.tsx`

智能排班当前包含：

- `限定免费` 角标展示与 billing / feature flag 字段预留
- 三档自动化等级：`recommend_only / semi_auto / full_auto`
- 需求预测、技师匹配评分、推荐班表、异常队列、质量评分、自动补人 / 自动减人入口、自动确认阈值
- 商户手机端轻量决策页、商户 PC 后台完整控制台、技师端偏好与自动提交反馈
- 用户端仍只读取最终 confirmed slots，智能草稿、推荐和异常待处理结果不会直接对用户可见

### Technician Schedule Refactor

`/technician/schedule` 这一轮已经从“一个过重的大页面”重构成两层清晰的信息架构：

- 一级固定插页
  - `我的日程`
  - `排班设置`
- `排班设置` 内部二级步骤插页
  - `排班规则设定`
  - `一键排班`
  - `确定排班`

#### 拆分前

- 技师端日程页把“看日程”“设规则”“模板编辑”“反馈提交”“确认结果”放在同一长页面里。
- `TechnicianShiftPlanningPanel` 和日 / 周 / 月时间轴直接串在一起，滚动后层级感很弱。
- “查看状态”和“配置反馈”没有明确职责边界。

#### 拆分后

- 顶部新增 sticky 一级插页，滚动时始终可见：
  - `我的日程` 负责查看和理解当前日程状态
  - `排班设置` 负责规则、生成和确认
- `排班设置` 再拆成三步：
  - `排班规则设定`
    - 配置技师个人规则、偏好、工时、休息、缓冲和是否接受高峰 / 临时排班
    - 商户强制继承字段保持灰色只读，并提示“该规则由商户统一设定，不可修改”
  - `一键排班`
    - 基于商户开放时段 + 商户强制规则 + 技师个人规则 + 历史模板生成可接受排班
    - 生成后仍可继续模板微调、按日微调，再提交反馈
  - `确定排班`
    - 只读展示商户最终确认后的排班结果、候补状态和确认 / 变更记录

#### 原内容迁移关系

- 移到 `我的日程`
  - 日视图
  - 周视图
  - 月视图
  - 列表视图
  - 当前周期状态、反馈状态、已确认 / 候补数量、同步通知摘要
  - 共享日程时间轴和列表浏览
- 移到 `排班设置`
  - 个人规则与偏好
  - 历史模板导入
  - 一键排班生成
  - 模板矩阵编辑
  - 单日微调
  - 排班反馈提交
  - 商户最终确认结果与变更记录

#### 一级 / 二级插页对应代码

- 技师端页面壳：`src/pages/mobile/TechnicianPortalPage.tsx`
  - 管理一级 sticky tabs：`我的日程 / 排班设置`
  - 管理日程视图切换：`日 / 周 / 月 / 列表`
- 技师端排班设置工作台：`src/components/scheduling/TechnicianShiftPlanningPanel.tsx`
  - 管理二级步骤：`排班规则设定 / 一键排班 / 确定排班`

#### 与后台互通的数据流

- 查看层
  - `src/state/scheduleStore.ts`
    - 继续提供技师共享日程、门店空档、已生成时段、计划标签
  - `src/state/shiftPlanningStore.ts`
    - 提供当前开放周期、技师反馈状态、最终确认结果、通知任务
- 设置层
  - `src/lib/shiftPlanning.ts`
    - 负责模板展开、规则合并、一键排班生成、最终确认算法
  - `saveTechnicianResponse`
    - 保存技师规则、模板矩阵、按日微调和反馈提交状态
  - `runAutoConfirm`
    - 继续负责商户最终确认逻辑

#### 当前实现说明

- 一级 tabs 和二级步骤 tabs 都已做成清晰的分层导航。
- `我的日程` 不再承载大段规则表单。
- `排班设置` 已补上一键生成逻辑，不再只是手工编辑模板。
- 仍然是前端 mock workflow，但数据边界已经保持与商户端 / 后台端同一套状态结构，后续可直接替换成真实接口。

## Backoffice IA Refactor

2026-04 这一轮对后台职责边界做了重构，目标是把平台运营能力和单店经营能力拆清楚。

### 调整原则

- 平台级、跨店铺、全局规则、全局数据，归运营后台。
- 单店经营、单店排班、单店调度、单店库存、单店场控，归店铺后台。
- “看结果、看状态、看当下排班”的能力归 `排班当前周期确认`。
- “创建、配置和生成排班”的能力归 `排班`，内部再分 `手动 / 自动 / 智能`。

### 从运营后台迁移到店铺后台的功能

- 调度中心
- 场控布局
- 库存管理

### 本次导航结构调整前后对比

- 调整前
  - 顶部横向导航里没有独立的“调度中心”一级入口
  - “调度中心”和“排班一览”同时存在，且语义重叠
  - `排班一览` 还是一套独立多页实现
- 调整后
  - 顶部横向导航新增 `调度中心`
  - `调度中心` 成为排班模块唯一一级入口
  - `调度中心` 下只保留两个核心子页：
    - `排班当前周期确认`
    - `排班`
  - 原 `排班一览 / 自动化排班 / 手动排班` 同级结构已收口为当前结构
  - `排班` 内部用二级切换承载 `手动 / 自动 / 智能`

### 新菜单结构

- 店铺后台
  - 门店总览
  - 订单中心
  - 调度中心
    - 排班当前周期确认
    - 排班
  - 场控布局
  - 库存管理
  - 财务结算
  - 技师管理 / 用户管理 / 评价中心
  - UI装修
  - 门店设置
- 运营后台
  - 数据大盘 / 分析中心 / 数据中心
  - 技师管理与审核
  - 订单 / 财务 / 营销 / 风控
  - 店铺与商家管理
  - 系统设置与权限管理

### 权限点变化

- `store.scheduling.overview.view`
- `store.scheduling.current.view`
- `store.scheduling.today.view`
- `store.scheduling.technician-status.view`
- `store.scheduling.automation.edit`
- `store.scheduling.one-click.run`
- `store.scheduling.batch-confirm.run`
- `store.dispatch.view`
- `store.dispatch.manage`
- `store.stage-layout.view`
- `store.stage-layout.manage`
- `store.inventory.view`
- `store.inventory.manage`

权限实现位于 `src/auth/featurePermissions.ts`，路由级守卫位于 `src/App.tsx` 的 `RequireFeaturePermission`。

### 旧入口兼容方案

- `/merchant-admin/schedule` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/store?module=floorplan` -> `/merchant-admin/stage-layout`
- `/merchant-admin/store?module=inventory` -> `/merchant-admin/inventory`
- `/merchant-admin/store?module=finance` -> `/merchant-admin/finance`
- `/merchant-admin/scheduling` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/scheduling/overview/*` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/scheduling/automation/*` -> `/merchant-admin/dispatch-center/schedule?mode=auto`
- `/merchant-admin/dispatch-center/overview` -> `/merchant-admin/dispatch-center/current`
- `/merchant-admin/dispatch-center/automation` -> `/merchant-admin/dispatch-center/schedule?mode=auto`
- `/merchant-admin/dispatch-center/manual` -> `/merchant-admin/dispatch-center/schedule?mode=manual`
- `/admin/dispatch` -> `/merchant-admin/dispatch-center/current`
- `/admin/floorplan` -> `/merchant-admin/stage-layout`
- `/admin/inventory` -> `/merchant-admin/inventory`

## Development Principles

- 用户端、技师端、店铺端：严格按手机优先开发。所有核心流程都需要以手机单手操作、信息易读、按钮易懂、层级清晰为标准来设计和验收。
- 前台三端：不仅要能在手机上显示，还要注重美观、易用、易懂。相同功能尽量复用同一套模块和交互，降低学习成本。
- 后台：优先适配 PC 端，保证运营、调度、数据管理等高密度场景的效率；在此基础上尽量兼容手机查看和轻操作。
- 前后台同一业务能力尽量共用同一套数据和规则，避免出现“前端能改、后台不同步”或“后台规则和前端展示不一致”的情况。

## Docs

- [项目结构](/Users/eason/Documents/New project/docs/PROJECT_STRUCTURE.md)
- [前端信息架构](/Users/eason/Documents/New project/docs/FRONTEND_IA.md)
- [核心数据模型](/Users/eason/Documents/New project/docs/DATA_MODEL.md)
- [自动排班系统说明](/Users/eason/Documents/New project/docs/SHIFT_PLANNING_SYSTEM.md)

## Detail Pages Refactor

2026-04 这一轮把 `用户 / 店铺 / 技师` 三类详细资料卡收敛到同一个 `profile-detail` 模块系统里。

统一的不是“长得完全一样”，而是：

- 同一套视图模型入口
- 同一套详情骨架入口
- 同一套底部操作与关闭方式
- 同一套从列表卡 / 聊天 / 动态 / 通讯录进入详情的维护方式

角色模板现在明确分成三类：

- `user-basic`
  - 参考微信个人资料页思路。
  - 只保留头像、昵称、地区、基础资料、标签 / 备注、个人介绍和联系入口。
  - 不再复用店铺 / 技师那种重商业化详情结构。
- `shop-business`
  - 保持店铺详情当前方向，继续参考 Tabelog 式商业详情。
  - 保留图片、名称、评分、地址、营业时间、服务项目、支付方式、标签与可预约信息。
- `technician-business`
  - 主体结构继续沿用当前聊天页点开后的技师详情。
  - “近期可约”部分已经替换成首页详情同源的 `RecentTwoWeekAvailability` 共享模块。

### Component Structure

- `src/types/detailProfile.ts`
  - 详情页统一视图模型。
  - 定义 `BaseDetailProfile`、`PersonalDetailProfile`、`ShopDetailProfile`。
  - 让 UI 只依赖统一的详情结构，不直接耦合旧的 mock/domain 字段。
- `src/lib/detailProfiles.ts`
  - 详情页字段映射层。
  - 提供 `buildUserDetailProfile`、`buildTechnicianDetailProfile`、`buildShopDetailProfile`。
  - 当前负责把现有 `Customer / Technician / Store` 数据整理成页面可直接消费的 summary / infoRows / intro / reviewSummary / serviceItems / teamMembers。
- `src/shared/profile-detail/UnifiedProfileDetail.tsx`
  - 新的统一详情入口。
  - 对外统一暴露：
    - `UnifiedProfileDetail`
    - `UnifiedProfileDetailBody`
    - `StickyActionBar`
    - `buildDefaultDetailActions`
- `src/shared/profile-detail/templates/user-basic.tsx`
  - 用户轻量资料模板入口。
- `src/shared/profile-detail/templates/shop-business.tsx`
  - 店铺详情模板入口。
- `src/shared/profile-detail/templates/technician-business.tsx`
  - 技师详情模板入口。
- `src/shared/profile-detail/sections/RecentTwoWeekAvailability.tsx`
  - 从首页详情抽出来的共享“两周预约”模块。
  - 首页详情和技师详情现在复用同一个 section，而不是各自维护。
- `src/components/mobile/EntityDetailPage.tsx`
  - 作为兼容层继续保留。
  - 内部已按 `user / technician / shop` 走不同 detail template 规则。

### Shared Blocks

- `GalleryCarousel`
  - 主图 + 缩略图 + 图片索引 + 左右切换 + 大图预览。
  - 现在缩略图区去掉了厚重边框，当前选中图只保留轻量高亮。
- `PersonalHeaderSummary`
  - 技师详情使用的主摘要区。
  - 继续沿用聊天页详情风格。
- `RecentTwoWeekAvailability`
  - 技师详情与首页详情共用的“最近两周预约”模块。
  - 首页仍然可以传入可交互版配置，详情页默认用同一套展示模块。
- `KeyInfoChips`
  - 技师详情的高价值信息 chip 组。
- `ProfileInfoList`
  - 技师 / 用户基础资料的轻量信息行。
  - 用分组标题、留白和极轻分隔线替代旧式表格感。
- `UserBasicDetailBody`
  - 用户专用的轻量资料模板。
  - 只保留基础资料、标签 / 备注和简介。
- `PersonalIntroSection`
  - 技师介绍区，支持长文展开 / 收起。
- `PersonalReviewSummarySection`
  - 技师页的评分、评价摘要和印象标签。
- `ProfileTagsSection`
  - 技师业务标签区，支持折叠 / 展开。
- `ShopHeaderSummary`
  - 店铺页专用首屏摘要区。
- `InfoTableSection`
  - 基本资料 / 规则信息 / 店铺详细信息的结构化信息表。
- `DetailBadgeCloud`
  - 快捷 badge、角色标签、评价标签，支持折叠。
- `IntroSection`
  - 介绍说明区，支持长文展开 / 收起。
- `ReviewSummarySection`
  - 评分、评价数、评价标签、最近评价摘要。
- `ShopCoreInfoBar`
  - 店铺营业状态、时间、地址、交通、支付、语言等核心信息条。
- `ShopServiceListSection`
  - 店铺服务项目区。
- `TeamSection`
  - 店铺团队 / 技师区。
- `MapSection`
  - 地址、交通说明、地标和地图跳转入口。

### Page Entry Points

- `src/components/mobile/MobileMessageCenter.tsx`
  - 聊天顶部资料卡点开后进入新的共享详情页。
  - 技师详情继续以这里原来的版本为主模板。
- `src/pages/mobile/MomentsPage.tsx`
  - 动态作者头像 / 名称点开后进入新的共享详情页。
- `src/pages/user/ProfileDetailPage.tsx`
  - 新增统一资料详情路由页，承接 `/profiles/:entityType/:id`。
- `src/pages/user/HomePage.tsx`
  - 首页旧的 `NearbyDetailOverlay` 不再自己维护另一套详情内容。
  - 现在改为复用统一 `DetailPageBody`，只保留首页特有的预约控制区。
- `src/pages/user/StoreDetailPage.tsx`
  - 店铺独立详情页已切到统一 `profile-detail` 入口。

### Field Mapping

- 用户页
  - `creditScore`：当前由 `Customer.activeScore / 10` 映射为 10 分制展示。
  - `commonPaymentMethods` / `preferredServiceTypes` / `verifiedStatus` / `region`：
    - 优先读取 `detailProfiles.ts` 内的 override。
    - 无 override 时走当前 domain 字段与默认兜底规则。
  - 当前用户页保留了：
    - `systemId`
    - `memberLevel`
    - `height`
    - `nextBookingAt`
    - `lastOrderAt`
  - 但渲染上只展示基础资料，不再把商业能力字段堆进用户详情模板。
- 技师页
  - `serviceScore`：当前由 `Technician.rating * 2` 统一到 10 分制。
  - `serviceTypes`：由 `Technician.skills` 映射。
  - `prepayRequired`：由 `Technician.paymentMethods` 是否包含 `prepay` 推导。
  - `paymentMethods`：当前统一映射成 `cash / offline / platform` 三类前端展示口径。
  - `recentTwoWeekAvailability`：
    - 不再走旧的聊天详情可约块。
    - 统一改为复用 `RecentTwoWeekAvailability`。
  - `serviceMode / workYears / startPrice / minUserCreditScore / availableSchedule`：
    - 优先读取 override。
    - 缺失时使用当前 mock 数据推导或兜底展示。
  - 当前个人页保留了：
    - `systemId`
    - `acceptRate`
    - `cancelRate`
    - `bidBudgetMin / bidBudgetMax`
    - `serviceAreas`
    - `canServeForeigners`
    - `paymentMethods`
- 店铺页
  - `shopScore`：当前由 `Store.rating * 2` 统一到 10 分制。
  - `categories / paymentMethods / languages / supportForeigner / reservable / holidayInfo / cancelPolicy / shopRules`：
    - 先由 `detailProfiles.ts` 内的店铺配置映射。
  - `serviceItems`：
    - 由店铺配置中的服务分类去筛选 `services`。
  - `teamMembers`：
    - 由 `technicians.filter((item) => item.storeId === store.id)` 生成。
  - `businessHours`：
    - 先把旧字符串规格化成结构化 `BusinessHourSlot[]`，供营业信息条和详细信息区复用。

### How To Extend

- 新增详情字段时，先判断它属于哪一层：
  - 原始业务字段：加在 domain / API response。
  - 详情页展示字段：优先加到 `src/types/detailProfile.ts`。
- 所有原始数据到页面展示的转换，统一放在 `src/lib/detailProfiles.ts`。
  - 不要在页面组件里直接拼业务逻辑。
  - 页面组件只消费 `DetailProfile`，尽量不直接读 `Customer / Technician / Store`。
- 如果只是增加一条展示信息：
  - 用户页通常放进 `basicInfoRows`、`capabilityRows`、`summaryBadges` 或 `introBlocks`。
  - 技师页通常放进 `basicInfoRows`、`capabilityRows`、`quickBadges`、`tags` 或 `introBlocks`。
  - 店铺页通常放进 `coreInfoItems`、`detailInfoRows`、`serviceItems`、`teamMembers` 或 `mapInfo`。
- 如果后续增加新的角色详情页：
  - 优先复用 `BaseDetailProfile` 思路。
  - 个人型角色继续走 `PersonalDetailProfile` 骨架，但渲染模板要明确区分 `user-basic` 和 `technician-business`。
  - 非个人型角色参考 `ShopDetailProfile`，继续挂到统一 `profile-detail` 系统下。

## Unified Profile Card Refactor

2026-04 这一轮把 `用户 / 店铺 / 技师` 三类简易资料卡继续收敛到同一个 `profile-card` 模块体系，首页“附近可预约”仍然是店铺 / 技师卡的基准视觉版本。

目标不是把所有场景强行做成同一张卡，而是统一：

- 同一套 schema
- 同一套 mapper
- 同一套样式规则
- 同一套交互入口
- 同一套 detailHeader 延展方式

### Module Structure

- `src/shared/profile-card/UnifiedProfileCard.tsx`
  - 简易资料卡统一入口。
  - 通过 `entityType + variant` 控制渲染。
- `src/shared/profile-card/variants/*`
  - `compact / list / share / nearby`
- `src/shared/profile-card/types.ts`
  - 对外提供更贴业务语义的类型别名：
    - `BaseProfileCardData`
    - `UserProfileData`
    - `ShopProfileData`
    - `TechnicianProfileData`
- `src/shared/info-card/types.ts`
  - 底层卡片数据结构实现。
- `src/shared/info-card/mappers.ts`
  - 负责把 `Customer`、`Store`、`Technician`、`DetailProfile` 映射成信息卡数据。
  - 对外提供：
    - `buildUserInfoCardData`
    - `buildShopInfoCardData`
    - `buildTechnicianInfoCardData`
    - `buildInfoCardDataFromDetail`
    - `buildInfoCardData`
- `src/shared/info-card/BaseInfoCard.tsx`
  - 统一渲染器。
  - 支持：
    - `nearby`
    - `list`
    - `compact`
    - `share`
    - `detailHeader`
- `src/shared/info-card/ShopInfoCard.tsx`
  - 店铺 wrapper。
- `src/shared/info-card/TechnicianInfoCard.tsx`
  - 技师 wrapper。
- `src/shared/profile-card/index.ts`
  - 新的 profile-card 统一导出入口。

### Variant Usage

- `nearby`
  - 首页 `HomePage` 的“附近可预约”店铺 / 技师卡。
- `list`
  - 搜索页 `SearchPage`
  - 分类页 `CategoryPage`
  - 店铺列表页 `StoreListPage`
  - 其他需要标准摘要卡的列表场景
- `compact`
  - 聊天窗口顶部资料卡 `ChatConversationInfoCard`
  - 通讯录 `ContactDirectorySection`
  - 通讯录快捷面板 `ContactShortcutPanel`
  - 商户端 / 技师端通讯录里的用户 / 店铺 / 技师联系人
- `detailHeader`
  - `EntityDetailPage` 里的店铺 / 技师详情头部摘要卡
  - 详情模板内部的首屏摘要头部
- `share`
  - 统一预留给聊天分享名片 / 动态嵌入卡，后续新增时直接走这一变体

### Field Mapping

- Base schema
  - `displayName / subtitle / badgeList / metricList / tags / metaLines / nextAvailability / detailPath`
  - 这些字段是所有变体共同消费的基础字段。
- 用户
  - `avatar / coverImage`：统一走 `Customer.avatar`
  - `rating`：统一映射成信用评分
  - `reviewCount`：暂时复用订单量 / 历史互动量
  - `detailPath`：统一走 `/profiles/user/:id`
- 店铺
  - `coverImage / avatar`：统一走 `Store.cover`
  - `status`：由 `Store.openStatus` 统一映射为 `营业中 / 可预约 / 暂未营业`
  - `priceLabel`：统一走 `Store.priceLabel`
  - `nextAvailability`：统一走 `Store.nextSlot`
  - `detailPath`：统一走 `/stores/:id`
- 技师
  - `coverImage / avatar`：统一走 `Technician.avatar`
  - `status`：统一由 `Technician.status` 映射为 `可预约 / 服务中 / 休息中`
  - `metaLines`：统一组织为技能、服务区域、接单率 / 取消率
  - `priceLabel`：优先用 `bidBudgetMin / bidBudgetMax`
  - `highlightChips`：统一汇总语言、外籍可接待、风格标签
  - `detailPath`：统一走 `/profiles/technician/:id`
- 详情页头部
  - 统一由 `buildInfoCardDataFromDetail` 从 `DetailProfile` 派生。
  - 这样首页卡、聊天卡、详情头卡使用的是同一套字段语义，而不是各自重新拼一遍文案。

### Migrated Entry Points

- `src/pages/user/HomePage.tsx`
  - “附近可预约”已切到统一 `nearby` 变体。
- `src/pages/user/SearchPage.tsx`
  - 店铺和技师列表卡统一走共享卡片。
- `src/pages/user/CategoryPage.tsx`
  - 分类页的店铺 / 技师概览卡统一走共享卡片，技师卡不再跳服务页。
- `src/components/mobile/ChatConversationInfoCard.tsx`
  - 用户 / 店铺 / 技师会话顶部资料卡改成共享 `compact` 变体。
  - 平台 / 客服等非实体联系人仍保留旧布局。
- `src/components/mobile/ContactDirectory.tsx`
  - 为目录联系人和快捷面板增加 `entityCardData / entityCardVariant`，让用户 / 店铺 / 技师联系人复用共享卡。
  - 当存在 `entityCardData.detailPath` 时，卡片点击优先进入统一详情页。
- `src/pages/user/ContactsPage.tsx`
  - 用户端通讯录中的店铺 / 技师联系人与快捷面板，已切到共享 `compact`。
- `src/pages/mobile/MerchantPortalPage.tsx`
  - 商户端通讯录里的用户 / 技师联系人已接入共享 `compact`，并走商户作用域的统一详情路由。
- `src/pages/mobile/TechnicianPortalPage.tsx`
  - 技师端通讯录里的用户 / 店铺 / 技师联系人已接入共享 `compact`，并走技师作用域的统一详情路由。

### Compatibility Layers

- `src/components/mobile/StoreCard.tsx`
  - 保留旧组件名，但内部已经转成 `ShopInfoCard` wrapper，方便旧调用逐步迁移。
- `src/components/mobile/ChatConversationInfoCard.tsx`
  - 保留旧组件名与旧入参。
  - 当会话类型是 `customer / store / technician` 时，内部自动切到共享 `compact`；其他类型继续走旧实现。
- `src/components/mobile/ContactDirectory.tsx`
  - 增加 `entityCardData` 兼容口，不强制所有联系人都变成信息卡。

### Deleted Duplicate Logic

- 首页“附近可预约”原先的店铺卡 / 技师卡内联结构已经不再单独维护。
- 搜索页和分类页里原本各自拼接的资料卡已经收口到共享模块。
- 聊天顶部资料卡与通讯录里的实体联系人卡，不再各自维护独立视觉规则。
- 技师卡从部分列表跳服务页、部分列表跳资料页的分叉逻辑已被收口。

### API Integration

当前实现仍基于 mock + 前端映射层，后续接真实接口时建议按下面方式替换：

- `GET /technicians/:id`
  - 返回后映射为 `buildTechnicianDetailProfile` 所需字段，或直接在 API adapter 内生成 `PersonalDetailProfile`。
- `GET /users/:id`
  - 返回后映射为 `buildUserDetailProfile` 所需字段。
- `GET /shops/:id`
  - 返回后映射为 `buildShopDetailProfile` 所需字段。
- `POST /favorites`
  - 对接顶部关注 / 收藏按钮与底部操作栏里的关注 / 收藏动作。
- `DELETE /favorites/:targetType/:targetId`
  - 对接取消关注 / 取消收藏。
- `GET /reviews/summary`
  - 写入 `reviewSummary.score`、`reviewSummary.reviewCount`、`reviewSummary.tags`、`reviewSummary.recentSummary`。
- `GET /shops/:id/services`
  - 直接替换 `serviceItems`。
- `GET /shops/:id/technicians`
  - 直接替换 `teamMembers`。

推荐做法是保留 `detailProfiles.ts` 作为“接口响应 -> 页面视图模型”的最后一层适配，这样 UI 可以继续稳定复用，不需要每接一个接口就改多个页面组件。

## 2026-04 Home / Me / Category Consolidation

这一轮继续围绕“统一结构，不重做品牌风格”推进首页、【我的】页、设置页和“所有服务类别”页。重点不是加新业务，而是把分类入口、设置入口、轮播和简卡都收口到更少的模块里。

### 齿轮 Icon 统一规则

- 三端首页和【我的】页右上角齿轮统一以用户端首页当前 `IconButton(icon="settings")` 为基准。
- `src/components/mobile/SettingsShortcutButton.tsx` 现在直接复用 `src/components/client-ui/AppScaffold.tsx` 里的 `IconButton`，不再维护另一套齿轮 svg、尺寸和容器样式。
- 统一后收敛范围包括：
  - 用户端首页 `src/pages/user/HomePage.tsx`
  - 用户端【我的】页 `src/pages/user/UserCenterPage.tsx`
  - 技师端首页 / 我的页 `src/pages/mobile/TechnicianPortalPage.tsx`
  - 商户端首页 / 我的页 `src/pages/mobile/MerchantPortalPage.tsx`
- 统一的是同一套图标本体、容器尺寸、点击热区、边框、背景和阴影；后续不要再新增其他齿轮风格。

### 用户端设置首页新增内容

- 用户端【我的】页已移除重复的“显示与语言”模块和首页分类配置模块，避免设置能力在多个页面重复出现。
- 用户端设置首页 `src/pages/user/UserSettingsPages.tsx` 保留“常用入口”目录项，并新增对应二级页 `/me/settings/home-shortcuts`。
- 这个区域只存在于用户端设置首页，技师端 / 商户端的设置结构暂时不跟进这一块。
- “常用入口”直接展示全部服务类别 icon，并复用现有 `CategoryIcon` 资源，不替换图标风格。

### 分类 Icon 替换逻辑

- 首页分类配置改由 `src/lib/homeCategories.ts` 统一管理。
- `homeCategoryOptions` 现在直接来自全部 `serviceCategories`，不再只维护少量首页专用分类。
- 选择规则：
  - 最多点亮 5 个。
  - 超过 5 个时会阻止继续选择，并提示“最多选择 5 个”。
  - 第 6 个首页入口固定保留“全部分类”。
- 首页展示规则：
  - 已点亮几个分类，首页就显示几个分类入口。
  - 第 6 个入口固定保留“全部分类”。
  - “恢复默认”会一键恢复默认的 5 个常用分类。
- 首页分类点击目标统一改为 `/categories?category=:id`，让首页分类区和“所有服务类别”页使用同一套分类语义。

### 所有服务类别页展开 / 收起逻辑

- `src/pages/user/CategoryPage.tsx` 已按新结构重排为：
  - 页面标题
  - 搜索框
  - “全部 / 收起”按钮
  - 分类 icon 区
  - 热门分类轮播
  - 可预约服务列表
- 分类 icon 区默认只显示两排，每排 6 个，共 12 个。
- 点击“全部”后会自然展开全部分类，容器高度不写死，跟随分类数量自动增长。
- 分类 icon 项已去掉旧的重型格子背景，名字改为单行，并通过负 margin 轻压在 icon 下部区域来压缩高度。
- 搜索框会实时过滤分类，但展开 / 收起规则仍按当前筛选结果生效。

### 热门分类轮播如何复用首页轮播模块

- 首页原本内联在 `HomePage.tsx` 里的轮播已抽成共享组件 `src/components/client-ui/FeatureCarousel.tsx`。
- 首页轮播现在通过这个共享模块渲染 3 张。
- “热门分类”模块也通过同一个 `FeatureCarousel` 渲染 6 张，只是数据源换成热门分类集合。
- 复用的是同一套：
  - 轮播滚动行为
  - 自动轮播逻辑
  - 指示器
  - 文案 / 按钮叠层结构
- 后续若要继续改轮播视觉，首页和热门分类必须一起走这一个组件，不要再回到页内各写一套。

### 店铺 / 技师简卡统一方式

- 新增统一入口组件：`src/shared/profile-card/UnifiedSimpleProfileCard.tsx`
- 这个组件按 `entityType` 分流到同一套 `BaseInfoCard` 渲染骨架，差异只保留在数据映射层。
- `ShopInfoCard` 和 `TechnicianInfoCard` 已改为转调 `UnifiedSimpleProfileCard`，不再各自直接拼装独立渲染器。
- 当前统一后的核心链路是：
  - 数据映射：`src/shared/info-card/mappers.ts`
  - 统一渲染：`src/shared/info-card/BaseInfoCard.tsx`
  - 统一简卡入口：`src/shared/profile-card/UnifiedSimpleProfileCard.tsx`
- 分类页的“可预约服务列表”现在优先用这套统一简卡来展示店铺和个人技师。

### 可预约服务列表联动

- “所有服务类别”页中的可预约服务列表不再固定展示同一批 mock 数据。
- 当前实现会随 `activeCategory` 切换同步刷新：
  - 同类服务摘要卡
  - 相关店铺候选
  - 相关个人技师候选
- 店铺 / 技师当前通过分类关键词、服务摘要、标签、简介和稳定 fallback 排序一起计算相关度，确保切换不同类别时，下方内容会变化。
- 后续如果后端补齐真实分类关联，只需要替换 `CategoryPage.tsx` 里的相关度来源，不需要重写列表 UI。

## 2026-04 Settings Directory Refactor

这一轮继续沿用现有主题、语言、身份和通知逻辑，但把设置页的信息架构重构成“目录首页 + 详细子页”的形式，目标是提高查找效率而不是新增复杂功能。

### 设置首页新信息架构

- 设置首页 `src/pages/user/UserSettingsPages.tsx` 现在只展示分组入口和当前状态，不再直接铺开大卡片和大量选项。
- 首页统一采用“左侧标题 + 右侧当前值 + 最右箭头”的目录式列表。
- 统一分组为：
  - 外观与系统
  - 个人资料与认证
  - 账户与安全
  - 通知与隐私
  - 其他

### 设置项与二级页映射

- `UI 切换` -> `/me/settings/theme`
- `语言` -> `/me/settings/language`
- `身份` -> `/me/settings/portal`
- `常用入口` -> `/me/settings/home-shortcuts`
- `资料编辑` -> `/me/settings/profile`
- `本人验证 / 店铺资质` -> `/me/settings/verification`
- `服务范围` -> `/me/settings/service-range`
- `账户与安全` -> `/me/settings/account`
- `通知设置` -> `/me/settings/notifications`
- `帮助与反馈` -> `/me/settings/help`
- `关于 NeeDo` -> `/me/settings/about`

### 从首页挪到二级页的简单功能

- 主题预览卡不再直接放在设置首页，改为集中在 `UserSettingsThemePage` 中选择。
- 语言切换不再使用首页大按钮，改为 `SettingsRadioListPage` 的紧凑单选列表。
- 身份切换不再占据首页大面积空间，改为独立单选页。
- 用户端首页分类 icon 配置不再直接显示在设置首页，而是移到“常用入口”二级页。

### 多身份显示差异

- 用户端首页显示：UI 切换、语言、身份、常用入口、资料编辑、本人验证、账户与安全、通知设置。
- 技师端首页显示：UI 切换、语言、身份、资料编辑、本人验证、服务范围、账户与安全、通知设置。
- 店铺端首页显示：UI 切换、语言、身份、资料编辑、店铺资质、账户与安全、通知设置。
- 三端共用同一套设置首页组件和列表结构，只通过当前身份控制条目显隐与文案差异。
