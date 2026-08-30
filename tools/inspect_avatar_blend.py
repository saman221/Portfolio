"""Run inside Blender to validate the editable avatar source."""

import json

import bpy


required_bones = {
    "Root", "Spine", "Chest", "Neck", "Head",
    "Shoulder.L", "UpperArm.L", "Forearm.L", "Hand.L",
    "Shoulder.R", "UpperArm.R", "Forearm.R", "Hand.R",
}
required_morphs = {"BlinkLeft", "BlinkRight", "Smile", "MouthOpen"}

armature = bpy.data.objects.get("SamanAvatarRig")
head = bpy.data.objects.get("Head")
assert armature and armature.type == "ARMATURE", "Missing SamanAvatarRig"
assert head and head.type == "MESH", "Missing Head mesh"

bone_names = set(armature.data.bones.keys())
morph_names = set(head.data.shape_keys.key_blocks.keys()) - {"Basis"}
action_names = set(bpy.data.actions.keys())
assert required_bones.issubset(bone_names), required_bones - bone_names
assert required_morphs == morph_names, morph_names
assert {"Idle", "Intro"}.issubset(action_names), action_names

triangle_count = 0
unweighted_meshes = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or obj.name == "DisplayPedestal":
        continue
    triangle_count += sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)
    if obj.name not in {"DisplayPedestal"} and not obj.vertex_groups:
        unweighted_meshes.append(obj.name)

assert triangle_count < 100_000, triangle_count
assert not unweighted_meshes, f"Meshes without deformation weights: {unweighted_meshes}"

image_paths = [image.filepath for image in bpy.data.images if image.filepath]
assert not any("codex-clipboard" in path or "AppData\\Local\\Temp" in path for path in image_paths), image_paths

print(json.dumps({
    "triangles": triangle_count,
    "bones": sorted(required_bones),
    "actions": sorted(action_names),
    "morphTargets": sorted(morph_names),
    "unweightedMeshes": unweighted_meshes,
    "imagePaths": image_paths,
}, indent=2))
