# 申请者中文教程生成

正文是 `application-guide-zh.md`，截图选择和环境标签位于 `application-guide-manifest.json`。仅包含申请者操作；审核人员页面不纳入教程。

当前交付为草稿与生成器，`finalReady=false`。部署后优先替换为 staging 的 TEST 账号截图，再确认正文、最终清单与截图中可见资料。不得把本地截图标成 staging，也不应将未经验收的身份切换描述为成功结果。

用 workspace dependency runtime Python 运行（需要 reportlab、Pillow、pypdf；渲染还需要 pypdfium2）：

```sh
python3 docs/guides/build_application_guide.py --check
python3 docs/guides/build_application_guide.py --render
python3 docs/guides/build_application_guide.py --final --render
```

第一条只校验正文、中文字体覆盖、截图完整性及清单，写 `check-report.json`，不生成 PDF。第二条生成带草稿页脚的 PDF。第三条要求经过确认的清单 `finalReady=true`，且三个申请流程都有截图。实际成品生成应在主任务确认最终素材之后进行。

默认使用 macOS STHeiti TrueType 集合并在 PDF 中嵌入子集；其他环境可以通过 `--font /absolute/path/font.ttf` 指定可嵌入的中文 TrueType 字体。字体缺字会明确失败，不回退到缺字的西文字体。

清单默认自动载入 `01..07` 店铺、`10..19` 本人认证和 `20..29` 技师的 `*-mobile.png`。最终可填充 `screenshots` 数组以指定准确文件、顺序、中文标题和单张截图来源；非空数组会替代自动发现。例如：

```json
{"file":"10-ekyc-profile-mobile.png","title":"填写本人认证资料","section":"本人认证","sourceEnvironment":"staging TEST 示例"}
```

每张截图都纳入附录，长截图按原始纵向像素连续拆页，分段边界保留最多 24 px 重叠。截图完整覆盖记录和 SHA-256 写入构建报告，可核对没有跳段。不会制造、涂改或重拍截图，也不会把所有长图挤成不可读的小字。`--render` 输出全部 PDF 页的预览供最终人工验收。

默认输出为 `exports/application-guide-2026-09-07`；重复运行覆盖同名产物，不触碰输入截图。最终生成前应确认正文中的草稿说明已根据实际验收结果更新。
