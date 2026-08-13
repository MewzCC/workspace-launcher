<div align="center">

[简体中文](README.md) | [English](README.en-US.md) | [日本語](README.ja-JP.md)

# LaunchPad

### ワンクリックで作業環境へ。AI ペットも一緒に

Windows 向けのオープンソースなワークスペースランチャー兼、仕事仲間アプリです。
複数アプリの一括起動、プロセスと自動化の管理に加え、インポート可能なアニメーションペットと軽量な AI 会話を利用できます。

[![Release](https://img.shields.io/github/v/release/MewzCC/workspace-launcher?style=for-the-badge&logo=github&color=635bff)](https://github.com/MewzCC/workspace-launcher/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MewzCC/workspace-launcher/total?style=for-the-badge&logo=windows&color=06b6d4)](https://github.com/MewzCC/workspace-launcher/releases)
[![License](https://img.shields.io/github/license/MewzCC/workspace-launcher?style=for-the-badge&color=22c55e)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=for-the-badge&logo=windows)](https://github.com/MewzCC/workspace-launcher/releases/latest)

[最新版をダウンロード](https://github.com/MewzCC/workspace-launcher/releases/latest) ·
[主な機能](#主な機能) ·
[ペットモデルのインポート](#codex-ペットモデルのインポート) ·
[ローカル開発](#ローカル開発) ·
[問題を報告](https://github.com/MewzCC/workspace-launcher/issues)

**現在のドキュメント：日本語｜アプリ表示：简体中文 · English · 日本語**

</div>

![LaunchPad ワークスペース管理](docs/images/workspace-management.png)

## LaunchPad とは？

LaunchPad は、毎日開くアプリ、スクリプト、ツールを「ワークスペース」としてまとめます。起動順序と待機時間を一度設定すれば、仕事、学習、制作、ゲーム環境をワンクリックで開始できます。

v1.5.0 からは専用の「ペットワークベンチ」も搭載しています。Codex v1/v2 アニメーションペットをインポートし、デスクトップ上の動作を調整し、好きな AI サービスへ接続して、静かで邪魔にならない仕事仲間として利用できます。

ワークスペースと設定はローカルの SQLite データベースに保存されます。LaunchPad アカウントの登録は不要です。

## 主な機能

### ワークスペースと効率化

- 複数の Windows アプリをワークスペースにまとめて一括起動。
- 起動順序、待機時間、引数、起動前後のスクリプトを設定。
- 起動台で実行状態を確認し、ワークスペース内のアプリを一括終了。
- システムトレイ、Windows ログイン時の起動、グローバルショートカットに対応。
- Everything の即時検索、またはディスク・フォルダー・スタートメニューのスキャン。
- ソフトウェアライブラリ、BAT/CMD スクリプト、ローカル自動化を管理。
- 名前、PID、ポートからプロセスを検索し、リソース確認と終了が可能。
- CPU、メモリ、ディスク I/O、ネットワーク、上位プロセスを監視。
- ライト／ダークテーマと、簡体字中国語・英語・日本語に対応。

### 仕事仲間型デスクトップペット

- 会話、モデル衣装棚、動作設定をまとめた専用ペットワークベンチ。
- Codex v1/v2 スプライトシートと旧形式マニフェストに対応。
- 待機、移動、作業、祝福、休憩など複数のアニメーション状態。
- サイズ、透明度、自由移動、常に手前に表示を調整可能。
- モデルの実寸に追従する小さなウィンドウで、広い透明領域が操作を妨げません。
- ドラッグ領域がペットに追従し、移動中にウィンドウが拡大しません。
- デスクトップ端でも内容が切れにくい自動調整の会話バルーン。

### 設定可能な AI 会話

- OpenAI、DeepSeek、Kimi／月之暗面、智譜 GLM のプリセット。
- API アドレスとモデル ID のカスタム指定。
- Chat Completions と Responses API からインターフェース形式を選択。
- プロバイダー別に API Key を保存。Electron メインプロセスのみが読み取り、OS の安全なストレージで暗号化します。
- AI は現在の表示言語（簡体字中国語、英語、日本語）で返答します。
- ペット名と性格プロンプトを自由に設定可能。

> AI 会話は設定したモデル提供元へ送信されます。各サービスのプライバシーポリシーと料金を確認し、パスワードやトークンなどの機密情報を送信しないでください。

## ペットのクイックスタート

1. サイドバーから「ペットワークベンチ」を開きます。
2. 「モデル衣装棚」で内蔵ペットを選ぶか、Codex ペットモデルをインポートします。
3. 「ペット設定」でサイズ、透明度、自由移動、常に手前に表示を調整します。
4. AI の提供元、API 形式、モデルを選択し、API Key を保存します。
5. 「会話」へ戻ると、ペットが現在の表示言語で応答します。

### Codex ペットモデルのインポート

`pet.json` を含むフォルダー全体、または `pet.json` を直接選択できます。検証済みモデルはローカルモデルライブラリへコピーされ、元ファイルは変更されません。

| バージョン | アトラス構成 | アトラスサイズ | マニフェスト判定 |
| --- | --- | --- | --- |
| Codex v1 | 8 × 9 | 1536 × 1872 | `spriteVersionNumber: 1`。旧形式は省略可能 |
| Codex v2 | 8 × 11 | 1536 × 2288 | `spriteVersionNumber: 2` |

最小構成：

```text
my-pet/
├── pet.json
└── spritesheet.png
```

透明背景の PNG と WebP に対応します。インポーターはマニフェスト、画像パス、アトラス寸法を検証し、エラーを現在の表示言語で表示します。

## 画面プレビュー

### ワークスペース管理

開発、オフィス、制作、配信、ゲームなど、用途別に再利用可能な起動プランを作成できます。

![ワークスペース管理](docs/images/workspace-management.png)

### ソフトウェアの追加と管理

実行ファイル、起動引数、アイコンを指定し、よく使うツールを一つのライブラリで管理します。

![ソフトウェアを追加](docs/images/add-software.png)

### スキャンセンター

Everything ですぐにアプリを検索し、必要に応じてディスクやフォルダーを中断可能な方法でスキャンします。

![スキャンセンター](docs/images/scan-center.png)

### プロセス管理

アプリ名、PID、ポートからプロセスを検索し、状態を確認して不要なタスクを終了できます。

![プロセス管理](docs/images/process-manager.png)

### 設定とローカルデータ

テーマ、言語、更新方法、保存フォルダー、診断情報を管理します。

![設定](docs/images/settings.png)

## ダウンロードとインストール

[GitHub Releases](https://github.com/MewzCC/workspace-launcher/releases/latest) から最新版をダウンロードできます。

- `LaunchPad-Setup-<version>-x64.exe`：推奨。インストール先を選択でき、ショートカットを作成します。
- `LaunchPad-Portable-<version>-x64.exe`：インストール不要のポータブル版です。

現在は Windows 10/11 x64 に対応しています。商用コード署名証明書を使用していないため、Windows SmartScreen に不明な発行元として表示される場合があります。本リポジトリの Releases からのみダウンロードしてください。

インストール版は GitHub Releases の更新を確認できます。ワークスペースデータとペットモデルは既定でローカル保存され、データフォルダーとモデルフォルダーを個別に変更できます。通常のアップデートでは削除されません。

## ローカル開発

必要環境：Windows、Node.js 18 以降、npm。

```bash
git clone https://github.com/MewzCC/workspace-launcher.git
cd workspace-launcher
npm install
npm run dev
```

ビルドとパッケージ作成：

```bash
# Electron アプリをビルド
npm run build

# Windows インストーラーとポータブル版を生成
npm run dist:win
```

成果物は `release/` に出力されます。`package.json` のバージョンと一致する `v*` タグを push すると、GitHub Actions が Windows 版を自動ビルドして公開します。

## 技術構成

- Electron 31 + Electron Vite
- React 18 + Zustand
- SQLite + better-sqlite3
- Chart.js + Lucide React
- electron-builder + NSIS

## データと安全性

- ワークスペース、設定、ペット構成は既定でローカルに保存されます。
- API Key はレンダラープロセスへ平文で公開されず、Electron メインプロセスが OS の安全なストレージで暗号化します。
- インポートモデルは検証後に管理対象のモデルライブラリへコピーされます。
- データフォルダーとモデルフォルダーは個別に変更できます。移行時は安全にコピーし、元フォルダーを保持し、移動先の既存データを上書きしません。
- プロセス終了とワークスペース終了は、ユーザーが明示的に設定または選択した対象だけに実行されます。

## コントリビューション

1. リポジトリを Fork して機能ブランチを作成します。
2. 目的が明確でレビューしやすい変更を加えます。
3. `npm run build` が成功することを確認します。
4. 変更理由と検証方法を記載して Pull Request を作成します。

不具合、機能提案、翻訳改善は [Issues](https://github.com/MewzCC/workspace-launcher/issues) へ投稿してください。

## ライセンス

LaunchPad は [MIT License](LICENSE) で公開されています。

<div align="center">

LaunchPad が作業開始を少しでも速くできたら、ぜひ Star をお願いします。

</div>
