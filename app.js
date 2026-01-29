// === AR Brain Viewer — Main Application Logic ===

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
            if (!localStorage.getItem('ar-brain-instructions-seen')) {
                instructionsOverlay.classList.remove('hidden');
            }
        }, 500);
    });

    // === Error Handling ===
    modelViewer.addEventListener('error', (event) => {
        console.error('Model loading error:', event.detail);
        loadingStatus.textContent = 'Error loading model. Please refresh.';
    });

    // === Dismiss Instructions ===
    dismissBtn.addEventListener('click', () => {
        instructionsOverlay.classList.add('hidden');
        localStorage.setItem('ar-brain-instructions-seen', 'true');
    });

    // === Info Panel Toggle ===
    infoToggle.addEventListener('click', () => {
        infoContent.classList.toggle('hidden');
    });

    // === Auto-Rotate Toggle ===
    toggleRotate.addEventListener('change', () => {
        if (toggleRotate.checked) {
            modelViewer.setAttribute('auto-rotate', '');
        } else {
            modelViewer.removeAttribute('auto-rotate');
        }
    });

    // === AR Session Events ===
    modelViewer.addEventListener('ar-status', (event) => {
        if (event.detail.status === 'session-started') {
            console.log('AR session started');
        } else if (event.detail.status === 'not-presenting') {
            console.log('AR session ended');
        } else if (event.detail.status === 'failed') {
            console.warn('AR not supported or failed on this device');
            alert('AR is not available on this device or browser. You can still interact with the 3D model on screen.');
        }
    });

    // === Fallback: hide loading after timeout if model fails silently ===
    setTimeout(() => {
        if (!loadingScreen.classList.contains('hidden')) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }, 15000);
})();
