# 2026-09-11 非运行资源清理与恢复记录

## 范围

清理基线：本地 main `cc999f093ec9f49c428ef1f6ab8a35c61d2d3e91`。

本批不修改页面、主题、路由、正式图片、API、数据库或 5180 运行环境。清理在 `codex/asset-cleanup-20260911` 隔离分支实施，只集成本地 main；GitHub 推送和 staging 发布由用户指定的另一任务负责。

## 已归档的文件

| 原位置 | 处理 | 备份 |
|---|---|---|
| `public/icons/icon.psd` | 从公开资源移出 | `design/source-assets/2026-09-11/icon.psd`，Git保留 |
| `public/icons/needo-nav-button-dark.psd` | 从公开资源移出 | `design/source-assets/2026-09-11/needo-nav-button-dark.psd`，Git保留 |
| `public/icons/2026-09-11-needo-web-ios-android-execution.md` | 原样移动到正确文档目录 | `docs/superpowers/plans/2026-09-11-needo-web-ios-android-execution.md`，Git保留；另有本地副本 |
| 根工作目录 `public` 中6个 `.DS_Store` | 从公开目录移出 | 本地备份，保留原相对路径 |
| 根工作目录旧 `dist` 中3个 `.DS_Store` 和2个 PSD | 从旧产物移出，不重写其他产物 | 本地备份，保留原相对路径 |

两份 PSD 合计 38,757,232 字节（36.96 MiB），只是退出公开产物，**没有销毁设计原件**。源件还在Git中，因此这不是仓库历史瘦身。

完整路径、SHA-256、字节数、备份类型见 [机器可读清单](2026-09-11-asset-cleanup-manifest.json)。移动操作先复制、核对目标校验值、再次确认源文件未变化，才移除原位置。

持久本地备份目录：

```text
/Users/eason/Documents/New project/.data/asset-cleanup-20260911/
  manifest.json
  main-before/public/icons/                  两份main原始PSD的额外副本
  working-directory-before/public/          系统杂项和误放文档
  working-directory-before/dist/            旧产物中的系统杂项和PSD
```

`.data` 由现有Git忽略规则排除，不推送GitHub，也不进入dist。上述本地备份不在系统临时目录，但仍依赖这台电脑的磁盘备份；两份PSD及正式文档还有Git版本化副本。

## 有意保留，不冒险删除

以下8张候选旧图仍在原位置，合计16,710,159字节：

- `public/images/Backend Management System_bg.png`
- `public/images/business_bg.png`
- `public/images/error_bg.png`
- `public/images/login_bg.png`
- `public/images/management_bg.png`
- `public/images/login.png`
- `public/images/error-page.png`
- `public/image.png`

已检索源码直接引用，前5张的实际背景加载已使用JPG；但尚未完成持久化URL、动态路径及线上旧版本引用确认。因此不能将“源码没搜到”当作安全删除证明。匹配的 `src/assets/runtime` PNG也保留。

有真实数据生成/业务引用的卡通头像、店铺图片、轮播/附近背景，以及兼容图标和重复图片均保留。未改动用户已删除的两个 `output/pdf` 预览图。

## 防止再次进入产物

扩展现有 `scripts/audit-production-bundle-lib.mjs`，不新建重复审计工具：

- 递归检查所有产物目录，拦截设计源件、Markdown/Word开发文档、备份/压缩文件、常见密钥文件和 `.DS_Store`。
- 拒绝符号链接，不跟随链接进入备份或产生递归循环。
- 保留PNG/SVG、JSON地图、webmanifest、许可证文本以及现有JS预算/正式运行标记/HTML资源引用检查。
- 目录读取失败不能返回通过。该门禁不是完整秘密扫描，也不证明图片都被实际使用。

现有 `npm run verify:production-build` 会执行该门禁。普通 `npm run build` 仍只编译，发布任务必须执行前者或独立审计；如果今后确实要公开分发被拦截类型，应单独设计精确允许规则和测试，不能整体关闭门禁。

## 恢复方法

### 只取回设计源件（推荐）

直接打开 `design/source-assets/2026-09-11/` 中的文件即可，无需回滚业务。校验命令：

```bash
shasum -a 256 design/source-assets/2026-09-11/icon.psd design/source-assets/2026-09-11/needo-nav-button-dark.psd
```

与JSON清单比较。若需要额外副本，复制到非公开工作目录；目标已存在时先比较，禁止覆盖后来编辑的设计。

### 精确恢复清理前的公开路径与审计代码

仅在负责人明确决定回退本批时，在最新main的独立回滚分支上操作。先检查这4个文件是否已有后续修改；有后续修改则按差异人工合并，不整文件覆盖。

```bash
git restore --source=cc999f093ec9f49c428ef1f6ab8a35c61d2d3e91 -- public/icons/icon.psd public/icons/needo-nav-button-dark.psd scripts/audit-production-bundle-lib.mjs scripts/audit-production-bundle-lib.test.mjs
npm test -- scripts/audit-production-bundle-lib.test.mjs
npm run verify:production-build
```

这只恢复本批相关旧文件，不执行 reset、不回退整个main、不删除后续提交；会重新把PSD带入公开构建，须明确接受这个影响，再审查并提交。保留非公开备份不妨碍恢复。

### 本地系统杂项或旧产物取证

按JSON中的 `backup` 路径读取本地原件；仅在原位置不存在时复制回对应根工作目录路径。`.DS_Store` 不影响应用，无需为业务恢复它；旧dist PSD也不应被重新发布。开发文档正常保留在docs，不能为了“恢复位置”重新放入public。

## 验证记录

- 原有审计基线：5/5通过。
- 新增回归：修复前11项失败，准确复现递归资源漏检和符号链接漏检。
- 最小修复后：18/18通过，包括合法资源保留、大小写后缀、嵌套目录和缺失目录。
- 备份14条记录逐项SHA-256核对通过；两份PSD与基线Git对象一致。
- 清理分支 `npm run verify:production-build` 退出0；8个HTML入口、67个构建assets的审计通过。仍有原有大chunk、动态/静态混合导入和依赖注释警告，本批不为消除警告改动业务。
- 所有343个保留的公开资源（77,800,211字节）与基线Git对象逐个一致，且与新dist对应文件SHA-256一致。因此没有改变现有背景/头像/图标的图片内容；这不是全业务或真机视觉验收。
- 使用现有node_modules软链接完成构建，Node 22.15.0、Vite 7.3.2；不是重新npm ci的锁文件重装验收。发布任务仍须执行自己的完整发布门禁。
- 集成后还必须重新运行同一组测试与正式构建，结果由最终交接记录明确说明，不以分支测试替代main验证。

根工作目录仍是较旧的detached HEAD，本批不切换该目录，也不改正在运行的固定版本。main的最终产物必须从集成后的main构建，不能使用根目录旧dist冒充最新发布包。
