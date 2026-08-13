<div align="center">

[简体中文](README.md) | [English](README.en-US.md) | [日本語](README.ja-JP.md)

# LaunchPad

### Enter your workspace with one click—and bring an AI companion along

An open-source Windows workspace launcher and work-companion app.
Launch groups of applications, manage processes and automations, and stay accompanied by an importable animated desktop pet with lightweight AI chat.

[![Release](https://img.shields.io/github/v/release/MewzCC/workspace-launcher?style=for-the-badge&logo=github&color=635bff)](https://github.com/MewzCC/workspace-launcher/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MewzCC/workspace-launcher/total?style=for-the-badge&logo=windows&color=06b6d4)](https://github.com/MewzCC/workspace-launcher/releases)
[![License](https://img.shields.io/github/license/MewzCC/workspace-launcher?style=for-the-badge&color=22c55e)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=for-the-badge&logo=windows)](https://github.com/MewzCC/workspace-launcher/releases/latest)

[Download](https://github.com/MewzCC/workspace-launcher/releases/latest) ·
[Features](#features) ·
[Import a Pet](#importing-codex-pet-models) ·
[Development](#local-development) ·
[Report an Issue](https://github.com/MewzCC/workspace-launcher/issues)

**Current document: English | App languages: 简体中文 · English · 日本語**

</div>

![LaunchPad workspace management](docs/images/workspace-management.png)

## What is LaunchPad?

LaunchPad organizes the apps, scripts, and tools you open every day into workspaces. Configure launch order and delays once, then enter your work, study, creative, or gaming setup with a single click.

Starting with v1.5.0, LaunchPad includes a dedicated Pet Workbench. Import Codex v1/v2 animated pets, tune their desktop behavior, and connect the AI provider of your choice to create a calm, low-distraction work companion.

Workspace data and app settings are stored locally in SQLite. No LaunchPad account is required.

## Features

### Workspaces and productivity

- Combine multiple Windows apps into a workspace and launch them together.
- Configure app order, delay, arguments, and before/after scripts.
- See live status on the dashboard and close all apps in a running workspace.
- Use the system tray, start-at-login, and global shortcuts for fast access.
- Find apps instantly through Everything, or scan disks, folders, and the Start Menu.
- Manage an app library, BAT/CMD scripts, and local automation tasks.
- Locate processes by name, PID, or port; inspect resource use and terminate a target.
- Monitor CPU, memory, disk I/O, network activity, and top processes.
- Switch between light/dark themes and Simplified Chinese, English, or Japanese.

### Work-companion desktop pet

- A dedicated Pet Workbench for chat, model wardrobe, and behavior settings.
- Codex v1 and v2 spritesheet compatibility, including automatic legacy detection.
- Multiple animation states such as idle, walking, working, celebrating, and resting.
- Adjustable scale, opacity, roaming behavior, and always-on-top mode.
- A tightly sized pet window that follows the model instead of blocking a large transparent area.
- Stable drag behavior whose interactive area follows the pet without growing the window.
- Adaptive chat bubbles that stay readable near desktop edges.

### Configurable AI chat

- Presets for OpenAI, DeepSeek, Kimi/Moonshot, and Zhipu GLM.
- Custom API endpoints and model IDs.
- A choice between Chat Completions and Responses API formats.
- A separate API key per provider. Keys are read by the Electron main process and encrypted with OS secure storage.
- Replies follow the current interface language by default: Simplified Chinese, English, or Japanese.
- Custom companion name and personality prompt.

> AI chat messages are sent to the provider you configure. Review that provider's privacy policy and pricing, and never submit passwords, tokens, or other secrets in chat.

## Pet quick start

1. Open **Pet Companion** from the sidebar.
2. Choose the built-in model in **Model Wardrobe**, or import a Codex pet model.
3. Adjust size, opacity, roaming, and always-on-top behavior in **Pet Settings**.
4. Select an AI provider, API format, and model, then save your API key.
5. Return to **Companion Chat**. The pet will reply in the current interface language.

### Importing Codex pet models

Select a complete folder containing `pet.json`, or select `pet.json` directly. LaunchPad copies validated files into the local model library without changing the source files.

| Version | Atlas layout | Atlas size | Manifest detection |
| --- | --- | --- | --- |
| Codex v1 | 8 × 9 | 1536 × 1872 | `spriteVersionNumber: 1`; legacy manifests may omit it |
| Codex v2 | 8 × 11 | 1536 × 2288 | `spriteVersionNumber: 2` |

Minimum model structure:

```text
my-pet/
├── pet.json
└── spritesheet.png
```

Transparent PNG and WebP atlases are supported. The importer validates the manifest, image path, and atlas dimensions, then displays any error in the current interface language.

## Interface preview

### Workspace management

Group development, office, creative, streaming, or gaming apps into reusable launch plans.

![Workspace management](docs/images/workspace-management.png)

### Add and manage software

Choose executables, launch arguments, and icons, then keep frequently used tools in one library.

![Add software](docs/images/add-software.png)

### Scan Center

Find apps instantly with Everything, or run cancellable disk and folder scans.

![Scan Center](docs/images/scan-center.png)

### Process management

Find a process by app name, PID, or port, inspect its status, and stop tasks you no longer need.

![Process management](docs/images/process-manager.png)

### Settings and local data

Manage themes, languages, updates, storage directories, and diagnostics.

![Settings](docs/images/settings.png)

## Download and installation

Download the latest version from [GitHub Releases](https://github.com/MewzCC/workspace-launcher/releases/latest):

- `LaunchPad-Setup-<version>-x64.exe`: recommended installer with a selectable install directory and shortcuts.
- `LaunchPad-Portable-<version>-x64.exe`: portable build that runs without installation.

LaunchPad currently targets Windows 10/11 x64. Builds are not signed with a commercial code-signing certificate, so Windows SmartScreen may show an unknown-publisher warning. Only download releases from this repository.

The installed build can check GitHub Releases for updates. Workspace data and pet models are stored locally by default. You may customize the data directory and model directory independently; normal updates preserve both.

## Local development

Requirements: Windows, Node.js 18+, and npm.

```bash
git clone https://github.com/MewzCC/workspace-launcher.git
cd workspace-launcher
npm install
npm run dev
```

Build and package:

```bash
# Build the Electron app
npm run build

# Generate the Windows installer and portable build
npm run dist:win
```

Artifacts are written to `release/`. Pushing a `v*` tag matching the version in `package.json` triggers GitHub Actions to build and publish the Windows artifacts automatically.

## Technology

- Electron 31 + Electron Vite
- React 18 + Zustand
- SQLite + better-sqlite3
- Chart.js + Lucide React
- electron-builder + NSIS

## Data and security

- Workspaces, settings, and pet configuration are stored locally by default.
- API keys are never exposed to the renderer as plain text. The Electron main process encrypts them through OS secure storage.
- Imported models are validated before they are copied into the managed model library.
- Data and model directories can be changed independently. Migration uses safe copying, retains the old directory, and never overwrites existing target data.
- Process termination and workspace shutdown only target apps explicitly configured or selected by the user.

## Contributing

1. Fork the repository and create a focused branch.
2. Make a clear, reviewable change.
3. Verify that `npm run build` succeeds.
4. Open a Pull Request describing the motivation and validation steps.

Use [Issues](https://github.com/MewzCC/workspace-launcher/issues) for bug reports, feature ideas, or translation improvements.

## License

LaunchPad is open source under the [MIT License](LICENSE).

<div align="center">

If LaunchPad helps you enter your flow faster, consider leaving a Star.

</div>
