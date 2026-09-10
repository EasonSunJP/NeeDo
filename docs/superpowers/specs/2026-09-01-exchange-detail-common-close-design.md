# Exchange 详情页通用关闭按钮设计

## 目标

修复用户、商户或技师通过直达链接打开 Exchange 需求/情报详情后，无法可靠返回 NeeDo Exchange 页面的导航问题。继续保留现有高保真详情 UI、正式 API、互动与抢单能力，不改动任何业务数据或后端合同。

## 根因

`ExchangePostDetailPage` 当前只向共享 `MobileFullscreenHeader` 提供 `onBack`。`goBack` 依据 `window.history.length` 决定执行 `navigate(-1)`，但浏览器历史长度不能证明上一条记录来自当前 NeeDo 门户。直达链接、登录重定向或跨页面打开时，因此没有确定性的 Exchange 页面出口；加载、无效链接和错误状态同样缺少关闭按钮。

## 已确认设计

- 保留左侧通用返回按钮，继续支持从列表进入详情后返回原历史位置。
- 在头部右侧控制区增加共享 `MobileFullscreenCloseButton`，通过 `MobileFullscreenHeader` 的 `onClose` 接口呈现，不创建页面私有按钮。
- 关闭按钮始终使用 `replace: true` 跳转到当前身份的 Exchange 根页面：
  - 用户：`/needo`
  - 商户：`/merchant/needo`
  - 技师：`/technician/needo`
- 正常详情、加载、无效链接和读取失败状态使用相同关闭行为，保证任何直达状态都有确定性出口。
- 右侧既有翻译、点赞和分享操作保持原顺序；关闭按钮由共享头部追加在操作组之后。
- 标题、圆形说明按钮、返回按钮、操作按钮及关闭按钮继续遵循 `MobileFullscreenHeader` 的统一尺寸、颜色、边框和对齐规则。

## 代码边界

只修改 Exchange 详情页及其聚焦测试：

- `src/features/exchange/ExchangePostDetailPage.tsx`
- `src/features/exchange/ExchangePostDetailPage.test.tsx`

不修改 `MobileFullscreenHeader`、Exchange API、路由表、数据库、RBAC、i18n、需求/情报数据模型或其他详情页面。

## 测试设计

自动化回归测试必须覆盖：

1. 正式情报详情渲染共享关闭按钮。
2. 点击关闭后以确定性路径返回用户端 `/needo`，不依赖历史长度。
3. 商户和技师上下文分别解析为 `/merchant/needo` 与 `/technician/needo`。
4. 加载、无效链接和读取失败状态也保留关闭按钮。
5. 原有返回、翻译、点赞、分享、详情字段和抢单能力测试继续通过。

测试先增加并确认因缺少关闭按钮而失败，再做最小实现使其通过。

## 浏览器验收

在约 iPhone 14 Pro Max 宽度的用户端页面执行：

1. 直接打开一个正式情报详情 URL。
2. 确认头部同一行显示返回、标题/说明、既有操作和关闭按钮，无横向溢出或遮挡。
3. 点击关闭，确认进入 `/needo` 且可以继续切换“我的需求”和“情报”。
4. 再从情报列表进入详情并使用返回按钮，确认原历史导航仍有效。
5. 检查控制台和页面状态；不得出现恢复页、运行错误或新增网络错误。

## 非目标

- 不改变浏览器原生返回语义。
- 不重做详情页视觉结构。
- 不新增 mock、localStorage、假接口或平行导航系统。
- 不处理匹配、预约、支付或其他 Exchange 状态流转。
