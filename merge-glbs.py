#!/usr/bin/env python3
"""
Merge multiple GLB files into a single GLB scene with distinct PBR materials.
Each part gets a unique color so they're visually distinguishable.
"""

import struct
import json
import io
import os
import copy

# Color assignments for each anatomical part (RGBA)
PART_COLORS = {
    "Brain":      [0.85, 0.65, 0.70, 0.95],   # pinkish (brain tissue)
    "Skull_Cap":  [0.90, 0.85, 0.75, 0.4],     # bone/ivory, semi-transparent
    "Face":       [0.88, 0.77, 0.65, 0.4],     # skin tone, semi-transparent
    "Tumor":      [0.9,  0.15, 0.15, 1.0],     # red (tumor)
    "Ventricle":  [0.3,  0.5,  0.9,  0.85],    # blue (CSF/ventricles)
}

PART_METALLIC = {
    "Brain": 0.0,
    "Skull_Cap": 0.05,
    "Face": 0.0,
    "Tumor": 0.1,
    "Ventricle": 0.15,
}

PART_ROUGHNESS = {
    "Brain": 0.7,
    "Skull_Cap": 0.4,
    "Face": 0.5,
    "Tumor": 0.6,
    "Ventricle": 0.3,
}


def read_glb(path):
    """Read a GLB file and return (gltf_json, binary_data)."""
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<4sII', f.read(12))
        assert magic == b'glTF' and version == 2

        # JSON chunk
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        assert chunk_type == 0x4E4F534A
        json_data = json.loads(f.read(chunk_len).decode('utf-8'))

        # BIN chunk (if present)
        bin_data = b''
        remaining = length - 12 - 8 - chunk_len
        if remaining > 0:
            chunk_len2, chunk_type2 = struct.unpack('<II', f.read(8))
            assert chunk_type2 == 0x004E4942
            bin_data = f.read(chunk_len2)

    return json_data, bin_data


def write_glb(gltf_json, bin_data, path):
    """Write a GLB file from gltf_json and binary_data."""
    json_str = json.dumps(gltf_json, separators=(',', ':'))
    while len(json_str) % 4 != 0:
        json_str += ' '
    json_bytes = json_str.encode('utf-8')

    while len(bin_data) % 4 != 0:
        bin_data += b'\x00'

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_data)

    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack('<II', len(bin_data), 0x004E4942))
        f.write(bin_data)

    print(f"  Wrote {path} ({total} bytes, {total/1024/1024:.1f} MB)")


def merge_glbs(parts, output_path):
    """
    Merge multiple GLB files into one scene.
    parts: list of (name, glb_path) tuples
    """
    combined_bin = io.BytesIO()
    all_accessors = []
    all_buffer_views = []
    all_meshes = []
    all_materials = []
    all_nodes = []
    root_children = []

    for part_idx, (name, glb_path) in enumerate(parts):
        print(f"  Merging {name} from {glb_path}...")
        gltf, bin_data = read_glb(glb_path)

        # Track offsets for this part
        bv_offset = len(all_buffer_views)
        acc_offset = len(all_accessors)
        mat_offset = len(all_materials)

        # Current position in combined binary
        bin_start = combined_bin.tell()

        # Pad to 4-byte alignment
        while combined_bin.tell() % 4 != 0:
            combined_bin.write(b'\x00')
        bin_start = combined_bin.tell()

        # Write this part's binary data
        combined_bin.write(bin_data)

        # Add material for this part
        color = PART_COLORS.get(name, [0.5, 0.5, 0.5, 1.0])
        metallic = PART_METALLIC.get(name, 0.0)
        roughness = PART_ROUGHNESS.get(name, 0.5)

        material = {
            "name": f"{name}_material",
            "pbrMetallicRoughness": {
                "baseColorFactor": color,
                "metallicFactor": metallic,
                "roughnessFactor": roughness,
            },
            "doubleSided": True,
        }

        # If alpha < 1, set alpha mode
        if color[3] < 1.0:
            material["alphaMode"] = "BLEND"

        all_materials.append(material)

        # Remap buffer views
        for bv in gltf.get("bufferViews", []):
            new_bv = copy.deepcopy(bv)
            new_bv["buffer"] = 0  # single combined buffer
            new_bv["byteOffset"] = bv.get("byteOffset", 0) + bin_start
            all_buffer_views.append(new_bv)

        # Remap accessors
        for acc in gltf.get("accessors", []):
            new_acc = copy.deepcopy(acc)
            if "bufferView" in new_acc:
                new_acc["bufferView"] += bv_offset
            all_accessors.append(new_acc)

        # Remap meshes — point to new accessor indices and new material
        for mesh in gltf.get("meshes", []):
            new_mesh = {"name": name, "primitives": []}
            for prim in mesh["primitives"]:
                new_prim = {}
                new_prim["attributes"] = {}
                for attr_name, attr_idx in prim["attributes"].items():
                    new_prim["attributes"][attr_name] = attr_idx + acc_offset
                if "indices" in prim:
                    new_prim["indices"] = prim["indices"] + acc_offset
                new_prim["material"] = mat_offset  # use our colored material
                if "mode" in prim:
                    new_prim["mode"] = prim["mode"]
                new_mesh["primitives"].append(new_prim)
            all_meshes.append(new_mesh)

        # Create a node for this part
        mesh_idx = len(all_meshes) - 1
        node = {"name": name, "mesh": mesh_idx}
        node_idx = len(all_nodes)
        all_nodes.append(node)
        root_children.append(node_idx)

    # Create root node
    root_node_idx = len(all_nodes)
    all_nodes.append({
        "name": "BrainScene",
        "children": root_children,
    })

    bin_total = combined_bin.getvalue()

    combined_gltf = {
        "asset": {"version": "2.0", "generator": "merge-glbs.py"},
        "scene": 0,
        "scenes": [{"nodes": [root_node_idx], "name": "BrainAnatomy"}],
        "nodes": all_nodes,
        "meshes": all_meshes,
        "materials": all_materials,
        "accessors": all_accessors,
        "bufferViews": all_buffer_views,
        "buffers": [{"byteLength": len(bin_total)}],
    }

    write_glb(combined_gltf, bin_total, output_path)


if __name__ == "__main__":
    models_dir = "models"

    parts = [
        ("Brain",      os.path.join(models_dir, "Brain.glb")),
        ("Skull_Cap",  os.path.join(models_dir, "Skull_Cap.glb")),
        ("Face",       os.path.join(models_dir, "Face.glb")),
        ("Tumor",      os.path.join(models_dir, "Tumor.glb")),
        ("Ventricle",  os.path.join(models_dir, "Ventricle.glb")),
    ]

    print("Merging GLB files into combined scene...")
    merge_glbs(parts, os.path.join(models_dir, "brain_combined.glb"))
    print("Done!")
