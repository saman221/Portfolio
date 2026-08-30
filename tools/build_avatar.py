"""Build the local, web-ready Saman avatar in Blender.

The script intentionally uses only procedural geometry and locally generated
textures. Reference photographs are inspected by the artist but are never read,
copied, packed into the .blend file, or sent over the network.
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "assets" / "models"
PICTURE_DIR = ROOT / "assets" / "pictures"
DELIVERY_DIR = ROOT / "deliverables" / "saman-avatar"
TEXTURE_DIR = DELIVERY_DIR / "textures"
GLB_PATH = MODEL_DIR / "saman-avatar.glb"
BLEND_PATH = DELIVERY_DIR / "saman-avatar.blend"
POSTER_PATH = PICTURE_DIR / "saman-avatar-fallback.png"

for directory in (MODEL_DIR, PICTURE_DIR, DELIVERY_DIR, TEXTURE_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def make_texture(name: str, base: tuple[float, float, float], path: Path, kind: str):
    size = 512
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    random.seed(1127 if kind == "skin" else 2214)
    pixels: list[float] = []
    for y in range(size):
        vertical = y / (size - 1)
        for x in range(size):
            horizontal = x / (size - 1)
            if kind == "skin":
                noise = (random.random() - 0.5) * 0.018
                warmth = 0.018 * math.sin(horizontal * math.pi)
                shade = 0.94 + 0.08 * vertical
                rgb = (
                    min(1.0, max(0.0, base[0] * shade + warmth + noise)),
                    min(1.0, max(0.0, base[1] * shade + noise * 0.65)),
                    min(1.0, max(0.0, base[2] * shade + noise * 0.45)),
                )
            else:
                weave = 0.018 * math.sin(x * math.pi / 3.0) + 0.012 * math.sin(y * math.pi / 4.0)
                shade = 0.92 + 0.08 * vertical
                rgb = tuple(min(1.0, max(0.0, component * shade + weave)) for component in base)
            pixels.extend((*rgb, 1.0))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    image=None,
):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.34
    if image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = f"{name}_BaseColor"
        texture.image = image
        texture.interpolation = "Linear"
        links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def smooth_mesh(obj) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_scale(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def uv_sphere(name, location, scale, material, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    smooth_mesh(obj)
    obj.data.materials.append(material)
    return obj


def cube_beveled(name, location, scale, material, bevel=0.12):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    modifier = obj.modifiers.new("Soft tailoring", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    smooth_mesh(obj)
    obj.data.materials.append(material)
    return obj


def cylinder_between(name, start, end, radius, material, vertices=24):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    apply_scale(obj)
    bevel = obj.modifiers.new("Fabric edge", "BEVEL")
    bevel.width = min(0.08, radius * 0.32)
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    smooth_mesh(obj)
    obj.data.materials.append(material)
    return obj


def curve_object(name, points, bevel, material, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for control, coordinate in zip(spline.bezier_points, points):
        control.co = coordinate
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def triangle_collar(name, points, depth, material):
    vertices = [Vector(point) for point in points]
    vertices.extend([Vector((point[0], point[1] + depth, point[2])) for point in points])
    faces = [
        (0, 1, 2),
        (5, 4, 3),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Collar seam", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def create_torso(name, material):
    """Create a closed, shoulder-shaped shirt torso instead of a round sphere."""
    rings = (
        (0.30, 0.94, 0.34),
        (0.55, 0.99, 0.36),
        (1.35, 1.02, 0.38),
        (2.05, 1.10, 0.40),
        (2.48, 1.25, 0.39),
        (2.70, 0.72, 0.31),
    )
    segments = 48
    vertices = []
    for z, width, depth in rings:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            # A slightly flatter front and back reads as fabric instead of skin.
            y = math.sin(angle) * depth + 0.055
            vertices.append((math.cos(angle) * width, y, z))
    bottom_center = len(vertices)
    vertices.append((0, 0.055, rings[0][0]))
    top_center = len(vertices)
    vertices.append((0, 0.055, rings[-1][0]))
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = (ring_index + 1) * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append((start + index, start + following, next_start + following, next_start + index))
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((bottom_center, following, index))
        top_start = (len(rings) - 1) * segments
        faces.append((top_center, top_start + index, top_start + following))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Soft shirt silhouette", "BEVEL")
    bevel.width = 0.055
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    smooth_mesh(obj)
    return obj


def refine_head_proportions(head) -> None:
    """Narrow the lower face and gently flatten the cheeks to match references."""
    for vertex in head.data.vertices:
        co = vertex.co
        normalized_height = max(0.0, min(1.0, (co.z + 0.82) / 1.64))
        if normalized_height < 0.48:
            jaw_factor = 0.78 + normalized_height * 0.46
            co.x *= jaw_factor
        if co.y < -0.30 and -0.40 < co.z < 0.30:
            co.y *= 0.965


def add_face_shape_keys(head) -> None:
    head.shape_key_add(name="Basis")
    basis = head.data.shape_keys.key_blocks["Basis"]
    targets = {}
    for name in ("BlinkLeft", "BlinkRight", "Smile", "MouthOpen"):
        targets[name] = head.shape_key_add(name=name)

    for index, base_point in enumerate(basis.data):
        co = base_point.co
        if co.y < -0.42:
            for name, eye_x in (("BlinkLeft", 0.27), ("BlinkRight", -0.27)):
                dx = abs(co.x - eye_x)
                dz = abs(co.z - 0.18)
                if dx < 0.23 and dz < 0.16:
                    influence = (1.0 - dx / 0.23) * (1.0 - dz / 0.16)
                    targets[name].data[index].co.z += (0.18 - co.z) * 0.82 * influence
                    targets[name].data[index].co.y -= 0.018 * influence

            mouth_dx = abs(co.x)
            mouth_dz = abs(co.z + 0.25)
            if mouth_dx < 0.42 and mouth_dz < 0.20:
                corner = min(1.0, mouth_dx / 0.42)
                influence = (1.0 - mouth_dz / 0.20) * corner
                targets["Smile"].data[index].co.z += 0.105 * influence
                targets["Smile"].data[index].co.x *= 1.0 + 0.035 * influence

            if mouth_dx < 0.30 and -0.48 < co.z < -0.20:
                influence = (1.0 - mouth_dx / 0.30) * min(1.0, (-0.20 - co.z) / 0.28)
                targets["MouthOpen"].data[index].co.z -= 0.095 * influence
                targets["MouthOpen"].data[index].co.y -= 0.025 * influence


def create_armature():
    armature_data = bpy.data.armatures.new("SamanAvatarRig")
    armature = bpy.data.objects.new("SamanAvatarRig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    armature.data.display_type = "BBONE"
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    bones = {}

    def bone(name, head, tail, parent=None):
        item = armature.data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = bones[parent]
        bones[name] = item

    bone("Root", (0, 0, 0.0), (0, 0, 0.38))
    bone("Spine", (0, 0, 0.38), (0, 0, 1.65), "Root")
    bone("Chest", (0, 0, 1.65), (0, 0, 2.67), "Spine")
    bone("Neck", (0, 0, 2.67), (0, 0, 3.10), "Chest")
    bone("Head", (0, 0, 3.10), (0, 0, 4.18), "Neck")

    for side, sign in (("L", 1.0), ("R", -1.0)):
        shoulder = (1.12 * sign, 0.0, 2.46)
        elbow = (1.35 * sign, 0.0, 1.48)
        wrist = (1.31 * sign, -0.03, 0.62)
        hand = (1.29 * sign, -0.10, 0.10)
        bone(f"Shoulder.{side}", (0.16 * sign, 0, 2.56), shoulder, "Chest")
        bone(f"UpperArm.{side}", shoulder, elbow, f"Shoulder.{side}")
        bone(f"Forearm.{side}", elbow, wrist, f"UpperArm.{side}")
        bone(f"Hand.{side}", wrist, hand, f"Forearm.{side}")

    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature


def skin_to_bone(obj, armature, bone_name: str, secondary: str | None = None) -> None:
    obj.parent = armature
    modifier = obj.modifiers.new("Avatar Armature", "ARMATURE")
    modifier.object = armature
    group = obj.vertex_groups.new(name=bone_name)
    if secondary is None:
        group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        return
    second_group = obj.vertex_groups.new(name=secondary)
    minimum = min(vertex.co.z for vertex in obj.data.vertices)
    maximum = max(vertex.co.z for vertex in obj.data.vertices)
    span = max(0.001, maximum - minimum)
    for vertex in obj.data.vertices:
        top_weight = max(0.0, min(1.0, (vertex.co.z - minimum) / span))
        group.add([vertex.index], 1.0 - top_weight, "REPLACE")
        second_group.add([vertex.index], top_weight, "REPLACE")


def add_pose_action(armature, name: str, duration: int, keyframes: dict[int, dict[str, tuple]]):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)

    for frame, transforms in keyframes.items():
        for bone_name, transform in transforms.items():
            pose_bone = armature.pose.bones[bone_name]
            rotation = transform[0]
            scale = transform[1] if len(transform) > 1 else (1.0, 1.0, 1.0)
            pose_bone.rotation_quaternion = Euler(rotation, "XYZ").to_quaternion()
            pose_bone.scale = scale
            pose_bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
            pose_bone.keyframe_insert("scale", frame=frame, group=bone_name)

    action["clip_name"] = name
    action["duration_frames"] = duration
    armature.animation_data.action = None
    return action


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_light(name, kind, location, energy, color, target=(0, 0, 2.4), size=4.0):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.shape = "DISK"
        data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def main() -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.fps = 30
    scene.world.color = (0.006, 0.009, 0.019)
    scene["avatar_spec"] = "semi-realistic waist-up web avatar"
    scene["reference_policy"] = "reference photos are not embedded or copied"

    skin_image = make_texture(
        "SkinBaseColor",
        (0.64, 0.39, 0.27),
        TEXTURE_DIR / "skin-basecolor.png",
        "skin",
    )
    shirt_image = make_texture(
        "ShirtBaseColor",
        (0.018, 0.10, 0.58),
        TEXTURE_DIR / "shirt-basecolor.png",
        "shirt",
    )

    skin = make_material("Skin", (0.64, 0.39, 0.27, 1), 0.47, image=skin_image)
    skin_shader = skin.node_tree.nodes.get("Principled BSDF")
    skin_shader.inputs["Roughness"].default_value = 0.58
    if "Specular IOR Level" in skin_shader.inputs:
        skin_shader.inputs["Specular IOR Level"].default_value = 0.22
    skin_dark = make_material("SkinShadow", (0.46, 0.25, 0.18, 1), 0.56)
    shirt = make_material("CobaltBlueShirt", (0.018, 0.10, 0.58, 1), 0.63, image=shirt_image)
    shirt_dark = make_material("ShirtSeams", (0.008, 0.035, 0.24, 1), 0.69)
    hair = make_material("DarkBrownHair", (0.012, 0.007, 0.006, 1), 0.42)
    brow = make_material("FacialHair", (0.006, 0.003, 0.002, 1), 0.94)
    brow_shader = brow.node_tree.nodes.get("Principled BSDF")
    if "Specular IOR Level" in brow_shader.inputs:
        brow_shader.inputs["Specular IOR Level"].default_value = 0.0
    eye_white = make_material("EyeWhite", (0.82, 0.78, 0.69, 1), 0.3)
    eye_shader = eye_white.node_tree.nodes.get("Principled BSDF")
    eye_shader.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in eye_shader.inputs:
        eye_shader.inputs["Specular IOR Level"].default_value = 0.08
    iris = make_material("DarkBrownEyes", (0.055, 0.019, 0.009, 1), 0.25)
    pupil = make_material("Pupil", (0.002, 0.001, 0.001, 1), 0.22)
    lip = make_material("NaturalLips", (0.42, 0.16, 0.13, 1), 0.58)
    lip_shader = lip.node_tree.nodes.get("Principled BSDF")
    lip_shader.inputs["Roughness"].default_value = 0.90
    if "Specular IOR Level" in lip_shader.inputs:
        lip_shader.inputs["Specular IOR Level"].default_value = 0.0
    button = make_material("BlueButtons", (0.025, 0.08, 0.42, 1), 0.29)
    pedestal_mat = make_material("Pedestal", (0.015, 0.025, 0.055, 1), 0.34, metallic=0.38)

    armature = create_armature()

    torso = create_torso("ShirtTorso", shirt)
    skin_to_bone(torso, armature, "Spine", "Chest")

    neck = cylinder_between("NeckMesh", (0, 0, 2.54), (0, 0, 3.12), 0.31, skin, 32)
    skin_to_bone(neck, armature, "Neck")

    head = uv_sphere("Head", (0, -0.01, 3.61), (0.64, 0.60, 0.84), skin, 64, 40)
    refine_head_proportions(head)
    add_face_shape_keys(head)
    skin_to_bone(head, armature, "Head")

    for sign, suffix in ((1, "L"), (-1, "R")):
        ear = uv_sphere(f"Ear.{suffix}", (0.64 * sign, -0.005, 3.59), (0.10, 0.065, 0.20), skin, 28, 18)
        inner = uv_sphere(f"EarInner.{suffix}", (0.662 * sign, -0.058, 3.59), (0.043, 0.020, 0.10), skin_dark, 20, 12)
        skin_to_bone(ear, armature, "Head")
        skin_to_bone(inner, armature, "Head")

    for sign, suffix in ((1, "L"), (-1, "R")):
        eye = uv_sphere(f"Eye.{suffix}", (0.225 * sign, -0.563, 3.75), (0.105, 0.022, 0.042), eye_white, 32, 20)
        eye.rotation_euler.z = -0.025 * sign
        iris_obj = uv_sphere(f"Iris.{suffix}", (0.225 * sign, -0.587, 3.75), (0.038, 0.005, 0.038), iris, 24, 16)
        pupil_obj = uv_sphere(f"Pupil.{suffix}", (0.225 * sign, -0.593, 3.75), (0.017, 0.0025, 0.017), pupil, 20, 12)
        glint = uv_sphere(f"EyeGlint.{suffix}", (0.214 * sign, -0.597, 3.762), (0.005, 0.0015, 0.005), eye_white, 12, 8)
        for obj in (eye, iris_obj, pupil_obj, glint):
            skin_to_bone(obj, armature, "Head")

    nose_bridge = uv_sphere("NoseBridge", (0, -0.58, 3.59), (0.085, 0.15, 0.27), skin, 28, 18)
    nose_tip = uv_sphere("NoseTip", (0, -0.705, 3.47), (0.112, 0.10, 0.09), skin, 28, 18)
    nostril_left = uv_sphere("Nostril.L", (0.085, -0.81, 3.455), (0.025, 0.012, 0.014), skin_dark, 16, 10)
    nostril_right = uv_sphere("Nostril.R", (-0.085, -0.81, 3.455), (0.025, 0.012, 0.014), skin_dark, 16, 10)
    for obj in (nose_bridge, nose_tip, nostril_left, nostril_right):
        skin_to_bone(obj, armature, "Head")

    left_brow = curve_object(
        "Eyebrow.L",
        ((0.08, -0.575, 3.90), (0.245, -0.595, 4.00), (0.41, -0.565, 3.91)),
        0.010,
        brow,
    )
    right_brow = curve_object(
        "Eyebrow.R",
        ((-0.08, -0.575, 3.90), (-0.245, -0.595, 4.00), (-0.41, -0.565, 3.91)),
        0.010,
        brow,
    )
    mouth = curve_object(
        "MouthLine",
        ((-0.28, -0.636, 3.31), (0, -0.681, 3.285), (0.28, -0.636, 3.31)),
        0.012,
        lip,
    )
    upper_lip = curve_object(
        "UpperLip",
        ((-0.25, -0.649, 3.32), (0, -0.704, 3.34), (0.25, -0.649, 3.32)),
        0.009,
        lip,
    )
    moustache = curve_object(
        "SoftMoustache",
        ((-0.20, -0.66, 3.39), (0, -0.695, 3.405), (0.20, -0.66, 3.39)),
        0.0045,
        brow,
    )
    chin_patch = curve_object(
        "ChinPatch",
        ((-0.07, -0.59, 3.13), (0, -0.615, 3.10), (0.07, -0.59, 3.13)),
        0.004,
        brow,
    )
    for obj in (left_brow, right_brow, mouth, upper_lip, moustache, chin_patch):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        skin_to_bone(obj, armature, "Head")

    hair_shader = hair.node_tree.nodes.get("Principled BSDF")
    if "Specular IOR Level" in hair_shader.inputs:
        hair_shader.inputs["Specular IOR Level"].default_value = 0.12
    hair_shader.inputs["Roughness"].default_value = 0.72
    hair_cap = uv_sphere("HairCap", (0, 0.15, 4.27), (0.68, 0.55, 0.42), hair, 48, 28)
    skin_to_bone(hair_cap, armature, "Head")
    random.seed(621159936)
    for index in range(46):
        angle = random.uniform(-math.pi * 0.83, math.pi * 0.83)
        radius = random.uniform(0.18, 0.58)
        x = math.sin(angle) * radius
        y = -0.02 + math.cos(angle) * radius * 0.39
        z = 4.25 + random.uniform(0.01, 0.23) + 0.10 * (1.0 - abs(x) / 0.62)
        clump = uv_sphere(
            f"HairClump.{index:02d}",
            (x, y, z),
            (random.uniform(0.075, 0.115), random.uniform(0.06, 0.095), random.uniform(0.13, 0.23)),
            hair,
            20,
            12,
        )
        clump.rotation_euler.y = random.uniform(-0.34, 0.34) + x * 0.20
        clump.rotation_euler.x = random.uniform(-0.12, 0.12)
        skin_to_bone(clump, armature, "Head")

    left_collar = triangle_collar(
        "Collar.L",
        ((0.03, -0.39, 2.72), (0.50, -0.39, 2.53), (0.16, -0.47, 2.30)),
        0.08,
        shirt,
    )
    right_collar = triangle_collar(
        "Collar.R",
        ((-0.03, -0.39, 2.72), (-0.50, -0.39, 2.53), (-0.16, -0.47, 2.30)),
        0.08,
        shirt,
    )
    for collar in (left_collar, right_collar):
        skin_to_bone(collar, armature, "Chest")

    placket = cube_beveled("ShirtPlacket", (0, -0.385, 1.53), (0.045, 0.022, 0.82), shirt_dark, 0.018)
    skin_to_bone(placket, armature, "Chest")
    pocket = cube_beveled("ShirtPocket", (-0.61, -0.395, 1.72), (0.28, 0.018, 0.29), shirt_dark, 0.03)
    skin_to_bone(pocket, armature, "Chest")
    for index, z in enumerate((2.17, 1.72, 1.27, 0.82)):
        item = uv_sphere(f"ShirtButton.{index}", (0, -0.425, z), (0.048, 0.018, 0.048), button, 20, 12)
        skin_to_bone(item, armature, "Chest" if z > 1.5 else "Spine")

    limb_objects = []
    for sign, suffix in ((1, "L"), (-1, "R")):
        shoulder = (1.12 * sign, 0, 2.46)
        elbow = (1.35 * sign, 0.0, 1.48)
        wrist = (1.31 * sign, -0.03, 0.62)
        hand_end = (1.29 * sign, -0.10, 0.10)
        upper = cylinder_between(f"ShirtUpperArm.{suffix}", shoulder, elbow, 0.245, shirt, 28)
        forearm = cylinder_between(f"ShirtForearm.{suffix}", elbow, wrist, 0.205, shirt, 28)
        hand = cylinder_between(f"Hand.{suffix}", wrist, hand_end, 0.145, skin, 28)
        palm = uv_sphere(f"Palm.{suffix}", hand_end, (0.16, 0.115, 0.22), skin, 28, 18)
        thumb = cylinder_between(
            f"Thumb.{suffix}",
            (1.29 * sign, -0.12, 0.34),
            (1.14 * sign, -0.18, 0.18),
            0.052,
            skin,
            18,
        )
        for obj, bone_name in (
            (upper, f"UpperArm.{suffix}"),
            (forearm, f"Forearm.{suffix}"),
            (hand, f"Hand.{suffix}"),
            (palm, f"Hand.{suffix}"),
            (thumb, f"Hand.{suffix}"),
        ):
            skin_to_bone(obj, armature, bone_name)
            limb_objects.append(obj)

    add_pose_action(
        armature,
        "Idle",
        120,
        {
            1: {
                "Chest": ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
                "Head": ((0.0, 0.0, -0.018),),
            },
            30: {
                "Chest": ((0.008, 0.0, 0.0), (1.0, 1.0, 1.012)),
                "Head": ((0.012, 0.006, 0.012),),
            },
            60: {
                "Chest": ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
                "Head": ((0.0, -0.008, 0.02),),
            },
            90: {
                "Chest": ((0.008, 0.0, 0.0), (1.0, 1.0, 1.012)),
                "Head": ((-0.01, 0.004, -0.01),),
            },
            120: {
                "Chest": ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
                "Head": ((0.0, 0.0, -0.018),),
            },
        },
    )
    add_pose_action(
        armature,
        "Intro",
        150,
        {
            1: {
                "Chest": ((0.0, 0.0, 0.0),),
                "Head": ((0.0, 0.0, -0.04),),
                "UpperArm.R": ((0.0, 0.0, 0.0),),
                "Forearm.R": ((0.0, 0.0, 0.0),),
                "Hand.R": ((0.0, 0.0, 0.0),),
            },
            35: {
                "Chest": ((0.0, 0.035, 0.025),),
                "Head": ((-0.015, 0.035, 0.025),),
                "UpperArm.R": ((-0.38, -0.18, -0.46),),
                "Forearm.R": ((-0.76, 0.05, 0.12),),
                "Hand.R": ((0.0, 0.0, -0.12),),
            },
            65: {
                "Chest": ((0.0, 0.035, 0.025),),
                "Head": ((-0.015, 0.02, 0.02),),
                "UpperArm.R": ((-0.38, -0.18, -0.46),),
                "Forearm.R": ((-0.76, 0.05, 0.12),),
                "Hand.R": ((0.0, 0.0, 0.16),),
            },
            92: {
                "Chest": ((0.0, 0.035, 0.025),),
                "Head": ((-0.01, -0.015, -0.015),),
                "UpperArm.R": ((-0.38, -0.18, -0.46),),
                "Forearm.R": ((-0.76, 0.05, 0.12),),
                "Hand.R": ((0.0, 0.0, -0.15),),
            },
            120: {
                "Chest": ((0.0, 0.02, 0.01),),
                "Head": ((0.0, 0.0, -0.01),),
                "UpperArm.R": ((-0.16, -0.08, -0.18),),
                "Forearm.R": ((-0.28, 0.02, 0.04),),
                "Hand.R": ((0.0, 0.0, 0.0),),
            },
            150: {
                "Chest": ((0.0, 0.0, 0.0),),
                "Head": ((0.0, 0.0, -0.04),),
                "UpperArm.R": ((0.0, 0.0, 0.0),),
                "Forearm.R": ((0.0, 0.0, 0.0),),
                "Hand.R": ((0.0, 0.0, 0.0),),
            },
        },
    )

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.78, depth=0.14, location=(0, 0.08, -0.02))
    pedestal = bpy.context.object
    pedestal.name = "DisplayPedestal"
    pedestal.data.materials.append(pedestal_mat)
    bevel = pedestal.modifiers.new("Pedestal rim", "BEVEL")
    bevel.width = 0.06
    bevel.segments = 4
    bpy.context.view_layer.objects.active = pedestal
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    camera_data = bpy.data.cameras.new("PortraitCamera")
    camera = bpy.data.objects.new("PortraitCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -9.3, 3.03)
    camera.data.lens = 61
    camera.data.sensor_width = 36
    look_at(camera, (0, 0, 2.38))
    scene.camera = camera

    add_light("Key", "AREA", (-4.3, -5.2, 7.1), 980, (1.0, 0.71, 0.56), size=4.2)
    add_light("Fill", "AREA", (4.0, -3.4, 4.8), 720, (0.48, 0.64, 1.0), size=3.8)
    add_light("Rim", "AREA", (0.7, 3.1, 6.2), 1180, (0.27, 0.46, 1.0), size=3.0)
    add_light("FaceSoft", "AREA", (0, -4.0, 3.6), 340, (1.0, 0.88, 0.75), size=2.0)

    scene.render.filepath = str(POSTER_PATH)
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.film_transparent = False

    # Render the neutral rest pose, then save the source and export the rigged GLB.
    armature.animation_data.action = None
    scene.frame_set(1)
    bpy.ops.render.render(write_still=True)

    qa_dir = DELIVERY_DIR / "qa" / "turnaround"
    qa_dir.mkdir(parents=True, exist_ok=True)
    front_location = Vector((0, -9.3, 3.03))
    scene.render.resolution_x = 420
    scene.render.resolution_y = 500
    views = (
        ("front", 0),
        ("front-right-45", -45),
        ("right-profile", -90),
        ("back", 180),
        ("left-profile", 90),
        ("front-left-45", 45),
    )
    radius = math.sqrt(front_location.x**2 + front_location.y**2)
    for label, degrees in views:
        radians = math.radians(degrees)
        camera.location = (math.sin(radians) * radius, -math.cos(radians) * radius, front_location.z)
        look_at(camera, (0, 0, 2.38))
        scene.render.filepath = str(qa_dir / f"{label}.png")
        bpy.ops.render.render(write_still=True)
    camera.location = front_location
    look_at(camera, (0, 0, 2.38))
    scene.render.resolution_x = 768
    scene.render.resolution_y = 900
    scene.render.filepath = str(POSTER_PATH)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    bpy.ops.object.select_all(action="SELECT")
    export_arguments = {
        "filepath": str(GLB_PATH),
        "export_format": "GLB",
        "use_selection": False,
        "export_apply": False,
        "export_animations": True,
        "export_animation_mode": "ACTIONS",
        "export_morph": True,
        "export_skins": True,
        "export_yup": True,
        "export_materials": "EXPORT",
        "export_image_format": "AUTO",
        "export_cameras": False,
        "export_lights": False,
    }
    bpy.ops.export_scene.gltf(**export_arguments)

    mesh_triangles = 0
    for obj in scene.objects:
        if obj.type == "MESH" and obj.name != "DisplayPedestal":
            mesh_triangles += sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    print(f"AVATAR_GLTF={GLB_PATH}")
    print(f"AVATAR_BLEND={BLEND_PATH}")
    print(f"AVATAR_POSTER={POSTER_PATH}")
    print(f"AVATAR_TRIANGLES={mesh_triangles}")
    print("AVATAR_ACTIONS=" + ",".join(sorted(action.name for action in bpy.data.actions)))
    print("AVATAR_MORPHS=" + ",".join(key.name for key in head.data.shape_keys.key_blocks[1:]))


if __name__ == "__main__":
    main()
