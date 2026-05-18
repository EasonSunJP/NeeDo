# NeeDo

面向日本市场的本地生活服务平台与商家管理系统，覆盖上门服务、门店预约、餐饮预约和 SaaS 后台运营。

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Current Scope

- 用户端 Web App：深色首页、分类、搜索、服务列表、服务详情、店铺列表、店铺详情、下单流程、订单、用户中心、客服入口。
- 端侧移动应用：用户端、商户端、技师端共享白天 / 黑夜两套视觉主题，客户端主题与语言设置集中在用户端「我的」页面。
- 管理后台：Dashboard、Analytics、Data Center、Orders、Dispatch、Field Jobs、CRM、Marketing、Finance、Reviews、Merchants、Inventory、Floorplan、Roles。
- 复用组件：按钮、标签、指标卡、筛选器、表格、详情抽屉、Tabs、后台 Layout、移动端 Shell。
- Mock 数据：覆盖核心实体与业务流程，后续可替换为 API/Prisma 数据源。
- 多语言：用户端与后台端支持中文、日本語、English 三语切换，语言偏好会保存在本地。
- 后台主题：运营控制台支持黑夜 / 白天两套视觉主题，可在后台顶部随时切换。

## Docs

- [项目结构](/Users/eason/Documents/New project/docs/PROJECT_STRUCTURE.md)
- [前端信息架构](/Users/eason/Documents/New project/docs/FRONTEND_IA.md)
- [核心数据模型](/Users/eason/Documents/New project/docs/DATA_MODEL.md)
