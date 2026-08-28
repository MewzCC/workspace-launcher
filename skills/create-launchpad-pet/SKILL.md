---
name: create-launchpad-pet
description: Create, validate, and install a zero-code LaunchPad full-state-22 animated desktop pet from one character image or existing pet art. Use for new LaunchPad pets, converting character art into a directly importable model, or validating a LaunchPad model package; do not use for static avatars or Codex-only v1/v2 packaging.
---

# Create LaunchPad Pet

Create a self-contained `workspace-launcher-pet/full-state-22@1` model under LaunchPad's `models` directory. The finished model must import and run without changes to React, Electron, the renderer, or the existing emotion state machine.

## Read before acting

Read these project contracts completely:

1. `../../models/PET_MODEL_STANDARD.md` — runtime/import contract and fixed 22-state table.
2. `../../models/AI_PET_GENERATION_RULES.md` — single-image generation, repair, and visual acceptance rules.
3. [references/launchpad-full-state-contract.md](references/launchpad-full-state-contract.md) — packaging checklist and command.

Use the installed `$hatch-pet` skill for canonical identity generation, the first 11 rows, look-direction mechanics, deterministic frame extraction, and visual QA. Use `$imagegen` only through the route required by `$hatch-pet`.

## Full-state extension

Codex v2 is an intermediate source only. After rows 0–10 pass Hatch Pet QA, generate the additional complete 8-frame rows 11–21 from the same canonical identity reference:

`picked-up`, `dragging-left`, `dragging-right`, `drag-hold`, `falling`, `landing`, `sleep`, `wake-up`, `happy`, `angry`, `sad`.

Each generated row must attach the canonical reference and a matching eight-slot layout guide. Keep one coherent action family per row. Do not synthesize missing visual content with ad-hoc drawing code and do not mix independently generated repair cells into a row.

Prefer approved existing art. Correct crop, registration, scale, baseline, and transparency deterministically. Regenerate only a complete state row whose source visual fails identity or action semantics and cannot be corrected deterministically.

## Adapter boundary

Preserve LaunchPad's existing emotion state machine. Express every model-specific mapping in `pet.json` through animation semantics and `semantics.bindings`; do not add character-specific branches to runtime source files. An explanatory adapter JSON may accompany QA artifacts but is not the runtime authority.

## Package and validate

Before running the helper, call `load_workspace_dependencies` and use its exact Python executable:

```powershell
& $PYTHON "<this-skill>/scripts/package_pet.py" `
  --atlas "<absolute-path>/spritesheet-extended.webp" `
  --pet-id "<lowercase-id>" `
  --display-name "<Display Name>" `
  --description "<one sentence>" `
  --models-dir "<LaunchPad>/models"
```

The helper refuses incorrect geometry, missing alpha, empty or edge-touching cells, opaque chroma, invalid IDs, incomplete adapter bindings, and existing destinations. It reports hidden RGB separately because lossless WebP decoders may reconstruct RGB beneath alpha zero; the pre-encode RGBA source should still clear it. The helper creates the standard V3 `pet.json` from the canonical template and copies the atlas.

Validate an existing model without changing it:

```powershell
& $PYTHON "<this-skill>/scripts/package_pet.py" --validate-package "<LaunchPad>/models/<pet-id>"
```

Also run LaunchPad's runtime compatibility gate from the repository root:

```powershell
npm run verify:pet-package -- "models/<pet-id>"
```

Only report “directly importable” when both checks pass and final contact-sheet review has no hard visual failure. Never overwrite an existing model directory.

## Handoff

Report the model directory, `pet.json`, atlas, standard identifier, 22-state/176-frame result, strict validation output, contact sheet, and direction QA. Tell the user they can select the folder or `pet.json` in LaunchPad and use it immediately.
