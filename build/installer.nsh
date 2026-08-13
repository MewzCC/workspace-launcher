; LaunchPad NSIS 定制脚本
; 行为区分：
; - 安装模式：始终默认“仅为我安装”（per-user），跳过“为哪位用户安装”选择页。
; - 首次安装：保留目录选择页 → 安装进度 → 完成页，完成页默认不勾选“运行 LaunchPad”。
; - 更新（检测到已安装旧版本）：跳过许可/目录/完成页，直接进入安装进度界面，
;   在原安装路径上更新，装完自动结束，不启动应用；
;   用户数据（LaunchPadData / userData / 注册表配置）始终保留。

; 强制“仅为我安装”，跳过安装模式选择页（被 multiUserUi.nsh 的 pre 回调调用）。
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; 完成页：更新时整体跳过；首次安装显示完成页但默认不运行应用。
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
  ; 首次安装也默认不勾选“运行 LaunchPad”。
  !define MUI_FINISHPAGE_RUN_NOTCHECKED
  ; 提前展开接口宏，声明 $mui.FinishPage.Run 变量（宏有守卫，可重复调用）。
  !insertmacro MUI_FINISHPAGE_INTERFACE

  Function launchpadFinishPre
    ; 更新时跳过整个完成页：安装进度结束后直接结束，无任何向导页。
    ${if} ${isUpdated}
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE launchpadFinishPre
  !insertmacro MUI_PAGE_FINISH
!macroend

; 安装完成后不删除任何用户数据（升级/覆盖安装保留工作空间与设置）；
; 更新（覆盖安装）完成后自动启动应用；首次安装不自动启动。
!macro customInstall
  ${if} ${isUpdated}
    Exec '"$INSTDIR\LaunchPad.exe"'
  ${endif}
!macroend

; 卸载时保留用户数据。
!macro customUnInstall
!macroend
