# Weapon Model UV Mapping - Implementation Guide

This document tracks the implementation of proper UV mapping for all weapon models to prevent texture stretching and warping.

## Overview

All weapon models now use centralized geometry utility functions from `src/core/geometry-utils.ts` instead of local implementations or direct Three.js primitives. This ensures:

- **Consistent UV mapping** across all geometry
- **No texture stretching** on elongated weapon parts (barrels, stocks)
- **Proper texture tiling** based on world-space dimensions (TEXTURE_SCALE = 256)
- **Single source of truth** for geometry creation (no code duplication)

## Implementation Status

### ✅ Completed

#### Core Utilities
- **[src/core/geometry-utils.ts](../src/core/geometry-utils.ts)** - Centralized geometry functions
  - `createSubdividedBox()` - Box geometry with proper UVs
  - `createSubdividedCylinder()` - Cylinder geometry with proper UVs
  - `createSubdividedPlane()` - Plane geometry with proper UVs

#### Weapon Systems
- **[src/weapons/weapon-mesh-factory.ts](../src/weapons/weapon-mesh-factory.ts)** - Main weapon builder
  - ✅ Removed duplicate `createSubdividedBox()` and `createSubdividedCylinder()` functions (lines 24-122 deleted)
  - ✅ Now imports from `../core/geometry-utils`
  - ✅ All textured weapon parts use subdivided geometry:
    - **PP7 Pistol**: Slide, barrel, barrel extension, frame, grip
    - **KF7 Soviet**: Receiver, barrel, handguard, magazine, stock, grip
    - **Shotgun**: Receiver, barrel, magazine tube, pump, stock, grip
    - **Sniper Rifle**: Receiver, barrel, bolt, scope body, scope tube, stock, grip
  - Note: Small detail parts (< 0.05 units) like trigger guards, sights, screws use direct Three.js primitives as documented exceptions

#### Level Geometry
- **[src/levels/level-builder.ts](../src/levels/level-builder.ts)** - Level construction
  - ✅ Imports `createSubdividedBox` and `createSubdividedCylinder` from geometry-utils
  - ✅ All walls, floors, ceilings use subdivided geometry
  - ✅ Props (crates, barrels) use subdivided geometry

#### Pickup System
- **[src/levels/pickup-system.ts](../src/levels/pickup-system.ts)** - Item pickups
  - ✅ Imports `createSubdividedBox` from geometry-utils
  - ✅ All pickup meshes updated:
    - Health packs (cross shape)
    - Armor (shield shape)
    - Ammo boxes
    - Weapon fallback meshes
    - Key cards

#### Door System
- **[src/levels/door-system.ts](../src/levels/door-system.ts)** - Doors and frames
  - Already using subdivided geometry from previous update

## Technical Details

### Centralized Geometry Functions

All geometry creation now flows through these three functions:

```typescript
// Import statement used in all files
import { createSubdividedBox, createSubdividedCylinder } from '../core/geometry-utils';

// Usage examples
const barrel = createSubdividedCylinder(0.02, 0.02, 0.4, 12); // Weapon barrel
const receiver = createSubdividedBox(0.06, 0.08, 0.15);       // Weapon body
const wall = createSubdividedBox(10, 3, 0.2);                 // Level wall
```

### TEXTURE_SCALE

The constant `TEXTURE_SCALE = 256` is defined once in `geometry-utils.ts` and used by all functions:

- **128px texture = 0.5 world units**
- **256px texture = 1.0 world unit**

This means a weapon barrel that's 0.4 units long will tile the texture 0.8 times (80% of the texture visible).

### Before vs After

**Before (weapon-mesh-factory.ts):**
```typescript
// ❌ Duplicate code - had local implementations
function createSubdividedBox(width, height, depth) { /* 40 lines */ }
function createSubdividedCylinder(...) { /* 38 lines */ }

// Used local functions
const barrel = createSubdividedCylinder(0.02, 0.02, 0.4, 12);
```

**After (weapon-mesh-factory.ts):**
```typescript
// ✅ Import from centralized utilities
import { createSubdividedBox, createSubdividedCylinder } from '../core/geometry-utils';

// Use imported functions
const barrel = createSubdividedCylinder(0.02, 0.02, 0.4, 12);
```

### Code Duplication Eliminated

- **Before**: 3 copies of subdivided geometry logic
  - `weapon-mesh-factory.ts` (local functions)
  - `level-builder.ts` (inline calculations)
  - `pickup-system.ts` (direct primitives)

- **After**: 1 canonical implementation
  - `geometry-utils.ts` (single source of truth)
  - All other files import and use

## Exceptions (When Direct Primitives Are OK)

These cases use `new THREE.BoxGeometry()` or similar directly, which is acceptable:

### Very Small Geometry (< 0.05 units)
- Weapon trigger guards, sights, screws, pins
- Projectile system bullet casings (0.02 units)
- Stretching is imperceptible at this scale

### Untextured VFX Geometry
- Muzzle flash planes (weapon-view-model.ts)
- Explosion flash spheres (grenade-system.ts, destructible-system.ts)
- Barrel explosion flash geometry
- Blood splatter decals (blood-splatter.ts)
- These use solid colors or additive blending, no tiling textures

### Temporary Debris
- Destructible system debris chunks (0.06-0.14 units, solid colors, < 2 second lifetime)

## Files Using Geometry-Utils

### Primary Imports

| File | Imports | Used For |
|------|---------|----------|
| `weapon-mesh-factory.ts` | Box, Cylinder | All weapon parts (pistol, rifle, shotgun, sniper) |
| `level-builder.ts` | Box, Cylinder | Walls, floors, ceilings, props (crates, barrels) |
| `pickup-system.ts` | Box | Health, armor, ammo, keys, weapon fallback meshes |
| `door-system.ts` | Box | Door panels and frames |

### Files NOT Using Geometry-Utils (Exceptions)

| File | Geometry Type | Reason |
|------|---------------|--------|
| `blood-splatter.ts` | PlaneGeometry | Small VFX decals (0.12-0.15 units) |
| `projectile-system.ts` | BoxGeometry | Bullet casings (0.02 units) |
| `weapon-view-model.ts` | PlaneGeometry | Muzzle flash VFX |
| `grenade-system.ts` | PlaneGeometry | Explosion VFX |
| `destructible-system.ts` | BoxGeometry, SphereGeometry | Debris chunks and explosion flash |

## Verification Steps

To verify proper UV mapping after these changes:

1. **Build the project**: `npm run build`
   - Should complete with no TypeScript errors
   - Warnings about chunk sizes are expected

2. **Run the game**: `npm run dev`
   - Check weapon models in first-person view
   - Check weapon pickups on ground
   - Check level geometry (walls, floors, ceilings)
   - Check props (crates, barrels)

3. **Visual inspection checklist**:
   - ✅ Weapon barrels show consistent texture scale along length
   - ✅ Weapon receivers don't have stretched textures on top/bottom
   - ✅ Wall textures tile evenly without distortion
   - ✅ Crate textures look square, not stretched
   - ✅ Barrel textures wrap smoothly around circumference

## Performance Impact

Subdivided geometry has more vertices than simple primitives:

- **BoxGeometry(1, 1, 1)**: 24 vertices
- **createSubdividedBox(1, 1, 1)**: ~96 vertices (4x segments on large faces)

This is **acceptable** because:
- Better visual quality (proper texturing) outweighs vertex cost
- Modern GPUs handle this easily (weapons = ~500-1000 vertices each)
- Level geometry batched and static (minimal draw calls)
- Only applied to textured surfaces (VFX uses simple geometry)

## Maintenance Guidelines

### When Creating New Geometry

1. **Always import from geometry-utils**:
   ```typescript
   import { createSubdividedBox, createSubdividedCylinder } from '../core/geometry-utils';
   ```

2. **Use subdivided functions for textured surfaces**:
   ```typescript
   // ✅ CORRECT
   const mesh = new THREE.Mesh(
     createSubdividedBox(1, 2, 0.5),
     materialWithTexture
   );

   // ❌ WRONG
   const mesh = new THREE.Mesh(
     new THREE.BoxGeometry(1, 2, 0.5),
     materialWithTexture
   );
   ```

3. **Direct primitives OK for exceptions**:
   ```typescript
   // ✅ OK - very small (< 0.05 units)
   const screw = new THREE.Mesh(
     new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6),
     metalMat
   );

   // ✅ OK - untextured VFX
   const flash = new THREE.Mesh(
     new THREE.PlaneGeometry(0.2, 0.2),
     new THREE.MeshBasicMaterial({ color: 0xffff00 })
   );
   ```

### When Modifying Existing Geometry

1. **Check if file imports geometry-utils** - if not, add import
2. **Replace THREE.BoxGeometry** with `createSubdividedBox()` for textured parts
3. **Replace THREE.CylinderGeometry** with `createSubdividedCylinder()` for textured parts
4. **Test visually** - run game and check for texture stretching

### When Adding New Weapons

Follow the patterns in `weapon-mesh-factory.ts`:

```typescript
export function buildNewWeapon(skin: WeaponSkin = 'default'): THREE.Group {
  const group = new THREE.Group();

  // Main textured parts - use subdivided geometry
  const barrel = new THREE.Mesh(
    createSubdividedCylinder(0.02, 0.02, 0.5, 12),
    createMaterial(skin, 'metal', 0.4, 0.9, 'cylinderMetal')
  );

  const receiver = new THREE.Mesh(
    createSubdividedBox(0.08, 0.12, 0.2),
    createMaterial(skin, 'metal', 0.5, 0.8, 'shortMetal')
  );

  // Small details - direct primitives OK
  const frontSight = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.015, 0.015),
    sightMat
  );

  group.add(barrel, receiver, frontSight);
  return group;
}
```

## Related Documentation

- **[UV_MAPPING_GUIDE.md](./UV_MAPPING_GUIDE.md)** - General UV mapping guide for entire project
- **[src/core/geometry-utils.ts](../src/core/geometry-utils.ts)** - Geometry utility source code
- **[CLAUDE.md](../CLAUDE.md)** - Project overview and guidelines

## Changelog

### 2025-02-15 - Initial Implementation
- Created `src/core/geometry-utils.ts` with centralized geometry functions
- Updated `weapon-mesh-factory.ts` to use geometry-utils (removed 98 lines of duplicate code)
- Updated `level-builder.ts` to import from geometry-utils
- Updated `pickup-system.ts` to use subdivided geometry for all pickups
- Created this documentation file
- Build verified successful with no errors

## Future Improvements

Potential optimizations for later:

1. **LOD (Level of Detail)** - Use simpler geometry for distant weapons/props
2. **Geometry instancing** - Share geometry buffers for identical shapes
3. **Texture atlasing** - Combine multiple textures to reduce draw calls
4. **Dynamic subdivision** - Adjust segment count based on screen size

These are not critical now - current implementation provides excellent visual quality with acceptable performance.
