# Release Notes

[简体中文](../README.md) | [English](../README.en-US.md) | [日本語](../README.ja-JP.md)

LaunchPad 的版本发布说明统一保存在此目录，避免 Release Notes 散落在仓库根目录。

## 命名规则

每个版本使用与 Git Tag 一致的文件名：

```text
release-notes/
├── README.md
├── v1.2.0.md
├── v1.3.0.md
└── v1.5.0.md
```

发布新版本时：

1. 将应用版本更新为 `x.y.z`。
2. 新建 `release-notes/vx.y.z.md`。
3. 创建并推送 `vx.y.z` Tag。
4. GitHub Actions 会读取对应文件并填充 GitHub Release 标题与正文。

## 历史版本

- [v1.5.0 — AI 工作桌宠](v1.5.0.md)
- [v1.4.6 — 一键关闭与智能更新](v1.4.6.md)
- [v1.4.5 — 诊断能力与设置体验优化](v1.4.5.md)
- [v1.4.4 — 更新日志与回滚](v1.4.4.md)
- [v1.4.3 — 安装体验优化](v1.4.3.md)
- [v1.4.2 — 更新体验完善](v1.4.2.md)
- [v1.4.1 — 自动更新与数据路径升级](v1.4.1.md)
- [v1.4.0 — 性能监控与全局快捷键](v1.4.0.md)
- [v1.3.0 — 即时搜索与进程管理](v1.3.0.md)
- [v1.2.0 — 系统托盘与开机启动](v1.2.0.md)
