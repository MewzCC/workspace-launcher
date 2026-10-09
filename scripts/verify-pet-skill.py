"""Exercise the distributed skill's packaging CLI with isolated image fixtures."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

from PIL import Image, ImageDraw

script = Path(__file__).resolve().parents[1] / "skills/create-launchpad-pet/scripts/package_custom_pet.py"


def run(source, output, success=True):
    result = subprocess.run([sys.executable, str(script), "--source", str(source), "--output", str(output),
                             "--pet-id", "fixture-pet", "--display-name", "测试桌宠"], capture_output=True, text=True, encoding="utf-8")
    assert (result.returncode == 0) == success, result.stderr
    return result


with tempfile.TemporaryDirectory(prefix="pet-skill-test-") as directory:
    root = Path(directory)
    source = root / "source"
    for action in ["idle", "walk_right", "drag"]:
        (source / action).mkdir(parents=True)
        for frame in [2, 10]:
            image = Image.new("RGBA", (192, 208), (0, 0, 0, 0))
            ImageDraw.Draw(image).ellipse((50 + frame, 50, 130, 185), fill=(60, 150, 230, 255))
            image.save(source / action / f"{frame}.png")
    output = root / "output"
    data = json.loads(run(source, output).stdout)
    assert data["actions"] == ["dragging", "idle", "walkRight"]
    assert not data["static"]
    with zipfile.ZipFile(data["zip"]) as archive:
        manifest = json.loads(archive.read("fixture-pet/pet.json"))
        assert manifest["animations"]["idle"]["frames"] == ["animations/idle/001.png", "animations/idle/002.png"]
        assert len(archive.namelist()) == 7
        assert not any("qa" in name or "contact" in name for name in archive.namelist())
    assert Image.open(data["contactSheet"]).width > 0
    assert json.loads(Path(data["qa"]).read_text(encoding="utf-8"))["visualReview"] == "required"
    run(source, output, False)
    static = json.loads(run(source / "idle/2.png", root / "static").stdout)
    assert static["static"]
    Image.new("RGB", (192, 208), "white").save(root / "opaque.png")
    run(root / "opaque.png", root / "invalid", False)
    assert not (root / "invalid").exists()
    Image.new("RGBA", (200, 208), (10, 20, 30, 255)).save(source / "idle/3.png")
    run(source, root / "mismatched", False)
    assert not (root / "mismatched").exists()
print("Skill CLI: ZIP structure, transparent-frame validation, natural ordering, contact sheet, static assets and no-overwrite passed")
