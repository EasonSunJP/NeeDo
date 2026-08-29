# 通讯录 NeeDoID 与好友动态状态

## 目的

通讯录、会话参与者和联系人信息设置页必须显示用户表中不可变的 `User.needoId`，不能把内部自增主键 `User.id` 当作公开账号 ID。联系人标签下方提供一个轻量的好友动态入口，但联系人页不下载动态正文、图片或视频。

本实现对应：

- [设计说明](./superpowers/specs/2026-08-27-contact-needoid-social-preview-design.md)
- [实施计划](./superpowers/plans/2026-08-27-contact-needoid-social-activity.md)

## 正式数据合同

`GET /api/v1/im/contacts` 的每一条联系人关系包含 `contactUser`：

```json
{
  "contactUser": {
    "userId": 237,
    "needoId": "n0000000237",
    "username": "柴田 陽菜",
    "avatarUrl": "/images/generated/profiles/cartoon-profile-03.png"
  }
}
```

`userId` 仅用于内部关联与正式路由参数；公开显示、搜索和登录账号标签统一使用 `needoId`。商户组织通讯录的正式技师数据也直接读取关联用户的 `needoId`，不从技师资料 ID 或内部用户 ID 拼接展示值。

## 30 天动态状态接口

受保护接口：

```text
GET /api/v1/social/users/:userId/activity-status
permission: social-post:list
```

接口返回：

- `recent_posts`：最近滚动 30 天内至少存在一条当前查看者可见、未删除的动态。
- `no_recent_posts`：最近滚动 30 天内没有符合条件的动态。
- `latestVisiblePostAt`：命中时返回最新可见动态时间，否则为 `null`。
- `profile`：目标账号的正式公开资料摘要，`joinedAt` 来自真实 `User.createdAt`。

可见范围与正式 Social 列表一致：公开动态可见；关注者动态仅本人或仍处于有效关注关系的查看者可见。置顶不会延长 30 天窗口。目标账号不存在、停用或软删除时返回正式 404 错误。

完整 Social 动态响应另外返回 `viewerIsFriend`：只有查看者和作者双方都存在未删除、未拉黑的 Contact 时为 `true`。该字段用于正式“好友”筛选；Follow 仍独立表达单向关注，单向联系人不会被提升为好友。

该接口只执行存在性查询并选择 `id`、`createdAt`，不会读取或返回 `media`、正文列表、邮箱、密码散列或 token。

## 查询与索引

迁移 `20260827193000_social_post_activity_lookup` 为 `social_posts` 增加：

```text
social_posts_author_user_id_deleted_at_created_at_idx
(author_user_id, deleted_at, created_at)
```

联系人详情页只在打开单个正式联系人时请求一次状态接口，不在通讯录列表批量请求，也不逐条扫描联系人。页面卸载或切换联系人时会忽略过期响应。只有点击动态入口进入完整好友页后，前端才按 `authorUserId` 分页请求该账号的正式动态；并发进入同一账号时复用同一个在途 Promise。

因此联系人页的固定成本是一条目标账号资料查询和一条走复合索引的 `LIMIT 1` 存在性查询，不包含媒体下载，也不会产生通讯录 N+1 请求。

## 前端状态与路由

动态区域位于标签区域之后、消息设置之前，始终为纯文字入口：

- 加载中：`正在查看好友近期动态`
- 最近 30 天有可见动态：`前往好友的动态页`
- 最近 30 天无可见动态：`好友近期无动态`
- 接口失败：`动态暂时无法加载`

四种状态都可以点击完整好友 Social 页面。三端复用同一页面实现：

```text
/moments/users/:userId
/merchant/moments/users/:userId
/technician/moments/users/:userId
```

完整页面按目标账号加载正式资料和可见动态；无动态时显示好友空状态，不提供代替好友发布内容的按钮。

## 本地正式验收

使用 `backend/.env.dev` 指向的 `needo_dev`、受保护的正式测试 seed 和真实账号完成验证：

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run seed:formal-social-test
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:simulation-data
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:formal-social-test
```

验收必须同时确认：联系人 API 返回持久化 NeeDoID；状态 API 不含媒体或敏感字段；`EXPLAIN FORMAT=JSON` 选择复合索引；联系人页不显示内部数字 ID、不渲染媒体；点击后进入对应账号的完整正式 Social 页面。
