# NeeDo 用户首页五语言轮播内容设计

## 1. 状态与目标

本设计于 2026-08-29 经用户确认。目标是在现有正式 `USER_HOME` 内容发布能力上补齐语言级图片覆盖和无跳转轮播项，并用一个新的五张发布版本替换当前单张 Service 轮播。

最终顺序固定为：

1. NeeDo 欢迎图，不绑定店铺、技师或服务，不响应整卡点击。
2. 麻布十番超级按摩，跳转到该店铺的正式用户端首页。
3. Roppongi Recovery Lounge，跳转到该店铺的正式用户端首页。
4. Daikanyama Skin & Lash，跳转到该店铺的正式用户端首页。
5. Aoyama Care Studio，跳转到该店铺的正式用户端首页。

本轮只修改用户首页正式轮播领域，不改变联盟营销公告轮播的目标规则。当前已发布的 Service 轮播不会被物理删除；新版本发布后由现有发布生命周期归档，保留版本、审计和回滚证据。

## 2. 已核对的正式实体与图片

四个店铺均已在当前本地正式用户端逐页核对，可打开店铺详情：

| 顺序 | 正式店铺 | 当前本地 Shop ID | 用户端路由 | 现有展示图 |
|---|---|---:|---|---|
| 2 | 麻布十番超级按摩 | 217 | `/stores/217` | `store-cafe-consult.jpg` |
| 3 | Roppongi Recovery Lounge | 2 | `/stores/2` | `store-calm-body-room.jpg` |
| 4 | Daikanyama Skin & Lash | 6 | `/stores/6` | `store-beauty-reception.jpg` |
| 5 | Aoyama Care Studio | 1 | `/stores/1` | `home-merchant-feature.jpg` |

正式轮播发布时仍由 repository 解析 Shop，并在公共响应中返回店铺公开标识；前端不得把上表数字主键写入公共轮播链接。

四张店铺图使用各店当前详情页已有展示图，不创建与店铺事实不一致的新场景。NeeDo 欢迎图是独立品牌画面，不使用四店拼图：深色品牌底、NeeDo 荧光绿色强调、克制的定位或东京城市线条元素。欢迎图本身不烘焙任何特定语言文字；标题、说明和图片替代文本由正式多语言字段覆盖，这样切换语言时不需要依赖像素文字识别，也不会在不同屏幕裁切时损失内容。

## 3. 方案选择

### 3.1 语言图片采用默认图加语言覆盖

每张轮播继续保留一张必需的默认 `MediaAsset`。每个语言翻译可以额外关联一个可选 `MediaAsset`：

- 当前语言存在专属图片时，公共 API 返回该专属图片。
- 当前语言没有专属图片时，公共 API 返回该轮播项的默认图片。
- 五种语言可以分别上传不同图片，也可以全部复用默认图片。
- 复用同一个媒体记录时不重复存储文件。

该方案兼容当前已发布内容，也不会强迫运营人员上传五份完全相同的文件。

未采用的方案：

- 不强制五种语言分别上传图片，因为这会制造重复文件和不必要的运营负担。
- 不把翻译文字烘焙进五张图片，因为这样会破坏可访问性、响应式排版和后台文字校验。

### 3.2 欢迎项采用明确的无跳转目标

`CarouselTargetType` 新增 `NONE`，API 使用 `{ "type": "none" }` 表达。该类型只允许 `USER_HOME`，并要求 Shop、Technician、Service、Announcement 和 AffiliateTask 外键全部为空。

公共 API 对欢迎项返回 `{ "type": "none" }`。前端把它映射为没有 `to` 的 `FeatureCarouselSlide`，因此渲染普通轮播容器，不生成链接或按钮。欢迎项的 `ctaLabel` 固定为 `null`。

未采用的方案：

- 不让欢迎项点击后重新打开首页，因为这会产生没有结果的交互。
- 不绑定虚假店铺、通用 Service 或无效公开标识。
- 不把欢迎区域移出轮播，因为用户明确要求它是第一张。

## 4. 数据模型与迁移

新增一条增量 Prisma migration：

1. `carousel_target_type` 增加 `none`。
2. `carousel_slide_translations` 增加可空 `media_asset_id`。
3. 为翻译媒体增加外键和索引，删除行为保持 `RESTRICT`。
4. 保留 `carousel_slides.media_asset_id` 作为默认图片，不搬移或重写既有发布版本。

Prisma 关系命名必须与 `MediaAsset` 现有 Carousel 默认图片关系区分。所有表继续保留软删除、创建时间和更新时间规则；已应用的历史 migration 不修改。

公共图片解析规则为：

```text
selectedTranslation.mediaAsset ?? slide.defaultMediaAsset
```

默认媒体缺失、已软删除、不是正式内容媒体或物理文件不可用时，发布校验失败。语言专属媒体只要存在，也必须通过同一媒体有效性校验。

## 5. API、Service 与 Repository

用户首页 target input 和公共 target union 增加 `{ type: "none" }`。联盟公告轮播 validator 和 Service 继续拒绝该类型。

草稿创建、整版替换、逐语言更新和 preview 响应增加语言媒体字段：

- `defaultMediaAssetPublicId`：轮播项默认图片。
- `mediaAssetPublicId`：当前语言可选覆盖，允许为 `null` 表示使用默认图。
- `imageUrl`：preview 与公共读取时按当前语言解析后的最终图片地址。

已有客户端字段在迁移期间保持兼容，正式实现应在同一微步骤内统一后端类型、OpenAPI、前端 API 类型和编辑器提交结构，不能留下双重权威。

发布前继续校验五种语言的标题和图片替代文本完整。图片覆盖不是五语言必填项，因为默认图是合法回退。任何 target、媒体、并发版本或权限错误都使用现有统一错误 envelope、幂等命令和审计日志。

## 6. 运营后台交互

用户首页轮播编辑器增加：

- 公共设置区的默认图片上传和预览。
- 每个语言页签内的“当前语言图片”上传、预览和“使用默认图片”操作。
- 用户首页 target 类型中的“不跳转”；选择后隐藏目标搜索，并清除店铺、技师和服务目标。
- 不跳转项不显示 CTA 文案输入，提交值为 `null`。

上传仍走 `POST /api/v1/backoffice/content/media`，需要现有媒体上传权限并写审计。语言切换只切换编辑内容，不在浏览器本地保存业务状态。保存、预览、立即发布、定时发布、停用和回滚继续使用现有正式生命周期与 optimistic lock。

## 7. 五语言内容

店铺名称保持正式品牌名，不为切换语言改写店铺身份。Badge、说明、CTA 和图片替代文本按语言保存。

### 7.1 欢迎图

| 语言 | Badge | 标题 | 说明 | CTA | 图片替代文本 |
|---|---|---|---|---|---|
| zh-CN | 欢迎来到 NeeDo | 欢迎进入 NeeDo | 发现东京值得信赖的本地服务 | 无 | NeeDo 本地生活服务欢迎图 |
| zh-TW | 歡迎來到 NeeDo | 歡迎進入 NeeDo | 探索東京值得信賴的在地服務 | 无 | NeeDo 在地生活服務歡迎圖 |
| en | Welcome to NeeDo | Welcome to NeeDo | Discover trusted local services across Tokyo | 无 | Welcome to NeeDo local services |
| ja | NeeDoへようこそ | NeeDoへようこそ | 東京で信頼できるローカルサービスを見つけよう | 无 | NeeDoローカルサービスのウェルカム画像 |
| ko | NeeDo에 오신 것을 환영합니다 | NeeDo에 오신 것을 환영합니다 | 도쿄의 믿을 수 있는 지역 서비스를 만나보세요 | 无 | NeeDo 지역 서비스 환영 이미지 |

### 7.2 店铺页

四张店铺页统一使用以下本地化 Badge 与 CTA：

| 语言 | Badge | CTA |
|---|---|---|
| zh-CN | 精选店铺 | 进入店铺 |
| zh-TW | 精選店舖 | 進入店舖 |
| en | Featured shop | View shop |
| ja | 注目の店舗 | 店舗を見る |
| ko | 추천 매장 | 매장 보기 |

说明文案：

| 店铺 | zh-CN | zh-TW | en | ja | ko |
|---|---|---|---|---|---|
| 麻布十番超级按摩 | 麻布十番的到店护理空间 | 麻布十番的到店護理空間 | In-store care in Azabu-Juban | 麻布十番で受けられる来店型ケア | 아자부주반에서 만나는 매장 케어 |
| Roppongi Recovery Lounge | 六本木的私密恢复护理 | 六本木的私密恢復護理 | Private recovery care in Roppongi | 六本木のプライベートリカバリーケア | 롯폰기의 프라이빗 리커버리 케어 |
| Daikanyama Skin & Lash | 代官山肌肤与美睫护理 | 代官山肌膚與美睫護理 | Skin and lash care in Daikanyama | 代官山のスキン＆アイラッシュケア | 다이칸야마의 스킨 앤 래시 케어 |
| Aoyama Care Studio | 青山的日常身心护理 | 青山的日常身心護理 | Everyday body and wellness care in Aoyama | 青山で受けられる日常のボディ＆ウェルネスケア | 아오야마의 일상 바디 및 웰니스 케어 |

每张店铺图片替代文本使用“正式店铺名 + 当前语言的店铺宣传图”语义，不包含评分、销量、疗效或其他可能变化的宣传事实。

## 8. 发布数据流程

实现完成后通过正式后台 API 执行：

1. 上传一张独立 NeeDo 欢迎品牌图和四张店铺现有展示图，形成正式 `MediaAsset`。
2. 从当前已发布版本创建新的可编辑草稿，不直接改写旧版本。
3. 将草稿完整替换为固定顺序的五张轮播。
4. 填写五语言文字；初始内容可复用默认图，后台仍保留逐语言图片覆盖能力。
5. preview 核对五种语言和所有目标。
6. 立即发布新版本；旧 Service 版本进入历史归档。
7. 通过审计日志核对媒体上传、草稿保存和发布动作。

不得通过 seed 静态数组、localStorage、直接 SQL 或手改发布表绕过 Service、RBAC、幂等和审计。

## 9. 测试与验收

实现按测试先行完成，至少覆盖：

- Prisma schema 与 migration 包含 `none` target 和翻译媒体外键。
- validator 允许用户首页 `none`，拒绝联盟轮播 `none`。
- Service 校验无跳转项外键为空并在其他 scene fail closed。
- Repository 保存、读取和克隆语言媒体覆盖；缺少覆盖时解析默认图。
- 公共 API 对 `zh-CN`、`ja` 返回各自文字与解析后的图片，只暴露公开店铺标识。
- OpenAPI、前端 API 类型和编辑器 payload 一致。
- 编辑器可上传默认图、上传或清除当前语言图片、选择不跳转。
- `PublishedCarousel` 对 `none` 不生成链接，对 Shop 生成正式店铺公开路由。
- 用户首页和动态页继续读取同一正式 `user-home` 发布版本。

完成前运行 focused backend/frontend tests、完整 backend/frontend tests、两端 lint/build、i18n 质量检查、正式生产构建和 `git diff --check`。

本地浏览器验收必须实际观察：

1. 后台新版本包含固定顺序五张。
2. 欢迎图无 CTA、无整卡链接，点击不改变路由。
3. 四张店铺图分别进入正确店铺首页并显示对应正式店名。
4. 用户端切换中文和日语后，标题、说明、CTA、图片替代文本与最终图片按语言解析。
5. 后台为一个语言上传独立图片后，只有该语言变化；清除覆盖后恢复默认图。
6. 刷新页面和重启 backend 后内容仍从 MySQL 与正式媒体恢复。
7. 用户首页和动态页的同一轮播发布版本一致。
8. 相关后台、主页、动态页和四个店铺详情页 console error 为 0。

## 10. 回滚边界

如果新版本验收失败，使用正式停用或历史回滚能力恢复旧发布版本，不删除历史发布、媒体、审计或幂等命令。数据库 migration 为向前兼容扩展；已经存在语言媒体关联后不得直接删除字段或枚举值。
