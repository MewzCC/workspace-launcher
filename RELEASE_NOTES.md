# 🛡️ LaunchPad v1.1.1 — 软件启动验证与 EACCES 修复

本次更新重点解决扫描导入的软件在一键启动时才暴露 `EACCES`、路径不可用或权限不足的问题。LaunchPad 现在会在添加阶段提前验证，只有能够正常启动的软件才会进入软件库。

## ✨ 本次更新

- 🧪 手动添加软件时先实际启动验证，成功后才保存
- 🚫 路径不存在、不是 EXE 或启动失败时禁止添加，并展示具体原因
- 🛡️ 编辑软件路径或启动参数时自动重新验证
- 🪟 遇到 Windows `EACCES/EPERM` 时自动回退到系统 Shell 启动，兼容需要 UAC 或 Shell 处理的 GUI 程序
- 📦 软件库批量添加与扫描中心导入同样执行逐个启动验证
- 🧯 批量验证每次最多 20 个软件，避免误操作同时打开数百个程序
- 📋 批量完成后显示验证通过数量与未添加的失败项目

## 📥 下载选择

- **LaunchPad-Setup-1.1.1-x64.exe**：Windows 安装版，可选择安装目录，并创建桌面与开始菜单快捷方式。
- **LaunchPad-Portable-1.1.1-x64.exe**：免安装便携版，下载后双击即可使用。

## 💻 系统要求

- Windows 10 / Windows 11
- x64 处理器

> 添加软件时会实际打开一次目标程序，这是启动验证流程的一部分。安装包尚未使用商业代码签名证书，Windows SmartScreen 可能提示“未知发布者”。

## 🔐 SHA-256

```text
36E76F9ED1BE1B6B8C6A70FE3F501CC7C5E50F9B3055A767917F120C619CB4E5  LaunchPad-Setup-1.1.1-x64.exe
FDBA298DE805957F3762AB6266003FFF888CC77F6CD1BD7CB64E4ED8B62B3217  LaunchPad-Portable-1.1.1-x64.exe
```
