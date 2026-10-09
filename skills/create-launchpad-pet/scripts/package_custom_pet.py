#!/usr/bin/env python3
"""Validate transparent frame assets and create an importable LaunchPad pet ZIP."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ALIASES = {
    "idle": "idle", "blink": "blink", "walk_right": "walkRight", "walkright": "walkRight",
    "walk_left": "walkLeft", "walkleft": "walkLeft", "wave": "wave", "happy": "wave",
    "jump": "jump", "angry": "failed", "failed": "failed", "waiting": "waiting",
    "sleep": "sleep", "working": "working", "review": "review", "drag": "dragging",
    "dragging": "dragging", "touch_head": "touchHead", "touchhead": "touchHead",
    "sit_down": "sitDown", "sitdown": "sitDown",
}


def natural(value):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(value))]


def images(folder):
    return sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in {".png", ".webp"}), key=natural)


def collect(source):
    if source.is_file():
        if source.suffix.lower() not in {".png", ".webp"}:
            raise ValueError("Single-image input must be PNG or WebP")
        return {"idle": [source]}
    if (source / "frames").is_dir():
        source = source / "frames"
    actions = {}
    for folder in source.iterdir():
        action = ALIASES.get(folder.name.lower()) if folder.is_dir() else None
        if action and images(folder):
            if action in actions:
                raise ValueError(f"Duplicate action: {action}")
            actions[action] = images(folder)
    if not actions:
        actions = {"idle": images(source)}
    if not actions.get("idle"):
        raise ValueError("Missing idle frames")
    return actions


def package(args):
    source, output = args.source.resolve(), args.output.resolve()
    if not source.exists() or source.is_symlink():
        raise ValueError("Source is missing or is a symlink")
    if output.exists():
        raise ValueError("Output already exists; choose a new output directory")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,47}", args.pet_id):
        raise ValueError("pet-id must be 1–48 lowercase ASCII letters, digits, underscores or hyphens")
    if not args.display_name.strip() or len(args.display_name.strip()) > 80:
        raise ValueError("display-name must contain 1–80 characters")
    if not 1 <= args.fps <= 30:
        raise ValueError("FPS must be 1–30")
    actions = collect(source)
    if sum(map(len, actions.values())) > 600 or any(len(v) > 120 for v in actions.values()):
        raise ValueError("Maximum 120 frames per action, 600 total")
    total = sum(p.stat().st_size for frames in actions.values() for p in frames)
    if total > 128 * 1024 * 1024:
        raise ValueError("Maximum total asset size is 128 MB")
    manifest = {"schemaVersion": 1, "renderer": "sequence", "id": args.pet_id,
                "displayName": args.display_name.strip(), "description": args.description[:240], "animations": {}}
    canvas = None
    qa = {"static": len(actions["idle"]) == 1, "actions": {}, "visualReview": "required"}
    thumbnails = []
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".pet-package-", dir=output.parent) as temp:
        stage = Path(temp)
        model = stage / args.pet_id
        for action, frames in actions.items():
            paths, bounds = [], []
            for index, frame in enumerate(frames):
                if frame.is_symlink() or frame.stat().st_size > 16 * 1024 * 1024:
                    raise ValueError(f"Invalid/oversized frame: {frame}")
                with Image.open(frame) as image:
                    image.load()
                    if image.format not in {"PNG", "WEBP"}:
                        raise ValueError(f"Invalid image format: {frame}")
                    if max(image.size) > 4096 or not 0.5 <= image.height / image.width <= 2:
                        raise ValueError(f"Invalid canvas dimensions: {frame}")
                    if canvas is None:
                        canvas = image.size
                    if image.size != canvas:
                        raise ValueError(f"Canvas size mismatch: {frame}; expected {canvas}")
                    rgba = image.convert("RGBA")
                    alpha = rgba.getchannel("A")
                    if alpha.getextrema()[0] != 0 or not alpha.getbbox():
                        raise ValueError(f"Frame needs transparent background and visible content: {frame}")
                    bounds.append(alpha.getbbox())
                    if index < 12:
                        rgba.thumbnail((96, 104))
                        thumbnails.append((f"{action} {index + 1}", rgba.copy()))
                relative = f"animations/{action}/{index + 1:03d}{frame.suffix.lower()}"
                target = model / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(frame, target)
                paths.append(relative)
            manifest["animations"][action] = {"frames": paths, "fps": args.fps, "loop": True}
            qa["actions"][action] = {"frames": len(frames), "bounds": bounds,
                                     "bottomRange": max(b[3] for b in bounds) - min(b[3] for b in bounds)}
        manifest["canvas"] = {"width": canvas[0], "height": canvas[1]}
        (model / "pet.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        qa["canvas"] = manifest["canvas"]
        (stage / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
        cols = min(8, len(thumbnails))
        sheet = Image.new("RGB", (cols * 120, ((len(thumbnails) + cols - 1) // cols) * 138), "#e2e5eb")
        draw = ImageDraw.Draw(sheet)
        for index, (label, thumb) in enumerate(thumbnails):
            x, y = (index % cols) * 120, (index // cols) * 138
            sheet.paste(thumb, (x + (120 - thumb.width) // 2, y + 8), thumb)
            draw.text((x + 4, y + 116), label, fill="#252a3c")
        sheet.save(stage / "contact-sheet.png")
        with zipfile.ZipFile(stage / f"{args.pet_id}.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            for file in model.rglob("*"):
                if file.is_file():
                    archive.write(file, file.relative_to(stage).as_posix())
        # A new output directory is created only after all validation succeeds.
        stage.rename(output)
    return {"zip": str(output / f"{args.pet_id}.zip"), "contactSheet": str(output / "contact-sheet.png"),
            "qa": str(output / "qa.json"), "actions": list(actions), "static": qa["static"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pet-id", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--fps", type=int, default=8)
    args = parser.parse_args()
    try:
        print(json.dumps(package(args), ensure_ascii=False, indent=2))
    except (ValueError, OSError, Image.DecompressionBombError) as error:
        parser.exit(1, f"Validation failed: {error}\n")


if __name__ == "__main__":
    main()
