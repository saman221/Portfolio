import * as THREE from '../vendor/three.module.min.js';

const supportsWebGL = () => {
    try {
        const testCanvas = document.createElement('canvas');
        return Boolean(
            window.WebGLRenderingContext &&
            (testCanvas.getContext('webgl2') || testCanvas.getContext('webgl'))
        );
    } catch {
        return false;
    }
};

const createOrbit = ({ radius, color, tiltX, tiltY, nodeCount, reverse = false }) => {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
    });
    const geometry = new THREE.TorusGeometry(radius, 0.009, 5, 128);
    const ring = new THREE.Mesh(geometry, material);
    group.add(ring);

    const nodeGeometry = new THREE.SphereGeometry(0.045, 8, 8);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color });

    for (let index = 0; index < nodeCount; index += 1) {
        const angle = (index / nodeCount) * Math.PI * 2;
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        group.add(node);
    }

    group.rotation.x = tiltX;
    group.rotation.y = tiltY;
    group.userData.speed = reverse ? -0.13 : 0.16;
    return group;
};

const createParticles = (count) => {
    const positions = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        const distance = 2.1 + Math.random() * 1.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
        positions[(index * 3) + 1] = distance * Math.sin(phi) * Math.sin(theta);
        positions[(index * 3) + 2] = distance * Math.cos(phi);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0x9aa8b6,
        size: 0.018,
        transparent: true,
        opacity: 0.46,
        sizeAttenuation: true,
        depthWrite: false
    });

    return new THREE.Points(geometry, material);
};

export const initCoreScene = async (stage) => {
    const canvas = stage.querySelector('#core-canvas');
    const status = stage.querySelector('[data-render-status]');

    if (!canvas || !supportsWebGL()) return false;

    const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0, lowPower ? 5.9 : 5.35);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowPower,
        powerPreference: lowPower ? 'low-power' : 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const core = new THREE.Group();
    scene.add(core);

    const shellGeometry = new THREE.IcosahedronGeometry(1.02, lowPower ? 1 : 2);
    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0x111927,
        emissive: 0x17265e,
        emissiveIntensity: 0.42,
        metalness: 0.7,
        roughness: 0.32,
        flatShading: true
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    core.add(shell);

    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x9aa8b6,
        transparent: true,
        opacity: 0.32
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry, 22), edgeMaterial);
    edges.scale.setScalar(1.006);
    core.add(edges);

    const innerGeometry = new THREE.IcosahedronGeometry(0.61, 1);
    const innerMaterial = new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        wireframe: true,
        transparent: true,
        opacity: 0.72
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    inner.rotation.set(0.3, 0.45, 0.1);
    core.add(inner);

    const frontendOrbit = createOrbit({
        radius: 1.55,
        color: 0x5f7cff,
        tiltX: Math.PI * 0.62,
        tiltY: Math.PI * 0.08,
        nodeCount: lowPower ? 3 : 5
    });
    const backendOrbit = createOrbit({
        radius: 1.77,
        color: 0xf4f7fb,
        tiltX: Math.PI * 0.18,
        tiltY: Math.PI * 0.55,
        nodeCount: lowPower ? 2 : 4,
        reverse: true
    });
    core.add(frontendOrbit, backendOrbit);

    const panelGeometry = new THREE.PlaneGeometry(0.94, 0.56);
    const panelEdgeGeometry = new THREE.EdgesGeometry(panelGeometry);
    const panelSurfaceMaterial = new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const panelEdgeMaterial = new THREE.LineBasicMaterial({
        color: 0x9aa8b6,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
    });
    const panelBarGeometry = new THREE.BoxGeometry(1, 0.035, 0.018);
    const panelBarMaterial = new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.54
    });
    const panelGroup = new THREE.Group();
    const floatingPanels = [];
    const panelDefinitions = [
        { position: [-1.48, 0.94, -0.56], rotation: [0.12, 0.28, -0.18] },
        { position: [1.5, 0.82, -0.4], rotation: [-0.08, -0.32, 0.16] },
        { position: [-1.48, -0.92, -0.48], rotation: [-0.1, 0.34, 0.12] },
        { position: [1.48, -0.92, -0.62], rotation: [0.1, -0.3, -0.14] }
    ];

    panelDefinitions.forEach((definition, panelIndex) => {
        const panel = new THREE.Group();
        const surface = new THREE.Mesh(panelGeometry, panelSurfaceMaterial);
        const outline = new THREE.LineSegments(panelEdgeGeometry, panelEdgeMaterial);
        outline.position.z = 0.004;
        panel.add(surface, outline);

        const barWidths = [0.66, 0.46, 0.58];
        barWidths.forEach((width, barIndex) => {
            const bar = new THREE.Mesh(panelBarGeometry, panelBarMaterial);
            bar.scale.x = width;
            bar.position.set(-0.09 + (barIndex * 0.05), 0.13 - (barIndex * 0.13), 0.025);
            panel.add(bar);
        });

        panel.position.fromArray(definition.position);
        panel.rotation.set(...definition.rotation);
        panel.userData.basePosition = panel.position.clone();
        panel.userData.drift = panelIndex % 2 === 0 ? 1 : -1;
        panelGroup.add(panel);
        floatingPanels.push(panel);
    });

    const connectorPositions = new Float32Array(floatingPanels.length * 6);
    const connectorGeometry = new THREE.BufferGeometry();
    connectorGeometry.setAttribute('position', new THREE.BufferAttribute(connectorPositions, 3));
    const connectorMaterial = new THREE.LineBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
    });
    const panelConnectors = new THREE.LineSegments(connectorGeometry, connectorMaterial);
    panelGroup.add(panelConnectors);
    core.add(panelGroup);

    const particles = createParticles(lowPower ? 28 : 58);
    scene.add(particles);

    const ambientLight = new THREE.AmbientLight(0x8da0c8, 1.2);
    const keyLight = new THREE.DirectionalLight(0xf4f7fb, 2.1);
    keyLight.position.set(3, 4, 5);
    const cobaltLight = new THREE.PointLight(0x5f7cff, 8, 7, 2);
    cobaltLight.position.set(-2.2, -1.5, 2.3);
    scene.add(ambientLight, keyLight, cobaltLight);

    const pointer = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    let scrollProgress = 0;
    let isVisible = true;
    let isDocumentVisible = !document.hidden;
    let running = false;

    const resize = () => {
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    };

    const onPointerMove = (event) => {
        const rect = stage.getBoundingClientRect();
        pointerTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerTarget.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onPointerLeave = () => pointerTarget.set(0, 0);
    const onScroll = () => {
        scrollProgress = Math.min(Math.max(window.scrollY / Math.max(window.innerHeight, 1), 0), 1.4);
    };

    const timer = new THREE.Timer();
    timer.connect(document);
    let elapsed = 0;

    const renderFrame = (timestamp) => {
        timer.update(timestamp);
        elapsed += Math.min(timer.getDelta(), 0.05);
        pointer.lerp(pointerTarget, 0.045);

        core.rotation.y = (elapsed * 0.12) + (pointer.x * 0.22);
        core.rotation.x = (pointer.y * 0.16) + Math.sin(elapsed * 0.25) * 0.04;
        core.rotation.z = scrollProgress * 0.15;
        inner.rotation.x -= 0.0022;
        inner.rotation.y += 0.0032;
        frontendOrbit.rotation.z += frontendOrbit.userData.speed * 0.006;
        backendOrbit.rotation.z += backendOrbit.userData.speed * 0.006;
        particles.rotation.y = elapsed * 0.018;
        particles.rotation.x = -pointer.y * 0.04;

        floatingPanels.forEach((panel, panelIndex) => {
            const base = panel.userData.basePosition;
            const spread = 1 + (scrollProgress * 0.14);
            panel.position.x += ((base.x * spread) - panel.position.x) * 0.045;
            panel.position.y += ((base.y * spread) - panel.position.y) * 0.045;
            panel.position.z = base.z + (scrollProgress * 0.18) + (Math.sin(elapsed * 0.38 + panelIndex) * 0.025);
            panel.rotation.z += panel.userData.drift * 0.00035;

            const positionOffset = panelIndex * 6;
            connectorPositions[positionOffset] = 0;
            connectorPositions[positionOffset + 1] = 0;
            connectorPositions[positionOffset + 2] = -0.16;
            connectorPositions[positionOffset + 3] = panel.position.x * 0.72;
            connectorPositions[positionOffset + 4] = panel.position.y * 0.72;
            connectorPositions[positionOffset + 5] = panel.position.z;
        });
        connectorGeometry.attributes.position.needsUpdate = true;

        camera.position.x += ((pointer.x * 0.12) - camera.position.x) * 0.035;
        camera.position.y += ((pointer.y * 0.1) - camera.position.y) * 0.035;
        camera.position.z += (((lowPower ? 5.9 : 5.35) - (scrollProgress * 0.18)) - camera.position.z) * 0.035;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
    };

    const start = () => {
        if (running || !isVisible || !isDocumentVisible) return;
        running = true;
        stage.dataset.renderState = 'running';
        timer.reset();
        renderer.setAnimationLoop(renderFrame);
    };

    const stop = () => {
        stage.dataset.renderState = 'paused';
        if (!running) return;
        running = false;
        renderer.setAnimationLoop(null);
    };

    const visibilityObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        isVisible ? start() : stop();
    }, { rootMargin: '100px', threshold: 0.01 });

    const onVisibilityChange = () => {
        isDocumentVisible = !document.hidden;
        isDocumentVisible ? start() : stop();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    visibilityObserver.observe(stage);
    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    onScroll();
    resize();
    renderer.render(scene, camera);
    start();

    if (status) status.textContent = lowPower ? 'WEBGL / LITE' : 'WEBGL / ACTIVE';

    window.addEventListener('pagehide', () => {
        stop();
        visibilityObserver.disconnect();
        resizeObserver.disconnect();
        stage.removeEventListener('pointermove', onPointerMove);
        stage.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('scroll', onScroll);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        shellGeometry.dispose();
        shellMaterial.dispose();
        edgeMaterial.dispose();
        innerGeometry.dispose();
        innerMaterial.dispose();
        panelGeometry.dispose();
        panelEdgeGeometry.dispose();
        panelSurfaceMaterial.dispose();
        panelEdgeMaterial.dispose();
        panelBarGeometry.dispose();
        panelBarMaterial.dispose();
        connectorGeometry.dispose();
        connectorMaterial.dispose();
        frontendOrbit.traverse((object) => {
            object.geometry?.dispose?.();
            object.material?.dispose?.();
        });
        backendOrbit.traverse((object) => {
            object.geometry?.dispose?.();
            object.material?.dispose?.();
        });
        particles.geometry.dispose();
        particles.material.dispose();
        timer.dispose();
        renderer.dispose();
    }, { once: true });

    return true;
};

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

const smoothStep = (edgeStart, edgeEnd, value) => {
    const normalized = clamp01((value - edgeStart) / Math.max(edgeEnd - edgeStart, 0.0001));
    return normalized * normalized * (3 - (2 * normalized));
};

export const initArchitectureScene = async (stage) => {
    const canvas = stage.querySelector('#architecture-canvas');
    const status = stage.querySelector('[data-architecture-render-status]');
    const architecture = stage.closest('[data-architecture]');
    const steps = architecture ? [...architecture.querySelectorAll('[data-architecture-step]')] : [];

    if (!canvas || !architecture || !supportsWebGL()) return false;

    const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    const baseCameraZ = lowPower ? 9.1 : 8.2;
    camera.position.set(0, 0, baseCameraZ);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowPower,
        powerPreference: lowPower ? 'low-power' : 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const geometries = new Set();
    const materials = new Set();
    const registerGeometry = (geometry) => {
        geometries.add(geometry);
        return geometry;
    };
    const registerMaterial = (material, baseOpacity = material.opacity ?? 1) => {
        material.userData.baseOpacity = baseOpacity;
        materials.add(material);
        return material;
    };

    const model = new THREE.Group();
    model.rotation.set(-0.08, -0.12, 0.02);
    scene.add(model);

    const layerGroups = [];
    const addLayer = (group, index, finalPosition, layerMaterials) => {
        group.userData.index = index;
        group.userData.finalPosition = new THREE.Vector3(...finalPosition);
        group.userData.collapsedPosition = new THREE.Vector3(0, 0, -0.16 * index);
        group.userData.materials = layerMaterials;
        group.position.copy(group.userData.collapsedPosition);
        group.scale.setScalar(index === 0 ? 1 : 0.72);
        model.add(group);
        layerGroups.push(group);
        return group;
    };

    const interfaceGroup = new THREE.Group();
    const interfacePlaneGeometry = registerGeometry(new THREE.PlaneGeometry(2.62, 1.48));
    const interfaceEdgesGeometry = registerGeometry(new THREE.EdgesGeometry(interfacePlaneGeometry));
    const interfaceSurfaceMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false
    }), 0.11);
    const interfaceEdgeMaterial = registerMaterial(new THREE.LineBasicMaterial({
        color: 0x7f96ff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
    }), 0.78);
    interfaceGroup.add(
        new THREE.Mesh(interfacePlaneGeometry, interfaceSurfaceMaterial),
        new THREE.LineSegments(interfaceEdgesGeometry, interfaceEdgeMaterial)
    );

    const uiBarGeometry = registerGeometry(new THREE.BoxGeometry(1, 0.055, 0.025));
    const uiBarMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0xf4f7fb,
        transparent: true,
        opacity: 0.68
    }), 0.68);
    [0.78, 0.5, 0.64, 0.37].forEach((width, index) => {
        const bar = new THREE.Mesh(uiBarGeometry, uiBarMaterial);
        bar.scale.x = width;
        bar.position.set(-0.38 + (index % 2) * 0.15, 0.42 - (index * 0.25), 0.04);
        interfaceGroup.add(bar);
    });
    addLayer(interfaceGroup, 0, [1.02, 1.52, 0.46], [interfaceSurfaceMaterial, interfaceEdgeMaterial, uiBarMaterial]);

    const flowGroup = new THREE.Group();
    const flowMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
    }), 0.78);
    const flowGeometryOuter = registerGeometry(new THREE.TorusGeometry(1.08, 0.018, 6, lowPower ? 72 : 112));
    const flowGeometryInner = registerGeometry(new THREE.TorusGeometry(0.66, 0.012, 6, lowPower ? 56 : 88));
    const flowOuter = new THREE.Mesh(flowGeometryOuter, flowMaterial);
    const flowInner = new THREE.Mesh(flowGeometryInner, flowMaterial);
    flowInner.rotation.set(0.62, 0.1, 0.24);
    flowGroup.add(flowOuter, flowInner);

    const flowNodeGeometry = registerGeometry(new THREE.SphereGeometry(0.055, 8, 8));
    const flowNodeMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0xf4f7fb,
        transparent: true,
        opacity: 1,
    }), 1);
    const flowNodeCount = lowPower ? 4 : 7;
    for (let index = 0; index < flowNodeCount; index += 1) {
        const angle = (index / flowNodeCount) * Math.PI * 2;
        const node = new THREE.Mesh(flowNodeGeometry, flowNodeMaterial);
        node.position.set(Math.cos(angle) * 1.08, Math.sin(angle) * 1.08, 0);
        flowGroup.add(node);
    }
    addLayer(flowGroup, 1, [-1.04, 0.55, 0.16], [flowMaterial, flowNodeMaterial]);

    const logicGroup = new THREE.Group();
    const logicGeometry = registerGeometry(new THREE.BoxGeometry(1.5, 1.05, 0.9));
    const logicEdgesGeometry = registerGeometry(new THREE.EdgesGeometry(logicGeometry));
    const logicMaterial = registerMaterial(new THREE.MeshStandardMaterial({
        color: 0x111927,
        emissive: 0x1d2c70,
        emissiveIntensity: 0.58,
        metalness: 0.68,
        roughness: 0.32,
        transparent: true,
        opacity: 0.9
    }), 0.9);
    const logicEdgeMaterial = registerMaterial(new THREE.LineBasicMaterial({
        color: 0xf4f7fb,
        transparent: true,
        opacity: 0.54
    }), 0.54);
    logicGroup.add(
        new THREE.Mesh(logicGeometry, logicMaterial),
        new THREE.LineSegments(logicEdgesGeometry, logicEdgeMaterial)
    );
    const logicCoreGeometry = registerGeometry(new THREE.OctahedronGeometry(0.34, 0));
    const logicCoreMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0x5f7cff,
        wireframe: true,
        transparent: true,
        opacity: 0.88
    }), 0.88);
    const logicCore = new THREE.Mesh(logicCoreGeometry, logicCoreMaterial);
    logicGroup.add(logicCore);
    addLayer(logicGroup, 2, [0.84, -0.48, 0], [logicMaterial, logicEdgeMaterial, logicCoreMaterial]);

    const dataGroup = new THREE.Group();
    const dataGeometry = registerGeometry(new THREE.CylinderGeometry(0.68, 0.68, 0.22, lowPower ? 20 : 32));
    const dataEdgesGeometry = registerGeometry(new THREE.EdgesGeometry(dataGeometry));
    const dataMaterial = registerMaterial(new THREE.MeshStandardMaterial({
        color: 0x18233a,
        emissive: 0x152250,
        emissiveIntensity: 0.34,
        metalness: 0.54,
        roughness: 0.38,
        transparent: true,
        opacity: 0.88
    }), 0.88);
    const dataEdgeMaterial = registerMaterial(new THREE.LineBasicMaterial({
        color: 0x7f96ff,
        transparent: true,
        opacity: 0.58
    }), 0.58);
    for (let index = 0; index < 4; index += 1) {
        const disk = new THREE.Mesh(dataGeometry, dataMaterial);
        const diskEdges = new THREE.LineSegments(dataEdgesGeometry, dataEdgeMaterial);
        disk.position.y = index * 0.31;
        diskEdges.position.y = index * 0.31;
        dataGroup.add(disk, diskEdges);
    }
    dataGroup.rotation.z = -0.08;
    addLayer(dataGroup, 3, [-0.92, -1.72, -0.3], [dataMaterial, dataEdgeMaterial]);

    const connectorPositions = new Float32Array(layerGroups.length * 3);
    const connectorGeometry = registerGeometry(new THREE.BufferGeometry());
    connectorGeometry.setAttribute('position', new THREE.BufferAttribute(connectorPositions, 3));
    const connectorMaterial = registerMaterial(new THREE.LineBasicMaterial({
        color: 0x5f7cff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    }), 0.5);
    const connector = new THREE.Line(connectorGeometry, connectorMaterial);
    model.add(connector);

    const particleCount = lowPower ? 30 : 72;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
        particlePositions[index * 3] = (Math.random() - 0.5) * 6.8;
        particlePositions[(index * 3) + 1] = (Math.random() - 0.5) * 6.8;
        particlePositions[(index * 3) + 2] = (Math.random() - 0.5) * 3.4;
    }
    const particleGeometry = registerGeometry(new THREE.BufferGeometry());
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = registerMaterial(new THREE.PointsMaterial({
        color: 0x9aa8b6,
        size: 0.022,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
    }), 0.38);
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const ambientLight = new THREE.AmbientLight(0x8392b4, 1.35);
    const keyLight = new THREE.DirectionalLight(0xf4f7fb, 2.35);
    keyLight.position.set(3.5, 4.5, 6);
    const accentLight = new THREE.PointLight(0x5f7cff, 9, 8, 2);
    accentLight.position.set(-2.2, -1.4, 2.8);
    scene.add(ambientLight, keyLight, accentLight);

    const pointer = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    const timer = new THREE.Timer();
    timer.connect(document);
    let elapsed = 0;
    let scrollProgress = lowPower ? 1 : 0;
    let scrollTarget = scrollProgress;
    let firstStepCenter = 0;
    let lastStepCenter = 1;
    let isVisible = true;
    let isDocumentVisible = !document.hidden;
    let running = false;
    let lastProgressAttribute = '';

    const updateScrollMetrics = () => {
        if (!steps.length) return;

        const firstRect = steps[0].getBoundingClientRect();
        const lastRect = steps[steps.length - 1].getBoundingClientRect();
        firstStepCenter = window.scrollY + firstRect.top + (firstRect.height / 2);
        lastStepCenter = window.scrollY + lastRect.top + (lastRect.height / 2);
    };

    const updateScrollTarget = () => {
        if (lowPower || window.innerWidth <= 820) {
            scrollTarget = 1;
            return;
        }

        const viewportFocus = window.scrollY + (window.innerHeight * 0.52);
        scrollTarget = clamp01((viewportFocus - firstStepCenter) / Math.max(lastStepCenter - firstStepCenter, 1));
    };

    const resize = () => {
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        updateScrollMetrics();
        updateScrollTarget();
    };

    const onPointerMove = (event) => {
        const rect = stage.getBoundingClientRect();
        pointerTarget.x = (((event.clientX - rect.left) / rect.width) * 2) - 1;
        pointerTarget.y = -((((event.clientY - rect.top) / rect.height) * 2) - 1);
    };

    const onPointerLeave = () => pointerTarget.set(0, 0);

    const renderFrame = (timestamp) => {
        timer.update(timestamp);
        elapsed += Math.min(timer.getDelta(), 0.05);
        pointer.lerp(pointerTarget, lowPower ? 0.035 : 0.05);
        scrollProgress += (scrollTarget - scrollProgress) * (lowPower ? 0.12 : 0.065);

        const phase = scrollProgress * (layerGroups.length - 1);
        layerGroups.forEach((group, index) => {
            const reveal = index === 0 ? 1 : smoothStep(index - 0.82, index + 0.08, phase);
            const highlight = 1 - Math.min(Math.abs(phase - index), 1);
            const finalPosition = group.userData.finalPosition;
            const collapsedPosition = group.userData.collapsedPosition;
            const targetX = THREE.MathUtils.lerp(collapsedPosition.x, finalPosition.x, reveal);
            const targetY = THREE.MathUtils.lerp(collapsedPosition.y, finalPosition.y, reveal);
            const targetZ = THREE.MathUtils.lerp(collapsedPosition.z, finalPosition.z, reveal);
            const targetScale = 0.72 + (reveal * 0.28);

            group.position.x += (targetX - group.position.x) * 0.075;
            group.position.y += (targetY - group.position.y) * 0.075;
            group.position.z += (targetZ - group.position.z) * 0.075;
            const nextScale = group.scale.x + ((targetScale - group.scale.x) * 0.075);
            group.scale.setScalar(nextScale);

            group.userData.materials.forEach((material) => {
                const baseOpacity = material.userData.baseOpacity ?? 1;
                material.opacity = baseOpacity * (0.12 + (reveal * 0.64) + (highlight * 0.24));
            });
        });

        logicCore.rotation.x += 0.003;
        logicCore.rotation.y += 0.004;
        flowGroup.rotation.z = (elapsed * 0.12) + (pointer.x * 0.08);
        interfaceGroup.rotation.y = -0.08 + (pointer.x * 0.07);
        dataGroup.rotation.y = pointer.x * 0.08;

        layerGroups.forEach((group, index) => {
            const offset = index * 3;
            connectorPositions[offset] = group.position.x;
            connectorPositions[offset + 1] = group.position.y;
            connectorPositions[offset + 2] = group.position.z;
        });
        connectorGeometry.attributes.position.needsUpdate = true;
        connectorMaterial.opacity = 0.12 + (scrollProgress * 0.42);

        model.rotation.y += (((pointer.x * 0.16) - 0.12) - model.rotation.y) * 0.035;
        model.rotation.x += (((-pointer.y * 0.1) - 0.08) - model.rotation.x) * 0.035;
        model.rotation.z = Math.sin(elapsed * 0.18) * 0.018;
        particles.rotation.y = elapsed * 0.012;
        particles.rotation.x = pointer.y * 0.025;

        camera.position.x += ((pointer.x * 0.16) - camera.position.x) * 0.03;
        camera.position.y += ((pointer.y * 0.12) - camera.position.y) * 0.03;
        camera.position.z += ((baseCameraZ - (scrollProgress * 0.36)) - camera.position.z) * 0.03;
        camera.lookAt(0, 0, 0);

        const progressAttribute = scrollProgress.toFixed(3);
        if (progressAttribute !== lastProgressAttribute) {
            stage.dataset.architectureProgress = progressAttribute;
            stage.style.setProperty('--arch-progress', progressAttribute);
            lastProgressAttribute = progressAttribute;
        }

        renderer.render(scene, camera);
    };

    const start = () => {
        if (running || !isVisible || !isDocumentVisible) return;
        running = true;
        stage.dataset.renderState = 'running';
        timer.reset();
        renderer.setAnimationLoop(renderFrame);
    };

    const stop = () => {
        stage.dataset.renderState = 'paused';
        if (!running) return;
        running = false;
        renderer.setAnimationLoop(null);
    };

    const visibilityObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        isVisible ? start() : stop();
    }, { rootMargin: '120px', threshold: 0.01 });

    const onVisibilityChange = () => {
        isDocumentVisible = !document.hidden;
        isDocumentVisible ? start() : stop();
    };

    const onContextLost = (event) => {
        event.preventDefault();
        stop();
        stage.dataset.renderState = 'fallback';
        stage.classList.remove('is-webgl-ready');
        if (status) status.textContent = 'STATIC / CONTEXT LOST';
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    visibilityObserver.observe(stage);
    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    window.addEventListener('scroll', updateScrollTarget, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    resize();
    renderer.render(scene, camera);
    start();

    if (status) status.textContent = lowPower ? 'WEBGL / LITE' : 'WEBGL / ACTIVE';

    window.addEventListener('pagehide', () => {
        stop();
        visibilityObserver.disconnect();
        resizeObserver.disconnect();
        window.removeEventListener('scroll', updateScrollTarget);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        timer.dispose();
        renderer.dispose();
    }, { once: true });

    return true;
};
