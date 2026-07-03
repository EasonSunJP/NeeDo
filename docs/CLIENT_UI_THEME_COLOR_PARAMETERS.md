# NeeDo UI 切换色系参数表

> 适用范围：用户端、技师端、商户端、Afirieito 前台等使用 `ClientThemeProvider` 与 `client-theme-*` 的客户端界面。  
> 不适用范围：运营后台 / 商户后台独立 `admin-theme-*` 色系。  
> 代码来源：`src/theme/ClientThemeProvider.tsx`、`src/styles.css`。

## 1. 风格 ID 与旧名称对应

| UI 风格 | 当前 theme id | 兼容旧名称 / 别名 | 日夜语义 | 说明 |
|---|---|---|---|---|
| 白绿版 | `light-green` | `day`、`jade-light` | day | 白色主底、墨绿主色、柔和卡片。 |
| 黑绿版 | `dark-green` | `night` | night | 冷黑青底、荧光青柠主色。 |
| 黑金版 | `black-gold` | `noir-gold` | night | 纯黑 / 石墨底、香槟金高光。 |
| 活力黑白版 | `vital-mono` | `black-white`、`lively-black-white`、`vital-black-white` | day | 白灰主界面、深黑模块、亮蓝点缀。 |
| 冷酷黑灰版 | `cool-black-gray` | `black-gray`、`cool-gray`、`cold-black-gray` | night | 深石墨黑灰、青蓝电光。 |
| 特殊黑 | `special-black` | `special-dark`、`特殊黑` | night | 蓝黑暗底、半透明石墨面板、蓝色发光主按钮、粉橙绿细状态光。 |
| 霓虹粉紫版 | `neon-pink` | `lovely-neon` | night | 深蓝黑底、粉紫霓虹、蓝紫玻璃感。 |

执行约定：

- 新代码统一使用当前 theme id，不再新增旧名称。
- 兼容旧入口时可以继续识别旧名称，但进入组件后必须 normalize 到当前 theme id。
- 页面组件不直接写死颜色值，优先使用 CSS 变量。

## 2. 字段与 token 映射

| 设计字段 | 推荐 CSS token | 用法 |
|---|---|---|
| 页面背景色 | `--client-bg` | 页面根背景、全屏壳层背景。 |
| 文本主色 | `--client-text` | 正文、标题、重要数字。 |
| 文本辅色 | `--client-muted` | 次级说明、meta、辅助信息。 |
| 边框主色 | `--client-line` | 分割线、输入框、卡片边框、列表边框。 |
| 卡片背景色 | `--client-surface` | 普通卡片、区块、浮层内容底。 |
| 卡片标题文本色 | `--client-text` | 卡片主标题。 |
| 描述文本色 | `--client-muted` | 卡片描述、说明文案。 |
| 列表背景色 | `--client-bg-soft` | 列表容器、轻量列表项背景。 |
| 列表标题色 | `--client-text` | 列表 item 标题。 |
| 列表边框色 | `--client-line` | 列表 item 分割、外框。 |
| 按钮主色 | `--client-primary` | 主按钮、选中态、关键 CTA。 |
| 按钮警告色 | `--client-warning` | 警告、待确认、注意操作。 |
| 按钮成功色 | 建议新增 `--client-success` | 成功、完成、通过、正常状态按钮。 |
| 按钮信息色 | 建议新增 `--client-info` | 信息、查看、同步、提示类按钮。 |
| 标签主色 | `--client-primary` | 强调标签、主状态标签。 |
| 标签辅色 | `--client-primary-soft` | 次级标签背景、弱强调 pill。 |

补充约定：

- `--client-elevated` 用于比普通卡片更高一层的浮层、弹窗、底部操作栏。
- 主按钮文字色使用 `--client-needo-text` 或 `--client-primary-contrast`。
- 黑色 / 夜间主题内不得使用白色或近白描边作为默认边框；边框统一走 `--client-line`，必要时使用 `color-mix(in srgb, var(--client-line) 40-70%, transparent)`。

## 3. 白绿版 `light-green`

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#ffffff` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#f6fbf8` |
| 文本主色 | `--client-text` | `#163630` |
| 文本辅色 | `--client-muted` | `rgba(22, 54, 48, 0.68)` |
| 边框主色 | `--client-line` | `rgba(22, 54, 48, 0.12)` |
| 卡片背景色 | `--client-surface` | `rgba(255, 255, 255, 0.7)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(255, 255, 255, 0.84)` |
| 卡片标题文本色 | `--client-text` | `#163630` |
| 描述文本色 | `--client-muted` | `rgba(22, 54, 48, 0.68)` |
| 列表背景色 | `--client-bg-soft` | `rgba(255, 255, 255, 0.82)` |
| 列表标题色 | `--client-text` | `#163630` |
| 列表边框色 | `--client-line` | `rgba(22, 54, 48, 0.12)` |
| 按钮主色 | `--client-primary` | `#367a71` |
| 主按钮文字色 | `--client-needo-text` | `#f8fffc` |
| 按钮警告色 | `--client-warning` | `#f3c84c` |
| 按钮成功色 | `--client-success` | `#2f9e68` |
| 按钮信息色 | `--client-info` | `#287a9b` |
| 标签主色 | `--client-primary` | `#367a71` |
| 标签辅色 | `--client-primary-soft` | `rgba(54, 122, 113, 0.14)` |

## 4. 黑绿版 `dark-green`

`dark-green` 继承 `client-theme-night` 的主体色系。

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#02070c` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#02070c` |
| 文本主色 | `--client-text` | `#f6f8f3` |
| 文本辅色 | `--client-muted` | `rgba(228, 235, 226, 0.68)` |
| 边框主色 | `--client-line` | `rgba(126, 153, 171, 0.18)` |
| 卡片背景色 | `--client-surface` | `rgba(24, 39, 50, 0.84)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(31, 47, 59, 0.92)` |
| 卡片标题文本色 | `--client-text` | `#f6f8f3` |
| 描述文本色 | `--client-muted` | `rgba(228, 235, 226, 0.68)` |
| 列表背景色 | `--client-bg-soft` | `rgba(7, 22, 34, 0.8)` |
| 列表标题色 | `--client-text` | `#f6f8f3` |
| 列表边框色 | `--client-line` | `rgba(126, 153, 171, 0.18)` |
| 按钮主色 | `--client-primary` | `#baff43` |
| 主按钮文字色 | `--client-needo-text` | `#07100d` |
| 按钮警告色 | `--client-warning` | `#f8bd4b` |
| 按钮成功色 | `--client-success` | `#72ff8b` |
| 按钮信息色 | `--client-info` | `#79d7ff` |
| 标签主色 | `--client-primary` | `#baff43` |
| 标签辅色 | `--client-primary-soft` | `rgba(186, 255, 67, 0.16)` |

## 5. 黑金版 `black-gold`

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#000000` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#000000` |
| 文本主色 | `--client-text` | `#f7f0df` |
| 文本辅色 | `--client-muted` | `rgba(232, 226, 212, 0.68)` |
| 边框主色 | `--client-line` | `rgba(254, 222, 160, 0.14)` |
| 卡片背景色 | `--client-surface` | `rgba(28, 28, 27, 0.8)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(42, 41, 38, 0.86)` |
| 卡片标题文本色 | `--client-text` | `#f7f0df` |
| 描述文本色 | `--client-muted` | `rgba(232, 226, 212, 0.68)` |
| 列表背景色 | `--client-bg-soft` | `rgba(20, 20, 20, 0.82)` |
| 列表标题色 | `--client-text` | `#f7f0df` |
| 列表边框色 | `--client-line` | `rgba(254, 222, 160, 0.14)` |
| 按钮主色 | `--client-primary` | `#fedfa0` |
| 主按钮文字色 | `--client-needo-text` | `#15110b` |
| 按钮警告色 | `--client-warning` | `#ccab6c` |
| 按钮成功色 | `--client-success` | `#5fe3a1` |
| 按钮信息色 | `--client-info` | `#9fc7ff` |
| 标签主色 | `--client-primary` | `#fedfa0` |
| 标签辅色 | `--client-primary-soft` | `rgba(254, 222, 160, 0.14)` |

## 6. 活力黑白版 `vital-mono`

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#f7f7f8` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#f7f7f8` |
| 文本主色 | `--client-text` | `#202124` |
| 文本辅色 | `--client-muted` | `rgba(32, 33, 36, 0.68)` |
| 边框主色 | `--client-line` | `rgba(28, 29, 31, 0.12)` |
| 卡片背景色 | `--client-surface` | `rgba(255, 255, 255, 0.88)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(236, 237, 239, 0.94)` |
| 卡片标题文本色 | `--client-text` | `#202124` |
| 描述文本色 | `--client-muted` | `rgba(32, 33, 36, 0.68)` |
| 列表背景色 | `--client-bg-soft` | `rgba(255, 255, 255, 0.9)` |
| 列表标题色 | `--client-text` | `#202124` |
| 列表边框色 | `--client-line` | `rgba(28, 29, 31, 0.12)` |
| 按钮主色 | `--client-primary` | `#2f2f30` |
| 主按钮文字色 | `--client-needo-text` | `#ffffff` |
| 按钮警告色 | `--client-warning` | `#ffca45` |
| 按钮成功色 | `--client-success` | `#16a34a` |
| 按钮信息色 | `--client-info` | `#14b8ff` |
| 标签主色 | `--client-primary` | `#2f2f30` |
| 标签辅色 | `--client-primary-soft` | `rgba(28, 29, 31, 0.08)` |

## 7. 冷酷黑灰版 `cool-black-gray`

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#0a0d10` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#0a0d10` |
| 文本主色 | `--client-text` | `#f3f8fb` |
| 文本辅色 | `--client-muted` | `rgba(222, 233, 238, 0.66)` |
| 边框主色 | `--client-line` | `rgba(183, 204, 214, 0.15)` |
| 卡片背景色 | `--client-surface` | `rgba(30, 36, 41, 0.74)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(47, 55, 62, 0.82)` |
| 卡片标题文本色 | `--client-text` | `#f3f8fb` |
| 描述文本色 | `--client-muted` | `rgba(222, 233, 238, 0.66)` |
| 列表背景色 | `--client-bg-soft` | `rgba(28, 34, 39, 0.78)` |
| 列表标题色 | `--client-text` | `#f3f8fb` |
| 列表边框色 | `--client-line` | `rgba(183, 204, 214, 0.15)` |
| 按钮主色 | `--client-primary` | `#18d2f0` |
| 主按钮文字色 | `--client-needo-text` | `#061013` |
| 按钮警告色 | `--client-warning` | `#ffcb61` |
| 按钮成功色 | `--client-success` | `#37e17e` |
| 按钮信息色 | `--client-info` | `#18d2f0` |
| 标签主色 | `--client-primary` | `#18d2f0` |
| 标签辅色 | `--client-primary-soft` | `rgba(24, 210, 240, 0.17)` |

## 8. 特殊黑 `special-black`

`special-black` 是特殊 UI 分支，严格参考蓝黑半透明任务 App 参考图。该分支允许静态 PNG、半透明色、渐变和阴影发光，但禁止实时 `backdrop-filter` 模糊、反射、折射等物理运算效果。

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#060a12` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#060a12` |
| 文本主色 | `--client-text` | `#f7f9ff` |
| 文本辅色 | `--client-muted` | `rgba(218, 226, 244, 0.66)` |
| 边框主色 | `--client-line` | `rgba(119, 146, 205, 0.16)` |
| 卡片背景色 | `--client-surface` | `rgba(19, 25, 39, 0.78)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(29, 38, 58, 0.86)` |
| 卡片标题文本色 | `--client-text` | `#f7f9ff` |
| 描述文本色 | `--client-muted` | `rgba(218, 226, 244, 0.66)` |
| 列表背景色 | `--client-bg-soft` | `rgba(14, 20, 32, 0.86)` |
| 列表标题色 | `--client-text` | `#f7f9ff` |
| 列表边框色 | `--client-line` | `rgba(119, 146, 205, 0.16)` |
| 按钮主色 | `--client-primary` | `#5f8dff` |
| 主按钮文字色 | `--client-needo-text` | `#ffffff` |
| 按钮警告色 | `--client-warning` | `#ffa83f` |
| 按钮成功色 | `--client-success` | `#39f47a` |
| 按钮信息色 | `--client-info` | `#5f8dff` |
| 标签主色 | `--client-primary` | `#5f8dff` |
| 标签辅色 | `--client-primary-soft` | `rgba(95, 141, 255, 0.19)` |

## 9. 霓虹粉紫版 `neon-pink`

| 参数 | CSS token | 色值 |
|---|---|---|
| 页面背景色 | `--client-bg` | `#080a1a` |
| 顶部系统背景色 | `--client-top-chrome-bg` | `#080a1a` |
| 文本主色 | `--client-text` | `#fbf8ff` |
| 文本辅色 | `--client-muted` | `rgba(235, 229, 255, 0.68)` |
| 边框主色 | `--client-line` | `rgba(204, 211, 255, 0.17)` |
| 卡片背景色 | `--client-surface` | `rgba(39, 43, 80, 0.62)` |
| 卡片高层背景色 | `--client-elevated` | `rgba(55, 59, 104, 0.76)` |
| 卡片标题文本色 | `--client-text` | `#fbf8ff` |
| 描述文本色 | `--client-muted` | `rgba(235, 229, 255, 0.68)` |
| 列表背景色 | `--client-bg-soft` | `rgba(30, 34, 66, 0.72)` |
| 列表标题色 | `--client-text` | `#fbf8ff` |
| 列表边框色 | `--client-line` | `rgba(204, 211, 255, 0.17)` |
| 按钮主色 | `--client-primary` | `#8a75ff` |
| 主按钮文字色 | `--client-needo-text` | `#080a1a` |
| 按钮警告色 | `--client-warning` | `#ffca6f` |
| 按钮成功色 | `--client-success` | `#50e6a5` |
| 按钮信息色 | `--client-info` | `#6ddcff` |
| 标签主色 | `--client-primary` | `#8a75ff` |
| 标签辅色 | `--client-primary-soft` | `rgba(138, 117, 255, 0.2)` |

## 10. 建议新增语义 token

当前代码已经统一了大部分 `--client-*` token，但成功 / 信息按钮还没有独立统一 token。建议在每个 theme block 中补齐以下别名，组件只调用别名，不直接写具体值：

```css
--client-success: <见上表>;
--client-success-soft: color-mix(in srgb, var(--client-success) 16%, transparent);
--client-success-text: color-mix(in srgb, var(--client-success) 82%, var(--client-text) 18%);

--client-info: <见上表>;
--client-info-soft: color-mix(in srgb, var(--client-info) 16%, transparent);
--client-info-text: color-mix(in srgb, var(--client-info) 82%, var(--client-text) 18%);
```

按钮实现建议：

| 按钮类型 | 背景 | 文字 | 边框 / 阴影 |
|---|---|---|---|
| Primary | `var(--client-primary)` | `var(--client-needo-text)` | `color-mix(in srgb, var(--client-primary) 34%, transparent)` |
| Warning | `var(--client-warning)` | `var(--client-warning-ink)` | `color-mix(in srgb, var(--client-warning) 34%, transparent)` |
| Success | `var(--client-success)` | 夜间用深色墨字，白天用白字或 `#ffffff` | `color-mix(in srgb, var(--client-success) 34%, transparent)` |
| Info | `var(--client-info)` | 根据背景明度选择 `#ffffff` 或深色墨字 | `color-mix(in srgb, var(--client-info) 34%, transparent)` |

标签实现建议：

| 标签类型 | 背景 | 文字 | 边框 |
|---|---|---|---|
| 主标签 | `var(--client-primary)` | `var(--client-needo-text)` | `color-mix(in srgb, var(--client-primary) 36%, transparent)` |
| 次标签 | `var(--client-primary-soft)` | `var(--client-primary-strong)` | `color-mix(in srgb, var(--client-primary) 26%, transparent)` |
| 信息标签 | `var(--client-info-soft)` | `var(--client-info-text)` | `color-mix(in srgb, var(--client-info) 24%, transparent)` |
| 成功标签 | `var(--client-success-soft)` | `var(--client-success-text)` | `color-mix(in srgb, var(--client-success) 24%, transparent)` |

## 11. 开发执行检查

- 页面、卡片、列表、按钮、标签必须从上表 token 取色。
- 不在 TSX 组件里写死主题颜色；确需特殊色时先补 CSS token。
- 深色主题边框不要使用 `white`、`rgba(255,255,255,...)` 作为默认边框，除非是品牌按钮内描边。
- 旧名称 `jade-light`、`noir-gold` 只做兼容输入，不作为新代码命名。
- 若新增 `--client-success` / `--client-info`，需要同时补齐 7 套 theme，并检查日夜主题下文字对比度。
