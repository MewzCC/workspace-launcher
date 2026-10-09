# LaunchPad 逐帧模型契约

新格式：`schemaVersion: 1`、`renderer: "sequence"`。应用同时兼容旧 Codex v1/v2 和参数化 SVG。

```json
{
  "schemaVersion": 1,
  "renderer": "sequence",
  "id": "blue-whale",
  "displayName": "小鲸鱼",
  "description": "温柔的蓝色鲸鱼伙伴",
  "animations": {
    "idle": { "frames": ["animations/idle/001.png", "animations/idle/002.png"], "fps": 8, "loop": true },
    "walkRight": { "frames": ["animations/walkRight/001.png", "animations/walkRight/002.png"], "fps": 10, "loop": true }
  }
}
```

- `idle` 必需。其他支持的动作：`blink`、`walkRight`、`walkLeft`、`wave`、`jump`、`failed`、`waiting`、`working`、`review`、`dragging`、`sleep`、`touchHead`、`sitDown`。
- 每个动作 1–120 帧，总计最多 600 帧、128 MB，每张最多 16 MB；PNG 或 WebP。
- 所有动作的画布尺寸相同，边长不超过 4096；高度/宽度在 0.5–2 之间。建议使用 192×208 或 384×416 透明画布，让角色在约 116 px 桌面宽度下仍清晰。
- 帧相对路径必须在模型目录内，不允许绝对路径、`..`、链接；保留透明边距，不要逐帧裁掉边距造成画布/脚底跳动。
- FPS 在 1–30 之间。`loop: false` 表示播放一次并停在末帧，运行时动作切换由桌宠行为控制。
- 单张透明图片是有效静态桌宠。它没有自动生成的行走动作；应用导入后默认关闭漫游。
- 缺失动作使用 idle。预览只展示实际存在的动作。
- ZIP 可含一个外层角色目录。里面只能有一个 `pet.json`。生成 ZIP 不含 QA 图、参考图等无关素材。

无配置文件时也可导入图片或动作文件夹。文件夹别名：`walk_right`→`walkRight`，`walk_left`→`walkLeft`，`drag`→`dragging`，`happy`→`wave`，`angry`→`failed`，`touch_head`→`touchHead`，`sit_down`→`sitDown`。多张未分类图片按自然文件名顺序作为 idle；不要在目录里混入不同角色或预览拼图。
