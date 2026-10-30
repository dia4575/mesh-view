/**
 * MeshView Studio — 3D Model Viewer
 * Three.js r170 · ES Modules · Local processing only
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ─── State ───────────────────────────────────────────────────────────
const state = {
  scene: null,
  camera: null,
  orthoCamera: null,
  renderer: null,
  controls: null,
  modelRoot: null,
  originalMaterials: new Map(),
  currentShading: 'material',
  showGrid: true,
  showAxes: true,
  isPerspective: true,
  gridHelper: null,
  axesHelper: null,
  selectedObject: null,
  mixer: null,
  clock: new THREE.Clock(),
  animations: [],
  currentAction: null,
  isPlaying: false,
  measureMode: false,
  measurePoints: [],
  measureLine: null,
  measureMarkers: [],
  fileMeta: { name: '', format: '', size: 0 },
  isolationActive: false,
  hiddenObjects: new Set(),
  // Lights
  ambientLight: null,
  keyLight: null,
  fillLight: null,
  hemiLight: null,
  pmremGenerator: null,
  envTexture: null,
  // Material override defaults
  matOverride: { color: '#c0c8d8', metalness: 0.1, roughness: 0.6 },
  // Loaders (shared)
  gltfLoader: null,
  dracoLoader: null,
};

// ─── DOM refs ────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const canvas = $('#canvas');
const fileInput = $('#file-input');
const dropOverlay = $('#drop-overlay');
const loadingOverlay = $('#loading-overlay');
const loadingText = $('#loading-text');
const progressFill = $('#progress-fill');
const errorToast = $('#error-toast');
const infoToast = $('#info-toast');
const hierarchyTree = $('#hierarchy-tree');
const materialsPanel = $('#materials-panel');
const animControls = $('#anim-controls');
const measureReadout = $('#measure-readout');

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  // Renderer
  try {
    state.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false, // better FPS; screenshot still works after explicit render
    });
  } catch (e) {
    showError('WebGL is not available on this device/browser.');
    return;
  }

  // Cap pixel ratio harder on mobile / low-memory for big models
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  state.basePixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
  state.perfMode = false;
  state.renderer.setPixelRatio(state.basePixelRatio);
  state.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.0;
  state.renderer.shadowMap.enabled = false;

  // Scene
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x1a1d26);

  // Cameras
  const aspect = canvas.clientWidth / canvas.clientHeight || 1;
  state.camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 10000);
  state.camera.position.set(3, 2, 5);

  state.orthoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 10000);
  state.orthoCamera.position.set(3, 2, 5);

  // Controls
  state.controls = new OrbitControls(state.camera, canvas);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.screenSpacePanning = true;
  state.controls.minDistance = 0.01;
  state.controls.maxDistance = 5000;
  state.controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // Lights (stored for UI control)
  state.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  state.scene.add(state.ambientLight);

  state.keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  state.keyLight.position.set(5, 8, 5);
  state.scene.add(state.keyLight);

  state.fillLight = new THREE.DirectionalLight(0xb0c4ff, 0.35);
  state.fillLight.position.set(-4, 2, -3);
  state.scene.add(state.fillLight);

  state.hemiLight = new THREE.HemisphereLight(0x8899bb, 0x222233, 0.3);
  state.scene.add(state.hemiLight);

  // Environment (PMREM) for realistic materials
  state.pmremGenerator = new THREE.PMREMGenerator(state.renderer);
  state.pmremGenerator.compileEquirectangularShader();
  applyEnvironment('studio');

  // Shared GLTF loader with Draco + Meshopt (fixes compressed GLB)
  state.dracoLoader = new DRACOLoader();
  state.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
  state.dracoLoader.setDecoderConfig({ type: 'js' });
  state.dracoLoader.preload();

  state.gltfLoader = new GLTFLoader();
  state.gltfLoader.setDRACOLoader(state.dracoLoader);
  // Meshopt: wait for WASM/JS decoder readiness when available
  const meshoptReady = MeshoptDecoder.ready ? MeshoptDecoder.ready : Promise.resolve();
  meshoptReady.then(() => {
    state.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }).catch(() => {
    // Still set — some builds are sync
    try { state.gltfLoader.setMeshoptDecoder(MeshoptDecoder); } catch (_) {}
  });
  // Also set immediately for sync builds
  try { state.gltfLoader.setMeshoptDecoder(MeshoptDecoder); } catch (_) {}

  // Grid & Axes
  state.gridHelper = new THREE.GridHelper(10, 20, 0x3a4060, 0x252a3a);
  state.gridHelper.name = '__grid';
  state.scene.add(state.gridHelper);

  state.axesHelper = new THREE.AxesHelper(1.5);
  state.axesHelper.name = '__axes';
  state.scene.add(state.axesHelper);

  // Events
  bindUI();
  window.addEventListener('resize', onResize);
  canvas.addEventListener('pointerdown', onCanvasPointerDown);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'o') { e.preventDefault(); fileInput.click(); }
    }
    if (e.key === 'Escape') {
      if (state.measureMode) toggleMeasure(false);
      closeSheets();
      closeSidebars();
    }
    if (e.key === 'f' && state.selectedObject) frameObject(state.selectedObject);
  });

  onResize();
  animate();
  showInfo('Drop a 3D model or click Import to begin');
}

// ─── Animation loop ──────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = state.clock.getDelta();
  if (state.mixer && state.isPlaying) {
    state.mixer.update(delta);
    updateAnimUI();
  }
  state.controls.update();
  const cam = state.isPerspective ? state.camera : state.orthoCamera;
  state.renderer.render(state.scene, cam);
}

// ─── Resize ──────────────────────────────────────────────────────────
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  state.renderer.setSize(w, h, false);
  const dpr = state.perfMode ? 1 : (state.basePixelRatio || Math.min(window.devicePixelRatio || 1, 1.75));
  state.renderer.setPixelRatio(dpr);

  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();

  const frustum = 2.5;
  const aspect = w / h;
  state.orthoCamera.left = -frustum * aspect;
  state.orthoCamera.right = frustum * aspect;
  state.orthoCamera.top = frustum;
  state.orthoCamera.bottom = -frustum;
  state.orthoCamera.updateProjectionMatrix();
}

// ─── UI Binding ──────────────────────────────────────────────────────
function bindUI() {
  $('#btn-import').addEventListener('click', () => fileInput.click());
  $('#mbar-import')?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', onFileSelect);

  $('#btn-clear').addEventListener('click', clearScene);
  $('#btn-screenshot').addEventListener('click', takeScreenshot);
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);

  // Drag & drop
  const vp = $('#viewport');
  ['dragenter', 'dragover'].forEach((ev) => {
    vp.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.add('active');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    vp.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (ev === 'drop') {
        dropOverlay.classList.remove('active');
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
      } else {
        dropOverlay.classList.remove('active');
      }
    });
  });

  // Shading
  $$('[data-shading]').forEach((btn) => {
    btn.addEventListener('click', () => setShading(btn.dataset.shading));
  });

  // Views
  $$('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  $('#btn-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    state.gridHelper.visible = state.showGrid;
    $('#btn-grid').setAttribute('aria-pressed', state.showGrid);
  });

  $('#btn-axes').addEventListener('click', () => {
    state.showAxes = !state.showAxes;
    state.axesHelper.visible = state.showAxes;
    $('#btn-axes').setAttribute('aria-pressed', state.showAxes);
  });

  $('#btn-perspective').addEventListener('click', toggleCameraType);
  $('#sheet-persp')?.addEventListener('click', () => {
    toggleCameraType();
    closeSheets();
  });

  $('#btn-fit').addEventListener('click', () => fitCameraToModel());
  $('#mbar-fit')?.addEventListener('click', () => fitCameraToModel());
  $('#btn-reset-cam').addEventListener('click', resetCamera);

  $('#btn-measure').addEventListener('click', () => toggleMeasure());
  $('#btn-measure-clear')?.addEventListener('click', clearMeasure);

  $('#bg-color').addEventListener('input', (e) => {
    state.scene.background = new THREE.Color(e.target.value);
  });

  // Sidebars mobile
  $('#btn-toggle-left')?.addEventListener('click', () => {
    $('#sidebar-left').classList.toggle('open');
    $('#sidebar-right').classList.remove('open');
  });
  $('#btn-toggle-right')?.addEventListener('click', () => {
    $('#sidebar-right').classList.toggle('open');
    $('#sidebar-left').classList.remove('open');
  });
  $('#btn-close-left')?.addEventListener('click', () => $('#sidebar-left').classList.remove('open'));
  $('#btn-close-right')?.addEventListener('click', () => $('#sidebar-right').classList.remove('open'));

  // Mobile sheets
  $('#mbar-shading')?.addEventListener('click', () => openSheet('sheet-shading'));
  $('#mbar-views')?.addEventListener('click', () => openSheet('sheet-views'));
  $('#sheet-backdrop')?.addEventListener('click', closeSheets);

  // Hierarchy search
  $('#hierarchy-search')?.addEventListener('input', (e) => {
    filterHierarchy(e.target.value.trim().toLowerCase());
  });

  // Selected actions
  $('#btn-frame-selected')?.addEventListener('click', () => {
    if (state.selectedObject) frameObject(state.selectedObject);
  });
  $('#btn-isolate')?.addEventListener('click', toggleIsolate);
  $('#btn-hide-selected')?.addEventListener('click', hideSelected);

  // Animation
  $('#btn-anim-play')?.addEventListener('click', togglePlay);
  $('#anim-slider')?.addEventListener('input', onAnimSeek);
  $('#anim-clip')?.addEventListener('change', onClipChange);

  // Lighting controls
  bindSlider('ctrl-exposure', 'val-exposure', (v) => {
    state.renderer.toneMappingExposure = v;
  });
  bindSlider('ctrl-ambient', 'val-ambient', (v) => {
    if (state.ambientLight) state.ambientLight.intensity = v;
  });
  bindSlider('ctrl-key', 'val-key', (v) => {
    if (state.keyLight) state.keyLight.intensity = v;
  });
  bindSlider('ctrl-fill', 'val-fill', (v) => {
    if (state.fillLight) state.fillLight.intensity = v;
  });
  $('#ctrl-env')?.addEventListener('change', (e) => applyEnvironment(e.target.value));

  // Material override
  bindSlider('ctrl-metal', 'val-metal', (v) => { state.matOverride.metalness = v; });
  bindSlider('ctrl-rough', 'val-rough', (v) => { state.matOverride.roughness = v; });
  $('#ctrl-mat-color')?.addEventListener('input', (e) => {
    state.matOverride.color = e.target.value;
  });
  $('#btn-apply-mat')?.addEventListener('click', () => setShading('solid'));
  $('#btn-reset-mat')?.addEventListener('click', () => setShading('material'));
}

function bindSlider(inputId, valId, onChange) {
  const input = $(`#${inputId}`);
  const valEl = $(`#${valId}`);
  if (!input) return;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (valEl) valEl.textContent = v.toFixed(2);
    onChange(v);
  });
}

function applyEnvironment(name) {
  if (state.envTexture) {
    state.envTexture.dispose();
    state.envTexture = null;
  }
  state.scene.environment = null;
  if (name === 'none' || !state.pmremGenerator) return;

  try {
    if (name === 'studio') {
      const room = new RoomEnvironment();
      state.envTexture = state.pmremGenerator.fromScene(room, 0.04).texture;
      room.dispose?.();
    } else {
      const envScene = new THREE.Scene();
      let top = 0x8899bb, bot = 0x222233;
      if (name === 'warm') { top = 0xffcc99; bot = 0x332211; }
      else if (name === 'cool') { top = 0x99bbff; bot = 0x112233; }
      else if (name === 'neutral') { top = 0xcccccc; bot = 0x444444; }
      envScene.add(new THREE.HemisphereLight(top, bot, 1));
      envScene.add(new THREE.AmbientLight(0xffffff, 0.3));
      state.envTexture = state.pmremGenerator.fromScene(envScene, 0.04).texture;
    }
    state.scene.environment = state.envTexture;
  } catch (e) {
    console.warn('Environment setup failed', e);
  }
}

function openSheet(id) {
  closeSheets();
  $(`#${id}`)?.classList.remove('hidden');
  $('#sheet-backdrop')?.classList.remove('hidden');
}

function closeSheets() {
  $$('.bottom-sheet').forEach((s) => s.classList.add('hidden'));
  $('#sheet-backdrop')?.classList.add('hidden');
}

function closeSidebars() {
  $('#sidebar-left')?.classList.remove('open');
  $('#sidebar-right')?.classList.remove('open');
}

// ─── File Handling ───────────────────────────────────────────────────
function onFileSelect(e) {
  if (e.target.files?.length) handleFiles(e.target.files);
  fileInput.value = '';
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  // Group by model type
  const modelFiles = files.filter((f) => isModelFile(f.name));
  const supportFiles = files.filter((f) => !isModelFile(f.name));

  if (!modelFiles.length) {
    const hasMtl = files.some((f) => getExt(f.name) === 'mtl');
    const hasTex = files.some((f) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
    if (hasMtl || hasTex) {
      showError('You selected materials/textures but no 3D model. Also select the .OBJ (or .GLB) file together with the .MTL and image files.');
    } else {
      showError('No supported 3D model found. Supported: GLB, glTF, OBJ, STL, FBX, PLY, 3MF. For OBJ rooms: select the .obj + .mtl + all texture images together.');
    }
    return;
  }

  // Prefer primary model
  const primary = pickPrimaryModel(modelFiles);
  const sizeMB = primary.size / (1024 * 1024);

  if (sizeMB > 80) {
    showInfo(`Very large file (${sizeMB.toFixed(1)} MB). Enabling performance mode…`);
    enablePerformanceMode(true);
  } else if (sizeMB > 25) {
    showInfo(`Large file (${sizeMB.toFixed(1)} MB). Loading may take a while.`);
  }

  showLoading(true, `Loading ${primary.name}…`);
  setProgress(0);
  await new Promise((r) => setTimeout(r, 30));

  try {
    await loadModel(primary, modelFiles, supportFiles);
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    if (/memory|allocation|out of memory/i.test(msg)) {
      showError('Out of memory. Try a smaller model, a compressed GLB, or close other tabs.');
    } else {
      showError(msg || 'Failed to load model');
    }
  } finally {
    showLoading(false);
  }
}

function isModelFile(name) {
  const ext = getExt(name);
  return ['glb', 'gltf', 'obj', 'stl', 'fbx', 'ply', '3mf', 'off', 'xyz'].includes(ext);
}

function getExt(name) {
  return name.split('.').pop().toLowerCase();
}

function pickPrimaryModel(files) {
  // Prefer glb/gltf, then fbx, obj, etc.
  const priority = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', '3mf'];
  for (const p of priority) {
    const found = files.find((f) => getExt(f.name) === p);
    if (found) return found;
  }
  return files[0];
}

async function loadModel(primary, allModelFiles, supportFiles) {
  clearScene(false);

  const ext = getExt(primary.name);
  state.fileMeta = {
    name: primary.name,
    format: ext.toUpperCase(),
    size: primary.size,
  };

  let object = null;

  switch (ext) {
    case 'glb':
    case 'gltf':
      object = await loadGLTF(primary, allModelFiles, supportFiles);
      break;
    case 'obj':
      object = await loadOBJ(primary, allModelFiles, supportFiles);
      break;
    case 'stl':
      object = await loadSTL(primary);
      break;
    case 'fbx':
      object = await loadFBX(primary);
      break;
    case 'ply':
      object = await loadPLY(primary);
      break;
    case '3mf':
      object = await load3MF(primary);
      break;
    case 'off':
    case 'xyz':
      throw new Error(`${ext.toUpperCase()} support is limited / experimental and not fully implemented in this version.`);
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }

  if (!object) throw new Error('Loader returned empty result');

  // Normalize
  object.name = object.name || primary.name.replace(/\.[^.]+$/, '');
  state.modelRoot = new THREE.Group();
  state.modelRoot.name = 'ModelRoot';
  state.modelRoot.add(object);
  state.scene.add(state.modelRoot);

  // Store original materials
  storeOriginalMaterials(state.modelRoot);

  // Center & scale helpers
  centerModel(state.modelRoot);
  fitCameraToModel();
  updateGridSize();

  // Optimize static large scenes (bathrooms, archviz, etc.)
  const meshStats = optimizeLoadedModel(state.modelRoot);
  if (meshStats.triangles > 400000 || meshStats.meshes > 400) {
    enablePerformanceMode(true);
    showInfo(`Heavy scene (${formatNum(meshStats.triangles)} tris, ${meshStats.meshes} meshes). Performance mode on.`);
  }

  // Stats & hierarchy
  updateStats();
  buildHierarchy();
  updateFileInfo();
  updateMaterialsPanel();

  // Enable UI
  $('#btn-clear').disabled = false;
  $('#btn-screenshot').disabled = false;

  showInfo(`Loaded ${primary.name}`);
}

// ─── Loaders ─────────────────────────────────────────────────────────
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Failed to read file'));
    r.onprogress = (e) => {
      if (e.lengthComputable) setProgress((e.loaded / e.total) * 90);
    };
    r.readAsArrayBuffer(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsText(file);
  });
}

function createObjectURL(file) {
  return URL.createObjectURL(file);
}

async function loadGLTF(primary, allModelFiles, supportFiles) {
  // Shared loader already has Draco + MeshoptDecoder configured
  const loader = state.gltfLoader || new GLTFLoader();
  if (!state.gltfLoader) {
    // Fallback if init order failed
    try {
      loader.setMeshoptDecoder(MeshoptDecoder);
      if (state.dracoLoader) loader.setDRACOLoader(state.dracoLoader);
    } catch (_) { /* ignore */ }
  }

  const url = createObjectURL(primary);

  // Multi-file glTF: map companion files (bin, textures) via LoadingManager
  const companions = [...allModelFiles, ...supportFiles].filter((f) => f !== primary);
  if (companions.length) {
    const manager = new THREE.LoadingManager();
    const blobMap = {};
    companions.forEach((f) => {
      blobMap[f.name] = createObjectURL(f);
      blobMap[f.name.toLowerCase()] = blobMap[f.name];
    });
    manager.setURLModifier((requestURL) => {
      const base = requestURL.split('/').pop().split('?')[0];
      if (blobMap[base]) return blobMap[base];
      if (blobMap[base.toLowerCase()]) return blobMap[base.toLowerCase()];
      return requestURL;
    });
    loader.manager = manager;
  }

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url);
        setProgress(100);
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) {
          reject(new Error('glTF/GLB contained no scene'));
          return;
        }
        // Optional: merge multiple scenes
        if (gltf.scenes?.length > 1) {
          const group = new THREE.Group();
          group.name = primary.name.replace(/\.[^.]+$/, '');
          gltf.scenes.forEach((s) => group.add(s));
          if (gltf.animations?.length) {
            state.animations = gltf.animations;
            state.mixer = new THREE.AnimationMixer(group);
            setupAnimationUI();
          }
          resolve(group);
          return;
        }
        if (gltf.animations?.length) {
          state.animations = gltf.animations;
          state.mixer = new THREE.AnimationMixer(root);
          setupAnimationUI();
        }
        resolve(root);
      },
      (xhr) => {
        if (xhr.lengthComputable) setProgress((xhr.loaded / xhr.total) * 100);
      },
      (err) => {
        URL.revokeObjectURL(url);
        const detail = err?.message || err?.toString?.() || 'parse error';
        reject(new Error('glTF/GLB load failed: ' + detail));
      }
    );
  });
}

async function loadOBJ(primary, allModelFiles, supportFiles) {
  const allFiles = [...allModelFiles, ...supportFiles];
  const mtlFile = allFiles.find((f) => getExt(f.name) === 'mtl');
  const objText = await readAsText(primary);
  setProgress(30);

  // Map every companion file by basename (case-insensitive) for MTL map_Kd paths
  const blobByBase = new Map();
  const blobUrls = [];
  for (const f of allFiles) {
    if (f === primary) continue;
    const base = f.name.split(/[/\\]/).pop();
    const url = createObjectURL(f);
    blobUrls.push(url);
    blobByBase.set(base.toLowerCase(), url);
    blobByBase.set(f.name.toLowerCase(), url);
  }

  let materials = null;
  try {
    if (mtlFile) {
      const mtlText = await readAsText(mtlFile);
      setProgress(45);

      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        // MTL often references "textures/floor.jpg" or "floor.jpg"
        const base = url.split(/[/\\]/).pop().split('?')[0].toLowerCase();
        if (blobByBase.has(base)) return blobByBase.get(base);
        if (blobByBase.has(url.toLowerCase())) return blobByBase.get(url.toLowerCase());
        // Try stripping folders progressively
        const parts = url.replace(/\\/g, '/').split('/');
        for (let i = 0; i < parts.length; i++) {
          const candidate = parts.slice(i).join('/').toLowerCase();
          if (blobByBase.has(candidate)) return blobByBase.get(candidate);
        }
        return url; // let it fail quietly if missing
      });

      const mtlLoader = new MTLLoader(manager);
      materials = mtlLoader.parse(mtlText, '');
      // Preload textures without hard-failing if some maps are missing
      try {
        materials.preload();
      } catch (texErr) {
        console.warn('Some OBJ textures failed to preload:', texErr);
      }
      setProgress(65);
    }

    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    const obj = objLoader.parse(objText);

    // Count meshes — empty OBJ is a common export mistake
    let meshCount = 0;
    obj.traverse((c) => { if (c.isMesh) meshCount++; });
    if (meshCount === 0) {
      throw new Error('OBJ parsed but contained no meshes. Export geometry as triangles/meshes, not only empties/cameras/lights.');
    }

    // Ensure every mesh has a usable material (MTL may have failed partially)
    obj.traverse((c) => {
      if (!c.isMesh) return;
      if (!c.material) {
        c.material = new THREE.MeshStandardMaterial({ color: 0xb0b8c8, metalness: 0.05, roughness: 0.75 });
      } else if (Array.isArray(c.material)) {
        c.material = c.material.map((m) => m || new THREE.MeshStandardMaterial({ color: 0xb0b8c8 }));
      }
      // Fix common OBJ issues
      if (c.geometry && !c.geometry.attributes.normal) {
        c.geometry.computeVertexNormals();
      }
    });

    setProgress(100);
    // Keep blob URLs alive while textures load; revoke later on clear
    state._objBlobUrls = (state._objBlobUrls || []).concat(blobUrls);
    return obj;
  } catch (e) {
    blobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
    throw new Error('OBJ load failed: ' + (e.message || e));
  }
}

function enablePerformanceMode(on) {
  state.perfMode = !!on;
  const dpr = on ? 1 : (state.basePixelRatio || 1.5);
  if (state.renderer) state.renderer.setPixelRatio(dpr);
  // Slightly cheaper tone mapping path under load
  if (state.renderer) {
    state.renderer.antialias = !on; // note: antialias is constructor-only on most browsers; pixel ratio is the real win
  }
}

/** Freeze transforms + ensure bounds for large static archviz scenes */
function optimizeLoadedModel(root) {
  let meshes = 0;
  let triangles = 0;
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isMesh && child.geometry) {
      meshes++;
      const g = child.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingBox) g.computeBoundingBox();
      const pos = g.getAttribute('position');
      if (g.index) triangles += g.index.count / 3;
      else if (pos) triangles += pos.count / 3;
      child.frustumCulled = true;
      child.matrixAutoUpdate = false;
      child.castShadow = false;
      child.receiveShadow = false;
    } else if (child.isObject3D) {
      // Freeze empty groups / helpers from archviz exports
      if (!child.isLight && !child.isCamera) {
        child.matrixAutoUpdate = false;
      }
    }
  });
  // Root still needs updates if we re-parent; keep root auto
  root.matrixAutoUpdate = true;
  return { meshes, triangles: Math.floor(triangles) };
}

async function loadSTL(primary) {
  const buffer = await readAsArrayBuffer(primary);
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb0b8c8,
    metalness: 0.1,
    roughness: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = primary.name.replace(/\.stl$/i, '');
  setProgress(100);
  return mesh;
}

async function loadFBX(primary) {
  const buffer = await readAsArrayBuffer(primary);
  const loader = new FBXLoader();
  return new Promise((resolve, reject) => {
    try {
      const object = loader.parse(buffer, '');
      setProgress(100);
      if (object.animations?.length) {
        state.animations = object.animations;
        state.mixer = new THREE.AnimationMixer(object);
        setupAnimationUI();
      }
      resolve(object);
    } catch (e) {
      reject(new Error('FBX parse failed: ' + (e.message || 'unknown')));
    }
  });
}

async function loadPLY(primary) {
  const buffer = await readAsArrayBuffer(primary);
  const loader = new PLYLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();
  const hasColors = geometry.getAttribute('color');
  const material = new THREE.MeshStandardMaterial({
    color: hasColors ? 0xffffff : 0xb0b8c8,
    vertexColors: !!hasColors,
    metalness: 0.05,
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = primary.name.replace(/\.ply$/i, '');
  setProgress(100);
  return mesh;
}

async function load3MF(primary) {
  const buffer = await readAsArrayBuffer(primary);
  const loader = new ThreeMFLoader();
  return new Promise((resolve, reject) => {
    try {
      const object = loader.parse(buffer);
      setProgress(100);
      resolve(object);
    } catch (e) {
      reject(new Error('3MF parse failed: ' + (e.message || 'unknown')));
    }
  });
}

// ─── Scene helpers ───────────────────────────────────────────────────
function clearScene(updateUI = true) {
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer = null;
  }
  state.animations = [];
  state.currentAction = null;
  state.isPlaying = false;
  animControls?.classList.add('hidden');

  clearMeasure();
  state.measureMode = false;
  $('#btn-measure')?.setAttribute('aria-pressed', 'false');

  if (state.modelRoot) {
    disposeObject(state.modelRoot);
    state.scene.remove(state.modelRoot);
    state.modelRoot = null;
  }
  if (state._objBlobUrls?.length) {
    state._objBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
    state._objBlobUrls = [];
  }
  state.originalMaterials.clear();
  // Keep performance mode if user loads another heavy file; reset DPR on empty scene
  if (updateUI) {
    enablePerformanceMode(false);
  }
  state.selectedObject = null;
  state.isolationActive = false;
  state.hiddenObjects.clear();
  state.fileMeta = { name: '', format: '', size: 0 };

  if (updateUI) {
    hierarchyTree.innerHTML = '<div class="empty-state"><p>No model loaded</p><p class="hint">Import a 3D file to begin</p></div>';
    materialsPanel.innerHTML = '<div class="empty-state small"><p>No materials</p></div>';
    updateStats(true);
    updateFileInfo();
    updateSelectedInfo(null);
    $('#btn-clear').disabled = true;
    $('#btn-screenshot').disabled = true;
  }
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v && v.isTexture) v.dispose();
        });
        m.dispose();
      });
    }
  });
}

function storeOriginalMaterials(root) {
  state.originalMaterials.clear();
  root.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      state.originalMaterials.set(child.uuid, mats.map((m) => m.clone()));
    }
  });
}

function centerModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  // Recompute after centering
  root.updateMatrixWorld(true);
}

function getModelBoundingBox() {
  if (!state.modelRoot) return new THREE.Box3();
  return new THREE.Box3().setFromObject(state.modelRoot);
}

function fitCameraToModel() {
  if (!state.modelRoot) return;
  const box = getModelBoundingBox();
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fov = state.camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2);
  dist *= 1.6;

  const dir = new THREE.Vector3(1, 0.7, 1).normalize();
  state.camera.position.copy(center).add(dir.multiplyScalar(dist));
  state.camera.near = Math.max(dist / 200, 0.001);
  state.camera.far = dist * 100;
  state.camera.updateProjectionMatrix();

  state.controls.target.copy(center);
  state.controls.update();

  // Sync ortho
  syncOrthoFromPerspective();
  updateOrthoFrustum(maxDim);
}

function syncOrthoFromPerspective() {
  state.orthoCamera.position.copy(state.camera.position);
  state.orthoCamera.quaternion.copy(state.camera.quaternion);
  state.controls.object = state.isPerspective ? state.camera : state.orthoCamera;
}

function updateOrthoFrustum(modelSize) {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const half = Math.max(modelSize * 0.7, 0.5);
  state.orthoCamera.left = -half * aspect;
  state.orthoCamera.right = half * aspect;
  state.orthoCamera.top = half;
  state.orthoCamera.bottom = -half;
  state.orthoCamera.near = state.camera.near;
  state.orthoCamera.far = state.camera.far;
  state.orthoCamera.updateProjectionMatrix();
}

function updateGridSize() {
  if (!state.modelRoot) return;
  const box = getModelBoundingBox();
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const gridSize = Math.ceil(maxDim * 2);
  const divisions = 20;

  state.scene.remove(state.gridHelper);
  state.gridHelper.dispose?.();
  state.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x3a4060, 0x252a3a);
  state.gridHelper.name = '__grid';
  state.gridHelper.visible = state.showGrid;
  state.scene.add(state.gridHelper);

  // Scale axes
  state.scene.remove(state.axesHelper);
  const axesLen = maxDim * 0.35;
  state.axesHelper = new THREE.AxesHelper(axesLen);
  state.axesHelper.name = '__axes';
  state.axesHelper.visible = state.showAxes;
  state.scene.add(state.axesHelper);
}

function resetCamera() {
  if (state.modelRoot) fitCameraToModel();
  else {
    state.camera.position.set(3, 2, 5);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
    syncOrthoFromPerspective();
  }
}

function setView(view) {
  if (!state.modelRoot) {
    // default target
  }
  const box = state.modelRoot ? getModelBoundingBox() : new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const dist = maxDim * 1.8;

  const positions = {
    front:  [0, 0, dist],
    back:   [0, 0, -dist],
    left:   [-dist, 0, 0],
    right:  [dist, 0, 0],
    top:    [0, dist, 0],
    bottom: [0, -dist, 0],
    iso:    [dist * 0.7, dist * 0.55, dist * 0.7],
  };

  const pos = positions[view];
  if (!pos) return;

  state.camera.position.set(center.x + pos[0], center.y + pos[1], center.z + pos[2]);
  state.controls.target.copy(center);
  state.controls.update();
  syncOrthoFromPerspective();
  closeSheets();
}

function toggleCameraType() {
  state.isPerspective = !state.isPerspective;
  const btn = $('#btn-perspective');
  btn?.setAttribute('aria-pressed', state.isPerspective);
  btn && (btn.textContent = state.isPerspective ? 'Persp' : 'Ortho');

  if (state.isPerspective) {
    state.controls.object = state.camera;
  } else {
    syncOrthoFromPerspective();
    const box = state.modelRoot ? getModelBoundingBox() : null;
    const maxDim = box ? Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1) : 5;
    updateOrthoFrustum(maxDim);
    state.controls.object = state.orthoCamera;
  }
  state.controls.update();
}

// ─── Shading ─────────────────────────────────────────────────────────
function setShading(mode) {
  state.currentShading = mode;
  $$('[data-shading]').forEach((b) => {
    b.classList.toggle('active', b.dataset.shading === mode);
  });

  if (!state.modelRoot) return;

  state.modelRoot.traverse((child) => {
    if (!child.isMesh) return;

    const originals = state.originalMaterials.get(child.uuid);
    if (!originals) return;

    // Restore base first
    if (Array.isArray(child.material)) {
      child.material.forEach((m, i) => m.dispose?.());
    } else {
      child.material.dispose?.();
    }

    switch (mode) {
      case 'material': {
        child.material = originals.map((m) => m.clone());
        if (child.material.length === 1) child.material = child.material[0];
        child.material.wireframe = false;
        break;
      }
      case 'solid': {
        const solid = new THREE.MeshStandardMaterial({
          color: new THREE.Color(state.matOverride.color),
          metalness: state.matOverride.metalness,
          roughness: state.matOverride.roughness,
          flatShading: false,
          envMapIntensity: 0.8,
        });
        child.material = solid;
        break;
      }
      case 'wireframe': {
        const wire = new THREE.MeshBasicMaterial({
          color: 0x8b9bb8,
          wireframe: true,
        });
        child.material = wire;
        break;
      }
      case 'wireframe-overlay': {
        // Keep material + add wireframe helper? Simple: material with wireframe edge
        // True overlay needs a second mesh; approximate with wireframe on a clone look
        const mats = originals.map((m) => {
          const c = m.clone();
          c.wireframe = false;
          return c;
        });
        child.material = mats.length === 1 ? mats[0] : mats;
        // Create overlay wireframe mesh if not present
        ensureWireOverlay(child);
        break;
      }
      case 'normals': {
        const nrm = new THREE.MeshNormalMaterial();
        child.material = nrm;
        break;
      }
    }

    // Clean overlays when not in overlay mode
    if (mode !== 'wireframe-overlay') {
      removeWireOverlay(child);
    }
  });
  closeSheets();
}

function ensureWireOverlay(mesh) {
  if (mesh.userData.wireOverlay) return;
  const geo = mesh.geometry;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.25,
    depthTest: true,
  });
  const overlay = new THREE.Mesh(geo, mat);
  overlay.name = '__wireOverlay';
  overlay.raycast = () => {}; // ignore
  mesh.add(overlay);
  mesh.userData.wireOverlay = overlay;
}

function removeWireOverlay(mesh) {
  if (mesh.userData.wireOverlay) {
    mesh.remove(mesh.userData.wireOverlay);
    mesh.userData.wireOverlay.material.dispose();
    mesh.userData.wireOverlay = null;
  }
}

// ─── Hierarchy ───────────────────────────────────────────────────────
function buildHierarchy() {
  hierarchyTree.innerHTML = '';
  if (!state.modelRoot) {
    hierarchyTree.innerHTML = '<div class="empty-state"><p>No model loaded</p></div>';
    return;
  }

  // Cap tree size for huge bathroom/archviz scenes (UI lag)
  state._hierarchyNodeBudget = 1500;
  const ul = document.createElement('div');
  buildTreeNode(state.modelRoot, ul, 0);
  hierarchyTree.appendChild(ul);
  if (state._hierarchyNodeBudget <= 0) {
    const note = document.createElement('div');
    note.className = 'empty-state small';
    note.innerHTML = '<p>Hierarchy truncated for performance</p>';
    hierarchyTree.appendChild(note);
  }
}

function buildTreeNode(obj, container, depth) {
  // Skip helpers
  if (obj.name === '__grid' || obj.name === '__axes' || obj.name === '__wireOverlay') return;
  if (obj.isLight || obj.isCamera) return;
  if (state._hierarchyNodeBudget !== undefined) {
    if (state._hierarchyNodeBudget <= 0) return;
    state._hierarchyNodeBudget--;
  }
  // Deep trees: stop expanding after depth 8
  if (depth > 8) return;

  const item = document.createElement('div');
  item.className = 'tree-item';
  item.dataset.uuid = obj.uuid;
  item.style.paddingLeft = `${depth * 4}px`;

  const hasChildren = obj.children.some(
    (c) => !c.name?.startsWith('__') && !c.isLight && !c.isCamera
  );

  const toggle = document.createElement('span');
  toggle.className = 'toggle' + (hasChildren ? '' : ' empty');
  toggle.textContent = hasChildren ? '▸' : '';
  item.appendChild(toggle);

  const visBtn = document.createElement('button');
  visBtn.className = 'vis-btn' + (obj.visible ? '' : ' hidden-obj');
  visBtn.title = 'Toggle visibility';
  visBtn.innerHTML = obj.visible
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    obj.visible = !obj.visible;
    visBtn.classList.toggle('hidden-obj', !obj.visible);
    visBtn.innerHTML = obj.visible
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  });
  item.appendChild(visBtn);

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = obj.name || (obj.isMesh ? 'Mesh' : obj.type);
  item.appendChild(name);

  item.addEventListener('click', (e) => {
    e.stopPropagation();
    selectObject(obj);
  });

  container.appendChild(item);

  if (hasChildren) {
    const childBox = document.createElement('div');
    childBox.className = 'tree-children';
    childBox.style.display = depth === 0 ? 'block' : 'none';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = childBox.style.display !== 'none';
      childBox.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '▸' : '▾';
    });
    if (depth === 0) toggle.textContent = '▾';

    obj.children.forEach((c) => buildTreeNode(c, childBox, depth + 1));
    container.appendChild(childBox);
  }
}

function filterHierarchy(query) {
  const items = hierarchyTree.querySelectorAll('.tree-item');
  items.forEach((item) => {
    const name = item.querySelector('.name')?.textContent?.toLowerCase() || '';
    const match = !query || name.includes(query);
    item.style.display = match ? '' : 'none';
  });
}

function selectObject(obj) {
  // Clear previous highlight
  if (state.selectedObject) {
    clearHighlight(state.selectedObject);
  }
  state.selectedObject = obj;
  applyHighlight(obj);

  // UI
  $$('.tree-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.uuid === obj.uuid);
  });
  updateSelectedInfo(obj);
  $('#btn-frame-selected').disabled = false;
  $('#btn-isolate').disabled = false;
  $('#btn-hide-selected').disabled = false;
}

function applyHighlight(obj) {
  obj.traverse((c) => {
    if (c.isMesh && c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        if (m.emissive) {
          m.userData._prevEmissive = m.emissive.clone();
          m.emissive.setHex(0x2a1a4a);
          m.emissiveIntensity = 0.35;
        }
      });
    }
  });
}

function clearHighlight(obj) {
  obj.traverse((c) => {
    if (c.isMesh && c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        if (m.userData._prevEmissive) {
          m.emissive.copy(m.userData._prevEmissive);
          m.emissiveIntensity = 0;
          delete m.userData._prevEmissive;
        }
      });
    }
  });
}

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const fov = state.camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
  const dir = state.camera.position.clone().sub(state.controls.target).normalize();
  state.camera.position.copy(center).add(dir.multiplyScalar(dist));
  state.controls.target.copy(center);
  state.controls.update();
  syncOrthoFromPerspective();
}

function hideSelected() {
  if (!state.selectedObject) return;
  state.selectedObject.visible = false;
  state.hiddenObjects.add(state.selectedObject.uuid);
  buildHierarchy();
}

function toggleIsolate() {
  if (!state.modelRoot || !state.selectedObject) return;
  state.isolationActive = !state.isolationActive;
  if (state.isolationActive) {
    state.modelRoot.traverse((c) => {
      if (c.isMesh) {
        c.userData._wasVisible = c.visible;
        c.visible = isDescendantOrSelf(c, state.selectedObject) || isDescendantOrSelf(state.selectedObject, c);
      }
    });
    // Also show ancestors path
    let p = state.selectedObject;
    while (p) {
      p.visible = true;
      p = p.parent;
    }
  } else {
    state.modelRoot.traverse((c) => {
      if (c.isMesh && c.userData._wasVisible !== undefined) {
        c.visible = c.userData._wasVisible;
        delete c.userData._wasVisible;
      }
    });
  }
  buildHierarchy();
}

function isDescendantOrSelf(obj, ancestor) {
  let p = obj;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

// ─── Stats ───────────────────────────────────────────────────────────
function updateStats(clear = false) {
  if (clear || !state.modelRoot) {
    ['meshes', 'vertices', 'triangles', 'materials', 'objects', 'textures', 'anims', 'size-x', 'size-y', 'size-z'].forEach((k) => {
      const el = $(`#stat-${k}`);
      if (el) el.textContent = '—';
    });
    return;
  }

  let meshes = 0, vertices = 0, triangles = 0, objects = 0;
  const materialSet = new Set();
  const textureSet = new Set();

  state.modelRoot.traverse((c) => {
    if (c.name?.startsWith('__')) return;
    objects++;
    if (c.isMesh) {
      meshes++;
      const geo = c.geometry;
      if (geo) {
        const pos = geo.getAttribute('position');
        if (pos) vertices += pos.count;
        if (geo.index) {
          triangles += geo.index.count / 3;
        } else if (pos) {
          triangles += pos.count / 3;
        }
      }
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        if (!m) return;
        materialSet.add(m.uuid);
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].forEach((key) => {
          if (m[key]?.isTexture) textureSet.add(m[key].uuid);
        });
      });
    }
  });

  const box = getModelBoundingBox();
  const size = box.getSize(new THREE.Vector3());

  $('#stat-meshes').textContent = formatNum(meshes);
  $('#stat-vertices').textContent = formatNum(Math.round(vertices));
  $('#stat-triangles').textContent = formatNum(Math.round(triangles));
  $('#stat-materials').textContent = formatNum(materialSet.size);
  $('#stat-objects').textContent = formatNum(objects);
  $('#stat-textures').textContent = formatNum(textureSet.size);
  $('#stat-anims').textContent = formatNum(state.animations.length);
  $('#stat-size-x').textContent = size.x.toFixed(3);
  $('#stat-size-y').textContent = size.y.toFixed(3);
  $('#stat-size-z').textContent = size.z.toFixed(3);
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function updateFileInfo() {
  const rows = $('#file-info')?.querySelectorAll('.info-row');
  if (!rows) return;
  const vals = [
    state.fileMeta.name || '—',
    state.fileMeta.format || '—',
    state.fileMeta.size ? formatBytes(state.fileMeta.size) : '—',
  ];
  rows.forEach((row, i) => {
    const v = row.querySelector('.value');
    if (v) v.textContent = vals[i];
  });
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function updateSelectedInfo(obj) {
  const rows = $('#selected-info')?.querySelectorAll('.info-row');
  if (!rows) return;
  if (!obj) {
    rows.forEach((r) => (r.querySelector('.value').textContent = '—'));
    return;
  }
  let verts = 0, tris = 0;
  if (obj.isMesh && obj.geometry) {
    const pos = obj.geometry.getAttribute('position');
    if (pos) verts = pos.count;
    if (obj.geometry.index) tris = obj.geometry.index.count / 3;
    else if (pos) tris = pos.count / 3;
  }
  const vals = [
    obj.name || '—',
    obj.type,
    verts ? formatNum(verts) : '—',
    tris ? formatNum(Math.round(tris)) : '—',
  ];
  rows.forEach((row, i) => {
    row.querySelector('.value').textContent = vals[i];
  });
}

function updateMaterialsPanel() {
  materialsPanel.innerHTML = '';
  if (!state.modelRoot) {
    materialsPanel.innerHTML = '<div class="empty-state small"><p>No materials</p></div>';
    return;
  }

  const seen = new Map();
  state.modelRoot.traverse((c) => {
    if (!c.isMesh || !c.material) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => {
      if (!m || seen.has(m.uuid)) return;
      seen.set(m.uuid, m);
    });
  });

  if (!seen.size) {
    materialsPanel.innerHTML = '<div class="empty-state small"><p>No materials</p></div>';
    return;
  }

  seen.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'mat-item';
    const swatch = document.createElement('div');
    swatch.className = 'mat-swatch';
    let color = '#888';
    if (m.color) color = '#' + m.color.getHexString();
    swatch.style.background = color;
    item.appendChild(swatch);

    const name = document.createElement('span');
    name.className = 'mat-name';
    name.textContent = m.name || m.type || 'Material';
    item.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'mat-meta';
    const hasMap = m.map ? 'tex' : '';
    meta.textContent = hasMap;
    item.appendChild(meta);

    materialsPanel.appendChild(item);
  });
}

// ─── Animation ───────────────────────────────────────────────────────
function setupAnimationUI() {
  if (!state.animations.length) {
    animControls.classList.add('hidden');
    return;
  }
  animControls.classList.remove('hidden');
  const select = $('#anim-clip');
  select.innerHTML = '';
  state.animations.forEach((clip, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = clip.name || `Clip ${i + 1}`;
    select.appendChild(opt);
  });
  playClip(0);
}

function playClip(index) {
  if (!state.mixer || !state.animations[index]) return;
  if (state.currentAction) state.currentAction.stop();
  state.currentAction = state.mixer.clipAction(state.animations[index]);
  state.currentAction.reset().play();
  state.isPlaying = true;
  $('#btn-anim-play').textContent = '⏸';
  const clip = state.animations[index];
  $('#anim-slider').max = clip.duration;
  $('#anim-slider').value = 0;
}

function togglePlay() {
  if (!state.currentAction) return;
  state.isPlaying = !state.isPlaying;
  state.currentAction.paused = !state.isPlaying;
  $('#btn-anim-play').textContent = state.isPlaying ? '⏸' : '▶';
}

function onAnimSeek(e) {
  if (!state.currentAction) return;
  const t = parseFloat(e.target.value);
  state.currentAction.time = t;
  state.mixer.update(0);
  $('#anim-time').textContent = t.toFixed(2) + 's';
}

function onClipChange(e) {
  playClip(parseInt(e.target.value, 10));
}

function updateAnimUI() {
  if (!state.currentAction) return;
  const t = state.currentAction.time;
  $('#anim-slider').value = t;
  $('#anim-time').textContent = t.toFixed(2) + 's';
}

// ─── Measure tool ────────────────────────────────────────────────────
function toggleMeasure(force) {
  state.measureMode = force !== undefined ? force : !state.measureMode;
  $('#btn-measure')?.setAttribute('aria-pressed', state.measureMode);
  if (!state.measureMode) {
    clearMeasure();
    measureReadout.classList.add('hidden');
    canvas.style.cursor = '';
  } else {
    measureReadout.classList.remove('hidden');
    canvas.style.cursor = 'crosshair';
    showInfo('Click two points on the model to measure');
  }
}

function clearMeasure() {
  state.measurePoints = [];
  if (state.measureLine) {
    state.scene.remove(state.measureLine);
    state.measureLine.geometry.dispose();
    state.measureLine.material.dispose();
    state.measureLine = null;
  }
  state.measureMarkers.forEach((m) => {
    state.scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  state.measureMarkers = [];
  $('#measure-value').textContent = '0';
}

function onCanvasPointerDown(e) {
  if (!state.measureMode || !state.modelRoot) return;
  if (e.button !== 0) return;

  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  const cam = state.isPerspective ? state.camera : state.orthoCamera;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, cam);

  const meshes = [];
  state.modelRoot.traverse((c) => {
    if (c.isMesh && c.visible) meshes.push(c);
  });

  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return;

  const point = hits[0].point.clone();
  state.measurePoints.push(point);

  // Marker
  const markerGeo = new THREE.SphereGeometry(getModelBoundingBox().getSize(new THREE.Vector3()).length() * 0.008 || 0.02, 12, 12);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.copy(point);
  state.scene.add(marker);
  state.measureMarkers.push(marker);

  if (state.measurePoints.length === 2) {
    const dist = state.measurePoints[0].distanceTo(state.measurePoints[1]);
    $('#measure-value').textContent = dist.toFixed(4);

    const geo = new THREE.BufferGeometry().setFromPoints(state.measurePoints);
    const mat = new THREE.LineBasicMaterial({ color: 0x8b5cf6 });
    state.measureLine = new THREE.Line(geo, mat);
    state.scene.add(state.measureLine);

    // Reset for next measurement pair
    state.measurePoints = [];
  }
}

// ─── Screenshot ──────────────────────────────────────────────────────
function takeScreenshot() {
  state.renderer.render(state.scene, state.isPerspective ? state.camera : state.orthoCamera);
  const dataURL = state.renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `meshview-${Date.now()}.png`;
  a.click();
  showInfo('Screenshot saved');
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

// ─── UI helpers ──────────────────────────────────────────────────────
function showLoading(show, text = 'Loading model…') {
  if (show) {
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = text;
    progressFill.style.width = '0%';
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

function setProgress(pct) {
  progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function showError(msg) {
  errorToast.textContent = msg;
  errorToast.classList.remove('hidden');
  setTimeout(() => errorToast.classList.add('hidden'), 6000);
}

function showInfo(msg) {
  infoToast.textContent = msg;
  infoToast.classList.remove('hidden');
  setTimeout(() => infoToast.classList.add('hidden'), 3500);
}

// ─── Boot ────────────────────────────────────────────────────────────
init();
