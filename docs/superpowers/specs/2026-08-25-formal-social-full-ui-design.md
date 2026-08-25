# NeeDo 正式动态完整页恢复设计

## 背景与根因

Step 13 接入正式 Social API 时新增了 `src/features/social/formal-pages.tsx`，并在 `route-pages.tsx` 中按正式模式与静态演示模式切换两套页面。正式页只渲染用户 ID 和纯文字；原完整 UI 只在静态演示中加载。同时，三个月正式模拟 Seed 没有写入 SocialPost，导致正式测试账号只有验收脚本遗留的单条纯文字动态。

这违反了 `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` 的既定边界：前端只替换 Social API adapter，不改 UI。

## 已确认目标

- 用户端、商家端、技师端只保留同一套完整动态 UI。
- 删除极简正式页面及正式/旧版页面切换逻辑。
- 正式账号从 `/api/v1/social/*` 读取数据；静态演示继续使用浏览器内 legacy adapter。
- 正式测试账号使用真实 MySQL SocialPost、Follow 和 User 数据。
- 正式模拟内容至少覆盖纯文字、单图/多图、引用、视频四类，并使用现有 NeeDo 本地图片资源和可播放视频 URL。
- 不新增 mock API，不把正式动态写入 localStorage，不伪造未实现的点赞、收藏或转发成功。

## 单一页面与适配层

```text
Social routes (user / merchant / technician)
                    |
                    v
         Existing full Social pages
                    |
        +-----------+-----------+
        |                       |
 static-demo bypass        formal session
        |                       |
 LegacySocialProvider      FormalSocialProvider
 browser demo state        /api/v1/social/* + SSE
```

`route-pages.tsx` 只负责懒加载完整页面，不再判断账号或环境。数据来源的唯一分支留在 `SocialProvider`：显式静态演示 bypass 使用 legacy provider，其余会话使用正式 provider。

## 正式动态合同

正式 SocialPost 响应补充作者公开展示信息，不返回敏感字段：`userId`、`displayName`、`username`、`avatarUrl`、`entityType`。`media` JSON 使用向后兼容 envelope：

```ts
type FormalSocialMediaEnvelope = {
  items: SocialMediaItem[];
  quotePostId?: number;
  replyToPostId?: number;
  postType?: SocialPostType;
  locationLabel?: string;
  counters?: {
    likes: number;
    replies: number;
    reposts: number;
    views: number;
    bookmarks: number;
  };
};
```

旧的数组形式仍解析为 `items`，避免破坏已有正式动态。

## 正式测试数据

三个月模拟 Seed 增加独立的 Social 计划，使用共享 `customer@example.com`、模拟客户、模拟技师和模拟店主账号。重复执行时只替换带 `namespace=needo_three_month_simulation`、`dataset=social` 标记的媒体 envelope，不删除人工发布的动态。

至少写入 12 条内容：

- 纯文字：预约前确认、服务体验、空档提醒。
- 图文：门店环境、护理准备、上门服务工具，多图布局。
- 引用：客户引用技师说明、技师引用店铺临时档公告。
- 视频：正式媒体 envelope 中含 `type=video`、poster、时长与可播放 URL。

## 错误与能力边界

- 正式列表加载失败时保留完整页面骨架并提供重试，不回退到浏览器模拟数据。
- 正式发布先等待 API 成功后才进入时间线；失败不制造本地成功记录。
- 对象存储合同完成前，不持久化 `blob:` 上传地址。
- 没有正式 API 的高级互动保持无假成功；本微步骤不扩张点赞、收藏、转发数据库模型。

## 验收

- 正式账号打开三个 `/moments` 入口均渲染完整页结构。
- 页面源码不再包含 `FormalSocialTimelinePage` 或正式/legacy 页面切换。
- 正式 API 返回至少 12 条模拟动态，四种内容类型齐全，作者头像和名称可见。
- 视频控件可以加载，引用卡可以解析到正式被引用动态。
- 定向测试、前后端测试、lint/build 通过，并用真实测试账号在浏览器中视觉检查桌面和移动宽度。
