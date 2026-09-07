"""Check each shipped retro GLB and its semantic runtime controls without Blender."""
import json
import math
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODELS = ROOT / "packages/ui/components/GamepadArtwork/models/retro"
DPAD = {4, 5, 6, 7}
SIMPLE = DPAD | {0, 8, 2, 3}
EXPECTED = {
    "nes": SIMPLE, "gb": SIMPLE, "gbc": SIMPLE,
    "gba": SIMPLE | {10, 11}, "snes": SIMPLE | {1, 9, 10, 11},
    "genesis": SIMPLE | {1, 9, 10, 11},
    "saturn": DPAD | {0, 8, 11, 1, 9, 10, 12, 13, 3},
    "arcade": SIMPLE | {1, 9, 10, 11},
    "n64": DPAD | {0, 1, 3, 10, 11, 12, 16, 17, 18, 19},
    "psx": set(range(16)), "psp": SIMPLE | {1, 9, 10, 11},
    "nds": SIMPLE | {1, 9, 10, 11},
    "gamecube": DPAD | {0, 8, 1, 9, 11, 12, 13, 3},
}
AXES = {"n64": {(0, 1)}, "psx": {(0, 1), (2, 3)}, "psp": {(0, 1)}, "gamecube": {(0, 1), (2, 3)}}


def validate(system):
    path = MODELS / f"{system}.glb"
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert (magic, version, length) == (b"glTF", 2, len(data)), f"{system}: invalid container"
    json_size, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    doc = json.loads(data[20:20 + json_size])
    names = [node.get("name") for node in doc["nodes"]]
    assert len(set(names)) == len(names), f"{system}: duplicate node names"
    found, axes = set(), set()
    for node in doc["nodes"]:
        extras = node.get("extras", {})
        control = extras.get("gamepadButtonIndex", extras.get("buttonIndex"))
        if control is not None:
            assert isinstance(control, int) and control >= 0
            assert node.get("children"), f"{system}: empty control pivot {node.get('name')}"
            found.add(control)
        if extras.get("controlRole") == "dpad":
            found.update(DPAD)
        if "axisIndices" in extras:
            axes.add(tuple(extras["axisIndices"]))
        for key in ("translation", "rotation", "scale", "matrix"):
            assert all(math.isfinite(value) for value in node.get(key, [])), f"{system}: invalid transform"
    assert EXPECTED[system] <= found, f"{system}: missing controls {EXPECTED[system] - found}"
    assert AXES.get(system, set()) <= axes, f"{system}: missing stick axes"
    assert all("uri" not in buffer for buffer in doc["buffers"]), f"{system}: external buffer"
    assert all("uri" not in image for image in doc.get("images", [])), f"{system}: external image"
    triangles = sum(doc["accessors"][primitive["indices"]]["count"] // 3
        for mesh in doc["meshes"] for primitive in mesh["primitives"])
    assert len(data) < 2_000_000, f"{system}: exceeds 2 MB"
    assert triangles < 80_000, f"{system}: exceeds 80,000 triangles"
    return {"system": system, "bytes": len(data), "triangles": triangles,
            "controls": sorted(found), "axes": sorted(axes)}


if __name__ == "__main__":
    print(json.dumps([validate(system) for system in EXPECTED], indent=2))
