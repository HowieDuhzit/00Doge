/**
 * Glowing fluid material for lab tanks/tubes — shader-based procedural noise.
 * No tiling or texture lookup; seamless FBM noise, flowing streaks, and drifting blobs
 * like the plasma weapon skin but tuned for luminous liquids.
 */
import * as THREE from 'three';

const labFluidMaterials = new Set<THREE.Material>();
let labFluidLoopRunning = false;

function labFluidLoop(): void {
  const t = performance.now() * 0.001;
  for (const mat of labFluidMaterials) {
    updateGlowingFluidMaterial(mat, t);
  }
  if (labFluidMaterials.size > 0) {
    requestAnimationFrame(labFluidLoop);
  } else {
    labFluidLoopRunning = false;
  }
}

// GLSL: hash-based procedural noise (seamless, no texture)
const FLUID_GLSL = /* glsl */ `
float fluidHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float fluidNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fluidHash(i);
  float b = fluidHash(i + vec2(1.0, 0.0));
  float c = fluidHash(i + vec2(0.0, 1.0));
  float d = fluidHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fluidFbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * fluidNoise(p);
    p = rot * p * 2.1;
    amp *= 0.5;
  }
  return v;
}

// Flowing vertical streaks with noise perturbation (liquid flow)
float fluidStreak(vec2 uv, float t, float seed) {
  float y = uv.y * 4.0 + t * 0.6 + seed * 12.0;
  float centerX = 0.5 + sin(y * 0.5 + seed * 3.14) * 0.25;
  centerX += fluidNoise(vec2(y * 0.3, t * 1.5 + seed * 7.0)) * 0.2 - 0.1;
  float dist = abs(uv.x - centerX);
  float streak = exp(-dist * 25.0);
  streak *= 0.6 + 0.2 * fluidNoise(vec2(y * 2.0, t * 2.0 + seed));
  return streak;
}

// Soft turbulent veins (organic, not electric)
float fluidVeins(vec2 uv, float t, float seed) {
  vec2 q = vec2(
    fluidFbm(uv * 2.5 + vec2(seed, t * 0.3)),
    fluidFbm(uv * 2.5 + vec2(seed * 1.7, t * 0.25 + 2.1))
  );
  vec2 r = vec2(
    fluidFbm(uv * 2.5 + q * 3.0 + vec2(1.2 + seed, t * 0.4 + 5.0)),
    fluidFbm(uv * 2.5 + q * 3.0 + vec2(6.1 + seed * 0.5, t * 0.35 + 3.2))
  );
  float f = fluidFbm(uv * 2.5 + r * 1.5);
  float veins = abs(f - 0.5) * 2.0;
  veins = 1.0 - veins;
  veins = smoothstep(0.35, 0.9, veins);
  veins = pow(veins, 1.2);
  return veins;
}

// Drifting blobs (mixing zones)
float fluidBlobs(vec2 uv, float t, float seed) {
  float blobs = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 center = vec2(
      0.25 + 0.5 * fluidNoise(vec2(seed + fi * 2.3, t * 0.4 + fi * 1.9)),
      0.25 + 0.5 * fluidNoise(vec2(seed * 1.3 + fi * 2.7, t * 0.35 + fi * 2.2))
    );
    center += vec2(sin(t * 0.8 + fi * 4.0) * 0.1, cos(t * 0.6 + fi * 3.2) * 0.1);
    float d = length(uv - center);
    float pulse = 0.5 + 0.5 * sin(t * 2.0 + fi * 5.0);
    blobs += exp(-d * 8.0) * pulse;
  }
  return blobs;
}
`;

const FLUID_MAIN = /* glsl */ `
{
  vec2 pUv = vUv * (2.2 + fluidSeed * 0.4) + vec2(fluidSeed * 2.7, fluidSeed * 1.3);
  float t = fluidTime;

  float vw = 0.6 + fract(fluidSeed * 0.33) * 0.5;
  float sw = 0.5 + fract(fluidSeed * 0.41) * 0.6;
  float bw = 0.35 + fract(fluidSeed * 0.29) * 0.45;

  float veins = fluidVeins(pUv, t * (0.8 + fluidSeed * 0.1), fluidSeed) * vw;
  float veins2 = fluidVeins(pUv * (1.8 + fluidSeed * 0.2) + vec2(4.1, 2.3), t * (0.75 + fluidSeed * 0.05), fluidSeed + 1.5) * 0.4;
  veins2 *= vw;

  float streaks = 0.0;
  streaks += fluidStreak(pUv, t * (1.0 + fract(fluidSeed) * 0.3), 0.0) * sw;
  streaks += fluidStreak(pUv, t * (1.15 + fluidSeed * 0.02), 0.4) * (sw * 0.6);
  streaks += fluidStreak(pUv, t * (0.85 + fluidSeed * 0.015), 0.7) * (sw * 0.5);

  float blobs = fluidBlobs(pUv * (1.2 + fluidSeed * 0.15), t * (0.9 + fluidSeed * 0.02), fluidSeed) * bw;

  float total = veins + veins2 + streaks + blobs;
  total = clamp(total, 0.0, 1.0);

  float colorPhase = veins + sin(t * 1.2 + pUv.x * 4.0 + fluidSeed) * 0.3;
  colorPhase = clamp(colorPhase, 0.0, 1.0);

  vec3 col;
  if (colorPhase > 0.5) {
    col = mix(fluidColorB, fluidColorA, (colorPhase - 0.5) * 2.0);
  } else {
    col = mix(fluidColorC, fluidColorB, colorPhase * 2.0);
  }
  float coreGlow = smoothstep(0.55, 1.0, total);
  col = mix(col, col + vec3(0.06, 0.08, 0.1), coreGlow * 0.08);

  float isCap = smoothstep(0.92, 0.98, abs(vNormal.y));
  float capDim = 1.0 - isCap * 0.85;
  totalEmissiveRadiance += col * total * 0.72 * capDim;
  diffuseColor.rgb = col * (0.4 + total * 0.55) * capDim;
}
`;

/** Hue (0–360) to RGB for shader color. Saturation and lightness for vivid but not blown-out. */
function hueToRgb(h: number, sat = 0.94, light = 0.52): THREE.Color {
  const c = new THREE.Color();
  c.setHSL(h / 360, sat, light);
  return c;
}

/** Create glowing fluid material for lab tanks/tubes. Seed and hueHint for variation. */
export function createGlowingFluidMaterial(
  seed: number,
  hueHint?: number,
): THREE.MeshStandardMaterial {
  const defaultHues = [120, 195, 280, 45, 310, 175, 340, 55, 15];
  const hue = hueHint ?? defaultHues[seed % defaultHues.length];
  const hueAccent = (hue + 75) % 360;
  const hueDark = (hue + 150) % 360;

  const colorA = hueToRgb(hue);
  const colorB = hueToRgb(hueAccent);
  const colorC = hueToRgb(hueDark);

  const mat = new THREE.MeshStandardMaterial({
    map: null,
    color: new THREE.Color(0x111111),
    roughness: 0.9,
    metalness: 0.0,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  (mat.defines as Record<string, unknown>)['USE_UV'] = '';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fluidTime = { value: 0 };
    shader.uniforms.fluidSeed = { value: seed * 0.001 };
    shader.uniforms.fluidColorA = { value: colorA.clone() };
    shader.uniforms.fluidColorB = { value: colorB.clone() };
    shader.uniforms.fluidColorC = { value: colorC.clone() };
    (mat.userData as Record<string, unknown>).shader = shader;

    shader.fragmentShader =
      'uniform float fluidTime;\nuniform float fluidSeed;\nuniform vec3 fluidColorA;\nuniform vec3 fluidColorB;\nuniform vec3 fluidColorC;\n' +
      FLUID_GLSL +
      '\n' +
      shader.fragmentShader;

    if (shader.fragmentShader.includes('totalEmissiveRadiance')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${FLUID_MAIN}`,
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `${FLUID_MAIN}
#include <output_fragment>`,
      );
    }
  };

  labFluidMaterials.add(mat);
  if (!labFluidLoopRunning) {
    labFluidLoopRunning = true;
    requestAnimationFrame(labFluidLoop);
  }

  return mat;
}

/** Update fluid material time (called by internal loop). */
export function updateGlowingFluidMaterial(material: THREE.Material, time: number): void {
  const shader = (material.userData as { shader?: { uniforms: { fluidTime?: { value: number } } } })
    .shader;
  if (shader?.uniforms?.fluidTime) {
    shader.uniforms.fluidTime.value = time;
  }
}
