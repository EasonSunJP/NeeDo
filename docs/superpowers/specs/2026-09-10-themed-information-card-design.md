# 简易信息卡主题配色与镂空认证章设计

## 目标

店铺、服务、技师和用户简易信息卡必须随当前 NeeDo UI 主题同步变化，不再固定使用黑底、白字和荧光绿色。完单数认证章继续使用当前主题主色，但中央对勾改为真正透明镂空，露出认证章下方的卡片背景。

本改动只修复共享信息卡的视觉主题链和认证章绘制，不改变已经合并的卡片高度、三类完单数据口径、指标顺序或紧凑数字规则。

## 根因

共享 `UnifiedInfoCardFrame`、详情文字、图片占位、标签、操作按钮和服务卡局部元素直接写死 `#031014`、`#f7f9f7`、`#9aacb5`、`#b8ff4a`、`#244047` 等暗色霓虹值。页面主题已经通过 `--client-*` CSS 变量切换，但共享卡片没有消费这些变量，因此浅色青绿主题下仍显示黑色卡片。

当前 `completed` 图标的对勾使用固定浅色 `stroke="#f7f9f7"`。这不是镂空，切换卡片背景后也不会显示下方真实颜色。

## 主题 token 映射

所有共享卡片入口只依赖现有全局主题变量，不新增卡片专用配色参数：

- 卡片背景：`color-mix(in srgb, var(--client-surface) 94%, var(--client-bg) 6%)`。
- 卡片边框与指标分隔线：由 `--client-line` 与少量 `--client-primary` 混合，保持各主题下可辨认但不过强。
- 主标题与指标数值：`--client-text`。
- 描述、地址、空状态：`--client-muted`。
- 指标图标、位置图标、标签文字与认证章：`--client-primary`。
- 标签背景：`--client-primary-soft`；标签边框使用主色与线色混合。
- 详情箭头背景：`--client-primary`；箭头图形：`--client-primary-contrast`。
- 阴影：使用 `--client-bg` 和 `--client-primary` 的透明混合，不保留固定黑色或荧光绿阴影。
- 图片空状态背景：由 `--client-surface`、`--client-bg`、`--client-primary-soft` 组成；真实服务图片上的时长/价格遮罩保留必要的图片对比层，但其强调色使用 `--client-primary`。
- 收藏与分享操作按钮使用 `--client-primary` 和 `--client-primary-soft`。

浅色主题应呈现浅色卡面、深色文字和当前主题强调色；暗色主题继续呈现暗色卡面、浅色文字和对应强调色。黑金、单色、青蓝、紫色等现有主题由同一 token 映射自然获得各自颜色，不写主题名称分支。

## 镂空认证章

- `completed` 继续使用 `0 0 24 24`、约 16 齿的实心认证章外形，并以 `currentColor` 继承 `--client-primary`。
- 中央对勾不再输出可见的固定颜色 stroke。
- 使用每个图标实例唯一的 SVG `mask`：白色区域保留章体，黑色圆头对勾从章体扣除。最终只绘制被 mask 处理的绿色章体，因此对勾区域透明并露出下方卡片背景。
- 唯一 mask ID 由 React `useId()` 生成，避免同一页面多个完单图标互相引用或发生重复 ID。
- 保留 `data-app-icon="completed"`、`data-icon-part="completed-seal"` 和 `data-icon-part="completed-check-cutout"`，供测试和无障碍外的结构识别使用。

## 范围

- 修改共享信息卡框架、共享卡片文字/标签/图片占位、收藏分享操作，以及服务卡的主题相关局部样式。
- 修改共享 `AppIcon` 的 `completed` 实现及其测试。
- 更新依赖固定 `#b8ff4a` 等源代码断言的卡片测试，改为断言主题 token 和不存在硬编码暗色卡片色。
- 不修改正式 API、Prisma、OpenAPI、完单数聚合、i18n 文案、路由、卡片高度或数字格式器。

## 测试与验收

- 先增加失败测试，证明共享卡片源代码/静态标记使用 `--client-surface`、`--client-text`、`--client-muted`、`--client-primary`、`--client-line` 与 `--client-primary-contrast`。
- 测试明确拒绝共享卡片中的固定 `#031014`、`#f7f9f7`、`#9aacb5`、`#b8ff4a`、`#244047` 视觉依赖；服务图片遮罩允许保留透明黑色以保证照片文字可读，但强调色必须走主题 token。
- 图标测试确认每个 `completed` 实例拥有唯一 mask ID、章体使用 `currentColor`、对勾作为 mask 内黑色扣除路径存在，并且不再出现固定白色对勾 stroke。
- 多实例静态渲染测试确认两个认证章的 mask 引用互不相同。
- 既有完单口径、`999/1000/1999`、卡片紧凑高度测试继续通过。
- 前端 TypeScript 检查和正式构建通过。
- 合并到本地 `main` 后，重新核对 5180 PID/cwd/branch/HTTP，再在同一页面切换至少浅色青绿主题和一个暗色主题：卡片背景、文字、图标、边框、标签和箭头都必须跟随主题；对勾必须显示为卡面背景形成的透明镂空。
- 不执行远端推送或部署。
