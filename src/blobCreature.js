import * as THREE from 'three';

/**
 * Evaluates the anatomical follicle growth mask at a local position on the blob surface.
 * Returns a float in [0.0, 1.0]:
 * - 0.0 inside eye sockets and mouth recess (prevents hair from poking through eyes/mouth)
 * - Smoothly tapers (0.2 -> 1.0) around the eye rims, nose bridge, and paw pads
 * - Slightly longer/fluffier (1.15) on the cheek tufts, chest fluff, and ear tips
 */
export function evaluateFollicleMask(x, y, z) {
  // Left and right eye centers in local space
  const lx = x + 0.31;
  const rx = x - 0.31;
  const ey = y - 0.16;
  const ez = z - 0.88;

  const distLeftEye = Math.sqrt(lx * lx + ey * ey * 1.1 + ez * ez);
  const distRightEye = Math.sqrt(rx * rx + ey * ey * 1.1 + ez * ez);
  const minEyeDist = Math.min(distLeftEye, distRightEye);

  // Tightly match the cornea radius (r < 0.148 = 0), then transition immediately
  // into short velvety eyelash/brow fuzz (0.28 -> 1.0) so there is NO bald skin ring!
  if (minEyeDist < 0.145) {
    return 0.0;
  }
  const eyeMask = 0.28 + 0.72 * smoothstep(0.145, 0.25, minEyeDist);

  // Small mask right under the pink nose button & mouth
  const mx = x / 1.25;
  const my = (y - 0.04) * 1.4;
  const mz = z - 0.96;
  const distMouth = Math.sqrt(mx * mx + my * my + mz * mz);
  const mouthMask = 0.22 + 0.78 * smoothstep(0.065, 0.16, distMouth);

  // Bottom belly contact pad taper
  const bottomMask = smoothstep(-1.05, -0.72, y);

  // Extra fluff boost on cheeks and chest tuft
  const cheekDist = Math.min(
    Math.hypot(x + 0.56, y - 0.02, z - 0.68),
    Math.hypot(x - 0.56, y - 0.02, z - 0.68)
  );
  const cheekFluff = 1.0 + 0.22 * (1.0 - smoothstep(0.0, 0.42, cheekDist));

  return Math.max(0.0, Math.min(1.25, eyeMask * mouthMask * bottomMask * cheekFluff));
}

/**
 * Computes the biological grooming flow tangent vector on the blob surface.
 * Hairs part naturally from a crown whorl at the top of the head, sweep around
 * the eye sockets, and flow downward with a subtle cheek/belly swirl.
 */
export function evaluateGroomFlow(x, y, z, nx, ny, nz) {
  // Base gravity/growth direction from crown (0, 1.05, 0.1)
  let fx = x * 0.25;
  let fy = -0.85;
  let fz = (z - 0.15) * 0.25;

  // Sweep tangentially around the left and right eyes like real facial fur
  const eyeCenters = [
    [-0.33, 0.17, 0.86],
    [0.33, 0.17, 0.86]
  ];
  for (let i = 0; i < 2; i++) {
    const [ex, ey, ez] = eyeCenters[i];
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
    if (d < 0.48) {
      const influence = (1.0 - d / 0.48) * 0.85;
      fx += (dx / d) * influence;
      fy += (dy / d) * influence * 0.6;
      fz += (dz / d) * influence * 0.3;
    }
  }

  // Project onto the tangent plane orthogonal to surface normal N
  const dotFN = fx * nx + fy * ny + fz * nz;
  let tx = fx - dotFN * nx;
  let ty = fy - dotFN * ny;
  let tz = fz - dotFN * nz;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 1e-5) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    tx = 1.0;
    ty = 0.0;
    tz = 0.0;
  }
  return [tx, ty, tz];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Sculpt a unit sphere vertex into our cute "Mochi-Puff" blob creature with
 * chubby pear cheeks, perky ears, stubby side arms, and recessed eye sockets.
 */
function sculptBlobPosition(u, v, w) {
  let x = u;
  let y = v;
  let z = w;

  // 1. Pear/Mochi silhouette: chubby lower cheeks & belly, slightly tapered crown
  const bellyWidth = 1.0 + 0.22 * Math.exp(-Math.pow((y + 0.24) / 0.55, 2.0));
  const cheekPuff = 1.0 + 0.14 * Math.exp(-Math.pow((y + 0.05) / 0.38, 2.0)) * Math.max(0, z);
  x *= bellyWidth * cheekPuff;
  z *= (0.94 + 0.12 * Math.exp(-Math.pow((y + 0.22) / 0.6, 2.0)));
  y *= 0.96;

  // Slightly flatten the base so Mochi-Puff sits cozily on the ground
  if (y < -0.55) {
    const t = (-0.55 - y) / 0.45;
    y = -0.55 - Math.tanh(t * 1.15) * 0.32;
  }

  // 2. Perky sculptural ears on top-left and top-right
  const leftEarDir = normalize3(-0.46, 0.86, 0.06);
  const rightEarDir = normalize3(0.46, 0.86, 0.06);
  const dotLEar = Math.max(0.0, u * leftEarDir[0] + v * leftEarDir[1] + w * leftEarDir[2]);
  const dotREar = Math.max(0.0, u * rightEarDir[0] + v * rightEarDir[1] + w * rightEarDir[2]);
  const earProfile = Math.pow(Math.max(dotLEar, dotREar), 14.0) * 0.44;
  x += u * earProfile * 0.75;
  y += v * earProfile * 1.15;
  z += w * earProfile * 0.55;

  // 3. Cute stubby side nubbins (little arms)
  const leftArmDir = normalize3(-0.94, -0.08, 0.28);
  const rightArmDir = normalize3(0.94, -0.08, 0.28);
  const dotLArm = Math.max(0.0, u * leftArmDir[0] + v * leftArmDir[1] + w * leftArmDir[2]);
  const dotRArm = Math.max(0.0, u * rightArmDir[0] + v * rightArmDir[1] + w * rightArmDir[2]);
  const armProfile = Math.pow(Math.max(dotLArm, dotRArm), 18.0) * 0.24;
  x += u * armProfile * 1.1;
  y += v * armProfile * 0.6;
  z += w * armProfile * 0.9;

  // 4. Subtle anatomical eye socket indentation so the glossy eyes sit nested inside the plush fur
  const lx = x + 0.33;
  const rx = x - 0.33;
  const ey = y - 0.17;
  const ez = z - 0.86;
  const dEye = Math.min(
    Math.sqrt(lx * lx + ey * ey + ez * ez),
    Math.sqrt(rx * rx + ey * ey + ez * ez)
  );
  if (dEye < 0.32) {
    const indent = (1.0 - smoothstep(0.0, 0.32, dEye)) * 0.065;
    z -= indent;
  }

  return [x, y, z];
}

function normalize3(x, y, z) {
  const l = Math.sqrt(x * x + y * y + z * z) || 1.0;
  return [x / l, y / l, z / l];
}

/**
 * Builds the continuous organic blob geometry with baked vertex attributes:
 * - `aFollicleMask`: float [0..1.25] controlling fur length & density mask
 * - `aGroomTangent`: vec3 biological fur flow direction
 */
export function createOrganicBlobGeometry(widthSegments = 96, heightSegments = 72) {
  const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const w = posAttr.getZ(i);
    const [sx, sy, sz] = sculptBlobPosition(u, v, w);
    posAttr.setXYZ(i, sx, sy, sz);
  }

  geom.computeVertexNormals();

  const normAttr = geom.attributes.normal;
  const follicleMaskArray = new Float32Array(count);
  const groomTangentArray = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
    const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
    groomTangentArray[i * 3] = tx;
    groomTangentArray[i * 3 + 1] = ty;
    groomTangentArray[i * 3 + 2] = tz;
  }

  geom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
  geom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));

  return geom;
}

import { MASCOT_VERTEX_MORPH_GLSL } from './furShaders.js';

/**
 * Helper to build a cute 3D 5-pointed star geometry for Starlight Antennae, Halo, and Eye Sparkles
 */
function createStarGeometry(outerRadius = 0.09, innerRadius = 0.042, depth = 0.028, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.35,
    bevelSize: outerRadius * 0.14,
    bevelSegments: 3
  });
  geo.center();
  return geo;
}

/**
 * 8-Channel Phoneme-to-Viseme Morph Target Dictionary for Mr. M
 * Maps standard speech phoneme groups (ARPAbet / IPA inspired) to 8 anatomical facial morph channels:
 * - jawOpen   (A.x): Vertical mandible drop
 * - mouthWide (A.y): Zygomatic smile / horizontal commissure stretch
 * - lipRound  (A.z): Orbicularis oris forward protrusion & circular O-pucker
 * - lipPress  (A.w): Bilabial compression (/B/, /M/, /P/)
 * - cheekPuff (B.x): Buccinator & malar apple-cheek inflation
 * - lipTuckFV (B.y): Labiodental lower-lip tuck under upper incisors (/F/, /V/)
 * - tongueUp  (B.z): Lingual alveolar elevation (/L/, /T/, /D/, /N/, /TH/)
 * - browLift  (B.w): Supraorbital expressive arch lift
 */
export const VISEME_PRESETS = {
  SIL: {
    id: 'SIL',
    label: 'Rest / Silence',
    ipa: '/∅/',
    examples: 'Cozy W-Smile',
    jawOpen: 0.0,
    mouthWide: 0.12,
    lipRound: 0.0,
    lipPress: 0.0,
    cheekPuff: 0.05,
    lipTuckFV: 0.0,
    tongueUp: 0.0,
    browLift: 0.0
  },
  AA: {
    id: 'AA',
    label: 'Open Vowel /AA/',
    ipa: '/ɑː · æ/',
    examples: 'star, father, cat',
    jawOpen: 0.92,
    mouthWide: 0.36,
    lipRound: 0.06,
    lipPress: 0.0,
    cheekPuff: 0.48,
    lipTuckFV: 0.0,
    tongueUp: 0.14,
    browLift: 0.45
  },
  EE: {
    id: 'EE',
    label: 'Wide Smile /EE/',
    ipa: '/iː · eɪ/',
    examples: 'dream, happy, see',
    jawOpen: 0.34,
    mouthWide: 0.95,
    lipRound: 0.0,
    lipPress: 0.0,
    cheekPuff: 0.78,
    lipTuckFV: 0.0,
    tongueUp: 0.35,
    browLift: 0.52
  },
  IH: {
    id: 'IH',
    label: 'Soft Vowel /IH/',
    ipa: '/ɪ · ɛ · ə/',
    examples: 'wish, friend, magic',
    jawOpen: 0.48,
    mouthWide: 0.62,
    lipRound: 0.05,
    lipPress: 0.0,
    cheekPuff: 0.42,
    lipTuckFV: 0.0,
    tongueUp: 0.25,
    browLift: 0.28
  },
  OH: {
    id: 'OH',
    label: 'Round Open /OH/',
    ipa: '/oʊ · ɔː/',
    examples: 'glow, rainbow, go',
    jawOpen: 0.78,
    mouthWide: 0.05,
    lipRound: 0.86,
    lipPress: 0.0,
    cheekPuff: 0.32,
    lipTuckFV: 0.0,
    tongueUp: 0.1,
    browLift: 0.56
  },
  OO: {
    id: 'OO',
    label: 'Tight Pucker /OO/',
    ipa: '/uː · ʊ/',
    examples: 'moon, blue, you',
    jawOpen: 0.36,
    mouthWide: 0.0,
    lipRound: 0.98,
    lipPress: 0.0,
    cheekPuff: 0.24,
    lipTuckFV: 0.0,
    tongueUp: 0.08,
    browLift: 0.38
  },
  BMP: {
    id: 'BMP',
    label: 'Bilabial Press /B·M·P/',
    ipa: '/b · m · p/',
    examples: 'Mr. M, bubble, pop',
    jawOpen: 0.0,
    mouthWide: 0.22,
    lipRound: 0.14,
    lipPress: 0.96,
    cheekPuff: 0.68,
    lipTuckFV: 0.0,
    tongueUp: 0.0,
    browLift: 0.22
  },
  FV: {
    id: 'FV',
    label: 'Lip Tuck /F·V/',
    ipa: '/f · v/',
    examples: 'fluffy, fur, love',
    jawOpen: 0.18,
    mouthWide: 0.34,
    lipRound: 0.06,
    lipPress: 0.18,
    cheekPuff: 0.35,
    lipTuckFV: 0.95,
    tongueUp: 0.15,
    browLift: 0.25
  },
  L_TH: {
    id: 'L_TH',
    label: 'Tongue Tip /L·T·TH/',
    ipa: '/l · t · d · θ/',
    examples: 'light, little, think',
    jawOpen: 0.46,
    mouthWide: 0.42,
    lipRound: 0.1,
    lipPress: 0.0,
    cheekPuff: 0.34,
    lipTuckFV: 0.0,
    tongueUp: 0.96,
    browLift: 0.32
  },
  SH_CH: {
    id: 'SH_CH',
    label: 'Palatal /SH·CH·J/',
    ipa: '/ʃ · tʃ · dʒ/',
    examples: 'shine, joy, wish',
    jawOpen: 0.32,
    mouthWide: 0.18,
    lipRound: 0.72,
    lipPress: 0.0,
    cheekPuff: 0.45,
    lipTuckFV: 0.0,
    tongueUp: 0.65,
    browLift: 0.35
  },
  WQ: {
    id: 'WQ',
    label: 'Glide Pucker /W·R/',
    ipa: '/w · ɹ/',
    examples: 'wonder, world, roar',
    jawOpen: 0.28,
    mouthWide: 0.0,
    lipRound: 0.92,
    lipPress: 0.12,
    cheekPuff: 0.54,
    lipTuckFV: 0.0,
    tongueUp: 0.35,
    browLift: 0.42
  },
  KG: {
    id: 'KG',
    label: 'Velar Open /K·G·S/',
    ipa: '/k · ɡ · s · z/',
    examples: 'kind, cozy, star',
    jawOpen: 0.38,
    mouthWide: 0.58,
    lipRound: 0.05,
    lipPress: 0.0,
    cheekPuff: 0.44,
    lipTuckFV: 0.0,
    tongueUp: 0.52,
    browLift: 0.26
  }
};

/**
 * Creates the complete Stylized Blob Creature group ("Mr. M" / Custom Kids' Dream Mascot):
 * - Base velvety under-skin mesh coupled to GPU vertex morphing
 * - 8-Channel Phoneme-to-Viseme facial morph target rig with dynamic fur velocity coupling
 * - Multi-layered glossy 3D eyes with iris, pupil tracking, star catchlights & expressive blinking eyelids
 * - Rosy translucent cheek blush patches that puff when speaking
 * - Animated 3D Viseme Mouth (W-smile + open vowel cavity + upper teeth + articulated pink tongue) for Speech-to-Text & TTS
 * - Articulated waving arm motion + custom Mascot Silhouettes & Dream Accessories
 */
export function createBlobCreature() {
  const root = new THREE.Group();
  root.name = 'MochiPuffCreature';

  const bodyGeometry = createOrganicBlobGeometry(96, 72);

  // Shared morph uniforms for the under-skin mesh so it deforms in 100% lockstep with the 64 fur shells & 60k strands
  const skinMorphUniforms = {
    uTalkMorph: { value: 0.0 },
    uTalkSmile: { value: 0.0 },
    uWaveAmount: { value: 0.0 },
    uWavePhase: { value: 0.0 },
    uEarBounce: { value: 0.0 },
    uEarStyle: { value: 0.0 },
    uVisemeWeightsA: { value: new THREE.Vector4(0, 0.12, 0, 0) },
    uVisemeWeightsB: { value: new THREE.Vector4(0.05, 0, 0, 0) },
    uFacialMorphVel: { value: new THREE.Vector4(0, 0, 0, 0) }
  };

  // Under-skin velvety material (visible at roots and around eyes/mouth)
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3248'),
    roughness: 0.78,
    metalness: 0.02
  });

  skinMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTalkMorph = skinMorphUniforms.uTalkMorph;
    shader.uniforms.uTalkSmile = skinMorphUniforms.uTalkSmile;
    shader.uniforms.uWaveAmount = skinMorphUniforms.uWaveAmount;
    shader.uniforms.uWavePhase = skinMorphUniforms.uWavePhase;
    shader.uniforms.uEarBounce = skinMorphUniforms.uEarBounce;
    shader.uniforms.uEarStyle = skinMorphUniforms.uEarStyle;
    shader.uniforms.uVisemeWeightsA = skinMorphUniforms.uVisemeWeightsA;
    shader.uniforms.uVisemeWeightsB = skinMorphUniforms.uVisemeWeightsB;
    shader.uniforms.uFacialMorphVel = skinMorphUniforms.uFacialMorphVel;

    shader.vertexShader =
      MASCOT_VERTEX_MORPH_GLSL +
      '\n' +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
           vec3 tmpMorphPos = position;
           applyMascotMorph(tmpMorphPos, objectNormal);`
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
           vec3 dummyNorm = normal;
           applyMascotMorph(transformed, dummyNorm);`
        );
  };

  const bodyMesh = new THREE.Mesh(bodyGeometry, skinMaterial);
  bodyMesh.name = 'BlobBodyMesh';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // Facial features container so eyes, blush, mouth, and nose move with head tilt
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FacialFeatures';
  root.add(faceGroup);

  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#120d1a'),
    roughness: 0.04,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0
  });

  const irisMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#4c2882')
  });

  const highlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff')
  });

  const warmHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffe4f2')
  });

  const starHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#fef08a')
  });

  const eyelidMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3248'),
    roughness: 0.65,
    metalness: 0.02
  });

  const miniStarGeo = createStarGeometry(0.036, 0.015, 0.008, 4);

  const eyes = [];
  const eyeSides = [-1, 1];

  for (const side of eyeSides) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.31, 0.16, 0.94);
    eyePivot.rotation.y = side * 0.22;
    eyePivot.rotation.x = -0.06;

    // Dark glossy cornea
    const eyeballGeo = new THREE.SphereGeometry(0.17, 32, 24);
    eyeballGeo.scale(0.96, 1.08, 0.68);
    const eyeball = new THREE.Mesh(eyeballGeo, eyeMaterial);
    eyePivot.add(eyeball);

    // Warm violet-amber lower iris crescent
    const irisGeo = new THREE.SphereGeometry(0.12, 24, 16);
    irisGeo.scale(0.92, 0.95, 0.38);
    const iris = new THREE.Mesh(irisGeo, irisMaterial);
    iris.position.set(0, -0.02, 0.086);
    eyePivot.add(iris);

    // Primary large anime catchlight (top-inner)
    const catchlightMainGeo = new THREE.SphereGeometry(0.045, 16, 12);
    catchlightMainGeo.scale(1.0, 1.18, 0.32);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, highlightMat);
    catchlightMain.position.set(-side * 0.042, 0.052, 0.112);
    eyePivot.add(catchlightMain);

    // Secondary lower rim catchlight
    const catchlightSubGeo = new THREE.SphereGeometry(0.023, 14, 10);
    catchlightSubGeo.scale(1.0, 1.0, 0.32);
    const catchlightSub = new THREE.Mesh(catchlightSubGeo, warmHighlightMat);
    catchlightSub.position.set(side * 0.048, -0.052, 0.11);
    eyePivot.add(catchlightSub);

    // 4-Pointed Dream Star Sparkle inside the eye (twinkles when talking / excited)
    const starCatchlight = new THREE.Mesh(miniStarGeo, starHighlightMat);
    starCatchlight.position.set(side * 0.036, 0.028, 0.118);
    eyePivot.add(starCatchlight);

    // Expressive Plush Upper Eyelid Cap (rotates down over eye when blinking / winking)
    const upperLidGeo = new THREE.SphereGeometry(0.178, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
    upperLidGeo.scale(0.98, 1.08, 0.72);
    const upperLid = new THREE.Mesh(upperLidGeo, eyelidMat);
    upperLid.rotation.x = -1.45; // tucked open at rest
    eyePivot.add(upperLid);

    // Expressive Plush Lower Eyelid Cap (rises up for happy squints when smiling/talking)
    const lowerLidGeo = new THREE.SphereGeometry(0.176, 28, 16, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52);
    lowerLidGeo.scale(0.98, 1.08, 0.72);
    const lowerLid = new THREE.Mesh(lowerLidGeo, eyelidMat);
    lowerLid.rotation.x = 1.45; // tucked open at rest
    eyePivot.add(lowerLid);

    faceGroup.add(eyePivot);
    eyes.push({
      pivot: eyePivot,
      basePos: eyePivot.position.clone(),
      catchlightMain,
      catchlightSub,
      starCatchlight,
      upperLid,
      lowerLid,
      side
    });
  }

  // Rosy glowing blush ovals nestled right below the eyes on the plush cheeks
  const blushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff5c93'),
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });

  const blushMeshes = [];
  for (const side of eyeSides) {
    const blushGeo = new THREE.SphereGeometry(0.12, 20, 16);
    blushGeo.scale(1.4, 0.75, 0.35);
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.position.set(side * 0.49, 0.0, 0.96);
    blush.rotation.y = side * 0.34;
    blush.rotation.z = -side * 0.1;
    faceGroup.add(blush);
    blushMeshes.push({ mesh: blush, side, basePos: blush.position.clone() });
  }

  // Cute bright pink nose button positioned proudly on the muzzle surface
  const noseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff94b8')
  });
  const noseGeo = new THREE.SphereGeometry(0.048, 18, 14);
  noseGeo.scale(1.3, 0.88, 0.75);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.075, 1.05);
  faceGroup.add(nose);

  // =========================================================================
  // EXPRESSIVE SUPRAORBITAL PLUSH EYEBROW ARCS (Sync with Brow Lift & Phoneme Prosody)
  // =========================================================================
  const browMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2c1838'),
    roughness: 0.55,
    metalness: 0.05
  });
  const brows = [];
  for (const side of [-1, 1]) {
    const browGroup = new THREE.Group();
    const bx = side * 0.32;
    const by = 0.45;
    const bz = 0.90;
    browGroup.position.set(bx, by, bz);
    browGroup.rotation.set(-0.22, side * 0.25, side * -0.10);

    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * -0.09, -0.012, -0.01),
      new THREE.Vector3(0.0, 0.018, 0.012),
      new THREE.Vector3(side * 0.09, -0.018, -0.014)
    ]);
    const browGeo = new THREE.TubeGeometry(browCurve, 18, 0.021, 10, false);
    const browMesh = new THREE.Mesh(browGeo, browMat);
    browGroup.add(browMesh);
    faceGroup.add(browGroup);
    brows.push({
      group: browGroup,
      side,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      baseRotZ: side * -0.10
    });
  }

  // =========================================================================
  // ANIMATED 3D VISEME MOUTH SYSTEM (Cat W-Smile + Open Speaking Mouth + Upper Teeth + Articulated Tongue)
  // =========================================================================
  const mouthGroup = new THREE.Group();
  mouthGroup.name = 'AnimatedMouthGroup';
  faceGroup.add(mouthGroup);

  const mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a102e') });
  const mouthArcs = [];
  for (const side of [-1, 1]) {
    const arcGeo = new THREE.TorusGeometry(0.046, 0.013, 10, 20, Math.PI * 0.92);
    const arc = new THREE.Mesh(arcGeo, mouthMat);
    arc.position.set(side * 0.043, 0.035, 1.045);
    arc.rotation.x = Math.PI + 0.15;
    arc.rotation.y = side * 0.14;
    mouthGroup.add(arc);
    mouthArcs.push({ mesh: arc, side, baseX: side * 0.043, baseY: 0.035, baseZ: 1.045 });
  }

  // 3D Open Mouth Cavity, Upper Incisors & Articulated 2-Stage Pink Tongue
  const openMouthPivot = new THREE.Group();
  openMouthPivot.position.set(0, -0.015, 1.032);
  openMouthPivot.scale.set(0.001, 0.001, 0.001);
  openMouthPivot.visible = false;
  mouthGroup.add(openMouthPivot);

  const mouthCavityGeo = new THREE.SphereGeometry(0.095, 24, 18);
  mouthCavityGeo.scale(1.15, 0.95, 0.35);
  const mouthCavityMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2d0822') });
  const mouthCavityMesh = new THREE.Mesh(mouthCavityGeo, mouthCavityMat);
  openMouthPivot.add(mouthCavityMesh);

  // Cute rounded upper teeth bar (visible on /FV/ lip tuck, /EE/ wide smile, and /L_TH/)
  const upperTeethGeo = new THREE.SphereGeometry(0.058, 18, 12);
  upperTeethGeo.scale(1.38, 0.35, 0.34);
  const upperTeethMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fffaf5') });
  const upperTeethMesh = new THREE.Mesh(upperTeethGeo, upperTeethMat);
  upperTeethMesh.position.set(0, 0.056, 0.026);
  openMouthPivot.add(upperTeethMesh);

  // Cute warm coral-pink rounded tongue base nestled inside the lower mouth cavity
  const tongueGeo = new THREE.SphereGeometry(0.068, 20, 14);
  tongueGeo.scale(1.12, 0.65, 0.38);
  const tongueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6b9d') });
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(0, -0.028, 0.016);
  openMouthPivot.add(tongueMesh);

  // Articulated tongue tip (elevates toward upper alveolar ridge for /L/, /T/, /D/, /N/, /TH/)
  const tongueTipGeo = new THREE.SphereGeometry(0.048, 16, 12);
  tongueTipGeo.scale(0.95, 0.72, 0.45);
  const tongueTipMesh = new THREE.Mesh(tongueTipGeo, tongueMat);
  tongueTipMesh.position.set(0, -0.018, 0.032);
  openMouthPivot.add(tongueTipMesh);

  // Soft dark rim lip loop framing the open speaking mouth
  const openLipGeo = new THREE.TorusGeometry(0.092, 0.014, 10, 28);
  openLipGeo.scale(1.15, 0.95, 0.5);
  const openLipMesh = new THREE.Mesh(openLipGeo, mouthMat);
  openLipMesh.position.set(0, 0, 0.018);
  openMouthPivot.add(openLipMesh);

  // =========================================================================
  // CUSTOMIZABLE MASCOT ACCESSORIES ("Make Mochi-Puff Your Own Dream Mascot")
  // =========================================================================
  const accessoriesGroup = new THREE.Group();
  accessoriesGroup.name = 'MascotAccessories';
  root.add(accessoriesGroup);

  const starGoldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fde047'),
    emissive: new THREE.Color('#f59e0b'),
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.35
  });
  const pastelPinkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f472b6'),
    emissive: new THREE.Color('#db2777'),
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.1
  });
  const cloudWhiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    emissive: new THREE.Color('#bae6fd'),
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.05
  });

  // 1. Starlight Dream Antennae (bouncing star bobbles on top of head)
  const antennaeGroup = new THREE.Group();
  antennaeGroup.visible = false;
  accessoriesGroup.add(antennaeGroup);

  const starBobbleGeo = createStarGeometry(0.115, 0.052, 0.038, 5);
  const antennaStars = [];
  for (const side of [-1, 1]) {
    const stalkPivot = new THREE.Group();
    stalkPivot.position.set(side * 0.18, 0.92, 0.12);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.09, 0.22, 0.04),
      new THREE.Vector3(side * 0.18, 0.38, 0.08)
    ]);
    const stalkGeo = new THREE.TubeGeometry(curve, 14, 0.022, 10, false);
    const stalkMesh = new THREE.Mesh(stalkGeo, pastelPinkMat);
    stalkPivot.add(stalkMesh);

    const starTip = new THREE.Mesh(starBobbleGeo, starGoldMat);
    starTip.position.set(side * 0.19, 0.41, 0.09);
    stalkPivot.add(starTip);

    antennaeGroup.add(stalkPivot);
    antennaStars.push({ pivot: stalkPivot, starTip, side });
  }

  // 2. Dream Cloud & Star Crown Halo (floating above head)
  const cloudCrownGroup = new THREE.Group();
  cloudCrownGroup.position.set(0, 1.24, 0.05);
  cloudCrownGroup.visible = false;
  accessoriesGroup.add(cloudCrownGroup);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.018, 12, 36),
    starGoldMat
  );
  haloRing.rotation.x = Math.PI / 2 - 0.12;
  cloudCrownGroup.add(haloRing);

  // Cute mini cloud puffs & stars around the halo ring
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const hx = Math.cos(ang) * 0.42;
    const hz = Math.sin(ang) * 0.42;
    if (i % 2 === 0) {
      const puffCluster = new THREE.Group();
      puffCluster.position.set(hx, 0, hz);
      const pCenter = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), cloudWhiteMat);
      const pLeft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), cloudWhiteMat);
      pLeft.position.set(-0.055, -0.01, 0);
      const pRight = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), cloudWhiteMat);
      pRight.position.set(0.055, -0.01, 0);
      puffCluster.add(pCenter, pLeft, pRight);
      cloudCrownGroup.add(puffCluster);
    } else {
      const hStar = new THREE.Mesh(starBobbleGeo, starGoldMat);
      hStar.scale.setScalar(0.68);
      hStar.position.set(hx, 0.02, hz);
      hStar.rotation.y = -ang + Math.PI / 2;
      cloudCrownGroup.add(hStar);
    }
  }

  // 3. Stardust Bowtie & Dream Badge (on chest below mouth)
  const bowtieGroup = new THREE.Group();
  bowtieGroup.position.set(0, -0.32, 0.98);
  bowtieGroup.rotation.x = 0.18;
  bowtieGroup.visible = false;
  accessoriesGroup.add(bowtieGroup);

  for (const side of [-1, 1]) {
    const wingGeo = new THREE.SphereGeometry(0.11, 18, 14);
    wingGeo.scale(1.25, 0.78, 0.38);
    const wing = new THREE.Mesh(wingGeo, pastelPinkMat);
    wing.position.set(side * 0.11, 0, 0);
    wing.rotation.z = -side * 0.18;
    bowtieGroup.add(wing);
  }
  const bowCenterStar = new THREE.Mesh(starBobbleGeo, starGoldMat);
  bowCenterStar.scale.setScalar(0.75);
  bowCenterStar.position.set(0, 0, 0.035);
  bowtieGroup.add(bowCenterStar);

  //Cute Rosy Paw Pads on the stubby arms that follow arm waving!
  const pawPads = [];
  for (const side of [-1, 1]) {
    const pawGroup = new THREE.Group();
    pawGroup.position.set(side * 1.06, -0.08, 0.34);
    pawGroup.rotation.y = side * 0.95;
    const mainPad = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 14, 12),
      noseMat
    );
    mainPad.scale.set(1.0, 0.85, 0.35);
    pawGroup.add(mainPad);
    for (let t = -1; t <= 1; t++) {
      const toeBean = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 10, 8),
        noseMat
      );
      toeBean.scale.set(0.9, 1.1, 0.35);
      toeBean.position.set(t * 0.042, 0.068, 0.008);
      pawGroup.add(toeBean);
    }
    root.add(pawGroup);
    pawPads.push({ group: pawGroup, side, basePos: pawGroup.position.clone() });
  }

  // Animation & physics state for creature motion (coupled to GPGPU fur inertia + 8-channel phoneme morphs & waving)
  const animState = {
    time: 0,
    baseScale: 1.0,
    baseX: 0.0,
    baseY: 0.0,
    baseZ: 0.0,
    blinkTimer: 0,
    nextBlink: 2.2,
    isDoubleBlink: false,
    winkSide: 0,
    winkTimer: 0,
    happySquintTimer: 0,
    boopImpulse: 0,
    boopPhase: 0,
    // Speech & Waving state
    isTalking: false,
    targetMouthOpen: 0.0,
    currentMouthOpen: 0.0,
    targetMouthWidth: 1.0,
    currentMouthWidth: 1.0,
    targetSmile: 0.0,
    currentSmile: 0.0,
    autoSpeakTimer: 0.0,
    autoSpeakPhase: 0.0,

    // 8-Channel Phoneme-to-Viseme Morph Target State & Spring-Damper Velocities
    activePhoneme: 'SIL',
    activeVisemeLabel: 'Rest / Silence',
    phonemeHoldTimer: 0.0,
    furReactivity: 1.0, // Multiplier for dynamic fur response to facial movements

    targetViseme: {
      jawOpen: 0.0,
      mouthWide: 0.12,
      lipRound: 0.0,
      lipPress: 0.0,
      cheekPuff: 0.05,
      lipTuckFV: 0.0,
      tongueUp: 0.0,
      browLift: 0.0
    },
    currentViseme: {
      jawOpen: 0.0,
      mouthWide: 0.12,
      lipRound: 0.0,
      lipPress: 0.0,
      cheekPuff: 0.05,
      lipTuckFV: 0.0,
      tongueUp: 0.0,
      browLift: 0.0
    },
    visemeVel: {
      jawOpen: 0.0,
      mouthWide: 0.0,
      lipRound: 0.0,
      lipPress: 0.0,
      cheekPuff: 0.0,
      lipTuckFV: 0.0,
      tongueUp: 0.0,
      browLift: 0.0
    },

    // Packed vectors read by main.js to drive GPGPU Verlet fur physics & vertex shaders
    visemeWeightsA: new THREE.Vector4(0, 0.12, 0, 0),
    visemeWeightsB: new THREE.Vector4(0.05, 0, 0, 0),
    facialMorphVel: new THREE.Vector4(0, 0, 0, 0),
    facialMorphState: new THREE.Vector4(0, 0.05, 0, 0.12),

    waveTimer: 0.0,
    waveIntensity: 0.0,
    wavePhase: 0.0,
    earBounce: 0.0,
    earStyle: 0,
    earStyleCode: 0,
    talkMorph: 0.0,
    talkSmile: 0.0,
    waveAmount: 0.0,
    accessoryStyle: 'star_antennae',
    starEyesEnabled: true,
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    targetLook: new THREE.Vector2(0, 0),
    currentLook: new THREE.Vector2(0, 0)
  };

  // Show Starlight Antennae by default to give the user's custom Dream Mascot its own distinct silhouette ("similar but different")!
  antennaeGroup.visible = true;

  // Spatial anchor position & viewer-facing orientation for AR plane placement
  const anchorPos = new THREE.Vector3(0, 0, 0);
  const targetAnchorPos = new THREE.Vector3(0, 0, 0);
  const startAnchorPos = new THREE.Vector3(0, 0, 0);
  let isPlaced = false;
  let isPlacing = false;
  let placeProgress = 1.0;
  let placeHopHeight = 0.0;
  let facingYaw = 0.0;
  let facingPitch = 0.0;
  let targetFacingYaw = 0.0;
  let targetFacingPitch = 0.0;
  let faceViewerHoldTimer = 0.0;

  function placeAt(targetWorldPos, normal, animate = true, cameraPos = null) {
    if (!targetWorldPos) return;
    isPlaced = true;
    const s = animState.baseScale;
    const targetCenterY = targetWorldPos.y + 0.94 * s;

    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    faceViewerHoldTimer = 1.4;

    if (cameraPos) {
      const dx = cameraPos.x - targetWorldPos.x;
      const dy = cameraPos.y - targetCenterY;
      const dz = cameraPos.z - targetWorldPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
      if (!animate) {
        facingYaw = targetFacingYaw;
        facingPitch = targetFacingPitch;
      }
    }

    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.65, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      targetAnchorPos.copy(anchorPos);
      isPlacing = false;
      placeProgress = 1.0;
    }
  }

  function resetPlacement(animate = true) {
    isPlaced = false;
    targetFacingYaw = 0.0;
    targetFacingPitch = 0.0;
    faceViewerHoldTimer = 0.0;
    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    const s = animState.baseScale;
    const ox = animState.baseX || 0.0;
    const oz = animState.baseZ || 0.0;
    const targetY = -0.94 + 0.94 * s;
    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(ox, targetY, oz);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.55, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(ox, targetY, oz);
      targetAnchorPos.set(ox, targetY, oz);
      startAnchorPos.set(ox, targetY, oz);
      facingYaw = 0.0;
      facingPitch = 0.0;
      isPlacing = false;
      placeProgress = 1.0;
      animState.boopImpulse = 0.0;
      animState.boopPhase = 0.0;
    }
  }

  function setEnvironmentScale(scale, offsetX = 0.0, offsetZ = 0.0) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1.0;
    const ox = Number.isFinite(offsetX) ? offsetX : 0.0;
    const oz = Number.isFinite(offsetZ) ? offsetZ : 0.0;
    animState.baseScale = s;
    animState.baseX = ox;
    animState.baseY = -0.94 * (1.0 - s);
    animState.baseZ = oz;
    if (!isPlaced) {
      anchorPos.set(ox, -0.94 + 0.94 * s, oz);
      targetAnchorPos.copy(anchorPos);
      startAnchorPos.copy(anchorPos);
      facingYaw = 0.0;
      facingPitch = 0.0;
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }
  }

  function triggerBoop() {
    animState.boopImpulse = 1.0;
    animState.boopPhase = 0.0;
    animState.waveTimer = Math.max(animState.waveTimer, 1.4);
  }

  function triggerWave(duration = 2.6) {
    animState.waveTimer = Math.max(animState.waveTimer, duration);
    animState.happySquintTimer = Math.max(animState.happySquintTimer, 0.9);
  }

  function triggerBlink(wink = false) {
    if (wink) {
      animState.winkSide = Math.random() > 0.5 ? 1 : -1;
      animState.winkTimer = 0.38;
    } else {
      animState.blinkTimer = animState.nextBlink + 0.001;
      animState.isDoubleBlink = true;
    }
  }

  /**
   * Triggers a specific Phoneme Viseme morph target pose on Mr. M for interactive testing or coarticulated speech
   */
  function triggerVisemePose(visemeKey, duration = 0.65, intensity = 1.0) {
    const preset = VISEME_PRESETS[visemeKey] || VISEME_PRESETS.SIL;
    const scale = Math.max(0, Math.min(1.35, Number(intensity) || 1.0));

    animState.activePhoneme = preset.id;
    animState.activeVisemeLabel = `${preset.label} ${preset.ipa}`;
    animState.phonemeHoldTimer = Math.max(0.05, Number(duration) || 0.55);
    animState.isTalking = visemeKey !== 'SIL';

    animState.targetViseme.jawOpen = preset.jawOpen * scale;
    animState.targetViseme.mouthWide = preset.mouthWide * scale;
    animState.targetViseme.lipRound = preset.lipRound * scale;
    animState.targetViseme.lipPress = preset.lipPress * scale;
    animState.targetViseme.cheekPuff = preset.cheekPuff * scale;
    animState.targetViseme.lipTuckFV = preset.lipTuckFV * scale;
    animState.targetViseme.tongueUp = preset.tongueUp * scale;
    animState.targetViseme.browLift = preset.browLift * scale;

    animState.targetMouthOpen = preset.jawOpen * scale;
    animState.targetMouthWidth = 0.8 + preset.mouthWide * 0.5 - preset.lipRound * 0.25;
    animState.targetSmile = Math.max(preset.mouthWide, preset.cheekPuff * 0.7) * scale;
  }

  function triggerHappyTalkDemo(duration = 2.6) {
    animState.autoSpeakTimer = Math.max(animState.autoSpeakTimer, duration);
    triggerWave(duration * 0.95);
    animState.boopImpulse = Math.max(animState.boopImpulse, 0.55);
    animState.boopPhase = 0.0;
  }

  function setFurReactivity(val) {
    animState.furReactivity = Math.max(0.0, Math.min(2.5, Number(val) ?? 1.0));
  }

  function getPhonemeTelemetry() {
    return {
      activePhoneme: animState.activePhoneme,
      activeVisemeLabel: animState.activeVisemeLabel,
      isSpeaking: animState.isTalking || animState.autoSpeakTimer > 0 || animState.phonemeHoldTimer > 0,
      furReactivity: animState.furReactivity,
      weights: { ...animState.currentViseme },
      velocities: {
        jawVel: animState.facialMorphVel.x,
        cheekVel: animState.facialMorphVel.y,
        puckerVel: animState.facialMorphVel.z,
        browVel: animState.facialMorphVel.w
      }
    };
  }

  function setSpeechState({
    talking = false,
    isSpeaking = false,
    mouthOpen = 0.0,
    mouthWidth = 1.0,
    smile = 0.0,
    mouthSmile = 0.0,
    energy = 0.0,
    wave = false,
    phoneme = null,
    visemeWeights = null
  } = {}) {
    const activeTalk = Boolean(talking || isSpeaking);
    const effSmile = Math.max(smile, mouthSmile);
    animState.isTalking = activeTalk;
    animState.targetMouthOpen = Math.max(0.0, Math.min(1.0, mouthOpen));
    animState.targetMouthWidth = Math.max(0.55, Math.min(1.45, mouthWidth));
    animState.targetSmile = Math.max(0.0, Math.min(1.0, effSmile));

    if (visemeWeights && typeof visemeWeights === 'object') {
      animState.targetViseme.jawOpen = Math.max(0, Math.min(1.2, visemeWeights.jawOpen ?? mouthOpen));
      animState.targetViseme.mouthWide = Math.max(0, Math.min(1.2, visemeWeights.mouthWide ?? effSmile));
      animState.targetViseme.lipRound = Math.max(0, Math.min(1.2, visemeWeights.lipRound ?? 0));
      animState.targetViseme.lipPress = Math.max(0, Math.min(1.2, visemeWeights.lipPress ?? 0));
      animState.targetViseme.cheekPuff = Math.max(0, Math.min(1.2, visemeWeights.cheekPuff ?? effSmile * 0.65));
      animState.targetViseme.lipTuckFV = Math.max(0, Math.min(1.2, visemeWeights.lipTuckFV ?? 0));
      animState.targetViseme.tongueUp = Math.max(0, Math.min(1.2, visemeWeights.tongueUp ?? 0));
      animState.targetViseme.browLift = Math.max(0, Math.min(1.2, visemeWeights.browLift ?? (energy || mouthOpen) * 0.45));

      if (phoneme && VISEME_PRESETS[phoneme]) {
        animState.activePhoneme = phoneme;
        animState.activeVisemeLabel = `${VISEME_PRESETS[phoneme].label} ${VISEME_PRESETS[phoneme].ipa}`;
      } else if (phoneme) {
        animState.activePhoneme = String(phoneme);
        animState.activeVisemeLabel = String(phoneme);
      }
      animState.phonemeHoldTimer = activeTalk ? 0.25 : 0;
    } else if (phoneme && VISEME_PRESETS[phoneme]) {
      const preset = VISEME_PRESETS[phoneme];
      const amp = Math.max(0.35, Math.min(1.2, energy || mouthOpen || 1.0));
      animState.activePhoneme = preset.id;
      animState.activeVisemeLabel = `${preset.label} ${preset.ipa}`;
      animState.targetViseme.jawOpen = preset.jawOpen * amp;
      animState.targetViseme.mouthWide = preset.mouthWide * amp;
      animState.targetViseme.lipRound = preset.lipRound * amp;
      animState.targetViseme.lipPress = preset.lipPress * amp;
      animState.targetViseme.cheekPuff = preset.cheekPuff * amp;
      animState.targetViseme.lipTuckFV = preset.lipTuckFV * amp;
      animState.targetViseme.tongueUp = preset.tongueUp * amp;
      animState.targetViseme.browLift = preset.browLift * amp;
      animState.phonemeHoldTimer = activeTalk ? 0.25 : 0;
    } else if (activeTalk) {
      // Synthesize natural 8-channel visemes from mouthOpen / mouthWidth / smile
      const openVal = Math.max(0, Math.min(1, mouthOpen));
      const wideVal = Math.max(0, Math.min(1, effSmile + Math.max(0, mouthWidth - 1.0) * 1.4));
      const roundVal = Math.max(0, Math.min(1, (1.08 - mouthWidth) * 1.6 + (1.0 - wideVal) * openVal * 0.45));
      const pressVal = openVal < 0.06 ? 0.65 : 0.0;

      animState.targetViseme.jawOpen = openVal;
      animState.targetViseme.mouthWide = wideVal;
      animState.targetViseme.lipRound = roundVal;
      animState.targetViseme.lipPress = pressVal;
      animState.targetViseme.cheekPuff = wideVal * 0.65 + openVal * 0.25;
      animState.targetViseme.lipTuckFV = 0.0;
      animState.targetViseme.tongueUp = openVal * 0.35;
      animState.targetViseme.browLift = Math.min(1.0, (energy || openVal) * 0.52 + wideVal * 0.22);

      animState.activePhoneme = pressVal > 0.4 ? 'BMP' : roundVal > 0.55 ? (openVal > 0.5 ? 'OH' : 'OO') : wideVal > 0.58 ? 'EE' : openVal > 0.55 ? 'AA' : 'IH';
      animState.activeVisemeLabel = VISEME_PRESETS[animState.activePhoneme]?.label || 'Speaking';
    } else {
      const sil = VISEME_PRESETS.SIL;
      animState.activePhoneme = 'SIL';
      animState.activeVisemeLabel = sil.label;
      animState.targetViseme.jawOpen = sil.jawOpen;
      animState.targetViseme.mouthWide = sil.mouthWide;
      animState.targetViseme.lipRound = sil.lipRound;
      animState.targetViseme.lipPress = sil.lipPress;
      animState.targetViseme.cheekPuff = sil.cheekPuff;
      animState.targetViseme.lipTuckFV = sil.lipTuckFV;
      animState.targetViseme.tongueUp = sil.tongueUp;
      animState.targetViseme.browLift = sil.browLift;
    }

    if (wave) {
      animState.waveTimer = Math.max(animState.waveTimer, 0.6);
    }
  }

  function setMascotStyle({ earStyle, accessory, accessoryStyle, eyeColor, starEyes, cheekColor, blushColor, furReactivity } = {}) {
    if (earStyle !== undefined) {
      let code = 0;
      if (typeof earStyle === 'string') {
        const map = { bear: 0, puppy: 1, bunny: 2, round: 3 };
        code = map[earStyle] !== undefined ? map[earStyle] : 0;
      } else {
        code = Number(earStyle) || 0;
      }
      animState.earStyle = code;
      animState.earStyleCode = code;
      skinMorphUniforms.uEarStyle.value = code;
    }
    const acc = accessory !== undefined ? accessory : accessoryStyle;
    if (acc !== undefined) {
      animState.accessoryStyle = acc;
      antennaeGroup.visible = acc === 'antennae' || acc === 'star_antennae' || acc === 'all';
      cloudCrownGroup.visible = acc === 'halo' || acc === 'cloud_crown' || acc === 'all';
      bowtieGroup.visible = acc === 'amulet' || acc === 'dream_bowtie' || acc === 'all';
    }
    if (eyeColor) {
      irisMaterial.color.set(eyeColor);
    }
    if (starEyes !== undefined) {
      animState.starEyesEnabled = Boolean(starEyes);
      for (const eye of eyes) {
        eye.starCatchlight.visible = animState.starEyesEnabled;
      }
    }
    const cColor = cheekColor || blushColor;
    if (cColor) {
      blushMat.color.set(cColor);
    }
    if (furReactivity !== undefined) {
      setFurReactivity(furReactivity);
    }
  }

  const setMascotCustomization = setMascotStyle;

  // Phoneme sequence for demo speech so "Happy Speak" cycles through distinct coarticulated phonemes
  const DEMO_PHONEME_CYCLE = ['BMP', 'AA', 'L_TH', 'EE', 'OO', 'FV', 'OH', 'SH_CH', 'WQ', 'EE', 'BMP', 'AA'];

  function update(dt, pointerNDC, cameraPos = null, isARMode = false) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    animState.time += safeDt;

    if (faceViewerHoldTimer > 0) {
      faceViewerHoldTimer = Math.max(0, faceViewerHoldTimer - safeDt);
    }

    // Smooth eye/head tracking toward pointer
    if (pointerNDC && faceViewerHoldTimer <= 0) {
      animState.targetLook.set(pointerNDC.x * 0.35, pointerNDC.y * 0.25);
    } else if (faceViewerHoldTimer > 0) {
      animState.targetLook.set(0, 0);
    }
    animState.currentLook.lerp(animState.targetLook, Math.min(1.0, safeDt * 7.5));

    // Breathing & happy idle bobbing + boop jump impulse
    if (animState.boopImpulse > 0.001) {
      animState.boopPhase += safeDt * 14.0;
      animState.boopImpulse *= Math.exp(-safeDt * 3.6);
    } else {
      animState.boopImpulse = 0.0;
    }

    // Demo Speech Coarticulation Timer
    if (animState.autoSpeakTimer > 0) {
      animState.autoSpeakTimer = Math.max(0, animState.autoSpeakTimer - safeDt);
      animState.autoSpeakPhase += safeDt * 7.2;
      const idx = Math.floor(animState.autoSpeakPhase) % DEMO_PHONEME_CYCLE.length;
      const phonemeKey = DEMO_PHONEME_CYCLE[idx];
      const preset = VISEME_PRESETS[phonemeKey];

      animState.activePhoneme = preset.id;
      animState.activeVisemeLabel = `${preset.label} ${preset.ipa}`;
      animState.targetViseme.jawOpen = preset.jawOpen;
      animState.targetViseme.mouthWide = preset.mouthWide;
      animState.targetViseme.lipRound = preset.lipRound;
      animState.targetViseme.lipPress = preset.lipPress;
      animState.targetViseme.cheekPuff = preset.cheekPuff;
      animState.targetViseme.lipTuckFV = preset.lipTuckFV;
      animState.targetViseme.tongueUp = preset.tongueUp;
      animState.targetViseme.browLift = preset.browLift;

      animState.isTalking = animState.autoSpeakTimer > 0.05;
      animState.targetMouthOpen = preset.jawOpen;
      animState.targetSmile = preset.mouthWide;

      if (animState.autoSpeakTimer <= 0.05) {
        setSpeechState({ talking: false });
      }
    } else if (animState.phonemeHoldTimer > 0) {
      animState.phonemeHoldTimer = Math.max(0, animState.phonemeHoldTimer - safeDt);
      if (animState.phonemeHoldTimer <= 0 && !animState.isTalking) {
        setSpeechState({ talking: false });
      }
    }

    // Second-Order Spring-Damper Solver for all 8 Phoneme Morph Target Channels
    // Produces natural muscular coarticulation AND instantaneous velocity impulses for the GPGPU Fur Physics!
    const stiffness = 195.0; // Snappy consonant/vowel articulation
    const damping = 21.5;    // Critically damped to prevent robotic overshoot

    const keys = ['jawOpen', 'mouthWide', 'lipRound', 'lipPress', 'cheekPuff', 'lipTuckFV', 'tongueUp', 'browLift'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const target = animState.targetViseme[k];
      const current = animState.currentViseme[k];
      let vel = animState.visemeVel[k];

      const force = (target - current) * stiffness - vel * damping;
      vel += force * safeDt;
      const next = Math.max(0.0, Math.min(1.25, current + vel * safeDt));

      animState.currentViseme[k] = next;
      animState.visemeVel[k] = vel;
    }

    const cv = animState.currentViseme;
    const vv = animState.visemeVel;

    // Smoothly interpolate speaking mouth viseme & waving arm states
    const effectiveJawOpen = Math.max(0.0, cv.jawOpen * (1.0 - cv.lipPress * 0.92));
    animState.currentMouthOpen = effectiveJawOpen;
    animState.currentMouthWidth = 1.0 + cv.mouthWide * 0.38 - cv.lipRound * 0.35;
    animState.currentSmile = Math.max(cv.mouthWide, cv.cheekPuff * 0.7);

    // Pack 8-channel viseme weights for GPU shaders
    animState.visemeWeightsA.set(cv.jawOpen, cv.mouthWide, cv.lipRound, cv.lipPress);
    animState.visemeWeightsB.set(cv.cheekPuff, cv.lipTuckFV, cv.tongueUp, cv.browLift);

    // Compute instantaneous facial muscle velocities (scaled by furReactivity) for GPGPU Verlet physics
    const react = animState.furReactivity;
    const jawVelImpulse = (vv.jawOpen - vv.lipPress * 0.75) * 0.35 * react;
    const cheekVelImpulse = (vv.cheekPuff + vv.mouthWide * 0.65) * 0.35 * react;
    const puckerVelImpulse = (vv.lipRound - vv.lipTuckFV * 0.55) * 0.35 * react;
    const browVelImpulse = vv.browLift * 0.38 * react;

    animState.facialMorphVel.set(jawVelImpulse, cheekVelImpulse, puckerVelImpulse, browVelImpulse);
    animState.facialMorphState.set(effectiveJawOpen, cv.cheekPuff, cv.lipRound, cv.mouthWide);

    if (animState.waveTimer > 0) {
      animState.waveTimer = Math.max(0, animState.waveTimer - safeDt);
    }
    const targetWave = (animState.waveTimer > 0 || animState.isTalking) ? 1.0 : 0.0;
    animState.waveIntensity += (targetWave - animState.waveIntensity) * Math.min(1.0, safeDt * 9.0);
    animState.wavePhase += safeDt * (animState.isTalking ? 8.2 : 6.4);

    const targetEarBounce = (animState.isTalking || animState.phonemeHoldTimer > 0 || animState.waveIntensity > 0.2 || animState.boopImpulse > 0.1)
      ? Math.max(animState.currentMouthOpen * 0.85, Math.abs(jawVelImpulse) * 0.75, animState.waveIntensity * 0.55, animState.boopImpulse)
      : 0.08;
    animState.earBounce += (targetEarBounce - animState.earBounce) * Math.min(1.0, safeDt * 12.0);

    // Sync GPU vertex morphing uniforms on under-skin material & expose aliases for furSystem
    animState.talkMorph = animState.currentMouthOpen;
    animState.talkSmile = animState.currentSmile;
    animState.waveAmount = animState.waveIntensity;
    animState.earStyleCode = animState.earStyle;

    skinMorphUniforms.uTalkMorph.value = animState.currentMouthOpen;
    skinMorphUniforms.uTalkSmile.value = animState.currentSmile;
    skinMorphUniforms.uWaveAmount.value = animState.waveIntensity;
    skinMorphUniforms.uWavePhase.value = animState.wavePhase;
    skinMorphUniforms.uEarBounce.value = animState.earBounce;
    skinMorphUniforms.uEarStyle.value = animState.earStyle;
    skinMorphUniforms.uVisemeWeightsA.value.copy(animState.visemeWeightsA);
    skinMorphUniforms.uVisemeWeightsB.value.copy(animState.visemeWeightsB);
    skinMorphUniforms.uFacialMorphVel.value.copy(animState.facialMorphVel);

    // Match eyelid & brow color to current skin color
    eyelidMat.color.copy(skinMaterial.color);
    browMat.color.copy(skinMaterial.color).multiplyScalar(0.55);

    // Parabolic placement leap towards target anchor plane
    let hop = 0.0;
    if (isPlacing) {
      placeProgress += safeDt * 3.4;
      if (placeProgress >= 1.0) {
        placeProgress = 1.0;
        isPlacing = false;
        anchorPos.copy(targetAnchorPos);
        triggerBoop();
      } else {
        const p = placeProgress;
        anchorPos.lerpVectors(startAnchorPos, targetAnchorPos, p);
        hop = Math.sin(p * Math.PI) * placeHopHeight;
      }
    }

    // When placed in AR mode, keep Mr. M's front face oriented directly towards the viewer
    if ((isPlaced || isARMode) && cameraPos) {
      const dx = cameraPos.x - anchorPos.x;
      const dy = cameraPos.y - anchorPos.y;
      const dz = cameraPos.z - anchorPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
    } else if (!isPlaced) {
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }

    const yawDiff = Math.atan2(Math.sin(targetFacingYaw - facingYaw), Math.cos(targetFacingYaw - facingYaw));
    facingYaw += yawDiff * Math.min(1.0, safeDt * 12.0);
    facingPitch += (targetFacingPitch - facingPitch) * Math.min(1.0, safeDt * 12.0);

    const s = animState.baseScale;
    const talkCadence = animState.currentMouthOpen * 0.045;
    const breath = Math.sin(animState.time * 2.3) * 0.035 + talkCadence;
    const bodyLookScale = (isPlaced || isARMode) ? (faceViewerHoldTimer > 0 ? 0.0 : 0.06) : 1.0;
    const talkSway = Math.sin(animState.wavePhase * 0.65) * animState.waveIntensity * 0.045;
    const swayX = (Math.sin(animState.time * 1.35) * 0.06 + talkSway + animState.currentLook.x * 0.15 * bodyLookScale) * s;
    const jumpY =
      (Math.sin(animState.time * 2.3) * 0.045 +
        animState.currentMouthOpen * 0.038 +
        Math.abs(Math.sin(animState.boopPhase)) * animState.boopImpulse * 0.32) *
        s;

    const squash =
      1.0 +
      breath +
      Math.cos(animState.boopPhase * 2.0) * animState.boopImpulse * 0.14;

    const prevX = root.position.x;
    const prevY = root.position.y;
    const prevZ = root.position.z;
    const prevRotZ = root.rotation.z;
    const prevRotY = root.rotation.y;

    root.position.set(
      anchorPos.x + swayX,
      anchorPos.y + jumpY + hop,
      anchorPos.z
    );
    root.scale.set((1.0 / Math.sqrt(squash)) * s, squash * s, (1.0 / Math.sqrt(squash)) * s);
    root.rotation.y = facingYaw + animState.currentLook.x * 0.38 * bodyLookScale + Math.sin(animState.time * 0.9) * (isPlaced ? 0.03 : 0.08) + talkSway * 1.4;
    root.rotation.x = facingPitch - animState.currentLook.y * 0.22 * bodyLookScale + Math.cos(animState.time * 1.8) * (isPlaced ? 0.02 : 0.04) - animState.currentMouthOpen * 0.06;
    root.rotation.z = -(swayX / s) * 0.35 + Math.sin(animState.boopPhase) * animState.boopImpulse * 0.18 + Math.sin(animState.wavePhase * 0.65) * animState.waveIntensity * 0.065;

    // Compute instantaneous creature velocity & angular velocity for GPGPU fur inertia
    animState.velocity.set(
      (root.position.x - prevX) / (safeDt * s),
      (root.position.y - prevY) / (safeDt * s),
      (root.position.z - prevZ) / (safeDt * s)
    );
    animState.angularVelocity.set(
      0,
      (root.rotation.y - prevRotY) / safeDt,
      (root.rotation.z - prevRotZ) / safeDt
    );

    // =========================================================================
    // ANIMATE 3D VISEME MOUTH, TEETH, TONGUE, BROWS, CHEEK PUFF & NOSE TWITCH
    // =========================================================================
    const mOpen = animState.currentMouthOpen;
    const mWidth = animState.currentMouthWidth;
    const mSmile = animState.currentSmile;
    const lipPressAmt = cv.lipPress;
    const lipRoundAmt = cv.lipRound;
    const lipTuckAmt = cv.lipTuckFV;
    const mouthWideAmt = cv.mouthWide;
    const tongueUpAmt = cv.tongueUp;

    const cavityVisibleAmt = Math.max(mOpen, lipRoundAmt * 0.55, lipTuckAmt * 0.48) * (1.0 - lipPressAmt * 0.88);

    // W-mouth arcs lift and widen into an upper lip bow as mouth opens, or compress on /BMP/
    for (const arcObj of mouthArcs) {
      arcObj.mesh.position.x = arcObj.baseX * (1.0 + mouthWideAmt * 0.22 - lipRoundAmt * 0.24 + lipPressAmt * 0.12);
      arcObj.mesh.position.y = arcObj.baseY + cavityVisibleAmt * 0.032 + mouthWideAmt * 0.014 + lipPressAmt * 0.01;
      arcObj.mesh.position.z = arcObj.baseZ + lipRoundAmt * 0.036 + cavityVisibleAmt * 0.015;
      arcObj.mesh.scale.set(
        1.0 + mouthWideAmt * 0.26 + lipPressAmt * 0.18 - lipRoundAmt * 0.28,
        Math.max(0.22, 1.0 - cavityVisibleAmt * 0.55 - lipPressAmt * 0.48),
        1.0
      );
    }

    if (cavityVisibleAmt > 0.035) {
      openMouthPivot.visible = true;
      const sx = Math.max(0.16, (0.65 + mouthWideAmt * 0.52) * (1.0 - lipRoundAmt * 0.42));
      const sy = Math.max(0.12, (mOpen * 1.22 + lipRoundAmt * 0.42 + lipTuckAmt * 0.24) * (1.0 - lipPressAmt * 0.85));
      const forwardPucker = lipRoundAmt * 0.038 - lipTuckAmt * 0.015;
      openMouthPivot.scale.set(sx, sy, 0.85 + lipRoundAmt * 0.55);
      openMouthPivot.position.y = 0.012 - mOpen * 0.038;
      openMouthPivot.position.z = 1.032 + forwardPucker + mOpen * 0.014;

      // Upper incisors show prominently on /FV/ lip tuck, /EE/ wide smile, and /L_TH/
      upperTeethMesh.position.y = 0.056 - lipTuckAmt * 0.022;
      upperTeethMesh.position.z = 0.026 + lipTuckAmt * 0.016;

      // Cute tongue base & articulated tongue tip (rises to alveolar ridge on /L_TH/, /SH_CH/, /EE/)
      tongueMesh.position.y = -0.028 + tongueUpAmt * 0.020 + Math.sin(animState.time * 16.0) * 0.006 * mOpen;
      tongueTipMesh.position.y = -0.018 + tongueUpAmt * 0.058;
      tongueTipMesh.position.z = 0.032 + tongueUpAmt * 0.022;
      tongueTipMesh.rotation.x = -tongueUpAmt * 0.45;
    } else {
      openMouthPivot.visible = false;
      openMouthPivot.scale.set(0.001, 0.001, 0.001);
    }

    // Expressive Supraorbital Eyebrow Arcs (Lift & arch with browLift morph channel)
    const browLiftAmt = cv.browLift + (animState.happySquintTimer > 0 ? 0.22 : 0.0);
    for (const brow of brows) {
      brow.group.position.set(
        brow.baseX,
        brow.baseY + browLiftAmt * 0.048,
        brow.baseZ + browLiftAmt * 0.014
      );
      brow.group.rotation.z = brow.baseRotZ + brow.side * browLiftAmt * 0.15;
    }

    // Nose button twitch & cheek blush puff
    nose.position.y = 0.075 + mOpen * 0.012 + lipRoundAmt * 0.016 + Math.sin(animState.time * 12.0) * mOpen * 0.005;
    nose.position.z = 1.05 + lipRoundAmt * 0.028 + mOpen * 0.012;

    for (const b of blushMeshes) {
      const puffAmt = cv.cheekPuff * 0.055 + mouthWideAmt * 0.035 + mOpen * 0.025 + animState.waveIntensity * 0.02;
      b.mesh.position.x = b.basePos.x + b.side * puffAmt * 0.65;
      b.mesh.position.y = b.basePos.y + puffAmt * 0.55;
      b.mesh.position.z = b.basePos.z + puffAmt * 0.65;
      const bScale = 1.0 + cv.cheekPuff * 0.26 + mouthWideAmt * 0.16;
      b.mesh.scale.set(bScale, bScale, 1.0);
    }
    blushMat.opacity = 0.55 + Math.min(0.35, cv.cheekPuff * 0.3 + mSmile * 0.2 + animState.waveIntensity * 0.12);

    // =========================================================================
    // ANIMATE WAVING PAW PADS & CUSTOM ACCESSORIES
    // =========================================================================
    for (const paw of pawPads) {
      if (animState.waveIntensity > 0.001) {
        const phaseOffset = paw.side > 0 ? 0.0 : 2.4;
        const waveVal = Math.sin(animState.wavePhase * 1.35 + phaseOffset) * 0.65 + 0.45;
        const swayZ = (paw.side > 0 ? 1 : -1) * Math.cos(animState.wavePhase * 1.35 + phaseOffset) * 0.16;
        const amt = animState.waveIntensity * (paw.side > 0 ? 0.34 : 0.30);
        paw.group.position.x = paw.basePos.x + paw.side * 0.08 * animState.waveIntensity;
        paw.group.position.y = paw.basePos.y + waveVal * amt;
        paw.group.position.z = paw.basePos.z + (0.12 + swayZ) * animState.waveIntensity;
        paw.group.rotation.z = -paw.side * waveVal * 0.45 * animState.waveIntensity;
      } else {
        paw.group.position.copy(paw.basePos);
        paw.group.rotation.z = 0;
      }
    }

    if (antennaeGroup.visible) {
      for (const a of antennaStars) {
        const springSway = Math.sin(animState.time * 3.8 + a.side * 1.2) * 0.08 +
                           Math.sin(animState.wavePhase * 1.8) * animState.earBounce * 0.22;
        a.pivot.rotation.z = -a.side * springSway - root.rotation.z * 0.8;
        a.pivot.rotation.x = Math.cos(animState.time * 3.1 + a.side) * 0.06;
        a.starTip.rotation.z = animState.time * 1.2 * a.side;
        const pulse = 1.0 + mOpen * 0.25 + animState.waveIntensity * 0.15;
        a.starTip.scale.setScalar(pulse);
      }
    }

    if (cloudCrownGroup.visible) {
      cloudCrownGroup.rotation.y = animState.time * 0.55;
      cloudCrownGroup.position.y = 1.24 + Math.sin(animState.time * 2.8) * 0.035 + mOpen * 0.03;
    }

    if (bowtieGroup.visible) {
      bowCenterStar.rotation.z = Math.sin(animState.time * 2.5) * 0.18;
      bowtieGroup.scale.setScalar(1.0 + mOpen * 0.12);
    }

    // =========================================================================
    // EXPRESSIVE BLINKING, DOUBLE-BLINKS, WINKS & STAR CATCHLIGHTS
    // =========================================================================
    animState.blinkTimer += safeDt;
    if (animState.winkTimer > 0) {
      animState.winkTimer = Math.max(0, animState.winkTimer - safeDt);
    }
    if (animState.happySquintTimer > 0) {
      animState.happySquintTimer = Math.max(0, animState.happySquintTimer - safeDt);
    }

    let blinkClosure = 0.0; // 0 = open, 1 = closed
    const blinkDuration = animState.isDoubleBlink ? 0.34 : 0.17;
    if (animState.blinkTimer > animState.nextBlink) {
      const elapsedBlink = animState.blinkTimer - animState.nextBlink;
      if (elapsedBlink < blinkDuration) {
        if (animState.isDoubleBlink) {
          // Two crisp blinks in rapid succession
          blinkClosure = Math.pow(Math.sin((elapsedBlink / blinkDuration) * Math.PI * 2.0), 2.0);
        } else {
          blinkClosure = Math.sin((elapsedBlink / blinkDuration) * Math.PI);
        }
      } else {
        animState.blinkTimer = 0;
        // Blink slightly more often when actively talking/communicating, just like real expressive animation!
        animState.nextBlink = (animState.isTalking ? 1.5 : 2.2) + Math.random() * 2.2;
        animState.isDoubleBlink = Math.random() < 0.28;
      }
    }

    if (animState.boopImpulse > 0.25) {
      blinkClosure = Math.max(blinkClosure, 0.85);
    }

    const happySquint = Math.max(
      cv.cheekPuff * 0.42,
      mSmile * 0.35,
      animState.happySquintTimer > 0 ? 0.38 : 0.0,
      mOpen * 0.18
    );

    for (const eye of eyes) {
      let eyeClose = blinkClosure;
      if (animState.winkTimer > 0 && eye.side === animState.winkSide) {
        eyeClose = Math.max(eyeClose, Math.sin((animState.winkTimer / 0.38) * Math.PI));
      }

      const blinkScaleY = Math.max(0.08, 1.0 - eyeClose * 0.92 + cv.browLift * 0.08);
      eye.pivot.scale.y = blinkScaleY;

      // Upper and lower plush eyelids close over the cornea
      eye.upperLid.rotation.x = -1.45 + eyeClose * 1.42 + happySquint * 0.25;
      eye.lowerLid.rotation.x = 1.45 - eyeClose * 1.15 - happySquint * 0.55;

      eye.catchlightMain.position.x = -eye.side * 0.042 + animState.currentLook.x * 0.028;
      eye.catchlightMain.position.y = 0.052 + animState.currentLook.y * 0.025;

      if (eye.starCatchlight.visible) {
        eye.starCatchlight.rotation.z = animState.time * 1.8 * eye.side;
        const starScale = 0.85 + 0.35 * Math.sin(animState.time * 5.0 + eye.side) + mOpen * 0.35;
        eye.starCatchlight.scale.setScalar(starScale);
      }
    }
  }

  return {
    root,
    bodyMesh,
    bodyGeometry,
    skinMaterial,
    skinMorphUniforms,
    animState,
    setEnvironmentScale,
    triggerBoop,
    triggerWave,
    triggerBlink,
    triggerVisemePose,
    triggerHappyTalkDemo,
    setFurReactivity,
    getPhonemeTelemetry,
    setSpeechState,
    setMascotStyle,
    setMascotCustomization,
    placeAt,
    resetPlacement,
    isPlaced: () => isPlaced,
    getAnchorPosition: () => anchorPos,
    update
  };
}


