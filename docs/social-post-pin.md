# Social 动态置顶本地微步骤

本微步骤属于 Step 13，只补齐已发布动态的正式置顶/取消置顶能力。

- 当前活动身份最多置顶一条自己发布的根动态。
- `PUT /api/v1/social/posts/:id/pin` 置顶；`DELETE /api/v1/social/posts/:id/pin` 取消置顶。
- 两个接口都要求既有 `social-post:create` 权限，并校验动态归属、活动身份、软删除状态及非回复关系。
- 当前置顶记录保存在 `user_identities.pinned_social_post_id`，数据库唯一约束保证同一动态不会跨身份复用；身份行天然保证每个身份最多一条。
- 置顶与取消置顶都写入 `AuditLog`，前端仅在正式 API 成功后更新状态。

本微步骤不包含动态删除、转发、翻译、举报或屏蔽能力，也不授权推送或部署。
