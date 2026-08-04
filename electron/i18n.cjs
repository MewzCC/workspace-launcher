// 主进程 i18n 模块
// 负责托盘、菜单、通知与校验错误等原生文案的多语言
// 语言从 app_settings 持久化读取，渲染层通过 language:set 切换

const MESSAGES = {
  'zh-CN': {
    tray: {
      tooltip: 'LaunchPad · 一键启动工作空间',
      launchingTooltip: 'LaunchPad · 正在启动 {name}',
      completeTitle: '工作空间启动完成',
      completeBody: '{icon} {name} 已完成一键启动',
      failedTitle: '工作空间启动失败',
      failedBody: '{name}: {message}',
      open: '打开 LaunchPad',
      launchWorkspace: '一键启动工作空间',
      openAtLogin: '开机自动启动',
      quit: '退出 LaunchPad',
      noWorkspace: '暂无工作空间',
      launchingSuffix: '（启动中…）',
      loginFailedTitle: '开机启动设置失败',
      hintTitle: 'LaunchPad 仍在运行',
      hintBody: '窗口已收起到系统托盘，可继续一键启动工作空间。'
    },
    menu: {
      file: '文件',
      edit: '编辑',
      view: '视图',
      window: '窗口',
      help: '帮助',
      about: '关于 LaunchPad',
      viewGithub: '在 GitHub 上查看',
      quit: '退出',
      closeWindow: '关闭窗口',
      undo: '撤销',
      redo: '重做',
      cut: '剪切',
      copy: '复制',
      paste: '粘贴',
      pasteAndMatchStyle: '粘贴并匹配样式',
      delete: '删除',
      selectAll: '全选',
      reload: '重新加载',
      forceReload: '强制重新加载',
      devTools: '开发者工具',
      resetZoom: '重置缩放',
      zoomIn: '放大',
      zoomOut: '缩小',
      fullscreen: '全屏',
      minimize: '最小化',
      zoom: '缩放',
      close: '关闭',
      services: '服务',
      hide: '隐藏 {name}',
      hideOthers: '隐藏其他',
      unhide: '显示全部',
      speech: '语音',
      startSpeaking: '开始朗读',
      stopSpeaking: '停止朗读',
      front: '前置全部窗口'
    },
    errors: {
      launchFailedCode: '程序启动失败（{code}）: {message}',
      exeRequired: '请选择可执行文件',
      exeOnly: '仅支持添加 .exe 可执行文件',
      batOnly: '仅支持执行 .bat 或 .cmd 脚本',
      scriptNotExist: '脚本文件不存在: {path}',
      exeNotExist: '可执行文件不存在: {path}',
      notAFile: '路径不是文件: {path}',
      winDenied: 'Windows 拒绝启动该程序（{code}），可能需要管理员权限、文件被安全软件拦截或程序已损坏: {path}',
      shellDetail: '；系统 Shell 返回：{message}',
      killExistingFailed: '无法结束已有进程: {message}',
      processStatusFailed: '无法读取进程状态: {message}',
      systemProcessFailed: '无法读取系统进程: {message}',
      systemPortFailed: '无法读取系统端口: {message}',
      parseProcessFailed: '无法解析进程状态: {message}',
      parsePortFailed: '无法解析端口状态: {message}',
      pidInvalid: 'PID 无效',
      processGone: '进程不存在或已经退出',
      processProtected: '为保护 Windows 与 LaunchPad，禁止结束该进程',
      killFailed: '结束进程失败，可能需要管理员权限（PID {pid}）',
      confirmTargetFailed: '无法确认目标进程信息',
      killSelfBlocked: '已阻止结束 LaunchPad 自身进程',
      noWindows: '当前系统不支持结束 Windows 进程',
      loginWinOnly: '当前版本仅支持在 Windows 中设置开机启动',
      loginPackagedOnly: '开机启动只能在安装版或便携版 LaunchPad 中设置',
      loginVerifyFailed: 'Windows 启动项写入后校验失败',
      softwareNotExist: '软件不存在',
      scriptNotExist: '脚本不存在',
      bulkLimit: '为避免一次启动过多程序，每次最多验证并添加 20 个软件',
      externalBlocked: '不允许打开该外部链接',
      scriptNameRequired: '请输入脚本名称',
      exeFilter: '可执行文件',
      scanCancelled: '扫描已取消'
    },
    engine: {
      preRunning: '执行启动前脚本',
      preSuccess: '启动前脚本执行成功',
      preFailed: '启动前脚本失败: {message}',
      launchSuccess: '{name} 启动成功',
      launchFailed: '{name} 启动失败: {message}',
      killedExisting: '已结束 {count} 个已有进程，正在重新启动',
      killFailed: '结束已有进程失败，继续尝试启动: {message}',
      postRunning: '执行启动后脚本',
      postSuccess: '启动后脚本执行成功',
      postFailed: '启动后脚本失败: {message}',
      batchRunning: '正在启动脚本：{name}',
      batchStarted: '脚本已启动：{name}',
      batchFailed: '{name}: {message}',
      batchStartedLog: '启动后脚本 {name} 已启动',
      batchFailedLog: '启动后脚本 {name} 启动失败: {message}',
      notFound: '工作空间不存在: {id}'
    }
  },
  'en-US': {
    tray: {
      tooltip: 'LaunchPad · Launch workspaces with one click',
      launchingTooltip: 'LaunchPad · Launching {name}',
      completeTitle: 'Workspace launch complete',
      completeBody: '{icon} {name} launched',
      failedTitle: 'Workspace launch failed',
      failedBody: '{name}: {message}',
      open: 'Open LaunchPad',
      launchWorkspace: 'Launch a Workspace',
      openAtLogin: 'Start at login',
      quit: 'Quit LaunchPad',
      noWorkspace: 'No workspaces yet',
      launchingSuffix: ' (launching…)',
      loginFailedTitle: 'Failed to set start-at-login',
      hintTitle: 'LaunchPad is still running',
      hintBody: 'The window was hidden to the system tray. Launch workspaces anytime from there.'
    },
    menu: {
      file: 'File',
      edit: 'Edit',
      view: 'View',
      window: 'Window',
      help: 'Help',
      about: 'About LaunchPad',
      viewGithub: 'View on GitHub',
      quit: 'Quit',
      closeWindow: 'Close Window',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      pasteAndMatchStyle: 'Paste and Match Style',
      delete: 'Delete',
      selectAll: 'Select All',
      reload: 'Reload',
      forceReload: 'Force Reload',
      devTools: 'Developer Tools',
      resetZoom: 'Reset Zoom',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      fullscreen: 'Toggle Full Screen',
      minimize: 'Minimize',
      zoom: 'Zoom',
      close: 'Close',
      services: 'Services',
      hide: 'Hide {name}',
      hideOthers: 'Hide Others',
      unhide: 'Show All',
      speech: 'Speech',
      startSpeaking: 'Start Speaking',
      stopSpeaking: 'Stop Speaking',
      front: 'Bring All to Front'
    },
    errors: {
      launchFailedCode: 'Failed to launch program ({code}): {message}',
      exeRequired: 'Please select an executable',
      exeOnly: 'Only .exe executables are supported',
      batOnly: 'Only .bat or .cmd scripts are supported',
      scriptNotExist: 'Script file does not exist: {path}',
      exeNotExist: 'Executable does not exist: {path}',
      notAFile: 'Path is not a file: {path}',
      winDenied: 'Windows refused to launch the program ({code}). It may need admin rights, be blocked by security software, or be corrupted: {path}',
      shellDetail: '; shell returned: {message}',
      killExistingFailed: 'Unable to terminate existing processes: {message}',
      processStatusFailed: 'Unable to read process status: {message}',
      systemProcessFailed: 'Unable to read system processes: {message}',
      systemPortFailed: 'Unable to read system ports: {message}',
      parseProcessFailed: 'Unable to parse process status: {message}',
      parsePortFailed: 'Unable to parse port status: {message}',
      pidInvalid: 'Invalid PID',
      processGone: 'Process does not exist or already exited',
      processProtected: 'This process is protected for Windows and LaunchPad, cannot terminate',
      killFailed: 'Failed to terminate process, may need admin rights (PID {pid})',
      confirmTargetFailed: 'Unable to confirm target process info',
      killSelfBlocked: 'Blocked terminating LaunchPad itself',
      noWindows: 'Terminating Windows processes is not supported on this system',
      loginWinOnly: 'Start at login is only supported on Windows',
      loginPackagedOnly: 'Start at login can only be set in the installed or portable LaunchPad',
      loginVerifyFailed: 'Windows startup entry verification failed after writing',
      softwareNotExist: 'Software does not exist',
      scriptNotExist: 'Script does not exist',
      bulkLimit: 'To avoid launching too many programs at once, validate at most 20 at a time',
      externalBlocked: 'This external link is not allowed',
      scriptNameRequired: 'Please enter a script name',
      exeFilter: 'Executables',
      scanCancelled: 'Scan cancelled'
    },
    engine: {
      preRunning: 'Running pre-launch script',
      preSuccess: 'Pre-launch script succeeded',
      preFailed: 'Pre-launch script failed: {message}',
      launchSuccess: '{name} launched',
      launchFailed: '{name} failed to launch: {message}',
      killedExisting: 'Terminated {count} existing processes, restarting',
      killFailed: 'Failed to terminate existing processes, continuing to launch: {message}',
      postRunning: 'Running post-launch script',
      postSuccess: 'Post-launch script succeeded',
      postFailed: 'Post-launch script failed: {message}',
      batchRunning: 'Starting script: {name}',
      batchStarted: 'Script started: {name}',
      batchFailed: '{name}: {message}',
      batchStartedLog: 'Post-launch script {name} started',
      batchFailedLog: 'Post-launch script {name} failed: {message}',
      notFound: 'Workspace does not exist: {id}'
    }
  },
  'ja-JP': {
    tray: {
      tooltip: 'LaunchPad · ワンクリックでワークスペースを起動',
      launchingTooltip: 'LaunchPad · {name} を起動中',
      completeTitle: 'ワークスペースの起動が完了しました',
      completeBody: '{icon} {name} の一括起動が完了しました',
      failedTitle: 'ワークスペースの起動に失敗しました',
      failedBody: '{name}: {message}',
      open: 'LaunchPad を開く',
      launchWorkspace: 'ワークスペースを一括起動',
      openAtLogin: 'ログイン時に起動',
      quit: 'LaunchPad を終了',
      noWorkspace: 'ワークスペースがありません',
      launchingSuffix: '（起動中…）',
      loginFailedTitle: 'ログイン時起動の設定に失敗',
      hintTitle: 'LaunchPad は実行中です',
      hintBody: 'ウィンドウはシステムトレイに収納されました。いつでもワークスペースを一括起動できます。'
    },
    menu: {
      file: 'ファイル',
      edit: '編集',
      view: '表示',
      window: 'ウィンドウ',
      help: 'ヘルプ',
      about: 'LaunchPad について',
      viewGithub: 'GitHub で見る',
      quit: '終了',
      closeWindow: 'ウィンドウを閉じる',
      undo: '元に戻す',
      redo: 'やり直す',
      cut: '切り取り',
      copy: 'コピー',
      paste: '貼り付け',
      pasteAndMatchStyle: 'スタイルを合わせて貼り付け',
      delete: '削除',
      selectAll: 'すべて選択',
      reload: '再読み込み',
      forceReload: '強制再読み込み',
      devTools: '開発者ツール',
      resetZoom: 'ズームをリセット',
      zoomIn: '拡大',
      zoomOut: '縮小',
      fullscreen: '全画面',
      minimize: '最小化',
      zoom: 'ズーム',
      close: '閉じる',
      services: 'サービス',
      hide: '{name} を隠す',
      hideOthers: '他を隠す',
      unhide: 'すべて表示',
      speech: '読み上げ',
      startSpeaking: '読み上げ開始',
      stopSpeaking: '読み上げ停止',
      front: 'すべて前面へ'
    },
    errors: {
      launchFailedCode: 'プログラムの起動に失敗（{code}）: {message}',
      exeRequired: '実行ファイルを選択してください',
      exeOnly: '追加できるのは .exe 実行ファイルのみです',
      batOnly: '実行できるのは .bat または .cmd スクリプトのみです',
      scriptNotExist: 'スクリプトファイルが存在しません: {path}',
      exeNotExist: '実行ファイルが存在しません: {path}',
      notAFile: 'パスはファイルではありません: {path}',
      winDenied: 'Windows がプログラムの起動を拒否しました（{code}）。管理者権限が必要、セキュリティソフトにブロックされている、またはファイルが破損している可能性があります: {path}',
      shellDetail: '；システムシェルの応答: {message}',
      killExistingFailed: '既存プロセスを終了できません: {message}',
      processStatusFailed: 'プロセス状態を読み取れません: {message}',
      systemProcessFailed: 'システムプロセスを読み取れません: {message}',
      systemPortFailed: 'システムポートを読み取れません: {message}',
      parseProcessFailed: 'プロセス状態を解析できません: {message}',
      parsePortFailed: 'ポート状態を解析できません: {message}',
      pidInvalid: 'PID が無効です',
      processGone: 'プロセスが存在しないか既に終了しています',
      processProtected: 'Windows と LaunchPad を保護するため、このプロセスは終了できません',
      killFailed: 'プロセスを終了できません。管理者権限が必要な可能性があります（PID {pid}）',
      confirmTargetFailed: '対象プロセスの情報を確認できません',
      killSelfBlocked: 'LaunchPad 自身のプロセスの終了をブロックしました',
      noWindows: 'このシステムでは Windows プロセスの終了はサポートされていません',
      loginWinOnly: 'ログイン時起動は Windows のみサポートされています',
      loginPackagedOnly: 'ログイン時起動はインストール版またはポータブル版の LaunchPad でのみ設定できます',
      loginVerifyFailed: 'Windows 起動エントリの書き込み後の検証に失敗しました',
      softwareNotExist: 'ソフトウェアが存在しません',
      scriptNotExist: 'スクリプトが存在しません',
      bulkLimit: '一度に起動しすぎないよう、一度に検証して追加できるのは最大 20 個です',
      externalBlocked: 'この外部リンクは許可されていません',
      scriptNameRequired: 'スクリプト名を入力してください',
      exeFilter: '実行ファイル',
      scanCancelled: 'スキャンがキャンセルされました'
    },
    engine: {
      preRunning: '起動前スクリプトを実行',
      preSuccess: '起動前スクリプトが正常に完了',
      preFailed: '起動前スクリプト失敗: {message}',
      launchSuccess: '{name} の起動に成功',
      launchFailed: '{name} の起動に失敗: {message}',
      killedExisting: '{count} 個の既存プロセスを終了しました。再起動します',
      killFailed: '既存プロセスの終了に失敗。起動を続行: {message}',
      postRunning: '起動後スクリプトを実行',
      postSuccess: '起動後スクリプトが正常に完了',
      postFailed: '起動後スクリプト失敗: {message}',
      batchRunning: 'スクリプトを起動中: {name}',
      batchStarted: 'スクリプトが起動しました: {name}',
      batchFailed: '{name}: {message}',
      batchStartedLog: '起動後スクリプト {name} が起動しました',
      batchFailedLog: '起動後スクリプト {name} の起動に失敗: {message}',
      notFound: 'ワークスペースが存在しません: {id}'
    }
  }
}

const DEFAULT_LANGUAGE = 'zh-CN'
const FLAT = Object.fromEntries(
  Object.entries(MESSAGES).map(([code, dict]) => [code, flatten(dict)])
)

function flatten(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, result)
    } else {
      result[path] = value
    }
  }
  return result
}

// 读取当前语言（settingsDao 可能未就绪时回退默认）
// 懒加载 settingsDao，避免 DAO 模块反向依赖本模块时的循环 require
function getLanguage() {
  try {
    const { settingsDao } = require('./db/index.cjs')
    const lang = settingsDao.get('language')
    return MESSAGES[lang] ? lang : DEFAULT_LANGUAGE
  } catch (_) {
    return DEFAULT_LANGUAGE
  }
}

// 翻译：key 扁平键，params 插值参数
function t(key, params = {}) {
  const dict = FLAT[getLanguage()] || FLAT[DEFAULT_LANGUAGE]
  const fallback = FLAT[DEFAULT_LANGUAGE]
  const template = dict[key] != null ? dict[key] : fallback[key] != null ? fallback[key] : key
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params[name] != null ? String(params[name]) : match
  )
}

module.exports = { t, getLanguage }
