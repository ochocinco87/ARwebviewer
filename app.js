// === Medivis AR Mobile Viewer ===
// Phase 1: 3D preview (spinning model on dark bg)
// Phase 2: AR camera mode (camera feed + model overlay)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ─── DOM ───
const video        = document.getElementById('camera-feed');
const canvas       = document.getElementById('ar-canvas');
const loadScreen   = document.getElementById('loading-screen');
const loadStatus   = document.getElementById('loading-status');
const topBar       = document.getElementById('top-bar');
const bottomBar    = document.getElementById('bottom-bar');
const enterArBtn   = document.getElementById('enter-ar-btn');
const placeBtn     = document.getElementById('place-btn');
const placeBtnText = document.getElementById('place-btn-text');
const exitArBtn    = document.getElementById('exit-ar-btn');
const infoToggle   = document.getElementById('info-toggle');
const infoContent  = document.getElementById('info-content');
const partLabel    = document.getElementById('part-label');
const partLabelTxt = document.getElementById('part-label-text');
const toastEl      = document.getElementById('toast');
const toastText    = document.getElementById('toast-text');

// ─── State ───
let pivot          = null;   // outer group (position/scale)
let innerModel     = null;   // inner group (centered model)
let arMode         = false;  // camera AR active?
let placed         = false;  // model locked in place?
let highlightedMesh = null;
const originalMaterials = new Map();

// Touch
let touchStartX = 0, touchStartY = 0;
let lastTouchDist = 0;
let rotStart = new THREE.Euler();
let isDragging = false, isPinching = false;

const PART_NAMES = {
    brain: 'Brain', skull_cap: 'Skull Cap', face: 'Face',
    tumor: 'Tumor', ventricle: 'Ventricles',
};
const HIGHLIGHT = new THREE.Color(0x6E5FF6);

// ════════════════════════════════════════
// Three.js setup
// ════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene  = new THREE.Scene();
// Start with dark bg for preview mode
scene.background = new THREE.Color(0x0a0a14);

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
camera.position.set(0, 0, 1.2);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 1.4);
dir.position.set(2, 4, 3);
scene.add(dir);
const fill = new THREE.DirectionalLight(0x8888ff, 0.35);
fill.position.set(-2, -1, -2);
scene.add(fill);

const raycaster = new THREE.Raycaster();
const tapNDC = new THREE.Vector2();

function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ════════════════════════════════════════
// Load model
// ════════════════════════════════════════
async function loadModel() {
    loadStatus.textContent = 'Loading 3D model...';
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    return new Promise((resolve, reject) => {
        loader.load('models/brain_scene.glb',
            (gltf) => {
                innerModel = gltf.scene;

                // Center on origin
                const box = new THREE.Box3().setFromObject(innerModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                // Scale to ~0.3m (head-sized)
                const s = 0.3 / maxDim;
                innerModel.scale.setScalar(s);
                innerModel.position.set(-center.x * s, -center.y * s, -center.z * s);

                // Wrap in pivot for transforms
                pivot = new THREE.Group();
                pivot.add(innerModel);
                // Start at 25% size for preview
                pivot.scale.setScalar(0.25);

                // Index meshes for highlighting
                pivot.traverse((child) => {
                    if (child.isMesh) {
                        originalMaterials.set(child, child.material.clone());
                    }
                });

                scene.add(pivot);
                resolve();
            },
            (p) => {
                if (p.total > 0) {
                    loadStatus.textContent = `Loading model: ${Math.round((p.loaded / p.total) * 100)}%`;
                }
            },
            (err) => { loadStatus.textContent = 'Error loading model.'; reject(err); }
        );
    });
}

// ════════════════════════════════════════
// Highlight / unhighlight
// ════════════════════════════════════════
function highlightMesh(mesh) {
    unhighlight();
    highlightedMesh = mesh;
    if (mesh.material) {
        const mat = mesh.material.clone();
        mat.emissive = HIGHLIGHT;
        mat.emissiveIntensity = 0.6;
        if (mat.transparent) mat.opacity = Math.min(mat.opacity + 0.3, 1.0);
        mesh.material = mat;
    }
    const name = (mesh.name || '').toLowerCase();
    for (const [key, label] of Object.entries(PART_NAMES)) {
        if (name.includes(key)) {
            partLabelTxt.textContent = label;
            partLabel.classList.remove('hidden');
            return;
        }
    }
    partLabelTxt.textContent = mesh.name || 'Structure';
    partLabel.classList.remove('hidden');
}

function unhighlight() {
    if (highlightedMesh && originalMaterials.has(highlightedMesh)) {
        highlightedMesh.material = originalMaterials.get(highlightedMesh).clone();
        highlightedMesh = null;
    }
    partLabel.classList.add('hidden');
}

// ════════════════════════════════════════
// Touch / mouse interactions
// ════════════════════════════════════════
function dist2(t) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

canvas.addEventListener('touchstart', (e) => {
    if (!pivot) return;
    if (e.touches.length === 1) {
        isDragging = true; isPinching = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        rotStart.copy(pivot.rotation);
    } else if (e.touches.length === 2) {
        isDragging = false; isPinching = true;
        lastTouchDist = dist2(e.touches);
    }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (!pivot) return;
    if (isDragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        pivot.rotation.y = rotStart.y + dx * 0.006;
        pivot.rotation.x = THREE.MathUtils.clamp(rotStart.x + dy * 0.006, -Math.PI / 2.5, Math.PI / 2.5);
    }
    if (isPinching && e.touches.length === 2) {
        const d = dist2(e.touches);
        const sf = d / lastTouchDist;
        pivot.scale.setScalar(THREE.MathUtils.clamp(pivot.scale.x * sf, 0.08, 4));
        lastTouchDist = d;
    }
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        if (isDragging) {
            const ex = e.changedTouches[0].clientX, ey = e.changedTouches[0].clientY;
            if (Math.abs(ex - touchStartX) < 10 && Math.abs(ey - touchStartY) < 10) {
                handleTap(ex, ey);
            }
        }
        isDragging = false; isPinching = false;
    } else if (e.touches.length === 1) {
        isPinching = false; isDragging = true;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        rotStart.copy(pivot.rotation);
    }
}, { passive: true });

// Mouse fallback
let mouseDown = false;
canvas.addEventListener('mousedown', (e) => {
    if (!pivot) return;
    mouseDown = true; touchStartX = e.clientX; touchStartY = e.clientY;
    rotStart.copy(pivot.rotation);
});
canvas.addEventListener('mousemove', (e) => {
    if (!mouseDown || !pivot) return;
    pivot.rotation.y = rotStart.y + (e.clientX - touchStartX) * 0.006;
    pivot.rotation.x = THREE.MathUtils.clamp(rotStart.x + (e.clientY - touchStartY) * 0.006, -Math.PI / 2.5, Math.PI / 2.5);
});
canvas.addEventListener('mouseup', (e) => {
    if (mouseDown && pivot && Math.abs(e.clientX - touchStartX) < 5 && Math.abs(e.clientY - touchStartY) < 5) {
        handleTap(e.clientX, e.clientY);
    }
    mouseDown = false;
});
canvas.addEventListener('wheel', (e) => {
    if (!pivot) return;
    pivot.scale.setScalar(THREE.MathUtils.clamp(pivot.scale.x * (1 - e.deltaY * 0.001), 0.08, 4));
}, { passive: true });

// ════════════════════════════════════════
// Tap → highlight part
// ════════════════════════════════════════
function handleTap(sx, sy) {
    if (!pivot) return;
    tapNDC.x = (sx / window.innerWidth) * 2 - 1;
    tapNDC.y = -(sy / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(tapNDC, camera);
    const hits = raycaster.intersectObject(pivot, true);
    if (hits.length > 0) highlightMesh(hits[0].object);
    else unhighlight();
}

// ════════════════════════════════════════
// AR mode: camera on/off
// ════════════════════════════════════════
async function enterAR() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
    } catch (err) {
        showToast('Camera access denied. Check permissions.', 4000);
        return;
    }

    arMode = true;
    placed = false;
    placeBtnText.textContent = 'Place Model';
    placeBtn.classList.remove('placed');

    // Show camera, transparent canvas bg
    video.classList.add('active');
    scene.background = null;
    renderer.setClearColor(0x000000, 0);

    // Swap buttons
    enterArBtn.classList.add('hidden');
    placeBtn.classList.remove('hidden');
    exitArBtn.classList.remove('hidden');

    // Position model ~2.5 feet in front
    camera.position.set(0, 0, 0);
    if (pivot) {
        pivot.position.set(0, 0, -0.8);
        pivot.scale.setScalar(1);
    }

    showToast('Point at a surface. Drag to rotate, pinch to zoom.', 4000);
}

function exitAR() {
    arMode = false;
    placed = false;

    // Stop camera
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    video.classList.remove('active');

    // Dark bg again
    scene.background = new THREE.Color(0x0a0a14);

    // Swap buttons
    placeBtn.classList.add('hidden');
    exitArBtn.classList.add('hidden');
    enterArBtn.classList.remove('hidden');

    // Reset model for preview
    camera.position.set(0, 0, 1.2);
    if (pivot) {
        pivot.position.set(0, 0, 0);
        pivot.scale.setScalar(0.25);
        pivot.rotation.set(0, 0, 0);
    }
    unhighlight();
}

enterArBtn.addEventListener('click', enterAR);
exitArBtn.addEventListener('click', exitAR);

// ════════════════════════════════════════
// Place / Pick Up
// ════════════════════════════════════════
placeBtn.addEventListener('click', () => {
    placed = !placed;
    if (placed) {
        placeBtnText.textContent = 'Pick Up';
        placeBtn.classList.add('placed');
        showToast('Placed! Tap a part to highlight. Pinch to resize.', 3000);
    } else {
        placeBtnText.textContent = 'Place Model';
        placeBtn.classList.remove('placed');
        unhighlight();
        showToast('Picked up. Drag to reposition.', 3000);
    }
});

// ════════════════════════════════════════
// Toast
// ════════════════════════════════════════
let toastTO = null;
function showToast(msg, dur) {
    toastText.textContent = msg;
    toastEl.classList.remove('hidden', 'fade-out');
    clearTimeout(toastTO);
    if (dur) toastTO = setTimeout(() => {
        toastEl.classList.add('fade-out');
        setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, dur);
}

// ════════════════════════════════════════
// Info panel
// ════════════════════════════════════════
infoToggle.addEventListener('click', () => infoContent.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
    if (!infoContent.classList.contains('hidden') &&
        !infoContent.contains(e.target) && !infoToggle.contains(e.target))
        infoContent.classList.add('hidden');
});

// ════════════════════════════════════════
// Render loop
// ════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    if (pivot) {
        const t = clock.getElapsedTime();
        if (!arMode) {
            // Preview: auto-rotate slowly
            pivot.rotation.y += 0.004;
        } else if (!placed) {
            // AR not placed: gentle bob
            pivot.position.y = Math.sin(t * 1.5) * 0.012;
        }
    }
    renderer.render(scene, camera);
}

// ════════════════════════════════════════
// Boot
// ════════════════════════════════════════
async function init() {
    try {
        await loadModel();
    } catch (e) {
        return;
    }

    // Show UI
    loadScreen.classList.add('fade-out');
    setTimeout(() => {
        loadScreen.classList.add('hidden');
        topBar.classList.remove('hidden');
        bottomBar.classList.remove('hidden');
        enterArBtn.classList.remove('hidden');
    }, 500);

    showToast('Rotate & zoom the model. Tap "Enter AR Camera" to go live.', 5000);
    animate();
}

init();
