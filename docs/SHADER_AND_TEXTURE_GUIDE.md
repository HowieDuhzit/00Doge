# Shader and Texture Guide

Guide for applying procedural shaders, proper geometry subdivision, and glass/transmission materials to objects in 007 Remix. Based on work done for the Experimental Lab tanks/tubes and weapon plasma skins.

---

## What We Implemented

### Experimental Lab Tanks & Tubes

- **Shader-based glowing fluid** (`src/levels/lab-fluid-material.ts`) — procedural noise, no texture lookups, seamless patterns
- **Subdivided geometry** — `createSubdividedCylinder()` with 48 radial segments (tanks), 36 (tubes)
- **Glass shells** — `MeshPhysicalMaterial` with transmission, `DoubleSide`, correct render order
- **Per-instance variation** — `seed` and `hueHint` uniforms for unique colors and flow patterns

### Existing Reference: Plasma Weapon Skin

- **`src/weapons/weapon-plasma-material.ts`** — `onBeforeCompile` injection into `MeshStandardMaterial`
- Hash-based FBM noise, animated veins/arcs, color cycling
- `updatePlasmaMaterial(mat, time)` called from weapon view model each frame

---

## When to Use Shader vs Texture

| Use Shader (Procedural) | Use Texture (Canvas/Image) |
|-------------------------|-----------------------------|
| Seamless, non-tiling patterns | Repeating tiles (brick, concrete) |
| Animated/flowing effects | Static patterns |
| Organic noise, plasma, fluids | Decals, blood splatter, logos |
| Per-instance variation needed | Same look across many instances |
| No visible repetition | Tiling is acceptable |

**Rule of thumb:** If you need organic, flowing, or animated patterns without visible seams or tiling, use a shader. If you need a fixed image or tiled surface, use a texture.

---

## Procedural Shader Checklist

### 1. Material Setup

```typescript
// Base: MeshStandardMaterial (or Physical for refraction)
const mat = new THREE.MeshStandardMaterial({
  map: null,  // Often no base texture for pure procedural
  color: new THREE.Color(0x111111),
  roughness: 0.9,
  metalness: 0.0,
  side: THREE.DoubleSide,  // If needed for cylinders
  depthWrite: true,
});

// CRITICAL: Materials without a map need USE_UV for vUv
(mat.defines as Record<string, unknown>)['USE_UV'] = '';
```

### 2. Shader Injection (onBeforeCompile)

```typescript
mat.onBeforeCompile = (shader) => {
  // Add uniforms
  shader.uniforms.myTime = { value: 0 };
  shader.uniforms.mySeed = { value: seed * 0.001 };
  shader.uniforms.myColorA = { value: colorA.clone() };

  // Inject at top of fragment shader
  shader.fragmentShader =
    'uniform float myTime;\nuniform float mySeed;\nuniform vec3 myColorA;\n' +
    MY_GLSL_FUNCTIONS + '\n' +
    shader.fragmentShader;

  // Inject main effect after emissivemap_fragment
  if (shader.fragmentShader.includes('totalEmissiveRadiance')) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${MY_MAIN_CODE}`,
    );
  } else {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `${MY_MAIN_CODE}\n#include <output_fragment>`,
    );
  }

  (mat.userData as Record<string, unknown>).shader = shader;
};
```

### 3. GLSL Conventions

- **UV:** Use `vUv` (with `USE_UV` define). Not `vMapUv` unless material has a map.
- **Noise:** Hash-based, no texture lookups — works everywhere, no seams.
- **Seed:** Pass as uniform, use in noise coordinates: `fluidNoise(p + vec2(seed, 0))`.
- **Time:** Pass as uniform, update each frame for animation.

### 4. Time Updates

**Option A — Self-contained (lab fluid):** Module-level `Set<Material>`, single `requestAnimationFrame` loop that updates all materials.

**Option B — Game loop (plasma):** Call `updateMyMaterial(mat, time)` from the owning system's update (e.g. weapon view model, level builder callback).

### 5. Color and Intensity

- Keep emissive under ~1.0 to avoid bloom washout.
- Avoid mixing toward pure white (`vec3(0.9, 0.95, 1.0)`); prefer `col + vec3(0.06, 0.08, 0.1)` for highlights.
- Saturation 0.9–0.95 for vivid colors without blowing out.

---

## Geometry Subdivision Checklist

### Do Not Use

- `new THREE.CylinderGeometry(r, r, h, radialSegs)` — no height segments, faceting, UV issues
- `new THREE.BoxGeometry(w, h, d)` — for large or textured surfaces

### Use Instead

```typescript
import { createSubdividedCylinder, createSubdividedBox } from '../core/geometry-utils';

// Cylinders
const geom = createSubdividedCylinder(radiusTop, radiusBottom, height, radialSegments);
// radialSegments: 36–48 for smooth curves at close range; 24+ for distant objects

// Boxes
const geom = createSubdividedBox(width, height, depth);
```

### Segment Guidelines

| Shape | Use Case | Radial/Segment Count |
|-------|----------|----------------------|
| Cylinder (tank) | Lab tank, barrel, large tube | 48 radial |
| Cylinder (tube) | Lab tube, pipe, pillar | 36 radial |
| Cylinder (distant) | Background props | 24 radial |
| Box | Walls, crates, floors | Auto by geometry-utils |

`createSubdividedCylinder` adds height segments via `Math.ceil(height * TEXTURE_SCALE / 128)`.

---

## Glass / Transmission Checklist

### Material

```typescript
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xe8f4fc,
  transmission: 0.92,   // < 1 for subtle reflectivity
  roughness: 0.06,
  thickness: 0.15,
  ior: 1.5,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,  // CRITICAL for cylinders
});
```

### Render Order

**Inner content (fluid) must render first; glass must render last.**

```typescript
fluid.renderOrder = 1;
glass.renderOrder = 2;  // Higher = later = on top
```

### Culling

- `side: THREE.DoubleSide` for cylinders — otherwise half the cylinder is culled.
- Use `createSubdividedCylinder` for the glass mesh; raw `CylinderGeometry` can cause faceting.

---

## Future Tasks

- [ ] Extract reusable `createProceduralEmissiveMaterial(config)` for new shader-based materials.
- [ ] Add `createSubdividedSphere()` to geometry-utils if needed for domes, orbs.
- [ ] Document environment-map setup for better glass reflections (transmission).
- [ ] Consider post-process bloom tuning per material if needed.
- [ ] Apply same patterns to other transparent containers (vats, aquariums, cryo tubes).

---

## File Reference

| File | Purpose |
|------|---------|
| `src/levels/lab-fluid-material.ts` | Glowing fluid shader, lab tanks/tubes |
| `src/weapons/weapon-plasma-material.ts` | Plasma weapon skin shader |
| `src/core/geometry-utils.ts` | `createSubdividedCylinder`, `createSubdividedBox`, `createSubdividedPlane` |
| `src/levels/level-builder.ts` | `buildLabProps()` — glass + fluid setup |
