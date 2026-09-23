# NeeDo Localization Issues

> 非本地化任务中发现的翻译、术语、截断、typo 或 i18n mapping 问题统一记录于此。不要在无关任务中顺手修改翻译。

## 使用规则

- 当前 locale：`zh`、`zh-Hant`、`ja`、`en`、`ko`。
- 一行记录一个可独立处理的问题；不知道建议文案时写 `—`，不要猜。
- `blocking` 仅用于 security、legal、payment、privacy、permission、consent、account deletion 或 App Store / Google Play compliance。
- 问题修复并验证后，将状态改为 `resolved`，并补充 commit/PR 或验证记录；不要删除历史行。

## Issue log

| ID | Status | Severity | Locale | Translation key / source text | Screen / module | Current text | Issue | Suggested correction | Found at | Evidence / resolution |
|---|---|---|---|---|---|---|---|---|---|---|
| LOC-0001 | open | non-blocking | ja | merchant staff list labels | `/merchant/staff` | `月人件费（日元）`、`职务名`、`在スタッフ下スタッフを追加`、`編集总务职务名`、`未解决`、`関連項目は完了しました。` | 商户技师列表、职位分组和人事信息区出现简体中文、日文混排，部分句子语义也不自然。 | — | 2026-09-20 staging | Staging UI DOM，LifeDance Wellness 渋谷，26 名技师列表 |
| LOC-0002 | open | non-blocking | ja | merchant staff metric label | `/merchant/staff` | `完特異` | 指标名称不是自然日语，且无法明确理解原指标含义。 | — | 2026-09-20 staging | 每张技师卡片的第二个指标 |
| LOC-0003 | open | non-blocking | ja | merchant staff detail tabs | `/merchant/staff/s5148317836` | `从属与アカウント`、`スタッフスケジュール`、`薪酬与分成`、`長年の専門的な経験` | 技师详情页标签和字段存在中日混排；“長年の専門的な経験”用于显示 `1年` 也不自然。 | — | 2026-09-20 staging | 佐藤美咲技师详情页 |
| LOC-0004 | open | non-blocking | ja | merchant service page controls | `/merchant/me?meTab=service` | `サービス已达上限 20/20`、`切り替え到第 1件轮播`、`缩略图` | 服务上限、轮播和缩略图控件出现简体中文、日文混排。 | — | 2026-09-20 staging | StagingTest 商户信息卡，正式 API 为 3 个服务 |
| LOC-0005 | open | non-blocking | ja | merchant service page booking copy | `/merchant/me?meTab=service` | `到着日`、`店舗・確認を確認してください。`、`まだありません予約サービスをご利用いただけます` | 日期字段语义与预约场景不符，营业时间与无可预约服务提示不自然且难以理解。 | — | 2026-09-20 staging | StagingTest 商户信息卡预约时间区 |
| LOC-0006 | open | non-blocking | ja | merchant service page staff and anomaly labels | `/merchant/me?meTab=service` | `隠れるスタッフ`、`視聴村 直樹`、`未解决`、`今天`、`関連項目は完了しました。` | 员工可见性、姓名、异常状态和时间标签存在误译、中日混排或语义错误。 | — | 2026-09-20 staging | 员工列表与异常信息区；正式姓名为中村 直樹 |
| LOC-0007 | open | non-blocking | ja | merchant schedule cycle wizard | `/merchant/schedule?tab=planning` | `步骤`、`默认推奨`、`完成ステータス汇总`、`権限と同期边界`、`スタッフ公開后投影`、`選ぶ`、`勤務時間、休憩天与サービス缓冲` | 新周期向导大量中日混排，部分关键配置项无法用自然日语理解。 | — | 2026-09-20 staging | 新規周期 10 步向导，未发布错误周期 |
| LOC-0008 | open | non-blocking | zh, zh-Hant, ja, en, ko | `error.order.not_found` | `/technician/orders/:orderId` | `error.order.not_found` | 技师订单详情加载失败时直接显示原始 error key，未映射为当前五种 locale 的用户文案。 | — | 2026-09-21 staging | Order 24424 / ND202609210621189522；本任务仅修复数据一致性，不扩大处理翻译 |
| LOC-0009 | open | non-blocking | ja | service-card empty tag fallback | `/stores/11/technicians/22/services` | `暂无标签` | 日语服务卡的空标签提示仍显示简体中文。 | — | 2026-09-23 staging | 390px 视口，服务 308「施術延長 30分」；未改动产品文案 |
