# LaunchPad Live2D 模型包

应用新增独立 Live2D 引擎，原有 SVG、Codex v1/v2 图集与逐帧引擎继续使用。默认自动识别，也可以手动选择“原有桌宠”或“Live2D”。

## 从已有模型打包

接受 Cubism 3/4/5 的 `.model3.json` + `.moc3` 完整导出包，运行时固定 Core 5.2；新版 moc 需确认可由该 Core 读取。Cubism 2 的 `.model.json` 不支持。不要把编辑工程 `.cmo3` 当成运行模型。

保留模型配置和全部 FileReferences 引用：Textures、Motions、Expressions、Physics、Pose、DisplayInfo、UserData，以及动作引用的 Sound。保留相对目录结构，引用资源须在模型所在目录内，不使用 `..`、外部 URL、绝对路径或符号链接。模型配置不包含 `url` 字段，包内不附带 Core、SDK 或 JavaScript。模型美术授权信息随包保留。

可以直接压缩模型文件夹交付，也可以添加以下 `pet.json` 设置名称。`modelPath` 相对 pet.json；用户无需手写动作映射，应用提供下拉选择，安装时保存。

```json
{
  "schemaVersion": 1,
  "renderer": "live2d",
  "id": "my-live2d-pet",
  "displayName": "我的角色",
  "modelPath": "character.model3.json"
}
```

模型最多 128 MB、600 个引用资源、200 个动作/表情；JSON 最多 4 MB；目录引用单文件最多 32 MB，ZIP 单条目最多 16 MB。打包前核对所有引用存在、JSON 可解析、moc3 为实际导出文件。ZIP 中只放一个模型；多模型包会要求用户选择模型，选择裸模型配置时不会读取其他 pet.json 的命名与映射。

交付前在应用中拖入 ZIP，等待实际 Live2D 画面出现，切换至少一个动作和一个表情，检查透明背景、比例和脚底位置。没有相应动作或表情时说明限制；没能运行预览时明确未验证。不要使用逐帧打包脚本处理 moc3。

交付 ZIP 链接和操作说明：“拖入 ZIP → 自动识别 Live2D → 预览动作/表情 → 按需要设置待机、招手、拖拽映射 → 使用这个桌宠”。未映射的行为保持待机，不会自动生成行走或拖拽姿势。

## 用户只有文字或图片

可以生成角色基准图、分层素材方案和动作设计；制作可运行的 Live2D 模型还需要分层 PSD、网格、参数与变形器绑定、物理设置及 Cubism 导出。没有可用的建模/绑定工具或完整导出模型时，交付美术与后续制作要求，或按用户接受的逐帧格式完成可运行桌宠，不宣称已经生成 moc3。
