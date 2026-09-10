# 非公开设计源文件

此目录保留设计源件，用于设计修改和恢复，不属于网站或 App 运行资源。

- `2026-09-11/icon.psd`：原 `public/icons/icon.psd`。
- `2026-09-11/needo-nav-button-dark.psd`：原 `public/icons/needo-nav-button-dark.psd`。

两份源件与清理前本地 main `cc999f093ec9f49c428ef1f6ab8a35c61d2d3e91` 字节一致；SHA-256 和字节数见 `docs/qa/2026-09-11-asset-cleanup-manifest.json`。

发布时只分发正式构建的 `dist`，不可将仓库根目录、此目录或本地 `.data` 备份目录作为静态站点根目录。正常设计修改应从这里打开 PSD，再将经过确认的运行图片导出到原资源位置；不要重新公开 PSD。
