# Custom Quickplay Arena Assets

Place your assets here for the "QUICK PLAY — CUSTOM ARENA" mode.

## Asset Names (configurable)

Use **config.json** to customize filenames. If omitted, defaults apply:

| Asset    | Default           | Description                                        |
|----------|-------------------|----------------------------------------------------|
| environment | environment.glb | Ground, walls, static geometry (required)          |
| hdri     | environment.hdr   | Equirectangular HDR for lighting and reflections   |
| skybox   | skybox.jpg        | LDR image for visible sky background              |

## config.json

```json
{
  "environment": "environment.glb",
  "hdri": "environment.hdr",
  "skybox": "skybox.jpg",
  "presets": {
    "day": { "hdri": "environment.hdr", "skybox": "skybox.jpg" },
    "night": { "hdri": "environment_night.hdr", "skybox": "skybox_night.jpg" }
  },
  "preset": "day"
}
```

- Set **preset** to switch time-of-day variants (day, night, sunset, etc.).
- Omit config.json to use defaults; omit fields to use that field’s default.

## Collision (Trimesh)

The GLB is used for **geometric trimesh colliders** — triangle mesh collision is derived from all visible meshes. This matches complex terrain (hills, rocks, tracks) instead of a flat box.

- **Dedicated collision mesh**: Name a mesh `collision` or `collider` in your 3D editor; only that mesh will be used for physics. Use a low-poly version for better performance.
- **Triangle winding**: If the player falls through terrain, edit `src/levels/custom-environment-loader.ts` and set `TRIMESH_FLIP_WINDING = true`.
- **Rapier contact skin**: A small contact buffer (0.08) improves trimesh reliability.

## Spawning

The game spawns crates, barrels, weapons, and enemies at the terrain’s vertical midpoint. Origin (0, 0, 0) is used for the center; ensure your model is reasonably centered.
