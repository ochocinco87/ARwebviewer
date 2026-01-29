#!/usr/bin/env python3
"""Generate a UV sphere GLB with blue PBR material."""

import struct
import json
import math
import io
import os

def generate_sphere(radius=0.5, stacks=32, slices=32):
    """Generate UV sphere vertices, normals, and triangle indices."""
    positions = []
    normals = []
    indices = []

    for i in range(stacks + 1):
        phi = math.pi * i / stacks
        for j in range(slices + 1):
            theta = 2.0 * math.pi * j / slices

            x = math.sin(phi) * math.cos(theta)
            y = math.cos(phi)
            z = math.sin(phi) * math.sin(theta)

            normals.append((x, y, z))
            positions.append((x * radius, y * radius, z * radius))

    for i in range(stacks):
        for j in range(slices):
            first = i * (slices + 1) + j
            second = first + slices + 1

            indices.append(first)
            indices.append(second)
            indices.append(first + 1)

            indices.append(second)
            indices.append(second + 1)
            indices.append(first + 1)

    return positions, normals, indices


def build_glb(positions, normals, indices):
    """Pack sphere data into a GLB binary."""
    buf = io.BytesIO()

    # Write positions
    pos_offset = 0
    for p in positions:
        buf.write(struct.pack('<3f', *p))
    pos_length = buf.tell()

    # Pad to 4-byte boundary
    while buf.tell() % 4 != 0:
        buf.write(b'\x00')

    # Write normals
    norm_offset = buf.tell()
    for n in normals:
        buf.write(struct.pack('<3f', *n))
    norm_length = buf.tell() - norm_offset

    # Pad to 4-byte boundary
    while buf.tell() % 4 != 0:
        buf.write(b'\x00')

    # Write indices (unsigned short if < 65536, else unsigned int)
    idx_offset = buf.tell()
    use_uint32 = max(indices) >= 65536
    for idx in indices:
        if use_uint32:
            buf.write(struct.pack('<I', idx))
        else:
            buf.write(struct.pack('<H', idx))
    idx_length = buf.tell() - idx_offset

    # Pad to 4-byte boundary
    while buf.tell() % 4 != 0:
        buf.write(b'\x00')

    bin_data = buf.getvalue()

    # Compute bounding box
    min_pos = [min(p[i] for p in positions) for i in range(3)]
    max_pos = [max(p[i] for p in positions) for i in range(3)]

    idx_component_type = 5125 if use_uint32 else 5123  # UNSIGNED_INT or UNSIGNED_SHORT

    gltf = {
        "asset": {"version": "2.0", "generator": "generate-sphere.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "BlueSphere"}],
        "meshes": [{
            "primitives": [{
                "attributes": {
                    "POSITION": 0,
                    "NORMAL": 1
                },
                "indices": 2,
                "material": 0
            }],
            "name": "SphereMesh"
        }],
        "materials": [{
            "name": "BlueMaterial",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.2, 0.4, 1.0, 1.0],
                "metallicFactor": 0.1,
                "roughnessFactor": 0.5
            },
            "emissiveFactor": [0.05, 0.1, 0.3]
        }],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(positions),
                "type": "VEC3",
                "max": max_pos,
                "min": min_pos
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": len(normals),
                "type": "VEC3",
                "max": [1.0, 1.0, 1.0],
                "min": [-1.0, -1.0, -1.0]
            },
            {
                "bufferView": 2,
                "componentType": idx_component_type,
                "count": len(indices),
                "type": "SCALAR",
                "max": [max(indices)],
                "min": [min(indices)]
            }
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": pos_offset,
                "byteLength": pos_length,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": norm_offset,
                "byteLength": norm_length,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": idx_offset,
                "byteLength": idx_length,
                "target": 34963
            }
        ],
        "buffers": [{"byteLength": len(bin_data)}]
    }

    json_str = json.dumps(gltf, separators=(',', ':'))
    while len(json_str) % 4 != 0:
        json_str += ' '
    json_bytes = json_str.encode('utf-8')

    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_data)

    out = io.BytesIO()
    # GLB header
    out.write(struct.pack('<4sII', b'glTF', 2, total_length))
    # JSON chunk
    out.write(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    out.write(json_bytes)
    # BIN chunk
    out.write(struct.pack('<II', len(bin_data), 0x004E4942))
    out.write(bin_data)

    return out.getvalue()


if __name__ == '__main__':
    os.makedirs('models', exist_ok=True)

    positions, normals, indices = generate_sphere(radius=0.5, stacks=32, slices=32)
    glb_data = build_glb(positions, normals, indices)

    output_path = os.path.join('models', 'brain.glb')
    with open(output_path, 'wb') as f:
        f.write(glb_data)

    print(f"Generated {output_path} ({len(glb_data)} bytes)")
    print(f"  Vertices: {len(positions)}, Triangles: {len(indices) // 3}")
