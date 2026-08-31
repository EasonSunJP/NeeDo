# 店铺测试功能角标与三端服务号入口设计

## 目标

在不新增业务数据、接口或平行页面的前提下，统一标识当前测试功能：

- 店铺端主功能轮播中的“点菜”“菜单”“场控”显示与“会员”相同的红色 `Test` 角标。
- 用户端、店铺端和技师端通讯录顶部始终显示“服务号”入口。
- “服务号”文字右侧显示同一个红色 `Test` 角标。

## 现状与边界

- 店铺端主功能轮播由 `merchantPrimaryModules` 配置和 `MerchantPrimaryNavCarousel` 共同渲染，已经支持 `badge: "Test"`，并使用共享 `TestFeatureBadge`。
- 三端通讯录共用 `ImContactsPage`，三种身份的 `serviceAccounts` 路由均已存在。
- 当前“服务号”入口仅在 `serviceContacts.length > 0` 时显示，因此没有服务号数据时入口会消失。
- 本次不新增或伪造服务号、不修改正式 IM 数据、不新增后端接口、权限、migration 或路由。

## 设计

### 店铺端主功能轮播

为 `dine_order`、`menu` 和 `floor_control` 三个模块增加 `badge: "Test"`。保留“会员”现有配置和 `MerchantPrimaryNavCarousel` 的角标渲染方式，使四个测试入口使用完全相同的组件、颜色、字号、阴影和右上角定位。

### 三端通讯录服务号入口

共享通讯录顶部快捷区无条件渲染“服务号”入口，不再由当前服务号联系人数量控制入口是否可见。点击后继续进入当前身份已有的服务号路由：

- 用户端：`/contacts/service-accounts`
- 店铺端：`/merchant/contacts/service-accounts`
- 技师端：`/technician/contacts/service-accounts`

为共享 `ImEntryCell` 增加可选尾部内容插槽。普通入口不受影响；“服务号”入口通过该插槽在标题右侧渲染共享 `TestFeatureBadge`。不复用 `ImEntryCell` 现有图标角落通知 badge，因为用户要求的测试标签位于文字右侧，且测试功能标识应统一由 `TestFeatureBadge` 提供。

### 数据与空状态

入口显示不代表创建服务号数据。服务号列表继续只读取现有正式 IM store 中被标记为服务号的联系人。没有可展示的服务号时保持真实空结果，不注入示例账号或浏览器 mock。

## 测试与验收

先增加失败测试，再修改实现：

1. 店铺主功能配置测试确认 `members`、`dine_order`、`menu`、`floor_control` 四项使用 `Test` 角标，其他入口不使用。
2. 共享通讯录测试确认“服务号”入口不依赖 `serviceContacts.length`，并使用各身份的现有 `serviceAccounts` 路由。
3. 共享入口组件测试确认尾部使用 `TestFeatureBadge`，不会占用图标通知 badge，也不影响组织人数等现有尾部信息。
4. 运行定向 Vitest、TypeScript 检查和正式构建。
5. 在可用的正式本地运行环境中分别检查用户端、店铺端和技师端通讯录，并检查店铺端主功能轮播；使用 440×956 和 320×956 视口确认角标位置、点击路径、无横向溢出、无控制台错误和失败请求。

## 不在本次范围

- 创建、编辑、关注或发布服务号。
- 新增服务号数据库模型、种子数据或管理后台。
- 修改服务号列表的数据权限或联系人分类规则。
- 改动其他通讯录快捷入口、导航顺序或视觉风格。
