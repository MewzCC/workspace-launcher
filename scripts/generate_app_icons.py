"""Generate LaunchPad PNG/ICO assets from a square raster icon source."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


ICON_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def crop_to_artwork(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, (255, 255, 255))
    difference = ImageChops.difference(rgb, background).convert("L")
    difference = difference.point(lambda value: 255 if value > 8 else 0)
    bbox = difference.getbbox()
    if not bbox:
        raise ValueError("No artwork was detected in the source image")

    left, top, right, bottom = bbox
    padding = max(6, round(max(right - left, bottom - top) * 0.008))
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)

    width, height = right - left, bottom - top
    side = max(width, height)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    square = (
        round(center_x - side / 2),
        round(center_y - side / 2),
        round(center_x + side / 2),
        round(center_y + side / 2),
    )
    cropped = image.convert("RGBA").crop(square)

    # Keep only the rounded app tile; transparent corners prevent a white square
    # around the icon in Windows Explorer, the taskbar and the system tray.
    radius = round(side * 0.205)
    inset = max(2, round(side * 0.006))
    rounded_mask = Image.new("L", cropped.size, 0)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(rounded_mask)
    draw.rounded_rectangle(
        (inset, inset, side - inset - 1, side - inset - 1),
        radius=radius,
        fill=255,
    )
    mask = rounded_mask.filter(ImageFilter.GaussianBlur(max(1, side * 0.0012)))
    cropped.putalpha(mask)
    return cropped


def save_assets(source: Path, build_dir: Path, renderer_dir: Path, public_dir: Path) -> None:
    image = Image.open(source)
    cropped = crop_to_artwork(image)
    master = ImageOps.fit(cropped, (1024, 1024), method=Image.Resampling.LANCZOS)

    build_dir.mkdir(parents=True, exist_ok=True)
    renderer_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)

    master.save(build_dir / "icon.png", optimize=True)
    renderer_icon = master.resize((256, 256), Image.Resampling.LANCZOS)
    renderer_icon.save(renderer_dir / "launchpad-icon.png", optimize=True)
    renderer_icon.save(public_dir / "app-icon.png", optimize=True)
    master.resize((32, 32), Image.Resampling.LANCZOS).save(
        build_dir / "tray-icon.png", optimize=True
    )
    master.save(build_dir / "icon.ico", sizes=[(size, size) for size in ICON_SIZES])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--build-dir", type=Path, default=Path("build"))
    parser.add_argument("--renderer-dir", type=Path, default=Path("src/assets"))
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()
    save_assets(args.source, args.build_dir, args.renderer_dir, args.public_dir)


if __name__ == "__main__":
    main()
