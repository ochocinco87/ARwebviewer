// === Medivis AR Mobile Viewer ===
// model-viewer: WebXR (ARCore) on Android, AR Quick Look (ARKit) on iOS
// Preview: auto-rotating model with tap-to-highlight anatomy parts

(function () {
    'use strict';

    // ─── DOM ───
    const mv           = document.getElementById('brain-model');
    const mvArBtn      = document.getElementById('mv-ar-button');
    const loadScreen   = document.getElementById('loading-screen');
    const loadStatus   = document.getElementById('loading-status');
    const topBar       = document.getElementById('top-bar');
    const bottomBar    = document.getElementById('bottom-bar');
    const enterArBtn   = document.getElementById('enter-ar-btn');
    const infoToggle   = document.getElementById('info-toggle');
    const infoContent  = document.getElementById('info-content');
    const partLabel    = document.getElementById('part-label');
    const partLabelTxt = document.getElementById('part-label-text');
    const toastEl      = document.getElementById('toast');
    const toastText    = document.getElementById('toast-text');
    const progressFill = document.getElementById('progress-fill');

    // Zoom control
    const zoomControl  = document.getElementById('zoom-control');
    const zoomSlider   = document.getElementById('zoom-slider');

    // AR overlay elements
    const arStatusText = document.getElementById('ar-status-text');
    const arPickupBtn  = document.getElementById('ar-pickup-btn');
    const arResetBtn   = document.getElementById('ar-reset-btn');
    const arTipsModal  = document.getElementById('ar-tips-modal');
    const arTipsGo     = document.getElementById('ar-tips-go');
    const arTipsClose  = document.getElementById('ar-tips-close');

    // ─── Platform ───
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // ─── Part names ───
    const PART_NAMES = {
        brain:      'Brain',
        skull_cap:  'Skull Cap',
        face:       'Face',
        tumor:      'Tumor',
        ventricle:  'Ventricles',
    };

    // ─── State ───
    let highlightedMaterial = null;
    let originalEmissive = null;
    let arPlaced = false;
    let arActive = false;

    // ════════════════════════════════════════
    // Loading
    // ════════════════════════════════════════
    mv.addEventListener('progress', (e) => {
        const pct = Math.round(e.detail.totalProgress * 100);
        progressFill.style.width = pct + '%';
        loadStatus.textContent = 'Loading model: ' + pct + '%';
    });

    mv.addEventListener('load', () => {
        loadStatus.textContent = 'Ready';
        progressFill.style.width = '100%';

        loadScreen.classList.add('fade-out');
        setTimeout(() => {
            loadScreen.classList.add('hidden');
            topBar.classList.remove('hidden');
            bottomBar.classList.remove('hidden');
            enterArBtn.classList.remove('hidden');
            zoomControl.classList.remove('hidden');
        }, 500);

        showToast('Use the slider to zoom. Drag to rotate. Tap a part to highlight.', 5000);
    });

    mv.addEventListener('error', () => {
        loadStatus.textContent = 'Error loading model. Please refresh.';
    });

    // ════════════════════════════════════════
    // Zoom slider
    // Maps slider 1..100 → camera orbit 300%..50%
    // (higher slider = more zoomed in = closer camera)
    // ════════════════════════════════════════
    zoomSlider.addEventListener('input', () => {
        const val = parseInt(zoomSlider.value, 10);
        // Linear map: 1→300%, 100→50%
        const orbitPct = 300 - (val - 1) * (250 / 99);
        mv.cameraOrbit = `auto auto ${orbitPct.toFixed(1)}%`;
    });

    // ════════════════════════════════════════
    // AR — trigger model-viewer's native AR
    // WebXR (ARCore) on Android Chrome
    // AR Quick Look (ARKit) on iOS Safari
    // Scene Viewer fallback on older Android
    // ════════════════════════════════════════
    enterArBtn.addEventListener('click', () => {
        if (mv.canActivateAR) {
            if (isIOS) {
                // Show gesture tips modal before launching Quick Look
                arTipsModal.classList.remove('hidden');
            } else {
                mv.activateAR();
            }
        } else {
            showToast('AR not supported on this device. Try on a phone.', 4000);
        }
    });

    // ─── iOS tips modal ───
    arTipsGo.addEventListener('click', () => {
        arTipsModal.classList.add('hidden');
        mv.activateAR();
    });

    arTipsClose.addEventListener('click', () => {
        arTipsModal.classList.add('hidden');
    });

    arTipsModal.addEventListener('click', (e) => {
        if (e.target === arTipsModal || e.target.classList.contains('ar-tips-backdrop')) {
            arTipsModal.classList.add('hidden');
        }
    });

    // ─── AR status tracking ───
    mv.addEventListener('ar-status', (e) => {
        const s = e.detail.status;
        if (s === 'session-started') {
            arActive = true;
            arPlaced = false;
            if (arPickupBtn) arPickupBtn.classList.add('hidden');
            if (arStatusText) arStatusText.textContent = 'Point at a flat surface, then tap to place';
        } else if (s === 'object-placed') {
            arPlaced = true;
            if (arPickupBtn) arPickupBtn.classList.remove('hidden');
            if (arStatusText) arStatusText.textContent = 'Model placed! Use buttons below to reposition.';
        } else if (s === 'not-presenting') {
            arActive = false;
            arPlaced = false;
        } else if (s === 'failed') {
            arActive = false;
            showToast('AR failed to start. Ensure camera permissions are granted.', 4000);
        }
    });

    mv.addEventListener('quick-look-button-tapped', () => {
        console.log('iOS AR Quick Look opened');
    });

    // ════════════════════════════════════════
    // AR overlay controls (WebXR DOM overlay)
    // ════════════════════════════════════════
    function reenterAR() {
        // Exit the current AR session via model-viewer's hidden AR button,
        // then re-enter. This resets the placement so the model follows
        // the hit-test reticle again (~2-3 ft in front of the user).
        mvArBtn.click();
        const onExit = (ev) => {
            if (ev.detail.status === 'not-presenting') {
                mv.removeEventListener('ar-status', onExit);
                setTimeout(() => mv.activateAR(), 400);
            }
        };
        mv.addEventListener('ar-status', onExit);
    }

    arResetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reenterAR();
    });

    arPickupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reenterAR();
    });

    // ════════════════════════════════════════
    // Tap-to-highlight anatomy parts
    // Uses model-viewer's material API
    // ════════════════════════════════════════
    mv.addEventListener('click', (event) => {
        // Only handle in non-AR mode
        if (mv.isPresenting) return;

        const rect = mv.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Use model-viewer's built-in surface detection
        const hit = mv.positionAndNormalFromPoint(x, y);
        if (!hit) {
            unhighlight();
            return;
        }

        // Find which material was hit by checking model-viewer's materials
        // model-viewer exposes materials via mv.model.materials
        const model = mv.model;
        if (!model) return;

        // Try to identify the part via internal mesh names
        // We access model-viewer's Three.js internals for raycasting
        try {
            const scene = mv.modelScene || getInternalScene(mv);
            if (scene) {
                const THREE = getThreeFromMV(mv);
                if (THREE) {
                    const raycaster = new THREE.Raycaster();
                    const mouse = new THREE.Vector2(
                        (x / rect.width) * 2 - 1,
                        -(y / rect.height) * 2 + 1
                    );

                    const camera = findCamera(scene);
                    if (camera) {
                        raycaster.setFromCamera(mouse, camera);
                        const hits = raycaster.intersectObject(scene, true);
                        if (hits.length > 0) {
                            highlightPart(hits[0].object, model);
                            return;
                        }
                    }
                }
            }
        } catch (err) {
            // Fallback: just show generic highlight based on position
            console.log('Raycast fallback:', err.message);
        }

        // Fallback: highlight based on model-viewer materials API
        highlightByMaterialAPI(model);
    });

    function getInternalScene(modelViewer) {
        // model-viewer stores its scene on an internal symbol
        const symbols = Object.getOwnPropertySymbols(modelViewer);
        for (const sym of symbols) {
            const val = modelViewer[sym];
            if (val && val.scene) return val.scene;
            if (val && val.isScene) return val;
        }
        const keys = Object.keys(modelViewer);
        for (const k of keys) {
            if (modelViewer[k] && modelViewer[k].scene) return modelViewer[k].scene;
        }
        return null;
    }

    function getThreeFromMV(modelViewer) {
        try {
            const canvas = modelViewer.shadowRoot.querySelector('canvas');
            if (canvas && canvas.__three_renderer__) {
                return window.THREE;
            }
        } catch (e) {}

        const scene = getInternalScene(modelViewer);
        if (scene && scene.constructor) {
            const proto = Object.getPrototypeOf(scene);
            if (proto.constructor.name === 'Scene') {
                return {
                    Raycaster: findGlobalConstructor('Raycaster'),
                    Vector2: findGlobalConstructor('Vector2'),
                };
            }
        }
        return null;
    }

    function findGlobalConstructor(name) {
        return window[name] || null;
    }

    function findCamera(scene) {
        let cam = null;
        scene.traverse((child) => {
            if (child.isCamera) cam = child;
        });
        return cam;
    }

    function highlightPart(mesh, model) {
        unhighlight();

        const meshName = (mesh.name || '').toLowerCase();

        // Find matching part name
        let displayName = 'Structure';
        for (const [key, label] of Object.entries(PART_NAMES)) {
            if (meshName.includes(key)) {
                displayName = label;
                break;
            }
        }

        // Highlight via model-viewer materials API
        if (model && model.materials) {
            for (const mat of model.materials) {
                const matName = (mat.name || '').toLowerCase();
                for (const key of Object.keys(PART_NAMES)) {
                    if (matName.includes(key) && meshName.includes(key)) {
                        originalEmissive = mat.emissiveFactor.slice();
                        highlightedMaterial = mat;
                        mat.setEmissiveFactor([0.4, 0.3, 0.9]);
                        break;
                    }
                }
                if (highlightedMaterial) break;
            }
        }

        partLabelTxt.textContent = displayName;
        partLabel.classList.remove('hidden');
    }

    function highlightByMaterialAPI(model) {
        // Fallback: cycle through materials and highlight the first one
        if (!model || !model.materials || model.materials.length === 0) return;
        unhighlight();

        const mat = model.materials[0];
        originalEmissive = mat.emissiveFactor.slice();
        highlightedMaterial = mat;
        mat.setEmissiveFactor([0.4, 0.3, 0.9]);

        partLabelTxt.textContent = PART_NAMES[Object.keys(PART_NAMES)[0]] || 'Structure';
        partLabel.classList.remove('hidden');
    }

    function unhighlight() {
        if (highlightedMaterial && originalEmissive) {
            highlightedMaterial.setEmissiveFactor(originalEmissive);
            highlightedMaterial = null;
            originalEmissive = null;
        }
        partLabel.classList.add('hidden');
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
    // Fallback: hide loading if stuck
    // ════════════════════════════════════════
    setTimeout(() => {
        if (!loadScreen.classList.contains('hidden')) {
            loadScreen.classList.add('fade-out');
            setTimeout(() => {
                loadScreen.classList.add('hidden');
                topBar.classList.remove('hidden');
                bottomBar.classList.remove('hidden');
                enterArBtn.classList.remove('hidden');
            }, 500);
        }
    }, 15000);
})();
