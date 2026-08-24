---
name: create-launchpad-pet
description: Create, validate, and install a Codex v2 animated desktop pet into LaunchPad's installation-level models directory. Use when a user asks for a new LaunchPad pet or wants existing character art converted to a LaunchPad pet; do not use for ordinary static avatars or unrelated image generation.
---

# Create LaunchPad Pet

Create a production-ready Codex v2 pet and place it directly in LaunchPad's `models` directory.

## Required generation workflow

1. Use the installed `$hatch-pet` skill for all image generation, animation rows, direction semantics, deterministic assembly, visual QA, and repair. Read that skill completely before acting.
2. Use `$imagegen` only through the route required by `$hatch-pet`; never draw or synthesize missing animation rows with ad-hoc code.
3. Keep the hatch-pet v2 acceptance gates intact. In particular, do not package an 8×9 intermediate atlas as a finished LaunchPad pet.
4. Read [references/launchpad-v2-contract.md](references/launchpad-v2-contract.md) before packaging.
5. If `$hatch-pet` is unavailable, stop and explain that it is required. Do not create a visually plausible but contract-invalid substitute.

When the user omits a name or style, infer a short friendly name and an appropriate pet-safe style. Ask only when a missing choice would materially change the character identity. Preserve supplied reference art and requested traits.

## LaunchPad destination

The output directory is always:

```text
<LaunchPad installation>/models/<pet-id>/
```

In the LaunchPad source repository, `<LaunchPad installation>` is the repository root. In an installed or portable build, it is the folder containing `LaunchPad.exe`. If the exact installed location cannot be discovered, ask the user to click **Open pet folder** in LaunchPad and provide or select that path.

Do not install into `.codex/pets`, Electron `userData/pets`, or an arbitrary custom model directory.

## Package the approved atlas

Only after every `$hatch-pet` v2 deterministic and visual QA gate passes, run:

```bash
"$PYTHON" "<this-skill>/scripts/package_pet.py" \
  --atlas "/absolute/path/to/spritesheet-extended.webp" \
  --pet-id "<lowercase-id>" \
  --display-name "<Display Name>" \
  --description "<one sentence>" \
  --models-dir "/absolute/path/to/LaunchPad/models"
```

Before running the script, call `load_workspace_dependencies` and use its exact Python path. The script requires Pillow and refuses non-v2 dimensions, missing transparency, unsafe IDs, and existing destinations.

Never overwrite an existing pet folder. If the ID already exists, choose a new ID with the user or ask the user to delete the old pet in LaunchPad first.

## Handoff

Report:

- installed pet folder
- `pet.json` path
- spritesheet path
- v2 dimensions and validation result
- the final contact sheet and direction QA paths retained by `$hatch-pet`

Tell the user to return to **Pet Workbench → Model Wardrobe** and choose the new pet. LaunchPad refreshes the model list when its window regains focus.

