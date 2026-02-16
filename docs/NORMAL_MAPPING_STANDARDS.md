# Normal Mapping Standards

This document defines the default normal-mapping requirements for this project.

## Policy

- Normal mapping is required for all new or reworked:
  - Level surface textures (floor, wall, ceiling)
  - Environment props (crates, barrels, etc.)
  - Weapon textures and weapon materials
- If a texture is shipped without a normal map, it must include a short reason in the PR/commit notes.

## Current Runtime Pipeline

- Procedural albedo textures are generated in `src/levels/procedural-textures.ts`.
- Normal maps are generated from those textures via `deriveNormalFromTexture(...)` in `src/levels/procedural-textures.ts`.
- Data/normal textures use linear color space (`THREE.NoColorSpace`) and repeat wrapping.
- Level materials apply `normalMap` and `normalScale` in `src/levels/level-builder.ts`.

## Required Implementation Pattern

For every texture family (default/palace/wasteland/weapons/props):

1. Add or reuse a normal texture export.
2. Wire that normal texture into the material with `normalMap`.
3. Set `normalScale` to a tuned value (do not leave defaults blindly).
4. Keep UV repeat settings in sync between albedo and normal textures.
5. Validate in-game lighting from multiple angles.

## Weapon Requirement

- Weapon materials must include normal maps for both:
  - World/view models
  - Any weapon preview/render pipeline
- When adding a new weapon skin/texture variant, add or map a corresponding normal variant.

## Future Level/Texture Requirement

- Any future map/theme must include:
  - `floor`, `wall`, and `ceiling` normal coverage
  - Prop normal coverage for map-specific destructibles/cover assets
- When introducing a new texture generator, add its normal generator in the same change.

## Maintenance Rule

- When normal mapping behavior changes, update this file in the same commit.
- Minimum updates required:
  - What changed
  - Which files were touched
  - Any new defaults (`normalScale`, generation strength, exceptions)

## Update Log

- 2026-02-16: Added runtime-derived normal maps for level surfaces and core props; wired `normalMap` and `normalScale` into level materials and destructible props.
