# LaunchPad 桌宠模型规范

本文件是 `models/` 下桌宠包的规范性契约。目标是让桌宠作者或 AI 只生成资源和清单，不修改 LaunchPad 代码；用户选择模型目录中的 `pet.json` 后即可导入使用。

关键词“必须”“不得”表示硬性要求，“建议”表示质量要求。当前规范名称为 `workspace-launcher-pet`，版本为 `1`。

## 1. 哪些模型可以直接导入

LaunchPad 可以直接导入以下自包含模型包：

1. **V3 通用包**：`pet.json` 的 `schemaVersion` 为 `3`，渲染器为 `sprite2d`，所有 PNG/WebP 资源都在同一模型目录内。它可以使用图集或独立序列帧。
2. **Full State 22 标准包**：V3 的严格超集，具有固定的 22 个状态和完整 adapter 语义。所有从单张图片生成的新桌宠必须使用此规格。
3. 旧 Codex v1/v2 包仍可由兼容层读取，但它们不是新桌宠的生产标准，也不能表达完整状态集。

无需为新角色新增 React、Electron、状态机或 renderer 代码。模型差异必须全部由 `pet.json`、资源文件和语义绑定表达。

## 2. 自包含目录

一个可导入的 Full State 22 包必须至少包含：

```text
models/<pet-id>/
  pet.json
  spritesheet.webp
```

可以附带 `source.png`、QA 报告或生成记录，但运行时不得依赖模型目录外的文件。`pet.json` 中的资源路径必须是相对路径，不得使用盘符、绝对路径或 `..`。

目录名建议与 `pet.json.id` 一致。ID 必须匹配：

```text
^[a-z0-9][a-z0-9_-]{0,63}$
```

## 3. Full State 22 标识

`pet.json` 必须包含：

```json
{
  "schemaVersion": 3,
  "modelStandard": {
    "name": "workspace-launcher-pet",
    "version": 1,
    "profile": "full-state-22"
  }
}
```

该字段供作者、AI 和严格校验器识别规格。LaunchPad V3 运行时对未知元数据保持向前兼容。

## 4. 图集几何

Full State 22 默认且推荐使用单张透明 PNG/WebP 图集：

- 8 列 × 22 行；
- 单格 `192×208`；
- 总尺寸严格为 `1536×4576`；
- 每个状态固定 8 帧；
- 所有 176 个单元格均为已使用单元格，不得为空；
- 角色不得触碰单元格边缘，不得跨格、裁切或带不透明背景；
- 完全透明像素的 RGB 应清零，避免缩放时出现色边。

V3 通用包可以使用 `sequence`，但 Full State 22 标准包必须使用上述图集布局，从而保证任何实现都能确定性验证和预览。

## 5. 固定状态表

行号、状态 ID、帧率和播放模式不得改名或调换：

| 行 | 状态 ID | FPS | 播放 | 含义 |
|---:|---|---:|---|---|
| 0 | `idle` | 6 | loop | 安静待机 |
| 1 | `running-right` | 10 | loop | 向屏幕右侧移动 |
| 2 | `running-left` | 10 | loop | 向屏幕左侧移动 |
| 3 | `waving` | 8 | once | 招手或回应悬停 |
| 4 | `jumping` | 10 | once | 兴奋跳跃 |
| 5 | `failed` | 6 | once | 任务失败 |
| 6 | `waiting` | 5 | loop | 等待用户输入 |
| 7 | `running` | 8 | loop | 正在工作，不是跑步 |
| 8 | `review` | 6 | loop | 审阅或专注检查 |
| 9 | `look-row-9` | 8 | loop | 000° 至 157.5° 的 8 个注视方向 |
| 10 | `look-row-10` | 8 | loop | 180° 至 337.5° 的 8 个注视方向 |
| 11 | `picked-up` | 8 | once | 被拿起 |
| 12 | `dragging-left` | 10 | loop | 拖拽向左 |
| 13 | `dragging-right` | 10 | loop | 拖拽向右 |
| 14 | `drag-hold` | 6 | loop | 拖拽静止保持 |
| 15 | `falling` | 10 | once | 松手下落 |
| 16 | `landing` | 10 | once | 落地缓冲 |
| 17 | `sleep` | 4 | loop | 睡眠 |
| 18 | `wake-up` | 8 | once | 醒来 |
| 19 | `happy` | 8 | once | 开心 |
| 20 | `angry` | 8 | once | 生气或烦躁 |
| 21 | `sad` | 6 | once | 难过或担忧 |

方向使用屏幕坐标：`000` 向上、`090` 向右、`180` 向下、`270` 向左。第 9 行依次为 `000, 022.5, 045, 067.5, 090, 112.5, 135, 157.5`；第 10 行依次为 `180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5`。

## 6. 语义 adapter

不得重写 LaunchPad 的情绪状态机。模型必须使用 `render.animations[*].semantics` 和 `semantics.bindings` 将运行时意图映射到动作。

至少必须绑定：

| 运行时意图 | 动画 |
|---|---|
| `idle` | `idle` |
| `move.walk.right` | `running-right` |
| `move.walk.left` | `running-left` |
| `greet`, `touch.head` | `waving` |
| `react.excited` | `jumping` |
| `error` | `failed` |
| `rest.sit`, `wait.user` | `waiting` |
| `focus.working` | `running` |
| `study.review`, `emotion.focused` | `review` |
| `emotion.curious` | `look-row-9`, `look-row-10` |
| `interaction.lift` | `picked-up` |
| `interaction.drag.left` | `dragging-left` |
| `interaction.drag.right` | `dragging-right` |
| `interaction.drag` | `drag-hold` |
| `interaction.release` | `falling` |
| `interaction.land` | `landing` |
| `rest.sleep`, `emotion.sleepy` | `sleep` |
| `rest.wake` | `wake-up` |
| `react.happy`, `emotion.happy` | `happy` |
| `react.angry`, `react.annoyed`, `emotion.angry` | `angry` |
| `react.sad`, `react.concerned`, `emotion.sad` | `sad` |

独立的 `emotion-action-adapter.json` 可以作为可读说明保留，但运行时权威映射必须写入 `pet.json`，因为导入器只保证复制清单声明的图像资源和 `pet.json`。

## 7. 单图生成规则

其他 AI 从一张角色图片生成桌宠时，必须遵循 [AI_PET_GENERATION_RULES.md](AI_PET_GENERATION_RULES.md)。核心原则如下：

1. 输入图是角色身份的唯一视觉基准；固定脸型、比例、配色、材质、标记和道具。
2. 每个状态生成完整的 8 帧动作行，不得把不同生成批次的单帧拼成同一行。
3. 优先复用通过 QA 的素材；确定性问题先裁切、对齐和统一缩放，只有源视觉错误时才重生完整状态行。
4. 生成图只负责视觉内容；精确的 192×208 分格、透明化、对齐和图集组装必须确定性完成。
5. 22 行全部通过结构、动作语义、身份一致性、透明度、连续性和小尺寸可读性 QA 后，才能写入模型目录。

## 8. 导入即用验收

生成 AI 必须先使用带 Pillow 的 Python 做像素级严格校验：

```powershell
& $PYTHON "skills/create-launchpad-pet/scripts/package_pet.py" --validate-package "models/<pet-id>"
```

然后在仓库根目录运行 LaunchPad 运行时兼容性校验：

```powershell
npm run verify:pet-package -- models/<pet-id>
```

只有两个命令都返回 `ok: true` 的 Full State 22 模型才能标注为“可直接导入”。Python 校验负责图集尺寸、176 个非空单元格、alpha、触边和色键；LaunchPad 校验负责 V3 清单、资源路径、22 行顺序、adapter 绑定和运行时兼容性。

然后在 LaunchPad 中选择模型目录或其中的 `pet.json` 即可导入；不需要修改或重新编译应用。

机器可读结构见 [PET_MODEL_V3.schema.json](PET_MODEL_V3.schema.json)，可复制模板见 [PET_MODEL_FULL_STATE_TEMPLATE.json](PET_MODEL_FULL_STATE_TEMPLATE.json)。运行时的 V3 校验实现仍是最终兼容性权威。
