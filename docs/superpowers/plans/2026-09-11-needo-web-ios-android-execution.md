# NeeDo Web / iOS / Android 共存开发执行文档

> 面向 Codex：使用 executing-plans 按本文的单个微步骤执行；遵守仓库 AGENTS.md，不自动并行改公共核心，不一次完成整份路线图。

**目标：** 保留现有网页和设计，复用正式业务系统，交付可安装、可维护、具备商店提交条件的 Android / iOS App。

**架构：** React / TypeScript / Vite 继续承担页面和业务交互；Capacitor 承担本地资源加载与必要原生能力。Web、Android、iOS 共用正式 API 和数据库，不复制订单、钱包、排班、IM 业务。

**技术栈：** 现有 React 19、Vite、TypeScript、Express、Prisma、MySQL、Redis；新增 Capacitor 及按需原生插件。不强制引入 Ionic UI。

**审计基线：** 本地 `main` = `cc999f093ec9f49c428ef1f6ab8a35c61d2d3e91`，核实日期 2026-09-11。正文中的现状均以该提交为准；执行时重新记录 main，不把当前目录的 HEAD 自动当成 main。

**状态：** 本文是实施规范，不是已完成清单。本次仅新增文档，没有移动 PSD、修改业务、生成正式 APK/AAB/IPA 或部署服务器。

**阅读顺序：** 产品决策先看0、4、8节；开发执行看9、10节；代码边界看11节；直接交给Codex的指令在12节。

## 0. 先读这页：推荐方案与边界

推荐：**共享 Web 核心 + 本地打包资源 + 薄原生壳 + 少量可关闭的原生增强。**

| 方案 | 开发与维护 | 视觉与体验 | 结论 |
|---|---|---|---|
| 只用 WebView 打开线上网址 | 首次最省事，强依赖线上页面 | 网络故障容易白屏；更新可能未经 App 回归 | 不作为正式发布主方案 |
| Capacitor 内置 Web 资源 | 最大程度沿用本项目；增加平台边界测试 | 大部分设计可保留；键盘、权限、返回等需适配 | **本项目首选** |
| React Native / Flutter / uni-app x 重写 | 页面、交互、样式需迁移，长期容易出现双份 UI | 可获得原生或独立渲染能力，但不能直接保留现有 CSS | 当前不选 |
| Swift / Kotlin 两套完整原生界面 | 开发和跨端同步成本最高 | 原生自由度最高 | 没有明确必要性前不选 |

这是一项针对现有代码的工程判断，不是所有产品的通用排名。若真机验证证明关键体验无法达到门槛，再局部替换问题部件，不能先推倒全站。

**先 Android 安装验证，同时早做 iOS 风险验证。** Android 调试 APK 通常更容易分发；这不等于 Google Play 发布一定更快。iOS 不应等 Android 全部完成才开始：WKWebView、登录回跳、键盘和玻璃必须在第一轮原型验证。Android 商店发布区分 AAB 与可安装 APK；iOS 区分模拟器运行、设备签名安装、TestFlight 和审核通过。

### 全局约束

- 执行前读 `README.md`、`AGENTS.md`、`docs/00_MASTER_MICRO_STEP_PLAN.md` 和本微步骤涉及的阶段文档；认证另读 `docs/User Management.md`。
- 本文 M 编号是移动化工作分解，不替代项目 Step 01–14；先核实前置阶段验收，不因“加壳”跳过正式业务门禁。
- 保留现有主题、角色、路由、语言和真实数据；不擅自删掉商户、技师、联盟营销等现有业务入口。
- 在基于当前本地 main 的隔离工作目录实施；不占用、重启或修改现有 5180 运行环境，不覆盖用户未提交改动。
- 本文不授权部署、商店上传、生产压测、开通收费资源、改签名证书或操作真实用户数据。需要这些操作时单独取得授权。
- 业务状态以服务器为准；App 缓存、推送、客户端时间都不是订单或账本的权威。
- 所有功能必须有关闭或退回现有实现的路径；迁移采用兼容性变更，不依靠破坏性数据库回退。

## 1. 两个 PSD 为什么进入产物

| main 中的文件 | 原始字节数 | 约 MiB |
|---|---:|---:|
| `public/icons/icon.psd` | 28,700,540 | 27.37 |
| `public/icons/needo-nav-button-dark.psd` | 10,056,692 | 9.59 |
| 合计 | 38,757,232 | 36.96 |

原因链：**设计源文件放进 `public` → Vite 默认整体复制 `public` → `dist/icons` 带入 PSD → 如果 App 打包整个 dist，也会带入。** 当前 `vite.config.ts` 没有关闭这项复制；现有 `audit-production-bundle-lib.mjs` 检查部分 JS 标记、大小和 HTML 资源引用，没有检查设计源文件后缀。这是资源目录和产物门禁的遗漏，不是 App 必需内容。[Vite 官方说明](https://vite.dev/guide/assets#the-public-directory)

已检索 `src`、`public`、`scripts`、`vite.config.ts`，没有找到 `.psd` 文本引用。仍应在移动前完成全仓引用核实。

修复原则：

1. 将两个原件移到非公开目录，例如 `design/source-assets/icons/`，保持字节内容和文件历史，不删除设计资产。
2. `public` 只保存确实需要公开分发的资源；网页继续使用现有 PNG / SVG 等导出件。
3. 扩展现有产物审计，递归拦截 PSD / PSB / AI / Sketch / FIG、源码压缩包、密钥等不应公开的文件；检查大小预算，不能只看 JS。
4. Web 与 App 都执行这项门禁；原生 sync 后再次检查实际打包资源。

执行时若发现文件已被其他任务移动或删除，先核实新位置、内容和变更归属，不擅自恢复或覆盖。本文记录的是上述 main 提交中的文件，不是实时工作目录清单。

注意：这约 37 MiB 是原件体积，**不是首屏下载量，也不是 APK 的确定减重数**。PSD 未被引用时，浏览器不会因为它在 dist 就主动下载；但若整个目录被发布，它可能成为可访问的公开文件。是否已被线上发布须另行核实，不能从本地构建推断。

## 2. 当前代码对移动化的实际影响

以下是实施入口，不代表这些文件要一次性修改。

| 已核实的代码现状 | 影响 | 对应处理 |
|---|---|---|
| `package.json`、`src/App.tsx`、`vite.config.ts`：React / Vite，多 HTML 入口，共享较大的 App 入口 | 只减少 HTML 文件未必减少模块加载；后台依赖可能仍进包 | M02 核实真实依赖图，按路由边界拆分 |
| `src/styles.css`：已有玻璃、高光、模糊与低性能样式 | 有可复用基础，不必另造设计系统 | M04 在现有 token 和组件上迭代 |
| `src/lib/clientPerformance.ts`：主要根据 Android 版本、内存、核心数降级 | 非 Android 提前返回 full；不能把硬件启发式当实际帧率 | 无障碍设置跨端生效；依据实测补充降级 |
| `src/lib/useVisualViewportFrame.ts`、`useIosScrollContainer.ts`：已有视口恢复与自定义滚动处理 | 原生壳的 inset、键盘和回弹可能与 Web 逻辑叠加 | M06 明确每项行为唯一责任方 |
| `src/api/portalApiBaseUrl.ts`：API 默认相对路径 | 本地壳 origin 不等于线上域名 | M03 配置正式绝对地址、精确 CORS 和媒体 URL |
| `src/auth/authEnvelope.ts`：刷新凭据在持久化 envelope 中，带锁和版本比较 | 不能简单把 localStorage 换成异步存储就算完成 | M05 保留原子性、门户隔离与退出不可复活语义 |
| `src/lib/deviceFingerprint.ts`；现有 Web Google 登录链路 | 原生登录、隐私申报与设备标识需重新核实 | M05、M09 独立处理，不照搬浏览器假设 |
| `src/lib/persistentResourceCache.ts`：已有持久缓存 | 再加独立离线状态层容易失配 | M06 复用，明确账户切换与缓存清理 |
| `backend/src/middlewares/security.middleware.ts`：限流未配置共享 store | 多实例计数不统一 | M10 用共享原子计数验证集群限流 |
| `backend/src/services/realtime-event.gateway.ts`、`redis-realtime-event.bus.ts`：已有 SSE 和 Redis 事件分发 | 不需要为了 App 改成一套 WebSocket；但断线补偿仍需验证 | M08 保留协议，补后台推送和恢复对账 |
| `deploy/prod/docker-compose.yml`：单 backend，未配置 backend 媒体挂载；Redis 使用 allkeys-lru 策略 | 模板不足以证明多实例、媒体持久性、认证状态安全 | M10 与 staging 和实际部署逐项对齐 |
| `load-tests/k6/needo-step14-load.js`：主要匿名读；登录 token 未用于后续场景；CDN 参数缺失时静态场景直接返回 | 不能证明交易、鉴权、长连接与真实静态流量容量 | M11 修正场景后再测 |

上述部署判断只针对仓库配置，**没有据此宣称线上服务器正在这样运行或已经故障**。此前构建和局部测试结果也不能替代干净安装、全业务回归、实机或容量验收。

## 3. 共存架构：哪些共用，哪些分平台

```text
同一套 React 页面 / 主题 / 业务状态 / API 契约
  ├─ Web 构建 ────────────── 浏览器 + CDN
  └─ Mobile 构建（本地资源）─ Capacitor
                              ├─ Android WebView + 必要插件
                              └─ iOS WKWebView + 必要插件
三端 ── HTTPS / SSE ── 现有正式 API ── MySQL / Redis / 媒体存储
```

### 共享范围

页面、表单校验、i18n、价格展示、排班组件、订单流程、角色权限展示、IM 数据模型继续复用。服务端继续执行权限、价格、库存、状态机、账本和幂等校验。

### 平台差异只放在边界

优先在现有能力模块内增加小型平台实现，不先建设巨大的“跨平台框架”。差异包括：凭据持久化、生命周期、键盘、安全区、返回、深链、系统分享、相册/拍摄/录音、定位、推送、可选原生玻璃。

同一逻辑只保留一个权威：一个路由状态、一个身份状态、一份键盘高度来源、一个有效实时订阅。原生按钮发送导航意图，不另存第二份订单或角色数据。

### 发布结构

- Web 保留现有入口；Mobile 使用独立构建目标及 `dist-mobile`，最终包含一个明确的 `index.html`。
- 仅在确认移动业务范围后裁剪非移动后台依赖；隐藏菜单不是安全隔离，服务端 RBAC 仍必须有效。
- App 内置可启动的 HTML / CSS / JS / 必需图标；内容图片按需读取。断网可打开壳和已有缓存，不能伪装订单已成功。
- 不用生产 `server.url` 指向网站，不开启明文 HTTP、混合内容或宽泛导航白名单。[Capacitor 配置](https://capacitorjs.com/docs/config)
- 相对 `/api/v1`、`/merchant-api/v1` 和媒体路径必须分别验证；不能只让首页 API 通了就判定接入完成。

## 4. 玻璃效果：可以更好，但必须区分技术能力

### 4.1 对用户提供文章的结论

[该文](https://juejin.cn/post/7514618352829448244)介绍了 SVG 位移滤镜模拟折射，以及边缘高光和模糊组合。它可以作为外观研究材料，不是 Android / iOS 通用兼容性证明。

文章推荐之一 [liquid-glass-react 的作者说明](https://github.com/rdev/liquid-glass-react)明确提示 Safari / Firefox 只部分支持，位移效果不可见。**不能把 Chrome 演示效果等同于 iPhone WKWebView 效果，也不能只依赖 `CSS.supports()` 判定折射正确。**

### 4.2 四种不同效果，不能混称

| 技术 | 能做什么 | 限制 | NeeDo 决策 |
|---|---|---|---|
| CSS `backdrop-filter` + 高光/渐变 | 网页背板模糊、通透层次 | 不是物理折射；大面积、多层会增加绘制成本 | 默认共享方案 |
| SVG 位移 / Web shader | 指定内容的变形、边缘折射模拟 | 取样内容、浏览器支持、滚动和 GPU 成本不同 | 仅小范围实验；失败回退 CSS |
| iOS 26+ `UIGlassEffect` | 系统原生 Liquid Glass，原生交互层质感 | 不能自动应用到每个 DOM 容器；跨 WKWebView 合成必须实测 | 可选增强导航/工具栏，不先覆盖所有卡片 |
| Android `RenderEffect` / 跨窗口 blur | 前者处理对应 RenderNode 内容，后者模糊背后窗口 | 都不等于任意网页背后的实时折射；设备和省电模式会影响支持 | 默认保留 Web 玻璃，局部原生试验后决定 |

苹果建议将 Liquid Glass 集中在重要交互控件，避免层层叠加；可用 `UIVisualEffectView` 配合 `UIGlassEffect`，旧系统采用可支持的材质回退。[Apple UIKit 官方演示](https://developer.apple.com/videos/play/wwdc2025/284/)

Android 的 `createBlurEffect` 模糊其安装对象的内容；直接对整个 WebView 调用会让文字和按钮一起模糊，不是玻璃容器的正确实现。[RenderEffect 官方定义](https://developer.android.com/reference/android/graphics/RenderEffect)

Android 12+ 的跨窗口模糊适用于浮动窗口等场景，可能被设备能力或运行状态关闭；不能当作同一网页内部的通用背景滤镜。[AOSP 官方说明](https://source.android.com/docs/core/display/window-blurs)

### 4.3 推荐视觉层级

1. **基础档：** 现有主题底色、描边、静态高光；对比度完整，无滤镜也像正式产品。
2. **标准档：** 当前 Web 玻璃基础上校准模糊、饱和度与边缘；作为三端默认体验。
3. **增强档：** 只在验证通过的系统/组件开启原生材质或局部折射；可以独立关闭，不改变布局与业务。

“减少动态效果”优先关闭形变/连续动画；“减少透明度”采用更实的底色。二者不要简单混成“所有阴影和玻璃全删”。低性能档也要保留设计层次和文字可读性。

初始实验预算：同屏主要动态玻璃面优先限于顶部、底部或当前弹层；重叠弹层尽量共用一个模糊背板。不要给每个列表卡片独立叠加多层滤镜。数量不是通用性能定律，最终根据合成轨迹调整。

### 4.4 原生玻璃原型的准入条件

先只选 **底部导航一个部件**，比较“现有 CSS”“优化 CSS”“原生覆盖层”；不替换整个 MobileShell。

- 使用真实页面背景：列表滚动、轮播图、图片、输入框和深浅主题，不只使用静态壁纸。
- 验证取样的是当前背后内容，没有冻结画面、黑块、漏边、错位、双重模糊、文字失真。
- 验证坐标、圆角、裁剪、安全区、旋转、键盘弹出、弹窗遮挡以及触摸命中。
- 验证 VoiceOver / TalkBack 顺序：不得出现两份相同导航，也不得让透明原生层挡住 Web 按钮。
- 连续滚动与切页 10 分钟，比较帧时间、内存、发热；若通过截图循环才能跟随背景，原型不通过。
- 原生版本只有在视觉收益明确、性能门槛通过、关闭可恢复时才进入正式实现。无法证明收益就保留优化 CSS，不阻塞 App 核心发布。

### 4.5 真正的视觉验收

固定同一账户、数据、语言、主题、页面状态和设备，保存 before/after 截图与滚动录屏。重点看：首页、底部导航、IM 输入容器、弹窗、服务卡片、排班表、支付/金额区域。

静态截图用来对比颜色和布局；录屏及性能轨迹用来判断折射跟随、掉帧与输入延迟。桌面浏览器缩窄窗口、模拟器或截图差异测试都不能代替手机实测。禁止为了通过截图比较而更改主题底色或隐藏真实内容。

## 5. App 易用性、适配与稳定性规则

| 场景 | 实施规则 | 必测失败情况 |
|---|---|---|
| 启动 | 壳先可显示，数据有加载/重试状态；启动画面与首屏主题一致 | 冷启动断网、登录过期、资源缺失，不无限白屏 |
| 键盘 | 原生 inset 和 VisualViewport 选定唯一责任方，复用现有 hook | 中日文组合输入、切键盘、横屏、语音、后台回来、输入栏遮挡 |
| 安全区 | 按当前窗口 inset / CSS env 计算，不硬编码机型高度 | 刘海、挖孔、手势条、三键导航、分屏、折叠展开 |
| 返回 | 顺序为关闭键盘/当前弹层、退页面、处理根页；与系统事件实测对齐 | Android 返回键/预测返回；iOS 侧滑；不能一退就退出或连续退两页 |
| 滚动 | 不让原生回弹和自定义 touchmove 回弹同时控制同一容器 | 列表、地图、横滑导航、排班横纵滑、弹层嵌套 |
| 文字与触控 | 保留系统字体缩放和读屏；建议 iOS 44 pt、Android 48 dp 等效点击区域 | 大字号、长日文、多语言、窄屏；金额不能截断 |
| 权限 | 在具体使用时申请，可拒绝、可取消、可恢复 | 定位/照片/麦克风权限从允许变为拒绝、仅部分照片 |
| 媒体 | 大图先按用途压缩和缩略；上传设大小/类型/超时限制，及时释放 URL 和流 | HEIC、旋转照片、大视频、上传中切后台、空间不足 |
| 深链/分享 | 严格解析已允许的域名、路由和 ID；先鉴权后进入目标 | 未登录、已删除对象、无权限、重复打开、恶意 scheme |
| 网络 | 请求去重、超时、取消、有限重试；网络提示不等于真实可达性 | Wi-Fi/蜂窝切换、DNS失败、TLS失败、429/503、请求结果未知 |
| 生命周期 | 恢复时先检查会话，再恢复当前数据与实时订阅 | 系统杀进程、WebView进程回收、锁屏30分钟、账户切换 |

Android 系统版本不等于 WebView 版本；安全区和键盘处理还会受 WebView 更新影响，需记录两者。[Android WebView Insets](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)

**交易底线：** 点击后可立即显示“处理中”，但下单、扣款、取消和退款的“成功”必须有服务端证明。写请求超时后先查结果，再使用同一幂等键补偿；不得生成新键盲目重试，不得把离线缓存当可用余额。

## 6. 认证、原生能力与商店准备

### 6.1 认证边界

- 保留内存 Access Token、短有效期、Refresh 轮换、退出吊销与门户隔离。
- 原生 Refresh 凭据使用经过审查的 Keychain / Android Keystore 支持的安全持久化实现；Capacitor Preferences 不是凭据保险箱。
- 不能只替换底层存储函数：现有 envelope 的比较写入、锁、credentialVersion、退出终态必须整体测试。存储失败时不能退回明文保存。
- 安全存储主要减少静态提取风险，**不自动防止 XSS 或被滥用的 JS 原生桥**；仍需 CSP、受信导航范围、插件最小权限与日志脱敏。
- Google 原生/系统浏览器登录采用受支持流程；服务端校验固定允许的客户端 audience、issuer、有效期与适用的 nonce / state / PKCE，不接受任意客户端 ID。
- 设备标识优先采用平台允许且符合实际用途的方案；不能用硬件/浏览器指纹规避隐私选择。

### 6.2 推送不是持久在线

前台复用 SSE；进入后台不承诺 JS/SSE 长期存活。原生推送负责提醒和唤起，打开后从正式 API 查询最新状态。推送内容不直接修改订单与余额，锁屏通知避免泄露敏感内容。

推送令牌绑定账户、设备、环境和 App 安装；支持轮换、退出解绑、失效删除、多设备去重。拒绝通知不应阻塞普通业务。推送权限、生产凭据、APNs/FCM 联调属于独立步骤。

### 6.3 上架门禁

除了可安装，还需审查：账号删除的完整处理流程；UGC 举报、屏蔽、内容处置和联系方式；隐私政策与 SDK 数据申报；第三方登录的适用要求；审核可访问的真实测试账户和在线后端。加几个插件不能保证通过“最低功能”审核。[Apple 审核规则 1.2、4.2、4.8、5.1.1](https://developer.apple.com/app-store/review/guidelines/)

商品需分别列清：现实服务、数字权益、会员、NDP 的购买/使用/兑换规则，不预设“一律外部支付”或“一律内购”。按销售地区与当期 Apple / Google 政策逐项确认，涉及法律与资金的决策由负责人确认。此次文档不更改财务模型。

Google Play 还需核对账号删除的 App 内入口及 App 外网页申请渠道；不能要求已经卸载的用户先重新安装才能申请。[Google 账号删除要求](https://support.google.com/googleplay/android-developer/answer/13327111) 支付分类同时参照 [Google Play Payments 政策](https://support.google.com/googleplay/android-developer/answer/9858738)。

提交前重新核对 SDK、target API、签名、隐私清单、数据安全表单、评级、权限用途、截图、支持网址和第三方库许可证。iOS / Google Play 的资格与审核等待时间不计作 Codex 编码时间。

## 7. 服务器稳定与抗高并发：独立于加壳

**本地资源包减少部分静态资源请求，不会减少同样业务操作产生的数据库竞争，也不会自动增加服务器容量。**

### 7.1 按优先级实施

| 优先级 | 处理 | 验证证据 |
|---|---|---|
| 发布前 | prod/staging 路由、CORS、环境变量、媒体持久化与真实部署一致 | 三 API 入口、上传读取、容器重建后媒体仍可读 |
| 发布前 | 公开图片使用对象存储/CDN或可靠持久存储；私有IM/身份材料鉴权 | 跨账户访问拒绝；签名过期拒绝；私有资源不进公共 CDN 缓存 |
| 多实例前 | 登录、OTP、一般 API 采用共享原子限流；设置正确代理信任边界 | 同账户打到两个实例仍累计；伪造转发头不能绕过 |
| 多实例前 | 审计随 API 启动的定时任务，明确唯一执行/分片/租约与幂等 | 同时启动两个实例不重复结算、不重复通知或丢任务 |
| 多实例前 | 会话、吊销和分布式锁不与可淘汰缓存混用资源策略 | Redis 故障/内存压力下不绕过认证；返回可控错误而非全放行 |
| 容量阶段 | 慢查询、分页、索引、热点读缓存、连接池和上游超时 | P95/P99、池等待、锁等待、事件循环延迟有量化证据 |
| 发布前 | 备份、恢复、告警和灰度回滚 | 实际还原演练及健康检查，不只存在配置文件 |

Redis 不同 logical DB 仍共享同一实例内存与淘汰策略，不构成资源隔离。`allkeys-lru` 只是在触发内存淘汰时产生风险；当前配置本身不能证明已发生会话丢失。关键状态实例应采用明确容量、持久性和故障策略；不能只改成 noeviction 而不处理写入失败。

连接池按所有进程求和，不只看单服务：

```text
总潜在连接 = Σ(API 实例数 × 每实例池上限)
           + Σ(worker 实例数 × 每实例池上限)
           + migration / 监控 / 运维预留
```

例如 3 类 API 各 4 实例、每实例 40 连接，API 就可能占 480 连接，不能在数据库上限 500 时继续照搬相同 worker 池。该例是容量计算，不是本项目推荐部署规模。

不要一开始上微服务、分库分表或 Kubernetes。先解决可见瓶颈；需要读副本时，订单结果、余额和登录状态不得误读延迟副本。

### 7.2 实时和重试风暴

- SSE 使用现有身份隔离与 Redis 分发；代理关闭适用路径的缓冲，配置心跳和连接超时，发布时优雅排空。
- Redis Pub/Sub 不等于持久消息队列。离线期间缺失通知，通过数据库中的消息/状态补齐；有游标的流按其契约恢复。
- 重连指数退避加随机抖动，401先走统一会话恢复，429遵守 Retry-After，不能每秒全量刷新。
- 同一账户会话/门户维持必要且去重的连接；离开页面清理订阅，不让每个卡片创建长连接。
- 非核心图片和统计允许降级；不能通过跳过 RBAC、价格校验或账本写入来“提升吞吐”。

### 7.3 压测必须回答的五个数字

分别报告：在线人数、同时活跃操作人数、每秒请求数、长期连接数、每秒交易写入数。一个“10万并发”数字不能替代这五项。

必须覆盖匿名读、登录/刷新、已登录列表、创建/取消订单、同一时段抢占、钱包幂等、IM 发送/补拉、SSE 同时重连、媒体上传。使用隔离测试租户和正式 API；不得碰真实客户订单或付费动作。

流程：小负载验证脚本正确 → 逐级增加 → 峰值 → 至少一轮长时间稳态 → 故障/恢复。每档记录数据规模、机器规格、版本、限流策略、延迟、错误率、队列积压、数据库与 Redis 指标以及压测机自身资源。

检查必须断言业务响应与最终数据库不变量，而不只断言 HTTP 200。k6 的 `check` 失败须有失败阈值或显式失败；不能因为请求没报网络错就放行。缺少账号、CDN URL 或场景参数应立即失败，不可悄悄跳过后汇报通过。

## 8. 验收门槛与设备矩阵

以下数字是**建议起始门槛，不是当前已达标的数据**。M00 固定参考设备/网络并记录基线；调整目标必须说明理由，不能为了通过而放宽。

| 项目 | 起始门槛 / 验收方法 |
|---|---|
| 正确性 | 核心认证、身份切换、下单/取消、账本与 IM 流程全部通过；阻断级缺陷为零 |
| 资源 | 两个 PSD 不进任何公开产物；无测试凭据、源压缩包、私钥；Web/Mobile 各自有体积清单 |
| 点击反馈 | 参考机正常负载下视觉反馈目标 ≤100ms；不可把反馈时间当 API 完成时间 |
| 启动 | 分开测壳可交互、会话恢复、真实首屏数据；建议参考机冷启动壳 P95 ≤2.5s，至少20次；网络条件单列 |
| 滚动与玻璃 | 60Hz参考机按16.7ms帧预算检查；分别记录慢帧比例/连续卡顿。增强档不得明显劣于标准档；低端机优先可读与稳定 |
| 内存与发热 | 连续使用30分钟；反复开关聊天/媒体/弹窗50次无持续增长、崩溃、ANR或输入延迟恶化 |
| API | 压测先采用现有读接口 P95<800ms、P99<1500ms 为参考；写入/上传/实时另设口径；错误率<1%且不变量零违规 |
| 恢复 | 断网、后台、进程回收、重启、旧版升级后能够恢复或明确提示；订单未知状态不盲目重复写 |
| 更新 | 旧版 App 与新版后端兼容通过；灰度异常可停止扩大，Web 可回到上一资源版本 |

最小矩阵：

- iPhone：拟支持的最低系统、小屏旧机、iOS26+普通机、较新高刷新率机；包含深浅主题、减少动态/透明度。
- Android：低内存机、普通中端机、旗舰机；至少覆盖 Pixel或Samsung，以及用户实际使用的 OPPO / ColorOS；记录具体 WebView 版本。
- 布局：窄屏、大字体、横屏、全面屏手势、三键导航；如宣称支持平板/折叠屏，必须追加对应设备或明确首发支持边界。
- Web：Chrome、Safari及现有承诺浏览器；用户、技师、商户、运营原有入口均回归。
- 网络：正常 Wi-Fi、受限网络、离线、网络切换；首次/重复安装、升级安装、清数据后启动分别覆盖。

框架下限不是产品支持承诺。当前 Capacitor 文档列 iOS15+、Android API24+，但 NeeDo 的 JS/CSS、插件和安全要求可能需要更高下限；先用本项目最低设备验证再确定，不因框架能启动就宣称完整兼容。[iOS 支持](https://capacitorjs.com/docs/ios)、[Android 支持](https://capacitorjs.com/docs/android)

## 9. 开发执行顺序

每个 M 都进一步按“失败测试/复现 → 最小实现 → 本步测试 → 相关回归 → 集成后复测”推进。视觉任务用真实渲染复现和基线图，不强迫写无价值的 CSS 字符串测试。每步独立交付，未通过的前置门槛不勾选完成。

### M00 — 固定基线与阻断清单（只读诊断）

**输入：** 当前本地 main、项目规范。**产出：** `docs/qa/mobile-baseline.md`，包括提交号、依赖版本、入口、功能清单、设备清单、现有失败项。

- [ ] 核实 worktree/HEAD/main/脏文件及运行端口归属；只从 main 读取审计基线。
- [ ] 在独立环境按 lockfile 安装并构建；记录实际 Node、Vite、Xcode、Android SDK。共享 node_modules 的通过不能称为干净构建。
- [ ] 固定关键页面截图与上述测试门槛；确认正式业务前置验收范围。
- [ ] 把必须由负责人提供的 App ID、签名、测试机、生产域名与权限列成阻断项；不编造值。

**门禁：** 基线可复现，失败项已分类。**回退：** 无运行代码变化。

### M01 — 设计源文件移出公开产物

**修改范围：** 两个 `public/icons/*.psd` 原件的精确路径；`scripts/audit-production-bundle-lib.mjs`、同名 `.test.mjs`；新增 `design/source-assets/README.md`。不改 UI。

- [ ] 在现有审计测试 fixture 中加入根目录及嵌套目录 PSD/大写后缀案例；断言失败包含文件路径。
- [ ] 加入合法 PNG/SVG 不被误杀、目录缺失仍报错的测试；先证明旧审计漏检。
- [ ] 在现有审计函数扩展递归文件检查，保留原有返回结构和门禁；不要另建平行审计系统。
- [ ] 全仓核实引用后移动这两个文件，比较移动前后 SHA-256 完全一致，保留设计来源说明。
- [ ] 执行本步测试、正式构建、原有产物审计；检查图标实际显示和产物不含 PSD。

**命令（未来执行时）：**

```bash
npm test -- scripts/audit-production-bundle-lib.test.mjs
npm run verify:production-build
```

**门禁：** 源文件还在、字节不变、产物不在、导出图标正常。**回退：** 撤销本步独立变更；不删除原件，不改线上已发版本。

### M02 — Mobile 构建入口与真实减重

**修改范围：** `vite.config.ts`、`package.json`、`src/App.tsx` 的必要路由导入边界；拟新增 `src/main.mobile.tsx` 和移动构建入口。先搜可复用入口，不复制 App。

- [ ] 记录现有各 HTML 的入口依赖，写产物测试：Web 入口完整、Mobile 有 index、既定业务路由可达。
- [ ] 加独立 mobile 目标与 outDir；保持原 formal 环境安全门禁，限制实际不需要的后台模块进入移动依赖图。
- [ ] 分批按真实路由 lazy load；语言按现有架构逐步拆分，避免一次重构整份翻译系统。
- [ ] 优化大图片和未用公开资源；先核实引用/质量再处理，不能删资产凑体积数字。
- [ ] 比较首屏真正请求的模块、解析耗时和压缩体积；同时验证 Web 全入口。

**门禁：** 功能不缩水、Web不受损、移动资源可独立部署预览。**回退：** 关闭 mobile 目标，原 Web 构建保持可用。

### M03 — 最小双平台壳与真实 API

**修改范围：** 拟新增 `capacitor.config.ts`、`android/`、`ios/`；现有 API URL 模块及测试；原生依赖锁文件。

- [ ] 锁定同一兼容版本系列的 Capacitor core/CLI/平台与插件；记录工具链，不盲装 latest。
- [ ] 按附录配置内置 `dist-mobile`，加入生产配置拒绝远程入口/明文请求的检查。
- [ ] 在 Android 安装调试 APK；iOS 至少完成模拟器构建，取得授权签名后尽早真机验证。
- [ ] 验证真实登录入口、首页、媒体、三类 API 地址和精确 CORS；禁止通过放开所有来源排除错误。
- [ ] 断网冷启动测试；分别记录“壳出现”和“业务数据成功”，不接假 API。

**门禁：** 能打开真实业务、无白屏、Web照常使用。**回退：** 仅撤销新增壳与边界变更，服务端契约不变。

### M04 — 玻璃和性能技术选型闸门

**修改范围：** `src/styles.css`、`src/lib/clientPerformance.ts` 及测试；`FloatingHomeHeader.tsx`、`MobileShell.tsx` 仅选一个部件做实验。

- [ ] 先对比当前 full/reduced 在真实手机的截图和轨迹；补非Android无障碍策略失败测试。
- [ ] 复用既有 token 改进标准玻璃及回退对比度，不另建整套组件。
- [ ] 按4.4做单部件原生/SVG实验；增强默认关闭，先给出对比证据，再决定是否纳入。
- [ ] 出具 `docs/qa/mobile-glass-decision.md`：每平台选择、支持范围、性能结果、失败原因和回退方法。

**门禁：** 两个平台都有可接受的基础视觉；实验未通过不推广。**回退：** 关闭增强恢复现有共享玻璃。

### M05 — 会话安全与登录恢复

**修改范围：** `src/auth/authEnvelope.ts`、现有 auth/storage/Google 登录相关模块及测试；后端现有认证模块，只改必要契约。

- [ ] 先补并发刷新、退出后晚到响应、换身份、重启恢复、存储失败测试。
- [ ] 接安全持久化并保持原有锁/版本语义；明确浏览器与原生的不同锁实现，不依赖缺失的 Web API。
- [ ] Google 登录回跳、取消、账户绑定及后端受信 audience 逐条验证；同步核对 Apple 登录适用要求。
- [ ] 测试旧凭据迁移、旧版 App、Web 多标签页和门户隔离；日志无凭据。

**门禁：** 不串账户、不复活已退出会话、不因失败降级安全性。**回退：** 兼容读取上一安全格式或要求重新登录，不回退到明文保存。

### M06 — 键盘、返回、滚动与恢复

**修改范围：** `src/main.tsx`、现有 MobileShell、`useVisualViewportFrame.ts`、`useIosScrollContainer.ts`、持久缓存和相关生命周期测试。

- [ ] 明确原生 App 与浏览器/PWA 的识别；不能只用 display-mode standalone 识别 Capacitor。
- [ ] 按第5节逐项复现，分别修正 inset、返回和滚动；不要把全部交互修复塞进一个提交。
- [ ] 处理进程回收、账户切换、缓存失效与重连；交易状态不做离线自动提交。
- [ ] 完成中日文输入、IM、排班、大字体和权限撤销的双端真机验收。

**门禁：** 输入栏不遮挡、不双退、不重复订阅、不串缓存。**回退：** 每项平台行为独立开关，Web路径保留。

### M07 — 媒体、定位、分享与深链

**修改范围：** 现有定位、媒体上传、录音和分享模块；必要原生插件和权限声明，不新建第二套上传服务。

- [ ] 按每种能力分别加取消、拒绝、超时、后台返回测试与实机记录。
- [ ] 优先系统选择器和受支持接口；上传继续使用正式权限、大小校验和持久化链路。
- [ ] 深链先验证域名/路径/参数，再执行身份恢复和路由；外部网页不进入受信原生桥。

**门禁：** 不越权、不空转、不重复上传；拒绝权限仍可完成不依赖该权限的业务。**回退：** 关闭单能力，给出明确可操作提示。

### M08 — 推送和实时恢复

**修改范围：** 现有通知、SSE、设备绑定模块；必要推送插件和服务端正式设备注册/吊销 API。

- [ ] 先测前后台切换、漏事件补拉、重复推送、退出解绑、推送打开无权限对象。
- [ ] 在既有事件与通知架构接入设备渠道，沿用可靠任务机制；如存在持久投递缺口，独立补齐，不用内存数组冒充队列。
- [ ] 分别联调开发/生产推送环境；真机锁屏和系统杀进程后验证。

**门禁：** 推送只是提醒，最终内容以 API 为准。**回退：** 停止推送渠道不影响前台查询和正式业务。

### M09 — 商店阻断项闭环

**范围：** 现有设置、账号生命周期、UGC与隐私模块；每个缺口独立微步骤。

- [ ] 核实账号删除、举报/屏蔽、审核处置、隐私披露是否真正端到端可用；有入口不算完成。
- [ ] 明确未完成订单、依法保留记录、账户删除与匿名化规则，不让 Codex自行决定删除账本。
- [ ] 完成支付分类、设备标识/SDK清单、审核账户与资料；敏感决策交由负责人批准。

**门禁：** 所有发布阻断项有证据或明确不发布该能力的产品决策；不能隐藏入口后假称后端能力已完成。

### M10 — 生产可靠性补强

**范围：** `backend/src/middlewares/security.middleware.ts`、现有 worker/实时模块、`deploy/prod/`、`deploy/staging/`、环境校验和部署契约测试。

- [ ] 先复现双实例限流不一致和任务重复风险，再逐个修正；复用现有 Redis 客户端与幂等约束。
- [ ] 对齐API路由、媒体持久化、连接池、秘密管理、健康检查、优雅停止。
- [ ] 配置关键指标、告警、备份恢复与依赖故障策略；先本地/隔离环境验证，远程操作另获授权。

**门禁：** 两实例正确性通过，重启不丢媒体，故障不会绕过安全与账本。**回退：** 保留上一镜像与兼容配置，数据库不做破坏性降级。

### M11 — 容量与故障演练

**范围：** `load-tests/k6/needo-step14-load.js` 及独立场景文件、`load-tests/reports/`，遵循 Step14。

- [ ] 先纠正参数、登录契约、检查阈值和静默跳过行为；小负载验证交易结果。
- [ ] 按7.3独立测读、写、鉴权、媒体和实时；阶梯由实际流量目标和授权测试资源决定。
- [ ] 验证峰值后的恢复、实例重启、Redis/数据库故障与重连风暴；核对账本和订单不变量。

**门禁：** 只公布实测通过档位和剩余容量，不把100k脚本配置写成达标结论。

### M12 — 发布、旧版共存与交接

**范围：** 原生构建/签名流程、CI、发布记录；不把证书或密钥提交仓库。

- [ ] 集成至 main 后重新运行相关测试、Web生产构建、移动构建和设备核心流程。
- [ ] 验证升级安装和旧版 App + 新后端；API新增字段优先可选，数据库先扩展后迁移再收缩。
- [ ] 记录 source commit、锁文件、构建工具、包版本、构建号、产物校验值与环境。
- [ ] 经授权后内测与灰度；监控崩溃/ANR、登录失败、订单错误、重连和服务器压力；异常停止扩大。

**门禁：** 分开报告“本地完成 / main集成 / 上传 / 部署 / 真机 / 审核”。App 商店更新不能假设立即撤回所有已安装版本；回滚方案必须保持后端兼容。

## 10. 禁止采用的方法

| 禁止 | 替代方式 |
|---|---|
| 为了加壳改成 Vue、uni-app x、Flutter 或重写三端 UI | 保留 React；只处理平台边界 |
| 直接把整个现有 dist 打包，连 PSD/后台资产一起带上 | 独立移动入口、资源核实、递归产物门禁 |
| 用远程网站地址作为正式壳入口，或下载代码规避审核 | 版本化本地资源；按商店政策发布，热更新另行评估 |
| `server.cleartext`、混合内容、CORS/导航全部放开 | 精确环境配置、HTTPS和受信域名 |
| 每个页面维护一份 token / 缓存 / 订单状态 | 复用现有会话、缓存和业务权威 |
| 为通过认证测试写死 token、账号、管理员或假 API | 隔离测试环境的正式账户与真实链路 |
| 每帧截屏 / DOM转图片 / 上传服务器算玻璃 | CSS默认；原生局部能力需直接合成验证 |
| 对整个 WebView 加 blur 当玻璃容器 | 限定背景材质，文字内容独立且清晰 |
| 给每个卡片加多层 blur、常驻 requestAnimationFrame 或到处 will-change | 测量后限制图层、面积和动画生命周期 |
| 用“iPhone/旗舰机”判断一定支持折射 | 系统/引擎/能力探测 + 实际像素/帧率验收 |
| 禁止缩放、强制固定宽高或机型偏移补丁掩盖适配问题 | 响应式布局、系统inset、大字体与读屏验收 |
| 无限重试、推送即成功、离线自动重复提交交易 | 幂等、查结果、有限退避、正式状态校验 |
| 扩容API但不审核worker/限流/连接池 | 先验证多实例正确性，再增加容量 |
| 用匿名读压测证明交易高并发，或提高阈值掩盖失败 | 分场景容量证据与数据库不变量核验 |
| CI通过、浏览器截图或打包成功就宣布可上架 | 真机、升级、可靠性和商店门禁分别验收 |

## 11. 关键代码约束示例

以下代码是未来微步骤的边界示例，**本次没有加入应用，也没有完成原生编译验证**。接入时沿用现有文件组织并补测试，不整段复制进多个业务组件。

### A. Capacitor 正式配置：没有远程页面入口

拟新增 `capacitor.config.ts`；环境值由受控构建提供，App ID 必须属于用户，不能使用虚构默认值。

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const appId = process.env.NEEDO_MOBILE_APP_ID?.trim();
if (!appId || !/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(appId)) {
  throw new Error('NEEDO_MOBILE_APP_ID must be a valid approved application ID');
}

const config: CapacitorConfig = {
  appId,
  appName: 'NeeDo',
  webDir: 'dist-mobile',
  loggingBehavior: 'debug',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
```

这个配置不等于完整安全验收。另测：缺少ID时构建失败；生成配置不存在 `server.url` / `cleartext:true` / 宽泛导航；API必须为正式绝对HTTPS地址；签名包的日志和WebView调试确实关闭。[配置字段依据](https://capacitorjs.com/docs/config)

### B. 原生 iOS 材质选择：仅作局部实验

在 M04 的原生部件内部使用，编译需要包含 `UIGlassEffect` 的 SDK。不是对 DOM 调用的 API，也不证明已能采样 WKWebView 背景。

```swift
import UIKit

@MainActor
func makeNavigationMaterial() -> UIView {
    if UIAccessibility.isReduceTransparencyEnabled {
        let view = UIView()
        view.backgroundColor = .secondarySystemBackground
        return view
    }

    let effect: UIVisualEffect
    if #available(iOS 26.0, *) {
        effect = UIGlassEffect()
    } else {
        effect = UIBlurEffect(style: .systemMaterial)
    }
    return UIVisualEffectView(effect: effect)
}
```

接入门槛：补布局/圆角、主题映射、设置变化监听与销毁、触摸/读屏归属；测试新旧系统及减少透明度。未满足4.4的合成与性能条件，不推广。Android 不提供“对WebView直接setRenderEffect”的伪等价实现。[UIKit依据](https://developer.apple.com/videos/play/wwdc2025/284/)

### C. 产物源文件检查：扩展现有审计函数

放入 `scripts/audit-production-bundle-lib.mjs`，复用文件内已有 `readdir`、`path`；在现有 `auditProductionBundle` 的 `failures` 创建后执行 `failures.push(...await auditSourceAssets(distDir))`。保留所有旧检查。

```js
const sourceAssetExtension = /\.(psd|psb|ai|sketch|fig)$/i;

async function auditSourceAssets(root, directory = root) {
  const failures = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isSymbolicLink()) {
      failures.push(`production asset must not be a symbolic link: ${relative}`);
    } else if (entry.isDirectory()) {
      failures.push(...await auditSourceAssets(root, absolute));
    } else if (entry.isFile() && sourceAssetExtension.test(entry.name)) {
      failures.push(`production assets include a design source: ${relative}`);
    }
  }
  return failures;
}
```

这是设计源文件门禁，不是完整秘密扫描；后续仍需资源白名单/预算、签名材料扫描、source map发布策略和真实包内容检查。测试必须覆盖嵌套路径、大小写、合法PNG和目录读取错误，不能捕获错误后返回“通过”。

## 12. 迭代成本、时间与 Codex 使用方式

**不会因为有三个发布端，就必然需要三倍 token。** 共享功能通常仍改同一份 React 和 API；新增成本主要来自平台边界、三端回归、原生构建和商店资料。反过来，如果复制三套页面、主题和接口客户端，长期同步成本才容易成倍增长。

降低成本的方法：

- 每个任务只加载本文相关段落、目标模块和对应测试，不反复全仓审计。
- 维护版本化API契约、设备验收记录和已知差异；公共能力修一次，平台差异集中处理。
- 不默认升级工具链、换渲染引擎或做大重构；先有稳定失败复现再修。
- 通用逻辑改动跑共享测试和三端核心冒烟；平台专属改动做该端专项，但发布前仍需跨端回归。
- 不在多任务同时修改 `App.tsx`、全局样式、会话核心或数据库模型。

**估时分层：** 安装壳、可用内测、达到发布质量、商店审核是四种不同终点。M03完成后，根据真实构建和接口问题估算M04–M08；M04真机通过后才能可靠估算玻璃成本；M09–M11再决定上架阻断量。不能把“Codex能快速写代码”换算成未经验证的固定上架日期，也不应预设必须做16–24周原生重写。16–24周本身约4–6个月，不是8个月。

### 可直接发给 Codex 的首步指令

```text
以执行时的本地 main 为准，阅读 README.md、AGENTS.md、
docs/00_MASTER_MICRO_STEP_PLAN.md 和
docs/superpowers/plans/2026-09-11-needo-web-ios-android-execution.md。

本次只执行 M00：固定移动化基线。核实 main/HEAD/worktree/脏文件及现有运行端口，
在隔离环境记录版本、正式构建、已有测试结果、关键页面视觉基线与设备覆盖缺口。
不要修改业务代码，不动5180，不修改真实业务数据，不部署，不推送，不上传商店。
不要把浏览器/模拟器结果写成真机通过，不把已有压测脚本写成容量达标。

交付 docs/qa/mobile-baseline.md，列明本地 main 提交、执行命令、实际结果、
未验证项与进入 M01 的条件。阶段前置验收未满足时，明确指出，不擅自跨步骤。
```

之后每次只指定一个M或其中一个独立子步骤。一般测试夹具可使用测试替身；禁止把替身带进正式应用或以替身结果冒充真实端到端验收。

### 每步完成报告模板

```text
基线：main提交 / 本步提交或未提交状态
范围：本步编号、变更文件、是否改API/数据库/权限
证据：命令与退出结果；设备/系统/WebView版本；截图/录屏/报告路径
结果：已通过 / 未通过 / 未执行（逐项区分）
回退：可关闭的能力、兼容版本、数据处理边界
状态：本地开发 / main集成 / 上传 / 部署 / 真机 / 审核分别说明
下一步：只列当前满足门槛的下一微步骤
```

## 13. 资料与适用日期

技术与政策链接核对日期：2026-09-11；执行涉及工具链、系统下限、商店政策时再次核对。第三方演示只提供研究方向，不能替代官方能力说明和本项目设备结果。

- [用户提供：HTML + CSS 实现 Liquid Glass](https://juejin.cn/post/7514618352829448244)
- [演示库作者：liquid-glass-react 兼容性声明](https://github.com/rdev/liquid-glass-react)
- [Apple：UIKit 新设计与原生玻璃](https://developer.apple.com/videos/play/wwdc2025/284/)
- [Android：RenderEffect](https://developer.android.com/reference/android/graphics/RenderEffect)
- [AOSP：跨窗口模糊](https://source.android.com/docs/core/display/window-blurs)
- [Android：WebView 安全区与键盘](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)
- [Capacitor：配置](https://capacitorjs.com/docs/config)、[工具链](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Vite：公开资源目录](https://vite.dev/guide/assets#the-public-directory)
- [Apple：审核规范](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play：账号删除](https://support.google.com/googleplay/android-developer/answer/13327111)、[支付政策](https://support.google.com/googleplay/android-developer/answer/9858738)

最终原则：**先保护现有体验和数据正确性；用小范围实机证据决定视觉增强；用真实业务压测决定容量；共享一套产品核心，分别验收三个运行环境。**
