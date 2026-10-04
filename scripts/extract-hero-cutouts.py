"""Re-extract the six original hero sprites without repainting or resampling.

Requires the existing Python Pillow environment. --check is read-only;
--write replaces only the six derived WebP files and their manifest.
"""
import argparse
import hashlib
import json
from array import array
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets/units/heroes-v2"
NAMES = ["lisaya", "luolinfo", "eluxia", "moluo", "heka", "su"]
CUTOFF, FRINGE, PADDING, SPARK_GAP = 32, 2, 8, 24


def neighbours(p, width, size):
    x = p % width
    if x:
        yield p - 1
    if x + 1 < width:
        yield p + 1
    if p >= width:
        yield p - width
    if p + width < size:
        yield p + width


def extract():
    atlas = Image.open(ROOT / "characters.png").convert("RGBA")
    width, height = atlas.size
    size = width * height
    rgba = atlas.tobytes()
    alpha = atlas.getchannel("A").tobytes()
    mask = bytearray(a >= CUTOFF for a in alpha)
    components = []
    for start in range(size):
        if not mask[start]:
            continue
        mask[start] = 0
        queue, pixels = deque([start]), array("I")
        left, top, right, bottom = width, height, 0, 0
        while queue:
            p = queue.popleft()
            pixels.append(p)
            x, y = p % width, p // width
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x + 1), max(bottom, y + 1)
            for n in neighbours(p, width, size):
                if mask[n]:
                    mask[n] = 0
                    queue.append(n)
        components.append({"pixels": pixels, "box": [left, top, right, bottom]})
    primary = [c for c in components if len(c["pixels"]) >= 10_000]
    assert len(primary) == 6, "Atlas must contain exactly six separate full subjects"
    primary.sort(key=lambda c: (c["box"][1] >= height // 2, c["box"][0]))
    owners = bytearray(size)
    distances = bytearray([255]) * size
    queue = deque()
    for owner, component in enumerate(primary, 1):
        for p in component["pixels"]:
            owners[p], distances[p] = owner, 0
            queue.append(p)
    # Ownership comes from the complete subject, never an equal atlas cell.
    while queue:
        p = queue.popleft()
        if distances[p] >= SPARK_GAP:
            continue
        for n in neighbours(p, width, size):
            if distances[n] == 255:
                owners[n], distances[n] = owners[p], distances[p] + 1
                queue.append(n)
    foreground = bytearray(size)
    sparks = [[] for _ in primary]
    for component in components:
        if len(component["pixels"]) >= 10_000:
            owner = owners[component["pixels"][0]]
        else:
            closest = min(component["pixels"], key=lambda p: distances[p])
            owner = owners[closest] if distances[closest] <= SPARK_GAP else 0
            if owner:
                sparks[owner - 1].append(len(component["pixels"]))
        if owner:
            for p in component["pixels"]:
                foreground[p] = owner
    # Preserve the original partial-alpha edge pixels next to each silhouette.
    # Almost-transparent atlas noise farther away cannot expand a crop.
    distances = bytearray([255]) * size
    queue = deque()
    for p, owner in enumerate(foreground):
        if owner:
            distances[p] = 0
            queue.append(p)
    while queue:
        p = queue.popleft()
        if distances[p] >= FRINGE:
            continue
        for n in neighbours(p, width, size):
            if distances[n] == 255:
                distances[n] = distances[p] + 1
                foreground[n] = foreground[p]
                queue.append(n)
    outputs, metadata = {}, {}
    for owner, name in enumerate(NAMES, 1):
        selected = [p for p in range(size) if foreground[p] == owner and alpha[p]]
        left, top = min(p % width for p in selected), min(p // width for p in selected)
        right, bottom = max(p % width for p in selected) + 1, max(p // width for p in selected) + 1
        w, h = right - left + PADDING * 2, bottom - top + PADDING * 2
        pixels = bytearray(w * h * 4)
        for p in selected:
            target = ((p // width - top + PADDING) * w + p % width - left + PADDING) * 4
            pixels[target:target + 4] = rgba[p * 4:p * 4 + 4]
        outputs[name] = Image.frombytes("RGBA", (w, h), bytes(pixels))
        metadata[name] = {"sourceBox": [left, top, right, bottom], "size": [w, h],
                          "contentBox": [PADDING, PADDING, w - PADDING, h - PADDING],
                          "retainedPixels": len(selected), "mainAlphaBox": primary[owner - 1]["box"],
                          "authoredSparkComponents": sparks[owner - 1]}
    return outputs, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    assert not (args.write and args.check), "Choose --write or --check"
    outputs, metadata = extract()
    if args.write:
        for name, image in outputs.items():
            image.save(ROOT / f"{name}.webp", "WEBP", lossless=True, quality=100, method=6, exact=True)
        manifest_path = ROOT / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf8"))
        manifest["derivation"] = "Full-atlas alpha components, original nearby sparks, 2px original antialias fringe, 8px transparent padding, lossless WebP. No repaint, resampling or retained-pixel recoloring."
        manifest["extraction"] = {"script": "scripts/extract-hero-cutouts.py", "alphaCutoff": CUTOFF,
                                  "antialiasFringe": FRINGE, "transparentPadding": PADDING,
                                  "atlasSha256": hashlib.sha256((ROOT / "characters.png").read_bytes()).hexdigest(),
                                  "sprites": metadata}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    # Exact RGBA comparison proves all kept source pixels and alpha survived export.
    for name, expected in outputs.items():
        actual = Image.open(ROOT / f"{name}.webp").convert("RGBA")
        assert actual.size == expected.size and actual.tobytes() == expected.tobytes(), name
        assert actual.getchannel("A").getbbox() == tuple(metadata[name]["contentBox"]), name
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf8"))
    assert manifest["extraction"]["sprites"] == metadata
    assert manifest["extraction"]["atlasSha256"] == hashlib.sha256((ROOT / "characters.png").read_bytes()).hexdigest()
    print(json.dumps({"pass": True, "originalPixelsPreserved": True, "sprites": metadata}))


if __name__ == "__main__":
    main()
