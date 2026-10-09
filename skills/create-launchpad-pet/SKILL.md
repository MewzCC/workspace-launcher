---
name: create-launchpad-pet
description: 根据文字描述或参考图片创建 LaunchPad 自定义桌宠，制作透明角色与逐帧动作，校验并输出可直接拖入预览的 ZIP 模型包。适用于 LaunchPad 桌宠生成和素材转换。
---

# 创建 LaunchPad 自定义桌宠

输出用户能直接拖入 LaunchPad「桌宠工作台 → 模型衣橱」的 ZIP 包。应用会自动识别、预览；用户点击「使用这个桌宠」后才安装。不要自行写入 models 或覆盖已有角色。

## 使用方式

将本 skill 文件夹放入 Codex 的 skills 目录（通常是 ~/.codex/skills/create-launchpad-pet），重启或开启新聊天后使用：
「用 $create-launchpad-pet 创建一只蓝色小鲸鱼，包含待机、左右行走和拖拽动作。」
用户提供参考图片时保留其身份特征。未指定名字、风格时自行选择简短名字和适合小尺寸的清晰轮廓。

## 制作与预览

1. 先读 [模型格式](references/sequence-contract.md)。优先使用逐帧模型；不要求固定 Codex 图集尺寸。
2. 使用当前环境可用的图像生成/编辑能力制作透明底角色。若提供 imagegen 技能或工具，按它的说明调用；生成图像不使用手绘代码代替。未提供生成能力时，可转换用户已有素材；纯文字请求则说明缺少图像生成能力，保留角色设计描述，不能把机器人换色说成角色生成。
3. 先展示角色基准图，再制作核心动作。用户已提供参考或已授权全流程时继续制作，无需额外确认。优先完成 idle、walkRight、walkLeft、dragging；用户只要求静态角色时仅制作 idle 并明确静态限制。
4. 用同一角色参考生成各动作，所有帧保持统一透明画布、角色比例、脚底基线和光照。左右行走应朝对应屏幕方向；只有对称角色才考虑镜像。拖拽应有被提起的姿势。不要拿跳跃冒充拖拽，也不要把整张图集放进单帧目录。
5. 动画素材可以按动作生成短条后确定性切帧，或生成独立帧。用图像工具编辑修复身份漂移、切边、白底和多余角色；脚本仅用于切帧、检查、打包等确定性处理。少量干净帧优于大量失真的帧。
6. 将帧放到 idle/、walk_right/、walk_left/、drag/ 等动作目录，按 001.png、002.png 编号。实际帧数可变，默认 6–10 FPS；先确认循环首尾和脚底对齐，再增加其他动作。
7. 用下方脚本打包，查看脚本输出的 contact-sheet.png，并预览各动作（在 LaunchPad 中或当前环境可用的动画预览工具中）。逐项确认角色一致、透明边缘干净、脚底不抖、方向正确和首尾自然。不能仅凭尺寸检查宣称视觉验收通过；未能查看动画时明确该项未验证。

## 校验与打包

脚本依赖 Python + Pillow。先发现当前环境的 Python；在 Codex 桌面有 load_workspace_dependencies 时使用它返回的 Python 路径。若未安装 Pillow，用用户现有图像工具完成等效校验或说明缺少依赖，不悄悄跳过校验。

```text
python <skill目录>/scripts/package_custom_pet.py --source <角色图片或动作目录> --output <新输出目录> --pet-id blue-whale --display-name 小鲸鱼 --fps 8
```

输出包含：
- <pet-id>/pet.json 与 animations/ 下的帧；
- <pet-id>.zip，可直接拖入应用；
- contact-sheet.png 与 qa.json，供质量检查，放在 ZIP 外。

脚本拒绝已存在的输出目录，不自动覆盖。校验失败时修复对应素材再重试。最多做两轮针对性生成修复；仍失败时交付明确标为未完成的素材和原因，不包装成已验收模型。

交付时展示预览，给出 ZIP 的可点击链接，列出已完成动作与静态/缺失动作限制，告诉用户：「拖入 ZIP → 切换动作预览 → 使用这个桌宠」。保留参考图和 QA 文件以便迭代。

旧版 Codex v2 图集只在用户明确要求该格式时使用 [旧图集契约](references/launchpad-v2-contract.md) 和 scripts/package_pet.py；已有合法图集可直接拖入，新的逐帧制作不依赖 hatch-pet。
