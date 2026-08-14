<div align="center">

[简体中文](README.md) | [English](README.en-US.md) | [日本語](README.ja-JP.md)

# LaunchPad

### 一键进入工作状态，也让一只 AI 桌宠陪你完成它

面向 Windows 的开源工作空间启动器与工作陪伴工具。
批量启动应用、管理进程与自动化任务，并通过可导入的动态桌宠获得轻量 AI 对话陪伴。

[![Release](https://img.shields.io/github/v/release/MewzCC/workspace-launcher?style=for-the-badge&logo=github&color=635bff)](https://github.com/MewzCC/workspace-launcher/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MewzCC/workspace-launcher/total?style=for-the-badge&logo=windows&color=06b6d4)](https://github.com/MewzCC/workspace-launcher/releases)
[![License](https://img.shields.io/github/license/MewzCC/workspace-launcher?style=for-the-badge&color=22c55e)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=for-the-badge&logo=windows)](https://github.com/MewzCC/workspace-launcher/releases/latest)

[下载最新版](https://github.com/MewzCC/workspace-launcher/releases/latest) ·
[查看功能](#核心能力) ·
[桌宠模型导入](#导入-codex-桌宠模型) ·
[本地开发](#本地开发) ·
[反馈问题](https://github.com/MewzCC/workspace-launcher/issues)

**当前文档：简体中文｜应用界面：简体中文 · English · 日本語**

</div>

![LaunchPad 工作空间管理界面](docs/images/workspace-management.png)

## LaunchPad 是什么？

LaunchPad 把每天重复打开的软件、脚本和工具组织成“工作空间”。设置一次启动顺序与延迟，之后只需点击一次，就能进入工作、学习、创作或游戏状态。

从 v1.5.0 开始，LaunchPad 也提供独立的“桌宠工作台”：你可以导入 Codex v1/v2 动画桌宠、调整它在桌面的行为，并连接自己选择的 AI 服务，让桌宠成为安静、低打扰的工作伙伴。

应用配置与工作空间数据保存在本机 SQLite 数据库中，无需注册 LaunchPad 账号。

## 核心能力

### 工作空间与效率工具

- 将多个 Windows 应用组合为工作空间并一键批量启动。
- 自定义应用启动顺序、延迟、参数和启动前后脚本。
- 在启动台查看运行状态，并一键关闭工作空间中的应用。
- 通过系统托盘驻留、开机启动和全局快捷键快速进入工作状态。
- 使用 Everything 即时搜索或扫描磁盘、目录和开始菜单中的软件。
- 管理软件库、BAT/CMD 脚本与本地自动化任务。
- 按名称、PID 或端口定位进程，查看资源占用并结束目标进程。
- 查看 CPU、内存、磁盘 I/O、网络与进程资源状态。
- 支持浅色/深色主题，以及简体中文、English、日本語三种界面语言。

### 工作陪伴型桌宠

- 独立桌宠工作台，集中管理陪伴对话、模型衣橱与桌宠设置。
- 兼容 Codex v1 与 v2 精灵图模型，并自动识别旧版清单。
- 支持待机、行走、工作、庆祝、休息等多种动画状态。
- 可调整桌宠大小、透明度、漫游范围、活跃程度和窗口置顶行为。
- 桌宠窗口会随模型动态调整，不用大面积透明窗口遮挡其他应用。
- 支持拖拽移动；拖拽区域跟随桌宠，不会因持续拖动不断放大窗口。
- 对话气泡自适应内容与桌面边界，避免文字被窗口裁切。
- 单击桌宠即可在下方输入消息，AI 回答继续以动态时长气泡展示；右键可启动专注计时、获取鼓励或调整桌面行为。

### 可配置 AI 对话

- 内置 OpenAI、DeepSeek、Kimi/月之暗面、智谱 GLM 厂商预设。
- 支持自定义 API 地址和模型 ID。
- 可在 Chat Completions 与 Responses API 两种接口格式中选择。
- 每个厂商可保存独立 API Key，Key 由 Electron 主进程读取并通过系统安全存储加密。
- AI 默认使用当前界面语言回答：简体中文、English 或日本語。
- 可自定义桌宠名字和性格提示，让回复方式符合自己的工作习惯。

> AI 对话请求会发送到你配置的模型服务商。请阅读对应服务商的隐私政策与计费规则，不要在对话中提交密码、令牌或其他敏感信息。

## 桌宠快速开始

1. 打开侧边栏中的“桌宠工作台”。
2. 在“模型衣橱”选择内置桌宠，或导入自己的 Codex 桌宠模型。
3. 在“桌宠设置”调整大小、透明度、漫游与置顶行为。
4. 在 AI 设置中选择厂商、接口方式与模型，填写 API Key 后保存。
5. 回到“陪伴对话”，桌宠便会按照当前界面语言与你交流。

### 导入 Codex 桌宠模型

可选择包含 `pet.json` 的完整模型文件夹，也可直接选择 `pet.json`。导入时模型会复制到 LaunchPad 的本地模型库，源文件不会被修改。

支持的动画图集：

| 版本 | 图集布局 | 图集尺寸 | 清单识别 |
| --- | --- | --- | --- |
| Codex v1 | 8 × 9 | 1536 × 1872 | `spriteVersionNumber: 1`，旧模型可省略该字段 |
| Codex v2 | 8 × 11 | 1536 × 2288 | `spriteVersionNumber: 2` |

模型目录至少应包含：

```text
my-pet/
├── pet.json
└── spritesheet.png
```

图集支持透明背景 PNG 或 WebP。导入器会检查清单、图片路径与图集尺寸；如果校验失败，会在当前界面语言中显示具体原因。

## 界面预览

### 工作空间管理

将开发、办公、创作或游戏应用按场景分组，创建自己的启动方案。

![工作空间管理](docs/images/workspace-management.png)

### 添加与管理软件

选择可执行文件、启动参数和图标，将常用工具集中收纳。

![添加软件](docs/images/add-software.png)

### 扫描中心

通过 Everything 即时查找应用，或按磁盘与目录执行可取消的扫描。

![扫描中心](docs/images/scan-center.png)

### 进程管理

按应用名称、PID 或端口定位进程，查看资源状态并结束不再需要的任务。

![进程管理](docs/images/process-manager.png)

### 设置与本地数据

管理主题、语言、更新方式、数据路径和诊断信息。

![设置页面](docs/images/settings.png)

## 下载与安装

前往 [GitHub Releases](https://github.com/MewzCC/workspace-launcher/releases/latest) 下载：

- `LaunchPad-Setup-<version>-x64.exe`：推荐，支持自选安装目录，并创建桌面与开始菜单快捷方式。
- `LaunchPad-Portable-<version>-x64.exe`：免安装便携版，下载后可直接运行。

当前版本面向 Windows 10/11 x64。项目暂未使用商业代码签名证书，Windows SmartScreen 可能显示未知发布者；请只从本仓库 Releases 页面下载。

安装版支持检查 GitHub Releases 更新。工作空间数据库和桌宠模型默认保存在本机，用户可以分别自定义数据目录与模型目录；正常升级不会清除这些数据。

## 本地开发

环境要求：Windows、Node.js 18+、npm。

```bash
git clone https://github.com/MewzCC/workspace-launcher.git
cd workspace-launcher
npm install
npm run dev
```

构建与打包：

```bash
# 构建 Electron 应用
npm run build

# 生成 Windows 安装包与便携版
npm run dist:win
```

打包产物输出到 `release/`。推送与 `package.json` 版本一致的 `v*` Tag 后，GitHub Actions 会自动构建并发布 Windows 产物。

## 技术栈

- Electron 31 + Electron Vite
- React 18 + Zustand
- SQLite + better-sqlite3
- Chart.js + Lucide React
- electron-builder + NSIS

## 数据与安全

- 工作空间、设置和桌宠配置默认保存在本机。
- API Key 不会提供给渲染页面明文读取，由 Electron 主进程使用系统安全存储加密。
- 自定义模型导入前会校验清单与精灵图，随后复制到应用管理的本地目录。
- 用户可以分别修改数据目录和模型目录。迁移采用安全复制，不覆盖目标中的已有数据，也不会自动删除原目录。
- 结束进程、关闭工作空间等操作只针对用户明确配置或选择的目标。

## 参与贡献

1. Fork 仓库并创建功能分支。
2. 提交聚焦且易于审查的改动。
3. 确认 `npm run build` 通过。
4. 发起 Pull Request，说明改动动机与验证方式。

欢迎通过 [Issues](https://github.com/MewzCC/workspace-launcher/issues) 报告问题、提出建议或补充翻译。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。

<div align="center">

如果 LaunchPad 帮你更快进入状态，欢迎点亮一个 Star。

</div>
