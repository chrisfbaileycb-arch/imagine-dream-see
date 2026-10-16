import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBlobCreature } from './blobCreature.js';
import { createGPUFurPhysics } from './gpuPhysics.js';
import { createGPUFurSystem } from './furSystem.js';
import { createMinimalUI, FUR_PRESETS } from './ui.js';
import { createEnvironmentManager, COZY_SKY_THEMES } from './environments.js';
import { createWordBubbleSystem } from './wordBubbles.js';

const container = document.getElementById('canvas-container');
const uiContainer = document.getElementById('ui-root');
const hudHint = document.getElementById('hud-hint');

if (hudHint) {
  hudHint.textContent = 'Pop a floating word bubble to spell & speak · Pet or click Mr. M to wave & boop!';
}

const urlSearchParams = new URLSearchParams(window.location.search);
const forceWebGL = urlSearchParams.get('gpuFur') === '0' || urlSearchParams.get('mode') === 'webgl';
const initialGpuFur = !forceWebGL;

// Initial state from our Mr. M Dream Mascot preset + Sunny Meadow Cozy Sky environment
const simState = {
  ...FUR_PRESETS[0],
  mascotName: 'Mr. M',
  keyColor: '#fffbeb',
  lightAngle: -42,
  lightIntensity: 1.55,
  rimIntensity: 1.45,
  windStrength: 0.70,
  environment: 'meadow',
  skyTheme: 'daydream',
  skyCloudiness: 1.0,
  skySparkle: 0.30,
  skyRainbow: 0.35,
  bubblesEnabled: true,
  wordCategory: 'dreamer',
  furReactivity: 1.15,
  gpuFurEnabled: initialGpuFur
};

// 1. Initialize WebGL2 Renderer with alpha: true so the soft CSS radial studio or AR camera backdrop shines through
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// 2. Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  80
);
camera.position.set(0.0, 0.45, 6.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.6;
controls.maxDistance = 15.0;
controls.maxPolarAngle = Math.PI * 0.62;
controls.target.set(0, 0.05, 0);

// 3. Synchronized 3-Point Studio Lighting Rig
const keyLight = new THREE.DirectionalLight('#fff7ed', simState.lightIntensity * 1.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.bias = -0.0005;
keyLight.shadow.radius = 2.5;
keyLight.shadow.camera.left = -2.2;
keyLight.shadow.camera.right = 2.2;
keyLight.shadow.camera.top = 2.2;
keyLight.shadow.camera.bottom = -2.2;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 10.0;
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#c4b5fd', simState.rimIntensity * 1.2);
rimLight.position.set(-2.4, 1.8, -3.2);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight('#f5d0fe', '#1e1b4b', 0.85);
scene.add(hemiLight);

// 4. Create Stylized Dream Mascot ("Lumi-Puff") + Hybrid GPU Fur + GPGPU Physics
const creature = createBlobCreature();
creature.setMascotStyle({
  earStyle: simState.earStyle,
  accessory: simState.accessory,
  eyeColor: simState.eyeColor,
  cheekColor: simState.cheekColor,
  furReactivity: simState.furReactivity
});
scene.add(creature.root);

const gpuPhysics = createGPUFurPhysics(renderer);
if (simState.gpuFurEnabled && !gpuPhysics.isGPGPUActive) {
  simState.gpuFurEnabled = false;
}
const furSystem = createGPUFurSystem(creature.bodyGeometry, simState);

// Attach both the 64-layer GPU shells and 60,000 instanced hair strands to creature root
creature.root.add(furSystem.shellMesh);
creature.root.add(furSystem.strandMesh);

// Initialize multi-environment manager (Studio, Sunny Meadow, Cozy Highrise, AR Camera)
const envManager = createEnvironmentManager({
  scene,
  renderer,
  container,
  keyLight,
  rimLight,
  hemiLight,
  furSystem,
  camera
});

// Initialize Kids' Dream-Builder Pop-Up Word & Spelling Bubbles + Speech-to-Text Engine
const wordBubbleSystem = createWordBubbleSystem({
  creature,
  onTriggerBoop: () => {
    boopShockwave = 0.85;
  }
});

// Helper to synchronize Key Light angle, color & intensity between scene lights and GLSL uniforms
function updateLightingFromState() {
  const rad = (simState.lightAngle * Math.PI) / 180.0;
  const lx = Math.sin(rad) * 2.8;
  const ly = 2.1;
  const lz = Math.cos(rad) * 2.8;

  keyLight.position.set(lx, ly, lz);
  keyLight.intensity = simState.lightIntensity * 1.35;
  rimLight.intensity = simState.rimIntensity * 1.15;
  if (simState.keyColor) {
    keyLight.color.set(simState.keyColor);
    furSystem.sharedUniforms.uKeyLightColor.value.set(simState.keyColor);
  }

  furSystem.sharedUniforms.uKeyLightDir.value.set(lx, ly, lz).normalize();
  furSystem.sharedUniforms.uKeyLightIntensity.value = simState.lightIntensity;
  furSystem.sharedUniforms.uRimIntensity.value = simState.rimIntensity;

  // Match under-skin color to darkened base root color so skin blends seamlessly
  creature.skinMaterial.color.set(simState.baseColor).multiplyScalar(0.55);
}

// Helper to center the camera & OrbitControls point-of-focus on Lumi-Puff with appropriate framing across environments
function applyCameraFramingForEnvironment(envId) {
  const isDesk = envId === 'highrise';
  const isAR = envId === 'ar';
  const s = (isDesk || isAR) ? 0.25 : 1.0;
  const deskX = isDesk ? -0.14 : 0.0;
  const deskZ = isDesk ? 0.42 : 0.0;
  creature.setEnvironmentScale(s, deskX, deskZ);

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const mobileZoomOut = isMobile
    ? Math.max(1.45, Math.min(1.95, 0.82 / Math.max(0.42, aspect)))
    : 1.0;

  if (isAR) {
    const targetY = -0.94 * (1.0 - s) + 0.05 * s;
    controls.target.set(0.0, targetY, 0.0);
    camera.position.set(0.0, 0.35, 6.2 * mobileZoomOut);
    controls.minDistance = 1.4;
    controls.maxDistance = 14.0 * mobileZoomOut;
    controls.update();
  } else {
    const targetY = -0.94 * (1.0 - s) + 0.05 * s;
    controls.target.set(deskX, targetY, deskZ);
    camera.position.set(deskX, targetY + 0.40 * s, deskZ + 6.4 * s * mobileZoomOut);
    controls.minDistance = 2.6 * s;
    controls.maxDistance = 15.0 * s * mobileZoomOut;
    controls.update();
  }
}

function applyEnvironmentPreset(envId) {
  const prevEnv = simState.environment;
  simState.environment = envId;

  if (typeof creature !== 'undefined' && creature.resetPlacement) {
    if ((prevEnv === 'ar' && envId !== 'ar') || (envId !== 'ar' && creature.isPlaced && creature.isPlaced())) {
      creature.resetPlacement(false);
    }
  }

  const envPreset = envManager.setEnvironment(envId);
  const u = furSystem.sharedUniforms;
  if (envPreset) {
    if (envPreset.keyColor !== undefined) {
      simState.keyColor = envPreset.keyColor;
    }
    simState.lightAngle = envPreset.lightAngle;
    simState.lightIntensity = envPreset.lightIntensity;
    simState.rimIntensity = envPreset.rimIntensity;
    simState.windStrength = envPreset.windStrength;
    u.uWindStrength.value = envPreset.windStrength;
  }
  // Re-apply active Cozy Sky theme & cloud/sparkle/rainbow settings
  envManager.setSkyTheme(simState.skyTheme);
  envManager.setSkyParams({
    cloudiness: simState.skyCloudiness,
    sparkle: simState.skySparkle,
    rainbow: simState.skyRainbow
  });

  applyCameraFramingForEnvironment(envId);
  updateLightingFromState();
  if (hudHint) {
    if (envId === 'ar') {
      hudHint.textContent = 'AR Active: Tap screen to place Mr. M · Pop word bubbles or talk to him!';
    } else {
      hudHint.textContent = 'Pop a floating word bubble to spell & speak · Pet or click Mr. M to wave & boop!';
    }
  }
}

const ALLOWED_ENV_IDS = new Set(['studio', 'meadow', 'highrise', 'ar']);
const urlEnvParam = new URLSearchParams(window.location.search).get('env');
const initialEnvId = urlEnvParam && ALLOWED_ENV_IDS.has(urlEnvParam) ? urlEnvParam : simState.environment;
applyEnvironmentPreset(initialEnvId);

// 5. Build Minimalist UI Controls
const ui = createMinimalUI(uiContainer, simState, (key, value) => {
  const u = furSystem.sharedUniforms;
  switch (key) {
    case 'environment': {
      applyEnvironmentPreset(value);
      ui.syncUI();
      break;
    }
    case 'mascotName': {
      wordBubbleSystem.setMascotName(value);
      break;
    }
    case 'triggerWave': {
      creature.triggerWave(2.2);
      boopShockwave = 0.65;
      break;
    }
    case 'triggerBlink': {
      creature.triggerBlink(Math.random() > 0.45);
      break;
    }
    case 'triggerGreeting': {
      const name = simState.mascotName || 'Mr. M';
      wordBubbleSystem.speakPhrase(`Hi friend! I am ${name}! Tap any floating bubble or talk to me to spell magical dream words!`, true);
      break;
    }
    case 'earStyle': {
      creature.setMascotStyle({ earStyle: value });
      break;
    }
    case 'accessory': {
      creature.setMascotStyle({ accessory: value });
      break;
    }
    case 'eyeColor': {
      creature.setMascotStyle({ eyeColor: value });
      break;
    }
    case 'cheekColor': {
      creature.setMascotStyle({ cheekColor: value });
      break;
    }
    case 'triggerPhoneme': {
      creature.triggerVisemePose(value, 0.95, 1.0);
      break;
    }
    case 'furReactivity': {
      creature.setFurReactivity(value);
      break;
    }
    case 'bubblesEnabled': {
      wordBubbleSystem.setBubblesEnabled(value);
      break;
    }
    case 'wordCategory': {
      wordBubbleSystem.setWordCategory(value);
      break;
    }
    case 'launchCustomWord': {
      wordBubbleSystem.launchCustomWord(value);
      break;
    }
    case 'triggerBubbleParty': {
      wordBubbleSystem.triggerBubbleParty();
      break;
    }
    case 'skyTheme': {
      const sky = envManager.setSkyTheme(value);
      if (sky) {
        simState.keyColor = sky.keyColor;
        simState.skySparkle = sky.sparkle;
        simState.skyRainbow = sky.rainbow;
        updateLightingFromState();
        // If user is in Studio mode, also tint the CSS backdrop to match the chosen Cozy Sky palette
        if (simState.environment === 'studio') {
          document.body.style.background = `radial-gradient(circle at 50% 38%, ${sky.mid}44 0%, ${sky.zenith}66 55%, #060812 100%)`;
        } else {
          document.body.style.background = '';
        }
        ui.syncUI();
      }
      break;
    }
    case 'skyCloudiness':
    case 'skySparkle':
    case 'skyRainbow': {
      envManager.setSkyParams({
        cloudiness: simState.skyCloudiness,
        sparkle: simState.skySparkle,
        rainbow: simState.skyRainbow
      });
      break;
    }
    case 'toggleGPUFur': {
      const enabled = Boolean(value);
      simState.gpuFurEnabled = enabled;
      furSystem.setGPUFurEnabled(enabled);
      ui.setGPUFurEnabled(enabled);
      if (hudHint) {
        hudHint.textContent = enabled
          ? 'WebGPU Fur ON (Default) · 64 Volumetric Shells + 60,000 3D Strands + GPGPU Verlet Physics'
          : 'WebGL Mode ON · Lightweight Analytical WebGL Fur · Toggle WebGPU Fur anytime';
      }
      break;
    }
    case 'arToggleMirror': {
      const mirrored = envManager.toggleMirror();
      ui.setMirrorLabel(mirrored);
      break;
    }
    case 'arFlipCamera':
      envManager.flipCamera();
      break;
    case 'furLength':
      u.uFurLength.value = value;
      break;
    case 'furDensity':
      furSystem.updateDensity(value);
      break;
    case 'clumping':
      u.uClumping.value = value;
      break;
    case 'curliness':
      u.uCurliness.value = value;
      break;
    case 'baseColor':
      u.uBaseColor.value.set(value);
      creature.skinMaterial.color.set(value).multiplyScalar(0.55);
      break;
    case 'tipColor':
      u.uTipColor.value.set(value);
      break;
    case 'roughness':
      u.uRoughness.value = value;
      break;
    case 'specular':
      u.uSpecular.value = value;
      break;
    case 'keyColor':
    case 'lightAngle':
    case 'lightIntensity':
    case 'rimIntensity':
      updateLightingFromState();
      break;
    case 'windStrength':
      u.uWindStrength.value = value;
      break;
    case 'arToggleTapPlace':
      tapToPlaceEnabled = Boolean(value);
      break;
    case 'arToggleLightEst': {
      const enabled = Boolean(value);
      envManager.setLightEstimationEnabled(enabled);
      if (hudHint) {
        hudHint.textContent = enabled
          ? 'AR Light Estimation ON · Sampling webcam color temperature, key direction & brightness'
          : 'AR Light Estimation OFF · Restored neutral studio AR lighting (sliders unlocked)';
      }
      break;
    }
    case 'arResetPosition':
      creature.resetPlacement();
      envManager.resetARAnchor();
      if (hudHint) {
        hudHint.textContent = 'Mascot reset to center position · Tap screen to place on detected surface';
      }
      break;
    default:
      break;
  }
});

let tapToPlaceEnabled = true;

envManager.onARStatusChange((statusText, isLive) => {
  ui.setARStatus(statusText, isLive);
});

envManager.onPlaneDetected((planeInfo) => {
  ui.setARPlaneStatus(
    planeInfo.surfaceType,
    planeInfo.planeY,
    planeInfo.confidence,
    planeInfo.featureCount
  );
});

envManager.onLightEstimated((lightInfo) => {
  if (simState.environment !== 'ar') return;
  if (!lightInfo.isManualReset && !envManager.isLightEstimationEnabled()) return;
  simState.keyColor = lightInfo.keyColor;
  simState.lightAngle = lightInfo.lightAngle;
  simState.lightIntensity = lightInfo.lightIntensity;
  simState.rimIntensity = lightInfo.rimIntensity;
  updateLightingFromState();
  ui.setARLightStatus(lightInfo);
});

// 6. Interactive 3D Pointer Raycasting for Petting, Combing & Booping
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(0, 0);
const pointerLocalPos = new THREE.Vector3(0, 0, 2);
const prevPointerLocalPos = new THREE.Vector3(0, 0, 2);
const pointerVelocity = new THREE.Vector3(0, 0, 0);
let isPointerOverCreature = false;
let pointerDownPos = { x: 0, y: 0 };
let boopShockwave = 0.0;

function isEventOnUIOverlay(e) {
  return Boolean(
    e.target &&
    typeof e.target.closest === 'function' &&
    (e.target.closest('#ui-root') ||
      e.target.closest('#page-nav') ||
      e.target.closest('#scene-nav') ||
      e.target.closest('#mobile-controls-btn') ||
      e.target.closest('#mobile-sheet-backdrop') ||
      e.target.closest('#word-stage-card') ||
      e.target.closest('#spelling-stage-card') ||
      e.target.closest('#speech-dock') ||
      e.target.closest('#mascot-comm-dock') ||
      e.target.closest('.word-bubble') ||
      e.target.closest('.floating-word-bubble'))
  );
}

window.addEventListener('pointermove', (e) => {
  if (isEventOnUIOverlay(e)) {
    isPointerOverCreature = false;
    return;
  }
  pointerNDC.x = (e.clientX / window.innerWidth) * 2.0 - 1.0;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2.0 + 1.0;

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(creature.bodyMesh, false);
  if (hits.length > 0) {
    prevPointerLocalPos.copy(pointerLocalPos);
    pointerLocalPos.copy(hits[0].point);
    creature.root.worldToLocal(pointerLocalPos);

    if (isPointerOverCreature) {
      pointerVelocity.subVectors(pointerLocalPos, prevPointerLocalPos).multiplyScalar(32.0);
    }
    isPointerOverCreature = true;
    container.style.cursor = 'pointer';
    if (simState.environment === 'ar') {
      envManager.updateARCursor(pointerNDC.x, pointerNDC.y, false);
    }
  } else {
    isPointerOverCreature = false;
    pointerVelocity.multiplyScalar(0.5);
    container.style.cursor = 'grab';
    if (simState.environment === 'ar' && tapToPlaceEnabled) {
      envManager.updateARCursor(pointerNDC.x, pointerNDC.y, true);
    }
  }
});

window.addEventListener('pointerdown', (e) => {
  pointerDownPos.x = e.clientX;
  pointerDownPos.y = e.clientY;
  if (isEventOnUIOverlay(e)) {
    return;
  }
  if (isPointerOverCreature) {
    controls.enabled = false;
  }
});

window.addEventListener('pointerup', (e) => {
  controls.enabled = true;
  const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (moveDist < 6) {
    if (isEventOnUIOverlay(e)) {
      return;
    }
    if (isPointerOverCreature) {
      creature.triggerBoop();
      boopShockwave = 1.0;
    } else if (simState.environment === 'ar' && tapToPlaceEnabled) {
      const planeHit = envManager.estimatePlaneAt(pointerNDC.x, pointerNDC.y);
      if (planeHit && planeHit.point) {
        pointerNDC.set(0, 0);
        creature.placeAt(planeHit.point, planeHit.normal, true, camera.position);
        envManager.triggerPlacementPulse(planeHit.point);
        if (hudHint) {
          hudHint.textContent = `Placed Mr. M on ${planeHit.surfaceType} · Depth: ${planeHit.depth.toFixed(2)}m`;
        }
      }
    }
  }
});

let targetDPR = Math.min(window.devicePixelRatio || 1, 2);
let currentDPR = targetDPR;
let wasMobileViewport = window.matchMedia('(max-width: 768px)').matches;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(currentDPR);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const isMobileNow = window.matchMedia('(max-width: 768px)').matches;
  if (isMobileNow || isMobileNow !== wasMobileViewport) {
    wasMobileViewport = isMobileNow;
    applyCameraFramingForEnvironment(simState.environment);
  }
});

// 7. Zero-GC Real-Time Render Loop
const clock = new THREE.Clock();
let elapsedTime = 0.0;
const webglInertiaDisp = new THREE.Vector3(0, 0, 0);
const webglInertiaVel = new THREE.Vector3(0, 0, 0);
const webglForceTmp = new THREE.Vector3(0, 0, 0);

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);
  elapsedTime += dt;

  controls.update();

  // Decay boop shockwave
  if (boopShockwave > 0.001) {
    boopShockwave *= Math.exp(-dt * 2.8);
  } else {
    boopShockwave = 0.0;
  }

  // Decay pointer velocity smoothly
  pointerVelocity.multiplyScalar(Math.exp(-dt * 12.0));

  // Step Word Bubble & Speech-to-Text Phoneme/Viseme Lip-Sync Sequencer
  wordBubbleSystem.update(dt);

  // Update creature breathing, eye blinking, speaking viseme mouth morph, waving arms, and bounce inertia
  creature.update(dt, pointerNDC, camera.position, simState.environment === 'ar');

  // Update active 3D / AR environment (Studio, Meadow, Cozy Highrise, AR View)
  envManager.update(elapsedTime, simState.windStrength, creature.root);

  let physicsTexture = gpuPhysics.fallbackTexture;
  if (simState.gpuFurEnabled) {
    physicsTexture = gpuPhysics.step({
      time: elapsedTime,
      dt,
      windStrength: simState.windStrength,
      creatureVelocity: creature.animState.velocity,
      creatureAngularVel: creature.animState.angularVelocity,
      pointerLocalPos,
      pointerVelocity,
      pointerActive: isPointerOverCreature,
      boopShockwave,
      facialMorphVel: creature.animState.facialMorphVel,
      facialMorphState: creature.animState.facialMorphState
    });
  } else {
    webglForceTmp.set(0, -0.32, 0);
    webglForceTmp.addScaledVector(creature.animState.velocity, -1.65);
    // Couple WebGL fallback inertia to jaw & cheek morph velocity too
    webglForceTmp.y -= creature.animState.facialMorphVel.x * 2.4;
    webglForceTmp.z += creature.animState.facialMorphVel.z * 2.2;
    if (isPointerOverCreature) {
      webglForceTmp.addScaledVector(pointerVelocity, 0.85);
    }
    webglForceTmp.addScaledVector(webglInertiaDisp, -24.0);
    webglInertiaVel.addScaledVector(webglForceTmp, dt);
    webglInertiaVel.multiplyScalar(Math.exp(-5.5 * dt));
    webglInertiaDisp.addScaledVector(webglInertiaVel, dt);
    if (webglInertiaDisp.lengthSq() > 0.64) {
      webglInertiaDisp.normalize().multiplyScalar(0.8);
    }
  }

  // Update shared fur uniforms including real-time 8-channel phoneme morphs, facial muscle velocity, arm waving, and ear silhouette morphs
  const u = furSystem.sharedUniforms;
  u.uPhysicsTex.value = physicsTexture;
  u.uTime.value = elapsedTime;
  u.uPointerLocalPos.value.copy(pointerLocalPos);
  u.uPointerActive.value = isPointerOverCreature ? 1.0 : 0.0;
  u.uWebGLInertia.value.copy(webglInertiaDisp);
  u.uBoopShockwave.value = boopShockwave;

  u.uTalkMorph.value = creature.animState.talkMorph;
  u.uTalkSmile.value = creature.animState.talkSmile;
  u.uWaveAmount.value = creature.animState.waveAmount;
  u.uWavePhase.value = creature.animState.wavePhase;
  u.uEarBounce.value = creature.animState.earBounce;
  u.uEarStyle.value = creature.animState.earStyleCode;
  u.uVisemeWeightsA.value.copy(creature.animState.visemeWeightsA);
  u.uVisemeWeightsB.value.copy(creature.animState.visemeWeightsB);
  u.uFacialMorphVel.value.copy(creature.animState.facialMorphVel);

  if (ui && typeof ui.updatePhonemeTelemetry === 'function') {
    ui.updatePhonemeTelemetry(creature.getPhonemeTelemetry());
  }

  renderer.render(scene, camera);
}

animate();


