#!/usr/bin/env bash
# ==================================================================
# setup-models.sh
# Downloads a free CC0 human brain 3D model in GLB format.
#
# Usage:
#   chmod +x setup-models.sh && ./setup-models.sh
#
# This script creates the models/ and assets/ directories and
# downloads a placeholder brain model. Replace with your own
# .glb and .usdz files for production use.
# ==================================================================

set -euo pipefail

MODELS_DIR="models"
ASSETS_DIR="assets"

echo "==> Creating directories..."
mkdir -p "$MODELS_DIR" "$ASSETS_DIR"

# -------------------------------------------------------------------
# NOTE: You need to provide your own brain/skull 3D model files.
#
# Recommended free sources:
#   1. Sketchfab (filter by "Downloadable" + "CC" license):
#      https://sketchfab.com/search?q=brain+skull&type=models
#   2. NIH 3D Print Exchange:
#      https://3d.nih.gov/
#   3. Smithsonian 3D:
#      https://3d.si.edu/
#
# Model format requirements:
#   - GLB (GL Binary) for Android/Chrome AR and 3D preview
#   - USDZ for iOS AR Quick Look (optional but recommended)
#
# Place your files as:
#   models/brain.glb   — required
#   models/brain.usdz  — optional (enables native iOS AR)
#   assets/poster.webp  — optional (loading preview image)
#
# Conversion tools:
#   - GLB ↔ GLTF: https://gltf.report/ or Blender
#   - GLB → USDZ: https://www.apple.com/augmented-reality/tools/
#                  or Reality Converter (macOS)
# -------------------------------------------------------------------

# Create a minimal placeholder GLB so the page loads without errors.
# This generates a tiny valid GLB file (a single triangle) using Python.
if [ ! -f "$MODELS_DIR/brain.glb" ]; then
    echo "==> Generating placeholder brain.glb..."
    python3 -c "
import struct, json, io

# Minimal glTF JSON for a simple mesh
gltf = {
    'asset': {'version': '2.0', 'generator': 'setup-models'},
    'scene': 0,
    'scenes': [{'nodes': [0]}],
    'nodes': [{'mesh': 0, 'name': 'BrainPlaceholder'}],
    'meshes': [{
        'primitives': [{
            'attributes': {'POSITION': 0},
            'indices': 1
        }],
        'name': 'BrainMesh'
    }],
    'accessors': [
        {
            'bufferView': 0,
            'componentType': 5126,  # FLOAT
            'count': 4,
            'type': 'VEC3',
            'max': [0.5, 0.5, 0.0],
            'min': [-0.5, -0.5, 0.0]
        },
        {
            'bufferView': 1,
            'componentType': 5123,  # UNSIGNED_SHORT
            'count': 6,
            'type': 'SCALAR',
            'max': [3],
            'min': [0]
        }
    ],
    'bufferViews': [
        {'buffer': 0, 'byteOffset': 0, 'byteLength': 48, 'target': 34962},
        {'buffer': 0, 'byteOffset': 48, 'byteLength': 12, 'target': 34963}
    ],
    'buffers': [{'byteLength': 60}]
}

# Binary buffer: 4 vertices (VEC3 float) + 6 indices (unsigned short)
buf = io.BytesIO()
# Vertices: a simple quad
for v in [(-0.5,-0.5,0), (0.5,-0.5,0), (0.5,0.5,0), (-0.5,0.5,0)]:
    buf.write(struct.pack('<3f', *v))
# Indices: two triangles
for i in [0,1,2, 0,2,3]:
    buf.write(struct.pack('<H', i))
bin_data = buf.getvalue()

json_str = json.dumps(gltf, separators=(',', ':'))
# Pad JSON to 4-byte alignment
while len(json_str) % 4 != 0:
    json_str += ' '
json_bytes = json_str.encode('utf-8')

# Pad binary to 4-byte alignment
while len(bin_data) % 4 != 0:
    bin_data += b'\x00'

# GLB header
total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
with open('$MODELS_DIR/brain.glb', 'wb') as f:
    # Header
    f.write(struct.pack('<4sII', b'glTF', 2, total_length))
    # JSON chunk
    f.write(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    f.write(json_bytes)
    # BIN chunk
    f.write(struct.pack('<II', len(bin_data), 0x004E4942))
    f.write(bin_data)

print('  Created placeholder brain.glb (' + str(total_length) + ' bytes)')
"
    echo "  NOTE: Replace models/brain.glb with a real brain model for production."
else
    echo "==> models/brain.glb already exists, skipping."
fi

# Create a simple poster image placeholder
if [ ! -f "$ASSETS_DIR/poster.webp" ]; then
    echo "==> Creating placeholder poster..."
    # Create a minimal 1x1 pixel placeholder (the real poster should be a screenshot of the model)
    python3 -c "
# Create a simple SVG and note about the poster
with open('$ASSETS_DIR/poster.svg', 'w') as f:
    f.write('''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\" viewBox=\"0 0 400 400\">
  <rect width=\"400\" height=\"400\" fill=\"#1a1a2e\"/>
  <text x=\"200\" y=\"190\" text-anchor=\"middle\" fill=\"#6c63ff\" font-family=\"sans-serif\" font-size=\"24\">AR Brain Viewer</text>
  <text x=\"200\" y=\"220\" text-anchor=\"middle\" fill=\"#888\" font-family=\"sans-serif\" font-size=\"14\">Loading 3D model...</text>
</svg>')
print('  Created poster.svg placeholder')
print('  TIP: For best results, take a screenshot of the loaded model and save as assets/poster.webp')
"
else
    echo "==> assets/poster.webp already exists, skipping."
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Replace models/brain.glb with a real brain/skull GLB model"
echo "  2. Optionally add models/brain.usdz for native iOS AR"
echo "  3. Optionally add assets/poster.webp as a loading preview"
echo "  4. Serve with: npx serve . (or any static file server)"
echo "  5. Open qr.html to generate a QR code for your deployed URL"
echo ""
