#!/usr/bin/env python3
"""Add a scale root node to the GLB so the model appears at realistic
   size in AR (Quick Look / WebXR). The OBJ source geometry is ~100x
   too large for meters-based glTF, so we wrap everything in a 0.01 scale node."""

import json, struct, sys

def scale_glb(path, scale):
    with open(path, 'rb') as f:
        data = f.read()

    magic, version, total_len = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, "Not a GLB file"

    json_len, json_type = struct.unpack_from('<II', data, 12)
    assert json_type == 0x4E4F534A, "First chunk is not JSON"

    json_bytes = data[20:20 + json_len]
    bin_data = data[20 + json_len:]          # binary chunk (header + payload)

    gltf = json.loads(json_bytes)

    # Check if we already added a scale root
    nodes = gltf.get('nodes', [])
    for node in nodes:
        if node.get('name') == 'AR_Scale_Root':
            print(f"Updating existing AR_Scale_Root to {scale}x")
            node['scale'] = [scale, scale, scale]
            _write(path, magic, version, json_type, gltf, bin_data)
            return

    # Get the default scene's root nodes
    scene = gltf['scenes'][gltf.get('scene', 0)]
    old_roots = scene.get('nodes', [])

    # Create a new root node with the scale transform
    new_idx = len(nodes)
    nodes.append({
        'name': 'AR_Scale_Root',
        'scale': [scale, scale, scale],
        'children': old_roots
    })
    scene['nodes'] = [new_idx]

    _write(path, magic, version, json_type, gltf, bin_data)
    print(f"Added AR_Scale_Root with scale {scale}x — model is now {scale*100:.1f}% of original")

def _write(path, magic, version, json_type, gltf, bin_data):
    new_json = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    pad = (4 - len(new_json) % 4) % 4
    new_json += b'\x20' * pad

    new_total = 12 + 8 + len(new_json) + len(bin_data)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', magic, version, new_total))
        f.write(struct.pack('<II', len(new_json), json_type))
        f.write(new_json)
        f.write(bin_data)
    print(f"Wrote {path} — {new_total:,} bytes")

if __name__ == '__main__':
    scale_glb('models/brain_scene.glb', 0.01)
