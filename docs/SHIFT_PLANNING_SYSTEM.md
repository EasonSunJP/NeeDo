# 排班系统 / confirmed_slots 时间容量底座

## 页面结构

- 店铺后台调度中心：`src/pages/merchant-admin/dispatch-center/DispatchCenterRoutePages.tsx`
  - 一级入口：`调度中心`
  - 默认子页：`排班当前周期确认`
  - 第二子页：`排班`
  - 调度中心内部二级切换条固定置顶，滚动时仍可切换
- `排班当前周期确认`
  - 基于原调度中心页面重构
  - 承载 `目前的日程表 / 今日排班表 / 本店技师状态 / 当前排班状态概览 / 调度监控`
- `排班`
  - 同一页面容器内承载 `手动 / 自动 / 智能`
  - 手动继续使用 `ManualSchedulingWorkspace`
  - 自动继续使用 `AutomationWizard`
  - 智能使用 `SmartSchedulingWorkspace`
- `排班 > 自动`
  - 以 `AutomationWizard` 为主
  - 按「模式选择 / 规则设定 / 技师反馈 / 最终确认」四步承载模板、规则、优先级、通知和自动确认逻辑
  - 三种模式统一为：`商户确认模式`、`技师自主排班`、`商户直接排班`
  - `商户直接排班` 不再进入技师反馈步骤，保存发起后直接生成正式排班和 confirmed slots
- `排班 > 智能`
  - 新增 `限定免费` 角标、自动化等级、周期选择、规则摘要、需求预测、推荐班表、异常队列、质量评分和 PC 审计区
  - 当前阶段只做 feature flag / billing 字段预留，不接真实计费
  - 推荐结果不会直接进入用户端；只有自动确认或人工确认后生成的 confirmed slots 才会被用户端读取
- 技师端：`src/pages/mobile/TechnicianPortalPage.tsx`
  - 在 `schedule` 视图顶部接入 `TechnicianShiftPlanningPanel`
  - 技师端反馈入口统一为「手动提交反馈 / 按规则自动生成反馈」，避免和商户端排班模式混淆
  - 商户直接排班模式下只读展示正式排班，提供「确认收到 / 申请更改」入口
  - 下方仍保留原个人日程时间轴和移动/休息编辑器

## 组件结构

- `src/components/merchant-admin/MerchantDispatchCenterShell.tsx`
  - 调度中心共享壳层
  - 提供 `排班当前周期确认 / 排班` 二级切换，并做 sticky 固定
- `src/components/merchant-admin/MerchantDispatchOverviewWorkspace.tsx`
  - 当前周期确认工作台
  - 基于原调度中心内容，承载当前日历、今日排班、技师状态、待派任务和排班监控摘要
- `src/components/scheduling/SmartSchedulingWorkspace.tsx`
  - 智能排班商户端 / PC 后台共享工作台
  - 展示智能策略、需求预测、推荐班表、异常队列、质量评分、自动确认阈值和智能排班日志
- `src/lib/scheduling/autoSchedulingEngine.ts`
  - `AutoSchedulingEngine`
  - 第一版规则算法实现需求预测、候选池、技师匹配评分、推荐生成、冲突检测、质量评分、自动补人/减人队列、自动确认和优化日志
- `src/components/scheduling/TechnicianSmartPreferencePanel.tsx`
  - 技师端智能排班接入
  - 管理我的排班偏好、自动提交反馈、临时补位、节假日和加班偏好
- `src/components/scheduling/StoreShiftPlanningWorkspace.tsx`
  - 旧版自动化排班设定共享工作台
  - 管理模板、规则、优先级、通知和自动确认；新调度中心入口已由 `AutomationWizard` 接管
- `src/components/scheduling/TechnicianShiftPlanningPanel.tsx`
  - 技师端反馈面板
  - 管理个人模板、历史导入、继承规则、单日调整、已确认班表、通知
- `src/components/scheduling/ShiftMatrixEditor.tsx`
  - 日 / 周 / 月（4 周）通用小时格编辑器
  - 支持点击、拖拽、全选、全不选、反选、工作日 / 周末套用、复制上一天、复制上一周、时段批量填充

## 状态流

旧自动 / 手动排班核心状态仍存放在 `src/state/shiftPlanningStore.ts`。调度中心与智能排班状态存放在 `src/features/dispatch-center/store.ts`，同样使用 `useSyncExternalStore + localStorage`。用户端预约页只读取最终投影出来的 `finalBookableSlots / confirmed slots`，不再用草稿、反馈或固定时间列表作为可预约来源。

1. 店铺创建或更新 `StoreSchedulePolicy`
2. 店铺模板保存为 `ScheduleTemplate(ownerType=store)`
3. 店铺开放周期后，向技师写入通知任务
4. 技师提交 `TechnicianScheduleResponse`
5. 技师模板保存为 `ScheduleTemplate(ownerType=technician)`
6. 技师单日调整保存为 `ScheduleSlotOverride(ownerType=technician)`
7. 店铺手动确认或一键确认后，写入 `ConfirmedShift`
8. 系统把缺人 / 超额 / 已确认结果写入 `NotificationTask`
9. 智能排班生成 `ScheduleDemandForecast / ScheduleRecommendation / ScheduleExceptionQueueItem / ScheduleOptimizationRun`
10. 只有 `confirmDispatchSmartSchedule` 或全自动达标后，才把智能结果写入 `DispatchFinalShift`
11. `buildPublishedBookableSlots` 仍只从已确认周期里的 confirmed final shifts 生成用户端可预约槽位

### v2 状态语义

- `draft`：周期草稿
- `rule_setting`：规则设定中
- `collecting_feedback`：商户确认模式下收集技师反馈
- `feedback_closed`：反馈已关闭，等待检测或自动确认
- `final_confirming`：最终确认中
- `confirmed`：已最终确认，生成 confirmed slots，等待执行
- `active`：周期正在执行
- `completed`：周期结束
- `cancelled`：周期取消
- `reopened`：已确认后重新开启，必须写日志

## 核心算法

算法实现位于 `src/lib/shiftPlanning.ts`。

### 1. 模板展开

- 日模板：1 天循环
- 周模板：7 天循环
- 月模板：28 天循环
- 如果 `repeatEnabled=true`，模板按周期长度映射到真实日期
- 如果 `repeatEnabled=false`，只展开首个周期长度内的日期

### 2. 三层排班模型

- 店铺开放层：`resolveStoreSlotStatus`
  - 输出 `closed / opened / locked`
- 技师反馈层：`resolveTechnicianSlotStatus`
  - 只有店铺开放时段才允许成为 `available / unavailable`
- 最终确认层：`ConfirmedShift`
  - 输出 `confirmed / waitlisted / cancelled`

### 3. 自动确认

`runAutoConfirm` 的处理顺序：

1. 取店铺开放时段
2. 取技师 `available` 反馈
3. 合并店铺规则与技师个人规则
4. 校验日 / 周 / 月工时上限
5. 校验最少休息日约束
6. 校验前后缓冲与已有共享日历冲突
7. 根据容量规则与祝日 / 星期需求系数计算目标人数和最大确认人数
8. 按优先级规则栈排序
9. 进入 `confirmed` 或 `waitlisted`
10. 生成 shortage / overflow 通知

### 4. 优先级规则栈

当前支持：

- 指定技师优先
- 指定标签优先
- 当前周期已确认工时更少优先
- 最近一次被排班时间更久者优先
- 响应更早者优先
- technicianId 稳定排序

规则栈可在 UI 中上下调整顺序，排序逻辑在 `compareByPriorityRules`。

## 数据结构

定义位于 `src/types/shiftPlanning.ts`，核心实体包括：

- `StoreSchedulePolicy`
- `ScheduleTemplate`
- `ScheduleSlotOverride`
- `TechnicianScheduleResponse`
- `ConfirmedShift`
- `CapacityRule`
- `NotificationTask`

这些实体已经按当前原型要求拆开，不再把“开放、反馈、确认”混在一张日历表里。

智能排班新增类型位于 `src/features/dispatch-center/domain.ts`：

- `ScheduleAutomationPolicy`
- `ScheduleDemandForecast`
- `TechnicianSchedulePreference`
- `ScheduleOptimizationRun`
- `ScheduleRecommendation`
- `ScheduleExceptionQueueItem`

这些字段对应未来后端表：`schedule_automation_policies`、`schedule_demand_forecasts`、`technician_schedule_preferences`、`schedule_optimization_runs`、`schedule_recommendations`、`schedule_exception_queue`。

## 如何扩展到 30 分钟粒度

当前版本固定 1 小时粒度。若要扩展到 30 分钟：

1. 把 `ShiftMatrixEditor` 的小时维度从 24 改为 48
2. 把 `ConfirmedShift.hour` 改为 `slotIndex`
3. 把 `formatHourLabel` 与冲突检测改为半小时
4. 把 `runAutoConfirm` 中的工时累加从 `+1` 改为 `+0.5`
5. 把 UI 中所有 “小时格” 文案统一替换为“时间格”

## 如何扩展到自然月模板

当前月模板是固定 28 天。

如果后续改自然月：

1. `getTemplateDayCount("month")` 改为按实际月份动态返回
2. `getMonthBucketKey` 改为按自然月聚合
3. `ShiftMatrixEditor` 的月视图天数改为按起始月份生成
4. `ScheduleTemplate.cycleLength` 不再固定 28

## 如何替换为真实接口

当前是 mock store，但接口边界已经明确：

- 页面只依赖 `shiftPlanningStore` 导出的动作
- 真实后端接入时，可把这些动作替换为 API 调用 + 响应归一化

推荐替换顺序：

1. 保留 `src/types/shiftPlanning.ts`
2. 把 `src/state/shiftPlanningStore.ts` 的本地写入替换为请求
3. 保持 `src/lib/shiftPlanning.ts` 继续负责前端展开、校验、预演和 UI 派生数据
4. 如果后端也实现自动确认，可让前端保留同一套算法作为“预览 / 验证器”

## 当前实现边界

- 已支持店铺开放、技师反馈、单日调整、手动确认、一键确认、候补、缺人 / 超额通知
- 已支持历史模板导入、期间免费角标、强制继承规则
- 已按后台职责重构，把店铺排班、调度、场控、库存从运营后台迁移到店铺后台
- 已完成“调度中心”导航收口：
  - 主插页为 `排班当前周期确认 / 排班`
  - `排班` 内部用二级切换承载 `手动 / 自动 / 智能`
  - 旧 `overview / automation / manual` 路由全部兼容跳转到新的结构
- 已新增智能排班第一版：
  - `限定免费` 角标
  - 智能推荐 / 半自动 / 全自动
  - 需求预测、技师匹配评分、推荐班表、异常队列、质量评分、自动确认阈值
  - 技师端我的排班偏好与自动提交反馈设置
  - confirmed slots 仍是用户端可预约时间唯一来源
- 仍属于前端 mock workflow，未接真实节假日服务和后端审批流
