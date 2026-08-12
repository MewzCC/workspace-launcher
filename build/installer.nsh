; LaunchPad NSIS 定制脚本
; 行为区分：
; - 首次安装：保持完整向导（许可页 → 目录选择页 → 安装进度 → 完成页，默认勾选“运行 LaunchPad”）
; - 更新（检测到已安装旧版本）：跳过许可页与目录选择页，直接进入安装进度界面，
;   在原安装路径上更新，完成页不显示“运行 LaunchPad”；
;   用户数据（LaunchPadData / userData / 注册表配置）始终保留。

; 更新时跳过许可页/目录页由 electron-builder 内置 skipPageIfUpdated 处理；
; 这里通过 customFinishPage 控制完成页的“运行应用”选项。

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  ; 提前展开接口宏，声明 $mui.FinishPage.Run 变量，供 pre 回调引用（宏有守卫，可重复调用）。
  !insertmacro MUI_FINISHPAGE_INTERFACE

  Function launchpadFinishPre
    ; 更新时隐藏“运行 LaunchPad”复选框，默认不启动应用。
    ${if} ${isUpdated}
      ShowWindow $mui.FinishPage.Run 0
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE launchpadFinishPre
  !insertmacro MUI_PAGE_FINISH
!macroend

; 安装完成后不删除任何用户数据（升级/覆盖安装保留工作空间与设置）。
!macro customInstall
!macroend

; 卸载时保留用户数据。
!macro customUnInstall
!macroend
