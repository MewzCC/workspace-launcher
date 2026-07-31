<div align="center">

# 🚀 LaunchPad

### 把每天重复打开的软件，变成真正的「一键启动」

一款简洁、开源、专为 Windows 打造的工作空间管理与软件启动器。  
自由组合开发、办公、创作或游戏应用，设置启动顺序与延迟，一次点击进入状态。

[![Release](https://img.shields.io/github/v/release/MewzCC/workspace-launcher?style=for-the-badge&logo=github&color=635bff)](https://github.com/MewzCC/workspace-launcher/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MewzCC/workspace-launcher/total?style=for-the-badge&logo=windows&color=06b6d4)](https://github.com/MewzCC/workspace-launcher/releases)
[![License](https://img.shields.io/github/license/MewzCC/workspace-launcher?style=for-the-badge&color=22c55e)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=for-the-badge&logo=windows)](https://github.com/MewzCC/workspace-launcher/releases/latest)

[⬇️ 下载最新版](https://github.com/MewzCC/workspace-launcher/releases/latest) ·
[✨ 功能亮点](#-为什么选择-launchpad) ·
[🛠️ 本地开发](#️-本地开发) ·
[💬 反馈建议](https://github.com/MewzCC/workspace-launcher/issues)

</div>

![LaunchPad 应用管理与一键启动界面](docs/images/workspace-management.png)

## 💡 LaunchPad 是什么？

每天开始工作时，你是否需要依次打开编辑器、浏览器、聊天工具、终端和文档？玩游戏前，又要逐个启动平台、加速器与辅助工具？

**LaunchPad 把这些重复操作收进一个工作空间。** 选择需要的软件、调整启动顺序和间隔，之后只需点击一次「一键启动」，就能快速进入工作、学习、创作或游戏状态。

数据保存在本机 SQLite 数据库中，不依赖云端账号，开箱即用。

## ✨ 为什么选择 LaunchPad？

| 功能 | 说明 |
| --- | --- |
| 🚀 **一键启动** | 将多个 Windows 软件组合为工作空间，一次点击批量启动 |
| 🧩 **自由编排** | 为每个软件设置启动顺序和延迟，减少开机拥堵 |
| 🔍 **智能扫描** | 扫描开始菜单、Program Files、指定磁盘或目录，快速发现已安装应用 |
| 🔎 **即时搜索** | 按名称、路径、描述或参数快速筛选软件、扫描结果与脚本 |
| 📦 **软件库** | 集中管理可执行文件、启动参数、图标和描述 |
| 🖥️ **BAT 脚本库** | 管理并一键运行本地 `.bat` / `.cmd` 自动化脚本 |
| ⚙️ **自动化脚本** | 支持启动前后命令，并可在软件启动后按顺序自动运行脚本库中的 BAT/CMD |
| 📈 **状态与日志** | 查看启动进度、运行状态和历史记录 |
| 🌗 **明暗主题** | 现代化浅色/深色界面，适配不同使用环境 |
| 🔒 **本地优先** | 配置与数据存储在本机，无需注册登录 |

## 📸 界面预览

### 🧭 工作空间管理

将常用软件按场景分组：开发、办公、游戏、直播或学习，都可以拥有自己的启动方案。

![工作空间管理](docs/images/workspace-management.png)

### ➕ 添加软件

支持选择可执行文件、设置启动参数与图标，常用工具统一收纳。

![添加软件](docs/images/add-software.png)

### 🔎 扫描中心

支持标准扫描、盘符扫描和目录扫描，批量发现并导入已安装的软件。

![扫描中心](docs/images/scan-center.png)

### ⚙️ 设置与本地数据

清楚展示版本、技术栈和本地数据状态，所有配置都由你掌控。

![设置页面](docs/images/settings.png)

## 📥 下载与安装

前往 [GitHub Releases](https://github.com/MewzCC/workspace-launcher/releases/latest) 下载：

- **`LaunchPad-Setup-1.1.0-x64.exe`**：推荐，大多数用户选择此安装包；支持自选安装目录，并创建桌面与开始菜单快捷方式。
- **`LaunchPad-Portable-1.1.0-x64.exe`**：免安装便携版，双击即可运行。

> 当前版本面向 Windows 10/11 x64。安装包暂未购买商业代码签名证书，Windows SmartScreen 可能显示未知发布者；请仅从本仓库 Release 页面下载。

## 🚀 三步开始一键启动

1. 在「扫描中心」自动发现软件，或在「软件库」手动添加程序。
2. 新建工作空间，选择软件并设置启动顺序、延迟时间。
3. 回到「启动台」或「应用管理」，点击 **一键启动**。

## 🛠️ 本地开发

环境要求：Node.js 18+、npm、Windows。

```bash
git clone https://github.com/MewzCC/workspace-launcher.git
cd workspace-launcher
npm install
npm run dev
```

构建生产版本：

```bash
# 仅构建应用
npm run build

# 构建 Windows 安装包与便携版
npm run dist:win
```

构建产物会输出到 `release/`。

## 🧱 技术栈

- ⚛️ React 18 + Zustand
- ⚡ Vite + Electron Vite
- 🖥️ Electron 31
- 🗃️ SQLite / better-sqlite3
- 🎨 Lucide React + 原生 CSS
- 📦 electron-builder + NSIS

## 🗺️ 路线图

- [ ] 工作空间导入与导出
- [ ] 系统托盘与开机启动
- [ ] 更多脚本模板和变量
- [ ] 自动更新
- [ ] 多语言支持

欢迎在 [Issues](https://github.com/MewzCC/workspace-launcher/issues) 提交建议或问题，也欢迎贡献代码。

## 🤝 参与贡献

1. Fork 本仓库并创建功能分支。
2. 提交清晰、聚焦的改动。
3. 确认 `npm run build` 通过。
4. 发起 Pull Request，并说明改动动机与测试方式。

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

<div align="center">

如果 LaunchPad 帮你少点几次鼠标，欢迎点亮一个 ⭐  
你的 Star 会让更多需要「Windows 一键启动」和「工作空间管理」的用户发现它。

</div>
