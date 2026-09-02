# LaunchPad Codex v2 contract

Use this reference only during final validation and packaging.

## Required package

```text
models/
  <pet-id>/
    pet.json
    spritesheet.webp  # PNG is also accepted
```

`pet.json` must contain:

```json
{
  "id": "example-pet",
  "displayName": "Example Pet",
  "description": "A short description.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

The ID uses 1–64 lowercase letters, numbers, hyphens, or underscores. The spritesheet filename must be local to the same pet folder.

## Atlas geometry

- exact size: `1536×2288`
- cell size: `192×208`
- grid: 8 columns × 11 rows
- transparent PNG or WebP
- used cells must be non-empty; unused cells remain transparent

Rows `0–8` are the nine standard animations:

| Row | State |
|---:|---|
| 0 | idle |
| 1 | running-right |
| 2 | running-left |
| 3 | waving |
| 4 | jumping |
| 5 | failed |
| 6 | waiting |
| 7 | running / working |
| 8 | review |

Rows `9–10` are the 16 clockwise look directions:

- row 9: `000`, `022.5`, `045`, `067.5`, `090`, `112.5`, `135`, `157.5`
- row 10: `180`, `202.5`, `225`, `247.5`, `270`, `292.5`, `315`, `337.5`

`000` is up, `090` is screen-right, `180` is down, and `270` is screen-left. Cardinal directions must be unmistakable at normal pet size. The two rows must form one continuous identity-preserving direction loop.

## Acceptance boundary

Packaging is allowed only when the `$hatch-pet` workflow has produced and passed:

- v2 atlas validation
- chroma despill validation
- standard contact sheet and motion previews
- focused 16-direction QA sheet
- per-direction semantic verdicts with no failures
- blind cardinal validation
- adjacent direction continuity review

Do not relax those gates to make an atlas importable. LaunchPad validating dimensions is not a substitute for visual and semantic QA.

