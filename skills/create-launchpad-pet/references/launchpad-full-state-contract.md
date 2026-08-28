# LaunchPad Full State 22 packaging checklist

Use this checklist only after visual generation and QA are complete. The normative rules live in `models/PET_MODEL_STANDARD.md`.

## Required package

```text
models/<pet-id>/
  pet.json
  spritesheet.png|webp
```

The atlas is exactly `1536×4576`, arranged as 8 columns × 22 rows of `192×208`, with all 176 cells populated and transparent outside the sprite.

`pet.json` must declare:

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

The manifest must contain exactly the fixed 22 animation IDs, rows, timing definitions, and required semantic adapter bindings from the model standard. All asset paths remain inside the model directory.

## Required evidence

- deterministic atlas geometry and alpha validation;
- every used cell nonempty and clear of cell edges;
- identity and state semantics reviewed across all 22 rows;
- row motion previews reviewed for scale, baseline, cadence, and continuity;
- 16 look directions pass cardinal and ordered-loop review;
- interaction family reads continuously as picked-up → drag → falling → landing;
- emotion family clearly distinguishes happy, angry, and sad;
- Python strict package validation passes;
- LaunchPad runtime package validation passes.

Codex v2 (`1536×2288`) may be retained as a compatibility artifact, but it is not a valid Full State 22 production package.
