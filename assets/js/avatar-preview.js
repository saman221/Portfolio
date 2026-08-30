import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js';

const MODEL_URL = './assets/models/saman-avatar.glb';
const body = document.body;
const canvas = document.querySelector('#avatar-canvas');
const stage = document.querySelector('#viewer-stage');
const loading = document.querySelector('#model-loading');
const loadingLabel = document.querySelector('#loading-label');
const loadingProgress = document.querySelector('#loading-progress');
const loadingPercent = document.querySelector('#loading-percent');
const fallback = document.querySelector('#avatar-fallback');
const fallbackMessage = document.querySelector('#fallback-message');
const renderBadge = document.querySelector('#render-badge bdi');
const clipButtons = [...document.querySelectorAll('[data-clip]')];
const togglePlay = document.querySelector('#toggle-play');
const togglePlayLabel = togglePlay.querySelector('span');
const resetViewButton = document.querySelector('#reset-view');
const morphInputs = [...document.querySelectorAll('[data-morph]')];
const blinkButton = document.querySelector('#trigger-blink');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactViewport = window.matchMedia('(max-width: 700px)');

let renderer;
let scene;
let camera;
let controls;
let mixer;
let previousFrameTime = performance.now();
let avatar;
let activeAction;
let activeClipName = 'Idle';
let paused = false;
let frameRequest = 0;
let stageVisible = true;
let defaultCameraPosition = new THREE.Vector3();
let defaultTarget = new THREE.Vector3();
let nextBlinkAt = 0;
const actions = new Map();
const morphMeshes = [];

const supportsWebGL = () => {
    try {
        const probe = document.createElement('canvas');
        return Boolean(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
    } catch {
        return false;
    }
};

const setControlsDisabled = (disabled) => {
    [...clipButtons, togglePlay, resetViewButton, blinkButton, ...morphInputs].forEach((control) => {
        control.disabled = disabled;
    });
};

const showFallback = (message, status = 'STATIC FALLBACK') => {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    canvas.hidden = true;
    fallback.hidden = false;
    loading.classList.add('is-complete');
    fallbackMessage.textContent = message;
    renderBadge.textContent = status;
    body.dataset.modelStatus = status === 'LOAD ERROR' ? 'error' : 'static';
    body.dataset.renderState = 'paused';
    setControlsDisabled(true);
};

const updateLoading = (loaded, total) => {
    const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 35;
    loadingProgress.style.width = `${percent}%`;
    loadingPercent.innerHTML = `<bdi>${percent}%</bdi>`;
    loadingLabel.textContent = percent > 80 ? 'در حال آماده‌سازی صحنه' : 'در حال بارگذاری مدل';
};

const setMorph = (name, value) => {
    morphMeshes.forEach((mesh) => {
        const index = mesh.morphTargetDictionary?.[name];
        if (index !== undefined) {
            mesh.morphTargetInfluences[index] = value;
        }
    });
};

const blink = () => {
    if (paused || body.dataset.modelStatus !== 'ready') return;
    const start = performance.now();
    const duration = 220;
    const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const influence = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        setMorph('BlinkLeft', influence);
        setMorph('BlinkRight', influence);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
};

const updateClipButtons = () => {
    clipButtons.forEach((button) => {
        const selected = button.dataset.clip === activeClipName;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    body.dataset.activeAnimation = activeClipName;
};

const playClip = (name) => {
    const action = actions.get(name);
    if (!action) return;
    if (activeAction && activeAction !== action) {
        activeAction.fadeOut(0.2);
    }
    activeClipName = name;
    activeAction = action;
    action.reset().fadeIn(0.2);
    if (name === 'Intro') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
    } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
    }
    action.paused = paused;
    action.play();
    nextBlinkAt = performance.now() + 1800;
    updateClipButtons();
};

const setPaused = (value) => {
    paused = value;
    if (activeAction) activeAction.paused = value;
    togglePlay.setAttribute('aria-pressed', String(value));
    togglePlayLabel.textContent = value ? 'ادامه حرکت' : 'توقف حرکت';
    body.dataset.renderState = value ? 'animation-paused' : 'running';
};

const fitCamera = () => {
    if (!avatar || !camera || !controls) return;
    const bounds = new THREE.Box3().setFromObject(avatar);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
    const distanceForWidth = size.x / (2 * Math.tan(verticalFov / 2) * camera.aspect);
    const distance = Math.max(distanceForHeight, distanceForWidth) * 0.94;
    defaultTarget.copy(center).add(new THREE.Vector3(0, size.y * 0.01, 0));
    defaultCameraPosition.set(center.x, center.y + size.y * 0.02, center.z + distance);
    camera.position.copy(defaultCameraPosition);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    controls.target.copy(defaultTarget);
    controls.minDistance = distance * 0.58;
    controls.maxDistance = distance * 1.75;
    controls.update();
};

const resetView = () => {
    if (!camera || !controls) return;
    camera.position.copy(defaultCameraPosition);
    controls.target.copy(defaultTarget);
    controls.update();
};

const resize = () => {
    if (!renderer || !camera) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
};

const animate = (timestamp) => {
    frameRequest = 0;
    if (!renderer || !stageVisible || document.hidden || motionPreference.matches) return;
    const delta = Math.min((timestamp - previousFrameTime) / 1000, 0.05);
    previousFrameTime = timestamp;
    if (mixer && !paused) mixer.update(delta);
    if (!paused && activeClipName === 'Idle' && performance.now() >= nextBlinkAt) {
        blink();
        nextBlinkAt = performance.now() + 2600 + Math.random() * 2200;
    }
    controls.update();
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(animate);
};

const startRendering = () => {
    if (!frameRequest && renderer && stageVisible && !document.hidden && !motionPreference.matches) {
        previousFrameTime = performance.now();
        frameRequest = requestAnimationFrame(animate);
    }
};

const initViewer = () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    camera.position.set(0, 2.5, 7.5);

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !compactViewport.matches,
        alpha: true,
        powerPreference: compactViewport.matches ? 'low-power' : 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactViewport.matches ? 1.25 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !compactViewport.matches;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.78;

    const hemisphere = new THREE.HemisphereLight(0xaec9ff, 0x101522, 2.2);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffdcc4, 4.6);
    key.position.set(-3.8, 6.4, 5.4);
    key.castShadow = !compactViewport.matches;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5f91ff, 3.2);
    rim.position.set(4.5, 4.8, -4.2);
    scene.add(rim);

    resize();
    const loader = new GLTFLoader();
    loader.load(
        MODEL_URL,
        (gltf) => {
            avatar = gltf.scene;
            avatar.traverse((child) => {
                if (!child.isMesh && !child.isSkinnedMesh) return;
                child.castShadow = !compactViewport.matches;
                child.receiveShadow = true;
                if (child.morphTargetDictionary) morphMeshes.push(child);
            });
            scene.add(avatar);
            mixer = new THREE.AnimationMixer(avatar);
            gltf.animations.forEach((clip) => actions.set(clip.name, mixer.clipAction(clip)));
            mixer.addEventListener('finished', () => {
                if (activeClipName === 'Intro') playClip('Idle');
            });
            fitCamera();
            loadingProgress.style.width = '100%';
            loadingPercent.innerHTML = '<bdi>100%</bdi>';
            loadingLabel.textContent = 'مدل آماده است';
            window.setTimeout(() => loading.classList.add('is-complete'), 180);
            body.dataset.modelStatus = 'ready';
            body.dataset.renderState = 'running';
            renderBadge.textContent = compactViewport.matches ? 'WEBGL / LITE' : 'WEBGL / ACTIVE';
            setControlsDisabled(false);
            playClip(actions.has('Idle') ? 'Idle' : gltf.animations[0]?.name);
            startRendering();
        },
        (event) => updateLoading(event.loaded, event.total),
        (error) => {
            console.error('Avatar model failed to load.', error);
            showFallback('بارگذاری مدل سه‌بعدی ممکن نشد؛ رندر ثابت نمایش داده شده است.', 'LOAD ERROR');
        },
    );

    new ResizeObserver(() => {
        resize();
        if (avatar) fitCamera();
    }).observe(stage);

    new IntersectionObserver(([entry]) => {
        stageVisible = entry.isIntersecting;
        body.dataset.renderState = stageVisible && !document.hidden ? (paused ? 'animation-paused' : 'running') : 'paused';
        if (stageVisible) startRendering();
    }, { threshold: 0.02 }).observe(stage);
};

clipButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setPaused(false);
        playClip(button.dataset.clip);
    });
});

togglePlay.addEventListener('click', () => setPaused(!paused));
resetViewButton.addEventListener('click', resetView);
blinkButton.addEventListener('click', blink);

morphInputs.forEach((input) => {
    input.addEventListener('input', () => {
        const value = Number(input.value);
        setMorph(input.dataset.morph, value);
        input.closest('.morph-control').querySelector('output').textContent = `${Math.round(value * 100)}%`;
    });
});

canvas.addEventListener('keydown', (event) => {
    if (!controls || !camera) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', ' ', '+', '=', '-', '_'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? 0.12 : -0.12);
        camera.position.copy(controls.target).add(offset);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        camera.position.y += event.key === 'ArrowUp' ? 0.12 : -0.12;
    } else if (event.key === 'Home') {
        resetView();
    } else if (event.key === ' ') {
        setPaused(!paused);
    } else {
        offset.multiplyScalar(event.key === '+' || event.key === '=' ? 0.9 : 1.1);
        camera.position.copy(controls.target).add(offset);
    }
    controls.update();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) startRendering();
});

motionPreference.addEventListener('change', (event) => {
    if (event.matches) {
        showFallback('به‌دلیل فعال بودن Reduce Motion، رندر ثابت نمایش داده شده است.', 'REDUCED MOTION');
    } else {
        window.location.reload();
    }
});

if (motionPreference.matches) {
    showFallback('به‌دلیل فعال بودن Reduce Motion، رندر ثابت نمایش داده شده است.', 'REDUCED MOTION');
} else if (!supportsWebGL()) {
    showFallback('مرورگر از WebGL پشتیبانی نمی‌کند؛ رندر ثابت نمایش داده شده است.', 'NO WEBGL');
} else {
    setControlsDisabled(true);
    initViewer();
}
