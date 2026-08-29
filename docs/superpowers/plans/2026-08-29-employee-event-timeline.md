# 员工事件时间线微步骤

## 目标

在员工详细信息卡恢复真实、可审计的事件历史，并采用 NeeDo 已批准的蓝黑商户端时间线结构，而不是原来的原始技术日志列表。

## 正式契约

- `GET /api/v1/merchant-admin/employees/:needoId/timeline`：只返回当前店铺、当前员工从属关系的变更结果，分页且不包含纯读取/预览操作。
- `POST /api/v1/merchant-admin/employees/:needoId/timeline/comments`：管理员或财务人员追加员工档案备注，使用既有写权限并形成审计记录。
- 对外仅返回事件语义、操作人显示名/头像、发生时间和色调；不返回内部用户 ID、从属关系 ID、权限码或原始 metadata。

## UI

- 复用 `ContactEventTimelinePanel`。
- 左侧时间、中间节点连线、右侧头像与圆角消息气泡。
- 正常变更使用商户蓝色高亮；停职、离职等阻断状态使用红色。
- 底部保留圆形评论节点、当前管理员头像和可提交输入框；评论必须写回后端。

## 验收

- 更新基本资料、从属关系、薪酬、结算周期和财务备注均以用户可读文字展示。
- 不显示 `merchant_admin.*`、内部 ID 或原始权限名称。
- 桌面及 390px 宽度无横向溢出。
- Zod、RBAC、OpenAPI、审计、前后端测试、lint 和 build 通过。
