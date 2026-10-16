// Physical Hair BSDF (Marschner / Kajiya-Kay Dual-Specular + TT Scatter + Volumetric Self-Shadowing)
// and Hybrid GPU Fur Shaders (64-Layer Volumetric Shells + 60,000 3D Tapered Instanced Strands)

const COMMON_HAIR_BSDF_GLSL = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uRoughness;
  uniform float uSpecular;
  uniform float uFurDensity;
  uniform vec3 uKeyLightDir;
  uniform vec3 uKeyLightColor;
  uniform float uKeyLightIntensity;
  uniform vec3 uRimLightDir;
  uniform vec3 uRimLightColor;
  uniform float uRimIntensity;
  uniform float uAmbientIntensity;
  uniform vec3 uEnvSkyColor;
  uniform vec3 uEnvGroundColor;
  uniform float uEnvTintStrength;

  // Shift hair tangent along surface normal to model tilted cuticle scales (Marschner 2003)
  vec3 shiftTangent(vec3 T, vec3 N, float shift) {
    return normalize(T + N * shift);
  }

  // Anisotropic Kajiya-Kay / Marschner longitudinal specular lobe
  float hairSpecularLobe(vec3 T, vec3 N, vec3 V, vec3 L, float roughness) {
    vec3 H = normalize(L + V + vec3(1e-6, 1e-6, 1e-6));
    float dotTH = clamp(dot(T, H), -1.0, 1.0);
    float sinTH = sqrt(max(1e-5, 1.0 - dotTH * dotTH));
    float hemiVis = smoothstep(-0.25, 0.15, dot(N, L));
    // Map physical roughness [0.05..0.95] to longitudinal exponent [220..10]
    float exponent = mix(220.0, 10.0, clamp(roughness * roughness, 0.0, 1.0));
    // Energy-conserving normalization factor
    float normFactor = (exponent + 2.0) / 8.0;
    return hemiVis * pow(sinTH, exponent) * normFactor * 0.095;
  }

  // Evaluate complete Physical Hair Shading (R + TRT + TT + Beer-Lambert Deep Shadow + Follicle AO)
  vec3 evaluatePhysicalHairShading(
    vec3 worldPos,
    vec3 surfNormal,
    vec3 hairTangent,
    float h,
    float strandSeed,
    float combMemory
  ) {
    vec3 N = normalize(surfNormal);
    vec3 T = normalize(hairTangent);
    vec3 V = normalize(cameraPosition - worldPos);
    vec3 L = normalize(uKeyLightDir);
    vec3 Lrim = normalize(uRimLightDir);

    // 1. Root-to-Tip Melanin / Pigment Gradient with per-strand micro-variation
    float rootTipMix = smoothstep(0.05, 0.92, pow(h, 0.82));
    vec3 strandTint = mix(vec3(0.92), vec3(1.08), fract(strandSeed * 13.37));
    vec3 albedo = mix(uBaseColor, uTipColor, rootTipMix) * strandTint;

    // 2. Follicle Ambient Occlusion (deep warm occlusion near skin roots)
    float follicleAO = mix(0.22, 1.0, pow(clamp(h, 0.0, 1.0), 0.72));

    // 3. Beer-Lambert Volumetric Hair Self-Shadowing (optical depth through coat)
    float NdotL = dot(N, L);
    float opticalDepth = (1.0 - h) * (0.45 + 0.55 * uFurDensity) / max(0.22, NdotL * 0.5 + 0.55);
    float deepShadow = exp(-opticalDepth * 1.45);
    float wrapDiffuse = clamp((NdotL + 0.45) / 1.45, 0.0, 1.0);

    // 4. Primary Specular Lobe (R): Cuticle surface reflection shifted toward root (-0.16 rad)
    float sheenBoost = 1.0 + combMemory * 0.35;
    vec3 tPrimary = shiftTangent(T, N, -0.16 + (strandSeed - 0.5) * 0.05);
    float specR = hairSpecularLobe(tPrimary, N, V, L, uRoughness) * uSpecular * sheenBoost;
    vec3 colorR = specR * uKeyLightColor * mix(vec3(1.0), albedo, 0.15);

    // 5. Secondary Specular Lobe (TRT): Internal reflection shifted toward tip (+0.24 rad), tinted by pigment
    vec3 tSecondary = shiftTangent(T, N, 0.24 + (strandSeed - 0.5) * 0.08);
    float glint = 0.75 + 0.5 * sin(strandSeed * 62.83);
    float specTRT = hairSpecularLobe(tSecondary, N, V, L, min(1.0, uRoughness * 1.35)) * uSpecular * 0.85 * glint;
    vec3 colorTRT = specTRT * mix(albedo, uTipColor, 0.65) * uKeyLightColor * 1.65;

    // 6. Forward Subsurface Scattering / Transmission Lobe (TT) from Key + Rim Backlights
    float forwardKey = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 3.2);
    float forwardRim = pow(clamp(dot(V, -Lrim + N * 0.4), 0.0, 1.0), 2.4);
    float fresnelRim = pow(1.0 - max(0.0, dot(N, V)), 2.6);
    vec3 scatterTT = (
      forwardKey * uKeyLightColor * 0.38 +
      (forwardRim * 0.75 + fresnelRim * 0.65) * uRimLightColor * uRimIntensity
    ) * mix(uBaseColor, uTipColor, 0.75) * (0.35 + 0.65 * h);

    // 7. Soft Hemisphere Studio & 3D Environment Fill Lighting
    vec3 baseSkyColor = mix(uTipColor, vec3(0.88, 0.92, 1.0), 0.65);
    vec3 baseGroundColor = uBaseColor * 0.38;
    vec3 skyColor = mix(baseSkyColor, uEnvSkyColor, uEnvTintStrength);
    vec3 groundColor = mix(baseGroundColor, uEnvGroundColor, uEnvTintStrength);
    vec3 hemiFill = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * uAmbientIntensity;

    // Combine all physical lobes while preserving intrinsic fur pigment hue in linear space
    vec3 balancedKeyTint = mix(vec3(1.0), uKeyLightColor, 0.58);
    vec3 directDiffuse = albedo * balancedKeyTint * uKeyLightIntensity * wrapDiffuse * deepShadow;
    vec3 directSpec = (colorR + colorTRT) * uKeyLightIntensity * deepShadow * (0.25 + 0.75 * h);
    vec3 ambientTerm = albedo * hemiFill * follicleAO;

    return directDiffuse + directSpec + scatterTT + ambientTerm;
  }
`;

export const MASCOT_VERTEX_MORPH_GLSL = /* glsl */ `
  uniform float uTalkMorph;
  uniform float uTalkSmile;
  uniform float uWaveAmount;
  uniform float uWavePhase;
  uniform float uEarBounce;
  uniform float uEarStyle;
  // 8-Channel Phoneme-to-Viseme Facial Morph Target Basis
  // uVisemeWeightsA: x = jawOpen (AA/OH), y = mouthWide (EE/IH/SZ), z = lipRound (OO/W/Q), w = lipPress (BMP/FV)
  // uVisemeWeightsB: x = cheekPuff,       y = browLift,             z = tongueUp (LNT),   w = noseSneer
  uniform vec4 uVisemeWeightsA;
  uniform vec4 uVisemeWeightsB;
  // Rate-of-change velocity of facial morph targets for high-frequency hair whip & follow-through
  uniform vec4 uFacialMorphVel;

  void applyMascotMorph(inout vec3 pos, inout vec3 norm) {
    // 1. Custom Ear Silhouette Morph (0 = Classic Perky, 1 = Cozy Floppy Bear/Puppy, 2 = Starlight Tall, 3 = Round Cloud Puff)
    if (pos.y > 0.35 && abs(pos.x) > 0.16) {
      float earZone = smoothstep(0.35, 0.72, pos.y) * smoothstep(0.16, 0.42, abs(pos.x));
      if (uEarStyle > 0.5 && uEarStyle < 1.5) {
        pos.x += sign(pos.x) * earZone * 0.16;
        pos.y -= earZone * 0.18;
        pos.z += earZone * 0.06;
      } else if (uEarStyle >= 1.5 && uEarStyle < 2.5) {
        pos.y += earZone * 0.14;
        pos.x += sign(pos.x) * earZone * 0.08;
      } else if (uEarStyle >= 2.5) {
        pos.y -= earZone * 0.12;
        pos.x += sign(pos.x) * earZone * 0.05;
      }
      // Ear bounce / wiggle coupled to phoneme rhythm & waving
      float earWiggle = sin(uWavePhase * 2.0 + sign(pos.x) * 0.8) * uEarBounce;
      pos.y += earZone * abs(earWiggle) * 0.095;
      pos.x += sign(pos.x) * earZone * earWiggle * 0.075;
    }

    // 2. Waving Arms when Talking / Greeting (moves both stubby arms and all attached fur!)
    if (uWaveAmount > 0.001) {
      float rightArmMask = smoothstep(0.48, 0.86, pos.x) * (1.0 - smoothstep(0.0, 0.52, abs(pos.y + 0.06))) * smoothstep(-0.25, 0.25, pos.z);
      float leftArmMask  = smoothstep(0.48, 0.86, -pos.x) * (1.0 - smoothstep(0.0, 0.52, abs(pos.y + 0.06))) * smoothstep(-0.25, 0.25, pos.z);

      if (rightArmMask > 0.001) {
        float waveR = sin(uWavePhase * 1.35) * 0.65 + 0.45;
        float swayZ = cos(uWavePhase * 1.35) * 0.18;
        pos.y += rightArmMask * waveR * uWaveAmount * 0.34;
        pos.x += rightArmMask * (0.08 + 0.06 * sin(uWavePhase * 2.7)) * uWaveAmount;
        pos.z += rightArmMask * (0.14 + swayZ) * uWaveAmount;
        norm = normalize(norm + vec3(0.0, rightArmMask * waveR * 0.35 * uWaveAmount, rightArmMask * 0.15 * uWaveAmount));
      }
      if (leftArmMask > 0.001) {
        float waveL = sin(uWavePhase * 1.35 + 2.4) * 0.55 + 0.35;
        float swayZ = -cos(uWavePhase * 1.35 + 2.4) * 0.16;
        pos.y += leftArmMask * waveL * uWaveAmount * 0.30;
        pos.x -= leftArmMask * (0.07 + 0.05 * cos(uWavePhase * 2.7)) * uWaveAmount;
        pos.z += leftArmMask * (0.12 + swayZ) * uWaveAmount;
        norm = normalize(norm + vec3(0.0, leftArmMask * waveL * 0.30 * uWaveAmount, leftArmMask * 0.15 * uWaveAmount));
      }
    }

    // 3. Multi-Target Phoneme Facial Morphing (Anatomical Muscle Zones)
    float jawOpen   = max(uTalkMorph, uVisemeWeightsA.x);
    float mouthWide = max(uTalkSmile * 0.6, uVisemeWeightsA.y);
    float lipRound  = uVisemeWeightsA.z;
    float lipPress  = uVisemeWeightsA.w;
    float cheekPuff = max(uTalkMorph * 0.45 + uTalkSmile * 0.45, uVisemeWeightsB.x);
    float browLift  = uVisemeWeightsB.y;
    float noseSneer = uVisemeWeightsB.w;

    if (pos.z > 0.25) {
      // 3a. Mandible / Lower Jaw Hinge Morph Target (AA, OH, LNT, AE)
      // Rotates and drops the chin and lower muzzle below the mouth line (y < 0.02)
      float jawMask = smoothstep(0.40, 0.88, pos.z) *
                      (1.0 - smoothstep(0.0, 0.46, abs(pos.x))) *
                      smoothstep(-0.62, -0.10, pos.y) *
                      (1.0 - smoothstep(-0.04, 0.06, pos.y));
      float netJawDrop = max(0.0, jawOpen - lipPress * 0.65);
      pos.y -= jawMask * netJawDrop * 0.165;
      pos.z += jawMask * (netJawDrop * 0.055 - lipPress * 0.03);
      norm = normalize(norm + vec3(0.0, -jawMask * netJawDrop * 0.32, jawMask * netJawDrop * 0.18));

      // 3b. Orbicularis Oris / Lip Pucker & Trumpet Protrusion Morph Target (OO, W, Q, SH, CH)
      // Draws the perioral muzzle inward horizontally while protruding forward in +Z
      float muzzleDist = length(vec2(pos.x * 1.15, (pos.y - 0.015) * 1.45));
      float muzzleMask = smoothstep(0.55, 0.92, pos.z) * (1.0 - smoothstep(0.04, 0.36, muzzleDist));
      if (lipRound > 0.001) {
        pos.x *= (1.0 - muzzleMask * lipRound * 0.28);
        pos.z += muzzleMask * lipRound * 0.095;
        pos.y += muzzleMask * lipRound * 0.015;
        norm = normalize(norm + vec3(-pos.x * muzzleMask * lipRound * 0.4, 0.0, muzzleMask * lipRound * 0.35));
      }

      // 3c. Bilabial / Labiodental Lip Press & Compression Target (B, M, P, F, V)
      if (lipPress > 0.001) {
        float lipBand = smoothstep(0.68, 0.96, pos.z) *
                        (1.0 - smoothstep(0.0, 0.28, abs(pos.x))) *
                        (1.0 - smoothstep(0.0, 0.14, abs(pos.y - 0.01)));
        // Compress vertical distance toward mouth seam y = 0.02 and tuck slightly
        pos.y = mix(pos.y, 0.02, lipBand * lipPress * 0.45);
        pos.z -= lipBand * lipPress * 0.028;
      }

      // 3d. Zygomatic Major / Wide Grin & Commissure Stretch Target (EE, IH, S, Z)
      float cornerDistL = length(pos - vec3(-0.26, 0.01, 0.88));
      float cornerDistR = length(pos - vec3( 0.26, 0.01, 0.88));
      float cornerMask = max(1.0 - smoothstep(0.0, 0.28, cornerDistL), 1.0 - smoothstep(0.0, 0.28, cornerDistR));
      if (mouthWide > 0.001) {
        pos.x += sign(pos.x) * cornerMask * mouthWide * 0.085;
        pos.y += cornerMask * mouthWide * 0.055;
        pos.z -= cornerMask * mouthWide * 0.018;
      }

      // 3e. Buccinator / Apple Cheek Puff & Zygomatic Fur Lift Target
      float cheekDistL = length(pos - vec3(-0.48, -0.02, 0.78));
      float cheekDistR = length(pos - vec3( 0.48, -0.02, 0.78));
      float cheekMask = max(1.0 - smoothstep(0.0, 0.40, cheekDistL), 1.0 - smoothstep(0.0, 0.40, cheekDistR));
      float totalCheek = cheekPuff * 0.095 + mouthWide * 0.045 + lipPress * 0.035;
      pos.x += sign(pos.x) * cheekMask * totalCheek;
      pos.y += cheekMask * totalCheek * 0.62;
      pos.z += cheekMask * totalCheek * 0.70;
      norm = normalize(norm + vec3(sign(pos.x) * cheekMask * totalCheek * 0.45, cheekMask * totalCheek * 0.35, 0.0));

      // 3f. Frontalis / Supraorbital Brow Arch & Fur Ridge Morph Target
      float browDistL = length(vec2((pos.x + 0.31) * 1.1, (pos.y - 0.33) * 2.1));
      float browDistR = length(vec2((pos.x - 0.31) * 1.1, (pos.y - 0.33) * 2.1));
      float browMask = smoothstep(0.55, 0.88, pos.z) *
                       max(1.0 - smoothstep(0.0, 0.26, browDistL), 1.0 - smoothstep(0.0, 0.26, browDistR));
      if (abs(browLift) > 0.001) {
        // Inner/center brow lifts highest on vowel emphasis
        float innerArch = 1.0 - smoothstep(0.15, 0.42, abs(pos.x));
        pos.y += browMask * browLift * (0.065 + 0.035 * innerArch);
        pos.z += browMask * browLift * 0.028;
        norm = normalize(norm + vec3(0.0, browMask * browLift * 0.38, browMask * browLift * 0.15));
      }

      // 3g. Levator Labii / Upper Muzzle & Nose Bridge Crinkle Target (F/V, S/Z, Consonant Emphasis)
      if (noseSneer > 0.001) {
        float noseZone = smoothstep(0.75, 0.98, pos.z) *
                         (1.0 - smoothstep(0.0, 0.22, abs(pos.x))) *
                         smoothstep(0.02, 0.18, pos.y) *
                         (1.0 - smoothstep(0.18, 0.32, pos.y));
        pos.y += noseZone * noseSneer * 0.042;
        pos.z += noseZone * noseSneer * 0.025;
      }
    }
  }

  // Computes dynamic facial fur groom flow modulation & high-frequency syllable velocity whip
  vec3 applyFacialFurDynamics(vec3 morphedPos, vec3 localNormal, inout vec3 groomDir) {
    if (morphedPos.z <= 0.25) {
      return vec3(0.0);
    }
    float jawOpen   = max(uTalkMorph, uVisemeWeightsA.x);
    float mouthWide = max(uTalkSmile * 0.6, uVisemeWeightsA.y);
    float lipRound  = uVisemeWeightsA.z;
    float cheekPuff = max(uTalkMorph * 0.45 + uTalkSmile * 0.45, uVisemeWeightsB.x);
    float browLift  = uVisemeWeightsB.y;

    // 1. Dynamic Groom Tangent Splay on Cheeks, Muzzle & Brow
    float cheekDist = min(
      length(morphedPos - vec3(-0.48, -0.02, 0.78)),
      length(morphedPos - vec3( 0.48, -0.02, 0.78))
    );
    float cheekZone = 1.0 - smoothstep(0.0, 0.42, cheekDist);
    // Flare cheek tuft hair tangents outward & upward when smiling or puffing cheeks
    vec3 cheekFlare = vec3(sign(morphedPos.x) * 0.65, 0.45, 0.25) * (cheekPuff + mouthWide * 0.6) * cheekZone;

    // Fan perioral whisker/muzzle hair tangents radially when rounding lips (OO / W)
    float muzzleDist = length(vec2(morphedPos.x, morphedPos.y - 0.02));
    float muzzleZone = smoothstep(0.60, 0.95, morphedPos.z) * (1.0 - smoothstep(0.06, 0.36, muzzleDist));
    vec3 radialMuzzle = normalize(vec3(morphedPos.x, morphedPos.y - 0.02, 0.25) + vec3(0.0, 1e-4, 0.0));
    vec3 puckerSplay = radialMuzzle * lipRound * 0.75 * muzzleZone;

    // Lift brow hair tangents when eyebrows arch
    float browZone = smoothstep(0.55, 0.90, morphedPos.z) *
                     smoothstep(0.18, 0.44, morphedPos.y) *
                     (1.0 - smoothstep(0.44, 0.65, morphedPos.y));
    vec3 browSplay = vec3(sign(morphedPos.x) * 0.25, 0.85, 0.2) * browLift * browZone;

    groomDir = normalize(groomDir + cheekFlare + puckerSplay + browSplay);

    // 2. Instantaneous Syllable Velocity Whip (secondary hair follow-through on jaw/cheek/lip/brow motion)
    float jawZone = smoothstep(0.38, 0.90, morphedPos.z) *
                    smoothstep(-0.65, -0.04, morphedPos.y) *
                    (1.0 - smoothstep(-0.04, 0.12, morphedPos.y));
    vec3 jawWhip = vec3(0.0, -uFacialMorphVel.x * 0.18, uFacialMorphVel.x * 0.09) * jawZone;
    vec3 cheekWhip = vec3(sign(morphedPos.x) * uFacialMorphVel.y * 0.14, uFacialMorphVel.y * 0.12, uFacialMorphVel.y * 0.10) * cheekZone;
    vec3 puckerWhip = radialMuzzle * (uFacialMorphVel.z * 0.15) * muzzleZone;
    vec3 browWhip = vec3(0.0, uFacialMorphVel.w * 0.14, 0.0) * browZone;

    // Subtle high-frequency vocal resonance shimmer on chin/muzzle fur when speaking open vowels
    float vocalVibration = sin(uWavePhase * 9.5 + morphedPos.x * 12.0) * jawOpen * 0.022 * (jawZone + muzzleZone * 0.5);

    return jawWhip + cheekWhip + puckerWhip + browWhip + vec3(0.0, vocalVibration, 0.0);
  }
`;

export const SHELL_VERTEX_SHADER = /* glsl */ `
  attribute float aFollicleMask;
  attribute vec3 aGroomTangent;
  attribute float aShellIndex;

  uniform sampler2D uPhysicsTex;
  uniform float uFurLength;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform float uGpuFurMode;
  uniform float uShellCountScale;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  ${MASCOT_VERTEX_MORPH_GLSL}

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  vec2 normalToSphericalUV(vec3 n) {
    vec3 d = normalize(n);
    float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
    float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
    return vec2(u, v);
  }

  void main() {
    float h = clamp(aShellIndex * uShellCountScale, 0.0, 1.0);
    vLayerHeight = h;
    vFollicleMask = aFollicleMask;

    vec3 morphedPos = position;
    vec3 localNormal = normalize(normal);
    applyMascotMorph(morphedPos, localNormal);
    vLocalPos = morphedPos;

    vec3 groomDir = normalize(aGroomTangent);
    vec3 facialFurWhip = applyFacialFurDynamics(morphedPos, localNormal, groomDir);
    vec3 sideDir = normalize(cross(localNormal, groomDir) + vec3(1e-4, 0.0, 0.0));

    // Sample GPGPU ping-pong Verlet displacement texture (or analytical WebGL spring inertia when GPU Fur is off)
    vec3 gpuDisp = vec3(0.0);
    vCombMemory = 0.0;
    if (uGpuFurMode > 0.5) {
      vec2 simUV = normalToSphericalUV(localNormal);
      vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
      gpuDisp = gpgpuData.xyz;
      vCombMemory = gpgpuData.w;
    } else {
      vec3 tangInertia = uWebGLInertia - localNormal * min(0.0, dot(uWebGLInertia, localNormal));
      gpuDisp = tangInertia;
      if (uBoopShockwave > 0.01) {
        float waveFront = (1.0 - uBoopShockwave) * 2.2;
        float dFront = abs(distance(localNormal, vec3(0.0, 0.1, 0.98)) - waveFront);
        if (dFront < 0.38) {
          float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
          vec3 radial = normalize(localNormal - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
          gpuDisp += radial * ripple * 0.65;
        }
      }
      if (uPointerActive > 0.5) {
        float pDist = distance(morphedPos, uPointerLocalPos);
        if (pDist < 0.45) {
          vCombMemory = (1.0 - pDist / 0.45) * 0.65;
        }
      }
    }

    // Analytical high-frequency wind & pointer fallback blend
    float bendFactor = pow(h, 1.55);
    vec3 windWave = vec3(
      sin(morphedPos.y * 4.2 + uTime * 2.6) * 0.08,
      cos(morphedPos.x * 3.8 + uTime * 2.1) * 0.04,
      cos(morphedPos.z * 4.0 - uTime * 2.4) * 0.08
    ) * uWindStrength;

    // Interactive pointer parting in vertex space for crisp local response
    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(morphedPos, uPointerLocalPos);
      if (pDist < 0.55) {
        vec3 away = normalize(morphedPos - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= localNormal * dot(away, localNormal);
        pointerPush = away * pow(1.0 - pDist / 0.55, 1.8) * 0.35;
      }
    }

    float effectiveLen = uFurLength * aFollicleMask;

    // Spatially coherent smooth wave/curl field shared across adjacent locks
    float lockPhase = dot(position, vec3(5.4, 6.2, 5.0));
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float wavePhase = h * curlFreq + lockPhase;
    float smoothEnv = h * h * (3.0 - 2.0 * h);
    float waveAmp = uCurliness * effectiveLen * 0.28 * smoothEnv;
    vec3 waveOffset = (sideDir * sin(wavePhase) + groomDir * (cos(wavePhase) - 1.0) * 0.55) * waveAmp;
    vec3 waveTangent = (sideDir * cos(wavePhase) - groomDir * sin(wavePhase) * 0.55) * (waveAmp * curlFreq);

    vec3 totalOffset =
      localNormal * (h * effectiveLen) +
      groomDir * (bendFactor * effectiveLen * (0.28 + 0.18 * uClumping)) +
      waveOffset +
      (gpuDisp * 0.42 + facialFurWhip + windWave + pointerPush) * bendFactor * effectiveLen;

    vec3 displacedLocal = morphedPos + totalOffset;
    vec4 worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
    vWorldPos = worldPosition.xyz;

    vSurfNormal = normalize(mat3(modelMatrix) * localNormal);
    // Instantaneous tangent along the curved & wavy hair trajectory (dPos/dh)
    vec3 localHairDir = normalize(
      localNormal * effectiveLen +
      groomDir * (1.55 * pow(max(0.05, h), 0.55) * effectiveLen * 0.35) +
      waveTangent +
      (gpuDisp * 0.42 + facialFurWhip + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
    );
    vHairTangent = normalize(mat3(modelMatrix) * localHairDir);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const SHELL_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  uniform float uClumping;
  uniform float uCurliness;
  uniform float uGpuFurMode;

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  // Continuous 2D Octahedral Surface UV (eliminates 3D Z-plane contour rings and voxel slicing)
  vec2 octahedralUV(vec3 n) {
    vec3 d = n / (abs(n.x) + abs(n.y) + abs(n.z) + 1e-6);
    vec2 oct = d.y >= 0.0
      ? d.xz
      : (1.0 - abs(d.zx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.z >= 0.0 ? 1.0 : -1.0);
    return oct * 0.5 + 0.5;
  }

  vec3 hash23(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xxz + p3.yxx) * p3.zyx);
  }

  void main() {
    if (vFollicleMask < 0.04) {
      discard;
    }

    // 2D surface-locked follicle coordinates (no 3D Cartesian Z-slicing or contour bands)
    float gridScale = mix(52.0, 96.0, clamp(uFurDensity, 0.0, 1.0));
    vec2 baseUV = octahedralUV(normalize(vLocalPos));
    vec2 warpedUV = baseUV + 0.008 * sin(baseUV.yx * 28.0);
    vec2 sampleUV = warpedUV * gridScale;

    // Clumping: pull 2D surface coordinates toward macro-tuft centers as h -> 1
    vec2 clumpGrid = warpedUV * (gridScale * 0.24);
    vec2 clumpFract = fract(clumpGrid) - 0.5;
    sampleUV -= clumpFract * (vLayerHeight * uClumping * 1.65);

    vec2 cellId = floor(sampleUV);
    vec2 cellLocal = fract(sampleUV) - 0.5;
    vec3 rand = hash23(cellId);

    // Smooth per-fiber height taper instead of binary salt-and-pepper cell holes
    float densityFactor = clamp(uFurDensity * 1.08, 0.22, 1.0) * clamp(vFollicleMask * 1.15, 0.0, 1.0);
    float fiberMaxH = mix(0.32, 1.0, rand.z) * densityFactor;
    if (vLayerHeight > fiberMaxH) {
      discard;
    }

    // Gentle helical offset inside each 2D surface cell
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float curlAngle = vLayerHeight * curlFreq + rand.x * 6.28318;
    float smoothEnv = vLayerHeight * vLayerHeight * (3.0 - 2.0 * vLayerHeight);
    float curlRadius = (0.03 * uClumping + 0.12 * uCurliness) * smoothEnv;
    vec2 strandCenter = (rand.xy - 0.5) * 0.22 + vec2(cos(curlAngle), sin(curlAngle)) * curlRadius;
    float distToAxis = length(cellLocal - strandCenter);

    // Conical hair profile tapering smoothly from plush solid undercoat to fine tip
    float normH = clamp(vLayerHeight / max(0.15, fiberMaxH), 0.0, 1.0);
    float maxRadius = 0.62 * (1.0 - pow(normH, 1.25));
    if (distToAxis > maxRadius) {
      discard;
    }

    vec3 color = evaluatePhysicalHairShading(
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vLayerHeight,
      rand.x,
      vCombMemory
    );

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const STRAND_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aRootPos;
  attribute vec3 aRootNormal;
  attribute vec3 aGroomDir;
  attribute vec3 aClumpOffset;
  attribute float aStrandSeed;
  attribute float aMaskValue;

  uniform sampler2D uPhysicsTex;
  uniform float uFurLength;
  uniform float uFurDensity;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform float uGpuFurMode;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  ${MASCOT_VERTEX_MORPH_GLSL}

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  vec2 normalToSphericalUV(vec3 n) {
    vec3 d = normalize(n);
    float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
    float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
    return vec2(u, v);
  }

  void main() {
    float h = position.y; // [0..1] along the 20-segment smooth curve
    vHeight = h;
    vRibbonU = position.x; // [-1..1] across ribbon width
    vStrandSeed = aStrandSeed;

    // Density culling in vertex shader (collapse inactive strands to zero area)
    if (aStrandSeed > uFurDensity || aMaskValue < 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      return;
    }

    vec3 morphedRootPos = aRootPos;
    vec3 N = normalize(aRootNormal);
    applyMascotMorph(morphedRootPos, N);

    vec3 G = normalize(aGroomDir);
    vec3 facialFurWhip = applyFacialFurDynamics(morphedRootPos, N, G);
    vec3 sideVec = normalize(cross(N, G) + vec3(1e-4, 0.0, 0.0));

    // Sample GPGPU Verlet texture in GPU Fur mode, or analytical WebGL spring inertia in default WebGL mode
    vec3 gpuDisp = vec3(0.0);
    vCombMemory = 0.0;
    if (uGpuFurMode > 0.5) {
      vec2 simUV = normalToSphericalUV(N);
      vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
      gpuDisp = gpgpuData.xyz;
      vCombMemory = gpgpuData.w;
    } else {
      gpuDisp = uWebGLInertia - N * min(0.0, dot(uWebGLInertia, N));
      if (uBoopShockwave > 0.01) {
        float waveFront = (1.0 - uBoopShockwave) * 2.2;
        float dFront = abs(distance(N, vec3(0.0, 0.1, 0.98)) - waveFront);
        if (dFront < 0.38) {
          float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
          vec3 radial = normalize(N - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
          gpuDisp += radial * ripple * 0.65;
        }
      }
      if (uPointerActive > 0.5) {
        float pDist = distance(morphedRootPos, uPointerLocalPos);
        if (pDist < 0.45) {
          vCombMemory = (1.0 - pDist / 0.45) * 0.65;
        }
      }
    }

    float lenVariation = 0.82 + 0.36 * fract(aStrandSeed * 17.31);
    float totalLen = uFurLength * aMaskValue * lenVariation * 1.15;

    // Smooth cantilever bend along the hair shaft
    float bend = pow(h, 1.55);
    float smoothEnv = h * h * (3.0 - 2.0 * h);

    vec3 windWave = vec3(
      sin(morphedRootPos.y * 4.4 + uTime * 2.7 + aStrandSeed * 3.14) * 0.08,
      cos(morphedRootPos.x * 3.9 + uTime * 2.2) * 0.04,
      cos(morphedRootPos.z * 4.1 - uTime * 2.5 + aStrandSeed * 3.14) * 0.08
    ) * uWindStrength;

    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(morphedRootPos, uPointerLocalPos);
      if (pDist < 0.58) {
        vec3 away = normalize(morphedRootPos - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= N * dot(away, N);
        pointerPush = away * pow(1.0 - pDist / 0.58, 1.8) * 0.42;
      }
    }

    // Spatially coherent lock phase so neighboring strands wave & curl together smoothly
    vec3 tuftAnchor = aRootPos + aClumpOffset;
    float coherentPhase = dot(tuftAnchor, vec3(5.4, 6.2, 5.0)) + (fract(aStrandSeed * 43.17) - 0.5) * 0.65;
    float curlFreq = mix(3.2, 8.2, uCurliness);
    float spiralAngle = h * curlFreq + coherentPhase;

    // Zero offset at root (h=0) via smoothEnv, building into soft S-waves & ringlets
    float curlAmp = uCurliness * totalLen * 0.34 * smoothEnv;
    vec3 curlOffset =
      sideVec * (sin(spiralAngle) - sin(coherentPhase)) * curlAmp +
      G * (cos(spiralAngle) - cos(coherentPhase)) * (curlAmp * 0.65);

    // Exact analytical derivative d(curlOffset)/dh for smooth tangent & specular continuity
    vec3 curlTangent =
      (sideVec * cos(spiralAngle) - G * sin(spiralAngle) * 0.65) * (curlAmp * curlFreq);

    vec3 clumpPull = aClumpOffset * (smoothEnv * uClumping * totalLen * 0.68);

    vec3 spineLocal =
      morphedRootPos +
      N * (h * totalLen) +
      G * (bend * totalLen * 0.34) +
      clumpPull +
      curlOffset +
      (gpuDisp * 0.48 + facialFurWhip + windWave + pointerPush) * bend * totalLen;

    vec3 localTangent = normalize(
      N * totalLen +
      G * (1.55 * pow(max(0.05, h), 0.55) * totalLen * 0.34) +
      clumpPull * 1.15 +
      curlTangent +
      (gpuDisp * 0.48 + facialFurWhip + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
    );

    vec3 worldSpine = (modelMatrix * vec4(spineLocal, 1.0)).xyz;
    vec3 worldTangent = normalize(mat3(modelMatrix) * localTangent);
    vSurfNormal = normalize(mat3(modelMatrix) * N);
    vHairTangent = worldTangent;

    // Camera-facing cylindrical ribbon billboarding (eliminates twisted/flat polygon kinks!)
    vec3 viewDir = normalize(cameraPosition - worldSpine);
    vec3 billboardRight = normalize(cross(worldTangent, viewDir) + vec3(1e-5, 0.0, 0.0));

    float modelScale = length(modelMatrix[0].xyz);
    float modeWidthBoost = mix(1.38, 1.0, uGpuFurMode);
    float baseWidth = 0.0145 * modeWidthBoost * (0.82 + 0.38 * (1.0 - uFurDensity)) * modelScale;
    float width = baseWidth * (1.0 - pow(h, 1.35));

    vec3 finalWorld = worldSpine + billboardRight * (position.x * width);
    vWorldPos = finalWorld;

    gl_Position = projectionMatrix * viewMatrix * vec4(finalWorld, 1.0);
  }
`;

export const STRAND_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  void main() {
    vec3 color = evaluatePhysicalHairShading(
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vHeight,
      vStrandSeed,
      vCombMemory
    );

    // Cylindrical cross-strand shading across the geometrically tapered 3D ribbon
    // Rely on geometric ribbon tapering + hardware MSAA instead of unsorted alpha-depth blending
    // so front strands never punch dark background-blended Z-buffer holes into behind strands!
    float radialDist = abs(vRibbonU);
    float cylinderRoundness = sqrt(max(0.18, 1.0 - radialDist * radialDist * 0.82));
    color *= (0.82 + 0.24 * cylinderRoundness);

    gl_FragColor = vec4(color, 1.0);
  }
`;
