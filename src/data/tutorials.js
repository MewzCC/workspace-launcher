// 使用教程数据：按平台模块分类，抽屉左侧导航 / 右侧步骤。
// 每个模块：key（图标名）+ label + steps[{ t: 标题, d: 描述 }]，三语言。

const step = (zhTitle, zhDesc, enTitle, enDesc, jaTitle, jaDesc) => ({
  'zh-CN': { t: zhTitle, d: zhDesc },
  'en-US': { t: enTitle, d: enDesc },
  'ja-JP': { t: jaTitle, d: jaDesc }
})

export const TUTORIAL_SECTIONS = [
  {
    key: 'dashboard',
    icon: 'Rocket',
    label: { 'zh-CN': '启动台', 'en-US': 'Dashboard', 'ja-JP': 'ダッシュボード' },
    steps: [
      step('快速启动工作空间', '在卡片底部点击「启动」按钮，一键启动该工作空间内全部软件。', 'Launch a workspace', 'Click the launch button at the card bottom to start all its apps at once.', 'ワークスペースを起動', 'カード下部の起動ボタンで全アプリを一括起動します。'),
      step('重新运行', '工作空间内软件全部运行时，按钮变为「重新运行」，会先结束再重启。', 'Relaunch', 'When all apps are running the button becomes "Relaunch" and restarts them.', '再実行', 'すべて実行中の場合「再実行」に変わり、終了してから再起動します。'),
      step('一键关闭', '运行中的卡片显示「关闭」按钮，一键结束该工作空间全部进程。', 'Close workspace', 'A "Close" button appears on running cards to stop every process at once.', '一括終了', '実行中のカードに「閉じる」が表示され、全プロセスを一括終了します。'),
      step('快速编辑', '点击「快速编辑」可调整包含的软件和快捷键，不改变启动顺序。', 'Quick edit', 'Adjust apps and shortcut without changing launch order.', 'クイック編集', 'アプリとショートカットを順序を変えずに調整できます。'),
      step('教程中心', '右上角时钟旁的「?」按钮打开本教程抽屉。', 'Tutorials', 'The "?" button next to the clock opens this tutorial drawer.', 'チュートリアル', '時計横の「?」ボタンでこのチュートリアルを開きます。')
    ]
  },
  {
    key: 'workspaces',
    icon: 'LayoutGrid',
    label: { 'zh-CN': '空间管理', 'en-US': 'Workspaces', 'ja-JP': 'ワークスペース管理' },
    steps: [
      step('创建工作空间', '点击右上角「添加工作空间」，填写名称、图标并选择软件。', 'Create', 'Click "Add Workspace" and pick a name, icon and apps.', '作成', '「ワークスペースを追加」で名前・アイコン・アプリを設定します。'),
      step('设置启动顺序', '在软件选择下方调整每个软件的启动顺序与延迟（毫秒）。', 'Launch order', 'Adjust launch order and delay (ms) per app below the picker.', '起動順', '各アプリの起動順と遅延（ms）を設定します。'),
      step('全局快捷键', '点击快捷键输入框后按下组合键（如 Ctrl+Alt+W），保存后任意位置按下即可启动。', 'Global shortcut', 'Press a combo (e.g. Ctrl+Alt+W) in the shortcut field to launch from anywhere.', 'グローバルショートカット', 'フィールドで Ctrl+Alt+W などを押すと、どこからでも起動できます。'),
      step('编辑与删除', '卡片上的编辑/删除按钮管理配置；删除前会二次确认。', 'Edit & delete', 'Use edit/delete buttons; deletion asks for confirmation.', '編集と削除', '編集・削除ボタンで管理。削除前に確認します。'),
      step('运行状态', '卡片右上角状态灯显示运行/停止；运行中可一键关闭。', 'Status', 'The status dot shows running state; close is one click away.', '状態', '右上のランプで実行状態を表示。一括終了もワンクリック。')
    ]
  },
  {
    key: 'software',
    icon: 'Box',
    label: { 'zh-CN': '软件库', 'en-US': 'Software Library', 'ja-JP': 'ソフトウェアライブラリ' },
    steps: [
      step('添加软件', '点击「添加软件」，选择 EXE 路径；保存前会实际启动验证。', 'Add software', 'Pick an EXE; it is actually launched to verify before saving.', '追加', 'EXE を選ぶと保存前に実際に起動して検証します。'),
      step('启动参数', '在启动参数栏填写如 --fullscreen 等参数。', 'Arguments', 'Fill launch arguments such as --fullscreen.', '引数', '--fullscreen などの起動引数を設定します。'),
      step('图标模式', '「自动」提取 EXE 真实图标；也可自定义 emoji 图标。', 'Icon modes', 'Auto extracts the real EXE icon, or pick a custom emoji.', 'アイコン', '自動で実アイコンを抽出、または絵文字を設定。'),
      step('批量添加', '「批量验证添加」可一次选择最多 20 个 EXE 验证导入。', 'Bulk add', 'Batch-validate up to 20 EXEs at once.', '一括追加', '最大20個のEXEを一括で検証・追加します。'),
      step('BAT 脚本', '切换到 BAT 标签管理 .bat/.cmd 脚本库，可直接运行。', 'BAT scripts', 'Manage .bat/.cmd scripts in the BAT tab and run them directly.', 'BATスクリプト', 'BATタブで .bat/.cmd を管理し直接実行できます。')
    ]
  },
  {
    key: 'automation',
    icon: 'Workflow',
    label: { 'zh-CN': '自动化', 'en-US': 'Automation', 'ja-JP': '自動化' },
    steps: [
      step('启动前后脚本', '为工作空间配置启动前（pre）/启动后（post）脚本，支持 CMD 与 PowerShell。', 'Pre/post scripts', 'Configure pre/post scripts per workspace in CMD or PowerShell.', '前後スクリプト', '起動前後のスクリプトを CMD/PowerShell で設定します。'),
      step('脚本延迟', '可设置脚本执行前的延迟时间（毫秒）。', 'Script delay', 'Set a delay before the script runs.', '遅延', 'スクリプト実行前の遅延を設定できます。'),
      step('BAT 自动运行', '「启动后运行 BAT 脚本」按顺序自动运行脚本库中的脚本。', 'BAT sequence', 'Run library BAT scripts in order after all apps start.', 'BAT自動実行', '全アプリ起動後にライブラリのBATを順番に実行します。')
    ]
  },
  {
    key: 'scan',
    icon: 'ScanLine',
    label: { 'zh-CN': '扫描中心', 'en-US': 'Scan Center', 'ja-JP': 'スキャンセンター' },
    steps: [
      step('即时搜索', '输入名称即可搜索 Everything 与 Windows 应用索引，无需先扫描。', 'Instant search', 'Search Everything and the Windows app index by typing a name.', '即時検索', '名前を入力するだけで Everything と Windows 索引を検索。'),
      step('三种扫描模式', '标准扫描（开始菜单+Program Files）、盘符扫描、目录扫描。', 'Scan modes', 'Standard, drive and directory scans are available.', '3つのモード', '標準・ドライブ・フォルダーの3種類。'),
      step('取消扫描', '扫描过程中可随时取消，已有结果会保留。', 'Cancel scan', 'Cancel anytime; existing results are kept.', 'キャンセル', 'いつでもキャンセルでき、結果は保持されます。'),
      step('验证添加', '勾选结果后点击「验证添加」，逐项启动验证后写入软件库。', 'Verify & add', 'Check results and click "Verify & Add" to import them.', '検証して追加', 'チェックして「検証して追加」でライブラリに取り込みます。')
    ]
  },
  {
    key: 'processes',
    icon: 'ListTree',
    label: { 'zh-CN': '进程管理', 'en-US': 'Process Manager', 'ja-JP': 'プロセス管理' },
    steps: [
      step('搜索进程', '按应用名称、PID 或监听端口搜索进程。', 'Search', 'Search processes by name, PID or listening port.', '検索', '名前・PID・ポートでプロセスを検索します。'),
      step('结束进程', '点击进程行的「结束」按钮，按进程树安全结束（系统进程受保护）。', 'Terminate', 'Terminate the process tree safely; system processes are protected.', '終了', 'プロセスツリーごと安全に終了。システムプロセスは保護。'),
      step('性能监视', '切换到「性能」标签查看 CPU/内存/磁盘/GPU 实时数据与进程排行。', 'Performance', 'Switch to the Performance tab for real-time CPU/RAM/disk/GPU stats.', 'パフォーマンス', '「パフォーマンス」タブで CPU/メモリ/ディスク/GPU を表示。'),
      step('GPU 排行', 'GPU 标签支持按显卡过滤进程占用排行。', 'GPU ranking', 'The GPU tab can filter process usage by each GPU.', 'GPUランキング', 'GPUタブでグラフィックスごとに絞り込み可能。')
    ]
  },
  {
    key: 'monitor',
    icon: 'Activity',
    label: { 'zh-CN': '状态监控', 'en-US': 'Monitor', 'ja-JP': 'モニター' },
    steps: [
      step('选择工作空间', '顶部按钮组切换要监控的工作空间，或查看全部。', 'Pick workspace', 'Switch the watched workspace from the top buttons.', '選択', '上部ボタンで監視対象を切り替えます。'),
      step('软件状态', '实时显示每个软件的运行/停止状态灯。', 'App status', 'Live running/stopped lights for every app.', '状態', '各アプリの実行状態をリアルタイム表示。'),
      step('启动日志', '下方展示启动历史与失败原因。', 'Launch logs', 'Launch history and failure reasons are listed below.', 'ログ', '起動履歴と失敗理由を下部に表示します。')
    ]
  },
  {
    key: 'updates',
    icon: 'Download',
    label: { 'zh-CN': '更新', 'en-US': 'Updates', 'ja-JP': '更新' },
    steps: [
      step('检查更新', '设置 → 更新 中点击「检查更新」手动检测新版本。', 'Check updates', 'In Settings → Updates click "Check for updates".', '確認', '設定 → 更新 の「更新を確認」で手動チェック。'),
      step('更新提示', '检测到新版本会弹出提示，可选更新、跳过此版本或取消。', 'Update prompt', 'A dialog offers Update / Skip this version / Cancel.', '通知', '検出時にダイアログで更新・スキップ・キャンセルを選択。'),
      step('后台静默更新', '窗口隐藏于托盘时按「更新方式」自动下载，完成后询问是否重启。', 'Background update', 'When hidden to tray, downloads silently and asks to restart.', 'バックグラウンド更新', 'トレイ隠し時に自動ダウンロードし、再起動を確認します。'),
      step('更新日志', '「更新日志」查看全部版本记录，支持下载旧版回滚。', 'Release history', 'View every release and download older installers to roll back.', '更新履歴', '全バージョンを表示し旧版をダウンロードしてロールバック。'),
      step('更新后自动启动', '安装完成后 LaunchPad 会自动打开。', 'Auto start after update', 'LaunchPad opens automatically after installing.', '更新後自動起動', 'インストール完了後に自動で起動します。')
    ]
  },
  {
    key: 'settings',
    icon: 'Settings',
    label: { 'zh-CN': '设置', 'en-US': 'Settings', 'ja-JP': '設定' },
    steps: [
      step('四个分类', '设置页分为通用 / 更新 / 数据 / 诊断四个标签。', 'Four tabs', 'Settings is split into General / Updates / Data / Diagnostics.', '4タブ', '一般・更新・データ・診断の4タブ構成です。'),
      step('系统与启动', '通用标签可配置开机自启、静默驻留、关闭到托盘、启动前结束进程。', 'System & startup', 'Configure login start, tray behavior and pre-launch process policy.', 'システムと起動', '自動起動・トレイ・起動前プロセス終了を設定。'),
      step('数据管理', '数据标签查看存储位置，支持导出/导入 JSON 备份与清理数据。', 'Data', 'View storage path, export/import JSON backups and clear data.', 'データ', '保存場所の確認、JSONバックアップ、データ消去。'),
      step('诊断反馈', '诊断标签可打开日志目录、复制诊断信息并反馈到 GitHub Issue。', 'Diagnostics', 'Open logs, copy diagnostics and report issues to GitHub.', '診断', 'ログ閲覧・診断情報コピー・Issue報告。'),
      step('桌面宠物', '通用标签可开关桌面宠物。', 'Desktop pet', 'Toggle the desktop pet in the General tab.', 'ペット', '一般タブでデスクトップペットを切り替え。')
    ]
  },
  {
    key: 'pet',
    icon: 'Cat',
    label: { 'zh-CN': '桌面宠物', 'en-US': 'Desktop Pet', 'ja-JP': 'デスクトップペット' },
    steps: [
      step('显示与漫游', '宠物常驻桌面，会随机走动并在空闲时休息。', 'Roaming', 'The pet stays on the desktop, roaming around and resting.', '表示と散策', 'ペットはデスクトップに常駐し、ランダムに動き回ります。'),
      step('拖拽宠物', '按住宠物拖动到任意位置，位置会被记住。', 'Drag', 'Drag the pet anywhere; the position is remembered.', 'ドラッグ', '好きな場所にドラッグでき、位置は記憶されます。'),
      step('双击打开', '双击宠物快速打开 LaunchPad 主窗口。', 'Double-click', 'Double-click the pet to open the main window.', 'ダブルクリック', 'ダブルクリックでメインウィンドウを開きます。'),
      step('右键菜单', '右键可打开 LaunchPad、回家或隐藏宠物。', 'Right-click menu', 'Right-click to open LaunchPad, go home or hide the pet.', '右クリック', '右クリックで起動・帰宅・非表示を選択。')
    ]
  }
]
