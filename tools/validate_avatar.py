"""Validate the generated GLB using only the Python standard library."""

from __future__ import annotations

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "assets" / "models" / "saman-avatar.glb"
MAX_TRIANGLES = 100_000
MAX_BYTES = 8 * 1024 * 1024
MAX_TEXTURE_EDGE = 2048
EXPECTED_ANIMATIONS = {"Idle", "Intro"}
EXPECTED_MORPHS = {"BlinkLeft", "BlinkRight", "Smile", "MouthOpen"}
EXPECTED_BONES = {
    "Root",
    "Spine",
    "Chest",
    "Neck",
    "Head",
    "Shoulder.L",
    "UpperArm.L",
    "Forearm.L",
    "Hand.L",
    "Shoulder.R",
    "UpperArm.R",
    "Forearm.R",
    "Hand.R",
}


def read_glb(path: Path):
    raw = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF", f"Unexpected magic: {magic!r}"
    assert version == 2, f"Expected glTF 2, found {version}"
    assert declared_length == len(raw), "Declared GLB length does not match file size"

    offset = 12
    chunks = {}
    while offset < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunks[chunk_type] = raw[offset : offset + chunk_length]
        offset += chunk_length

    json_chunk = chunks[0x4E4F534A].rstrip(b" \t\r\n\x00")
    document = json.loads(json_chunk.decode("utf-8"))
    return document, chunks.get(0x004E4942, b""), len(raw)


def png_dimensions(payload: bytes):
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", payload[16:24])
    return None


def main() -> None:
    assert MODEL_PATH.exists(), f"Missing model: {MODEL_PATH}"
    document, binary, file_size = read_glb(MODEL_PATH)
    assert document["asset"]["version"] == "2.0"
    assert file_size < MAX_BYTES, f"GLB exceeds {MAX_BYTES} bytes"

    accessors = document.get("accessors", [])
    triangle_count = 0
    morph_names = set()
    for mesh in document.get("meshes", []):
        target_names = mesh.get("extras", {}).get("targetNames", [])
        morph_names.update(target_names)
        for primitive in mesh.get("primitives", []):
            assert primitive.get("mode", 4) == 4, "Only triangle primitives are expected"
            accessor_index = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
            if accessor_index is not None:
                triangle_count += accessors[accessor_index]["count"] // 3

    animation_names = {animation.get("name") for animation in document.get("animations", [])}
    node_names = {node.get("name") for node in document.get("nodes", [])}
    assert animation_names == EXPECTED_ANIMATIONS, f"Animations: {sorted(animation_names)}"
    assert EXPECTED_MORPHS.issubset(morph_names), f"Morph targets: {sorted(morph_names)}"
    assert EXPECTED_BONES.issubset(node_names), f"Missing bones: {sorted(EXPECTED_BONES - node_names)}"
    assert document.get("skins"), "No skin found in GLB"
    assert 0 < triangle_count < MAX_TRIANGLES, f"Triangle count: {triangle_count}"

    image_dimensions = []
    for image in document.get("images", []):
        if "bufferView" not in image:
            continue
        view = document["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        dimensions = png_dimensions(binary[start:end])
        if dimensions:
            assert max(dimensions) <= MAX_TEXTURE_EDGE, f"Texture too large: {dimensions}"
            image_dimensions.append(dimensions)

    external_uris = [
        item["uri"]
        for group in (document.get("buffers", []), document.get("images", []))
        for item in group
        if "uri" in item
    ]
    assert not external_uris, f"GLB has external dependencies: {external_uris}"

    summary = {
        "file": str(MODEL_PATH),
        "bytes": file_size,
        "triangles": triangle_count,
        "skins": len(document.get("skins", [])),
        "animations": sorted(animation_names),
        "morphTargets": sorted(EXPECTED_MORPHS),
        "textureDimensions": sorted(set(image_dimensions)),
        "externalUris": external_uris,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
