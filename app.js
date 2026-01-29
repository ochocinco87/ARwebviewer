// === Medivis AR Mobile Viewer — Main Application Logic ===

(function () {
    'use strict';

    const modelViewer = document.getElementById('brain-model');
    const loadingScreen = document.getElementById('loading-screen');
    const loadingStatus = document.getElementById('loading-status');
    const instructionsOverlay = document.getElementById('instructions-overlay');
    const dismissBtn = document.getElementById('dismiss-btn');
    const infoToggle = document.getElementById('info-toggle');
    const infoContent = document.getElementById('info-content');
    const toggleRotate = document.getElementById('toggle-rotate');
    const progressFill = document.getElementById('progress-fill');

    // === Loading Progress ===
    modelViewer.addEventListener('progress', (event) => {
        const progress = event.detail.totalProgress;
        const pct = Math.round(progress * 100);
        progressFill.style.width = pct + '%';
        loadingStatus.textContent = 'Loading model: ' + pct + '%';
    });

    // === Model Loaded ===
    modelViewer.addEventListener('load', () => {
        loadingStatus.textContent = 'Ready';
        progressFill.style.width = '100%';

        // Fade out loading screen
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.classList.add('hidden');

            // Show instructions if first visit
            if (!localStorage.getItem('medivis-ar-instructions-seen')) {
                instructionsOverlay.classList.remove('hidden');
            }
        }, 600);
    });

    // === Error Handling ===
    modelViewer.addEventListener('error', (event) => {
        console.error('Model loading error:', event.detail);
        loadingStatus.textContent = 'Error loading model. Please refresh.';
    });

    // === Dismiss Instructions ===
    dismissBtn.addEventListener('click', () => {
        instructionsOverlay.classList.add('hidden');
        localStorage.setItem('medivis-ar-instructions-seen', 'true');
    });

    // === Info Panel Toggle ===
    infoToggle.addEventListener('click', () => {
        infoContent.classList.toggle('hidden');
    });

    // Close info panel when tapping outside
    document.addEventListener('click', (event) => {
        if (!infoContent.classList.contains('hidden') &&
            !infoContent.contains(event.target) &&
            !infoToggle.contains(event.target)) {
            infoContent.classList.add('hidden');
        }
    });

    // === Auto-Rotate Toggle ===
    toggleRotate.addEventListener('change', () => {
        if (toggleRotate.checked) {
            modelViewer.setAttribute('auto-rotate', '');
        } else {
            modelViewer.removeAttribute('auto-rotate');
        }
    });

    // === AR Session Events & Placement Toast ===
    const arToast = document.getElementById('ar-toast');
    const arToastText = document.getElementById('ar-toast-text');
    let arToastTimeout = null;
    let modelPlaced = false;

    function showArToast(message, duration) {
        arToastText.textContent = message;
        arToast.classList.remove('hidden', 'fade-out');
        clearTimeout(arToastTimeout);
        if (duration) {
            arToastTimeout = setTimeout(() => {
                arToast.classList.add('fade-out');
                setTimeout(() => arToast.classList.add('hidden'), 300);
            }, duration);
        }
    }

    function hideArToast() {
        clearTimeout(arToastTimeout);
        arToast.classList.add('fade-out');
        setTimeout(() => arToast.classList.add('hidden'), 300);
    }

    modelViewer.addEventListener('ar-status', (event) => {
        const status = event.detail.status;

        if (status === 'session-started') {
            console.log('AR session started');
            modelPlaced = false;
            showArToast('Point at a flat surface, then tap to place');
        } else if (status === 'object-placed') {
            console.log('Model placed on surface');
            if (!modelPlaced) {
                modelPlaced = true;
                showArToast('Tap another spot to move. Pinch to resize.', 5000);
            } else {
                showArToast('Moved! Pinch to resize, twist to rotate.', 3000);
            }
        } else if (status === 'not-presenting') {
            console.log('AR session ended');
            modelPlaced = false;
            hideArToast();
        } else if (status === 'failed') {
            console.warn('AR not supported or failed on this device');
            hideArToast();
            alert('AR is not available on this device or browser. You can still interact with the 3D model on screen.');
        }
    });

    // === Fallback: hide loading after timeout if model fails silently ===
    setTimeout(() => {
        if (!loadingScreen.classList.contains('hidden')) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 600);
        }
    }, 15000);
})();
