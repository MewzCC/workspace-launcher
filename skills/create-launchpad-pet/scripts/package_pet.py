#!/usr/bin/env python3
"""Validate or install one LaunchPad full-state-22 desktop pet package."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image


PET_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
CELL = (192, 208)
COLUMNS = 8
ROWS = 22
ATLAS_SIZE = (CELL[0] * COLUMNS, CELL[1] * ROWS)
STANDARD = {"name": "workspace-launcher-pet", "version": 1, "profile": "full-state-22"}
STATES = [
    ("idle", 0, 6, "loop"), ("running-right", 1, 10, "loop"), ("running-left", 2, 10, "loop"),
    ("waving", 3, 8, "once"), ("jumping", 4, 10, "once"), ("failed", 5, 6, "once"),
    ("waiting", 6, 5, "loop"), ("running", 7, 8, "loop"), ("review", 8, 6, "loop"),
    ("look-row-9", 9, 8, "loop"), ("look-row-10", 10, 8, "loop"),
    ("picked-up", 11, 8, "once"), ("dragging-left", 12, 10, "loop"),
    ("dragging-right", 13, 10, "loop"), ("drag-hold", 14, 6, "loop"),
    ("falling", 15, 10, "once"), ("landing", 16, 10, "once"), ("sleep", 17, 4, "loop"),
    ("wake-up", 18, 8, "once"), ("happy", 19, 8, "once"), ("angry", 20, 8, "once"),
    ("sad", 21, 6, "once"),
]
REQUIRED_BINDINGS = {
    "idle": "idle", "move.walk.right": "running-right", "move.walk.left": "running-left",
    "greet": "waving", "touch.head": "waving", "react.excited": "jumping", "error": "failed",
    "rest.sit": "waiting", "wait.user": "waiting", "focus.working": "running", "study.review": "review",
    "emotion.focused": "review", "emotion.curious": "look-row-9", "interaction.lift": "picked-up",
    "interaction.drag.left": "dragging-left", "interaction.drag.right": "dragging-right",
    "interaction.drag": "drag-hold", "interaction.release": "falling", "interaction.land": "landing",
    "rest.sleep": "sleep", "emotion.sleepy": "sleep", "rest.wake": "wake-up",
    "react.happy": "happy", "emotion.happy": "happy", "react.angry": "angry",
    "react.annoyed": "angry", "emotion.angry": "angry", "react.sad": "sad",
    "react.concerned": "sad", "emotion.sad": "sad",
}


def repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_models_dir() -> Path:
    return repository_root() / "models"


def template_path() -> Path:
    return repository_root() / "models" / "PET_MODEL_FULL_STATE_TEMPLATE.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--atlas", type=Path, help="approved 1536x4576 PNG or WebP atlas to install")
    mode.add_argument("--validate-package", type=Path, help="existing model directory or pet.json")
    parser.add_argument("--pet-id")
    parser.add_argument("--display-name")
    parser.add_argument("--description", default="")
    parser.add_argument("--models-dir", type=Path, default=default_models_dir())
    parser.add_argument("--json-out", type=Path)
    return parser.parse_args()


def alpha_bbox(alpha: Image.Image) -> tuple[int, int, int, int] | None:
    return alpha.point(lambda value: 255 if value > 16 else 0).getbbox()


def inspect_atlas(atlas: Path) -> dict[str, object]:
    atlas = atlas.resolve()
    if not atlas.is_file() or atlas.suffix.lower() not in {".png", ".webp"}:
        raise ValueError("atlas must be an existing PNG or WebP file")
    with Image.open(atlas) as opened:
        opened.load()
        image_format = opened.format or atlas.suffix[1:].upper()
        if opened.size != ATLAS_SIZE:
            raise ValueError(f"full-state atlas must be {ATLAS_SIZE[0]}x{ATLAS_SIZE[1]}; received {opened.width}x{opened.height}")
        if "A" not in opened.getbands() and "transparency" not in opened.info:
            raise ValueError("atlas must contain transparency")
        image = opened.convert("RGBA")

    empty_cells: list[list[int]] = []
    edge_cells: list[list[int]] = []
    opaque_chroma_pixels = 0
    hidden_rgb_pixels = 0
    for row in range(ROWS):
        for column in range(COLUMNS):
            cell = image.crop((column * CELL[0], row * CELL[1], (column + 1) * CELL[0], (row + 1) * CELL[1]))
            bbox = alpha_bbox(cell.getchannel("A"))
            if bbox is None:
                empty_cells.append([row, column])
                continue
            if bbox[0] == 0 or bbox[1] == 0 or bbox[2] == CELL[0] or bbox[3] == CELL[1]:
                edge_cells.append([row, column])
            for red, green, blue, opacity in cell.get_flattened_data():
                if opacity > 16 and abs(red) <= 8 and abs(green - 255) <= 8 and abs(blue) <= 8:
                    opaque_chroma_pixels += 1
                if opacity == 0 and (red or green or blue):
                    hidden_rgb_pixels += 1

    errors = []
    if empty_cells:
        errors.append(f"empty used cells: {empty_cells}")
    if edge_cells:
        errors.append(f"alpha touches cell edges: {edge_cells}")
    if opaque_chroma_pixels:
        errors.append(f"opaque green chroma pixels: {opaque_chroma_pixels}")
    if hidden_rgb_pixels and atlas.suffix.lower() == ".png":
        errors.append(f"hidden RGB under transparent pixels: {hidden_rgb_pixels}")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "format": image_format, "size": list(image.size), "cells": COLUMNS * ROWS,
        "emptyCells": empty_cells, "edgeCells": edge_cells,
        "opaqueChromaPixels": opaque_chroma_pixels, "hiddenRgbPixels": hidden_rgb_pixels,
        "warnings": (["decoded WebP contains RGB under transparent pixels; verify the pre-encode RGBA source was cleared"] if hidden_rgb_pixels and atlas.suffix.lower() == ".webp" else []),
    }


def manifest_path(target: Path) -> Path:
    target = target.resolve()
    if target.is_dir():
        target = target / "pet.json"
    if not target.is_file() or target.name.lower() != "pet.json":
        raise ValueError("validate-package must point to a model directory or pet.json")
    return target


def validate_manifest(raw: dict[str, object], directory: Path) -> tuple[Path, dict[str, object]]:
    if raw.get("schemaVersion") != 3:
        raise ValueError("schemaVersion must be 3")
    if raw.get("modelStandard") != STANDARD:
        raise ValueError("modelStandard must be workspace-launcher-pet/full-state-22@1")
    pet_id = str(raw.get("id", ""))
    if not PET_ID_RE.fullmatch(pet_id):
        raise ValueError("invalid model id")
    animations = raw.get("render", {}).get("animations", {})
    if set(animations) != {item[0] for item in STATES}:
        raise ValueError("render.animations must contain exactly the 22 standard state IDs")
    atlas_name = None
    for state_id, row, fps, playback in STATES:
        clip = animations[state_id]
        source = clip.get("source", {})
        expected_source = {"type": "atlas", "columns": 8, "rows": 22, "cellWidth": 192, "cellHeight": 208, "row": row, "startColumn": 0, "frameCount": 8}
        for key, expected in expected_source.items():
            if source.get(key) != expected:
                raise ValueError(f"{state_id}.source.{key} must be {expected!r}")
        if atlas_name is None:
            atlas_name = source.get("asset")
        elif source.get("asset") != atlas_name:
            raise ValueError("all clips must share one atlas asset")
        if clip.get("timing", {}).get("fps") != fps or clip.get("timing", {}).get("playback") != playback:
            raise ValueError(f"invalid timing for {state_id}")
    if not isinstance(atlas_name, str) or Path(atlas_name).name != atlas_name:
        raise ValueError("atlas asset must be a local filename")
    bindings = raw.get("semantics", {}).get("bindings", {})
    for intent, state_id in REQUIRED_BINDINGS.items():
        values = bindings.get(intent, [])
        values = values if isinstance(values, list) else [values]
        if state_id not in values:
            raise ValueError(f"semantics.bindings.{intent} must include {state_id}")
    atlas = directory / atlas_name
    return atlas, inspect_atlas(atlas)


def validate_package(target: Path) -> dict[str, object]:
    manifest = manifest_path(target)
    raw = json.loads(manifest.read_text(encoding="utf-8"))
    atlas, atlas_report = validate_manifest(raw, manifest.parent)
    return {
        "ok": True, "standard": "workspace-launcher-pet/full-state-22@1",
        "petDirectory": str(manifest.parent), "manifest": str(manifest),
        "spritesheet": str(atlas), "id": raw["id"], "animations": 22, "atlas": atlas_report,
    }


def package_pet(args: argparse.Namespace) -> dict[str, object]:
    pet_id = str(args.pet_id or "").strip().lower()
    display_name = str(args.display_name or "").strip()
    if not PET_ID_RE.fullmatch(pet_id):
        raise ValueError("pet-id must use 1-64 lowercase letters, numbers, hyphens, or underscores")
    if not display_name or len(display_name) > 80:
        raise ValueError("display-name must contain 1-80 characters")
    inspect_atlas(args.atlas)
    models_dir = args.models_dir.resolve()
    models_dir.mkdir(parents=True, exist_ok=True)
    destination = models_dir / pet_id
    if destination.exists():
        raise FileExistsError(f"pet already exists: {destination}")
    destination.mkdir()
    sprite_name = f"spritesheet{args.atlas.suffix.lower()}"
    try:
        shutil.copy2(args.atlas.resolve(), destination / sprite_name)
        manifest = json.loads(template_path().read_text(encoding="utf-8"))
        manifest["id"] = pet_id
        manifest["displayName"] = display_name
        manifest["description"] = args.description.strip()[:500]
        for clip in manifest["render"]["animations"].values():
            clip["source"]["asset"] = sprite_name
        (destination / "pet.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return validate_package(destination)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise


def main() -> int:
    args = parse_args()
    result = validate_package(args.validate_package) if args.validate_package else package_pet(args)
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(output + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1)
