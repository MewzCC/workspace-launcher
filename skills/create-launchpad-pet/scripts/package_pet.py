#!/usr/bin/env python3
"""Validate and install one approved Codex v2 atlas into LaunchPad/models."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image


PET_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
V2_SIZE = (1536, 2288)


def default_models_dir() -> Path:
    # <installation>/skills/create-launchpad-pet/scripts/package_pet.py
    return Path(__file__).resolve().parents[3] / "models"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", required=True, type=Path)
    parser.add_argument("--pet-id", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--models-dir", type=Path, default=default_models_dir())
    return parser.parse_args()


def validate_atlas(atlas: Path) -> tuple[str, tuple[int, int]]:
    atlas = atlas.resolve()
    if not atlas.is_file() or atlas.suffix.lower() not in {".png", ".webp"}:
        raise ValueError("atlas must be an existing PNG or WebP file")
    with Image.open(atlas) as image:
        image.load()
        if image.size != V2_SIZE:
            raise ValueError(f"Codex v2 atlas must be {V2_SIZE[0]}x{V2_SIZE[1]}; received {image.width}x{image.height}")
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        if not has_alpha:
            raise ValueError("Codex v2 atlas must contain an alpha channel")
        return image.format or atlas.suffix[1:].upper(), image.size


def main() -> int:
    args = parse_args()
    pet_id = args.pet_id.strip().lower()
    display_name = args.display_name.strip()
    if not PET_ID_RE.fullmatch(pet_id):
        raise ValueError("pet-id must use 1-64 lowercase letters, numbers, hyphens, or underscores")
    if not display_name or len(display_name) > 80:
        raise ValueError("display-name must contain 1-80 characters")

    atlas = args.atlas.resolve()
    image_format, size = validate_atlas(atlas)
    models_dir = args.models_dir.resolve()
    models_dir.mkdir(parents=True, exist_ok=True)
    destination = models_dir / pet_id
    if destination.exists():
        raise FileExistsError(f"pet already exists: {destination}")

    destination.mkdir()
    sprite_name = f"spritesheet{atlas.suffix.lower()}"
    try:
        shutil.copy2(atlas, destination / sprite_name)
        manifest = {
            "id": pet_id,
            "displayName": display_name,
            "description": args.description.strip()[:240],
            "spriteVersionNumber": 2,
            "spritesheetPath": sprite_name,
        }
        (destination / "pet.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise

    print(json.dumps({
        "ok": True,
        "petDirectory": str(destination),
        "manifest": str(destination / "pet.json"),
        "spritesheet": str(destination / sprite_name),
        "format": image_format,
        "size": list(size),
        "spriteVersionNumber": 2,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)

