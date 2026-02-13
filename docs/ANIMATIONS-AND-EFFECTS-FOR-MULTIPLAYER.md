# Animations, 2D/3D Modes & Camera Effects — Multiplayer Setup Guide

This document describes how enemy rendering (models vs sprites), animations, death overlays, and camera effects work, and how they relate to multiplayer setup.

---

## 1. Enemy Render Modes (2D Sprites vs 3D Models)

### Config Layer

All enemy visual mode is controlled by `ENEMY_RENDER_CONFIG` in `src/enemies/enemy-render-config.ts`:

```typescript
setEnemyRenderConfig({
  mode: 'model' | 'sprite',
  spriteSource?: 'procedural' | 'baked' | 'image',
  spriteImageUrl?: string,  // when spriteSource === 'image'
  customModelPath?: string,
  customPlayerModelPath?: string,
  customCharacterModelPath?: string,
  customAnimationsPath?: string,
});
```

- **`mode: 'model'`** — 3D enemies (default)
- **`mode: 'sprite'`** — 2D billboard sprites, with `spriteSource`:
  - `procedural` — Canvas 2D–drawn sprites
  - `baked` — runtime 3D→2D bake (procedural guard model)
  - `image` — PNG sprite sheet (`spriteImageUrl`)

### Sprite Sources Explained

| Source       | Description                                                                 |
|--------------|-----------------------------------------------------------------------------|
| **Procedural** | `guard-sprite-sheet.ts` draws sprites with Canvas 2D; no 3D or external assets |
| **Baked**      | `sprite-baker.ts` renders procedural 3D guard into a texture at runtime      |
| **Image**      | Pre-made PNG (e.g. `npm run bake-sprites` → `public/sprites/enemy-guard.png`) |

### Creation Flow (EnemyBase)

In `src/enemies/enemy-base.ts`, `ENEMY_RENDER_CONFIG` decides which visual to create:

- **Sprite mode**
  - Cached custom model? → `bakeCustomModelSpriteSheet()`
  - Else `baked` → `bakeGuardSpriteSheet(variant, weapon)`
  - Else `image` → `getPreloadedSpriteTexture()` or fallback to procedural variant
  - Else → procedural `GuardVariant`
- **Model mode**
  - Cached custom model? → `EnemyCustomModel` (GLB/VRM + animations)
  - Else → `EnemyModel` (procedural low-poly + pose keyframes)

### Persistence & Init

- `main.ts` reads `localStorage['007remix_enemy_render_mode']` (`'2d'` or `'3d'`)
- 2D uses `spriteSource: 'image'`, `spriteImageUrl: '/sprites/enemy-guard.png'`
- 3D uses `mode: 'model'`
- `preloadEnemySpriteSheet('/sprites/enemy-guard.png')` is called at init (fallback if PNG missing)

---

## 2. Animation Systems

### A. Sprite Animation (`SpriteAnimator`)

**File:** `src/enemies/sprite/sprite-animator.ts`

- Drives UV offset for sprite sheet
- Atlas layout: `COLS` × `ROWS` (e.g. 5×3)
- Animations: `idle`, `alert`, `shoot`, `hit`, `death`, `walk`
- Each animation maps to frame indices; `death` and `hit` are non-looping
- Used by: `EnemySprite`

### B. Pose Animation (`PoseAnimator`)

**File:** `src/enemies/model/pose-animator.ts`  
**Poses:** `src/enemies/model/pose-library.ts`

- Interpolates joint rotations between keyframe poses
- Joints: hips, torso, head, shoulders, elbows, hips, knees
- Same animation names: `idle`, `alert`, `shoot`, `hit`, `death`, `walk`
- Used by: procedural `EnemyModel`

### C. Custom Model Animation (GLB/VRM)

**File:** `src/enemies/model/enemy-custom-model.ts`

- Uses THREE.js `AnimationMixer` with clips from:
  - Embedded in GLB/VRM, or
  - Standalone `idle.glb`, `walk.glb`, `death.glb`, etc. in `customAnimationsPath`
- Death: tries `activateRagdoll()` for VRM rig; otherwise plays `death` clip
- Death sink: model sinks procedurally (`DEATH_SINK`) during death clip
- Hit/death use `copyHipsPosition` for proper collapse

### D. Sprite Baking (3D → 2D)

**File:** `src/enemies/sprite/sprite-baker.ts`

- Renders procedural guard (or custom model) into a texture
- Uses poses from `pose-library.ts` for keyframes
- `FRAME_POSES` maps atlas cells to `(animationName, keyframeIndex)`
- Output: single texture cached per variant+weapon (or per custom model)
- Offline bake: `npm run bake-sprites` → `public/sprites/enemy-guard.png`

---

## 3. Death Overlay & Camera Effects

### Death Overlay

**File:** `src/ui/death-overlay.ts`

- Full-screen overlay: "YOU DIED" or "KILLED BY [NAME]"
- 3-second countdown: "Respawning in 3... 2... 1... Respawning..."
- `onCountdownComplete` callback for single-player respawn
- `show(killerName?: string)`, `hide()`, `isVisible()`

### Single-Player Death Flow

1. Player health → 0 → `handlePlayerDeath(fromPos)`
2. Death camera starts: camera falls to ground, looks up at killer, tilt + shake
3. Duration ~1.11s, ease-out cubic
4. When done → `deathOverlay.show()`
5. When countdown ends → `onCountdownComplete` → respawn, hide overlay

**Note:** `handlePlayerDeath` is skipped in multiplayer (`networkMode === 'client'`).

### Multiplayer Death Flow

1. Server sends `PlayerDeathEvent` (victimId, killerId, weaponType)
2. **Local victim:** `player.setDead(true)`, `deathOverlay.show(killerName)` — no death camera
3. **Remote victim:** `remotePlayer.playDeathAnimation()`
4. Server sends `PlayerRespawnEvent` when respawn time elapses
5. **Local victim:** `player.respawn()`, `player.setPosition(...)`, `deathOverlay.hide()`
6. **Remote victim:** `remotePlayer.resetAfterRespawn()`

In multiplayer, the overlay countdown is cosmetic; actual respawn is driven by the server.

### Death Camera (Single-Player Only)

**Location:** `game.ts` — `deathCameraAnimating`, `updateDeathCamera()`

- Camera position lerps from current to ground
- Look-at lerps from current view to killer (with bias above head)
- Shake during fall
- Roll tilt at settle
- Ground Y from physics raycast

---

## 4. Other Camera / Screen Effects

### Damage Indicator

**File:** `src/ui/damage-indicator.ts`

- Red vignette flash when player takes damage
- Duration ~0.3s, opacity fades out

### Low Health Overlay

**File:** `src/ui/low-health-overlay.ts`

- Red vignette when health ≤ 25
- Intensity grows as health decreases
- Hidden on death

### Screen Glitch

**File:** `src/ui/screen-glitch.ts`

- Random static and glitch bars over the view
- Overlay canvas with `mixBlendMode: 'overlay'`
- Random glitch every 5–10 seconds
- Used for CCTV-style aesthetic (started in `main.ts`)

---

## 5. Remote Player (Multiplayer) Animations

**File:** `src/player/remote-player.ts`

### Model

- Procedural low-poly player or custom character (`buildPlayerModel` / `buildPlayerModelFromCharacter`)
- Uses `player-model.ts`: `animatePlayerMovement()`, `playFireAnimation()`, `updateAimingPose()`

### Death Animation

- `playDeathAnimation()`: `_isDead = true`, `deathAnimationProgress = 0`
- Each frame:
  - `model.rotation.x = -π/2 * progress` (fall forward)
  - `model.position.y -= dt * 2` (sink)
  - Mesh materials fade opacity
- When `progress >= 1` → hide model and shadow
- `resetAfterRespawn()` restores visibility, rotation, opacity

### Movement / Combat

- Interpolation from server snapshots
- `animatePlayerMovement(model, time, isMoving)` for bob and leg swing
- `updateAimingPose()` raises arms for ~500ms after fire
- `playFireAnimation()` for recoil and muzzle flash
- Weapon mesh swapped when `currentWeapon` changes in snapshot

---

## 6. Multiplayer Parity Checklist

| Feature                     | Single-Player              | Multiplayer (Local)       | Multiplayer (Remote)          |
|----------------------------|---------------------------|---------------------------|-------------------------------|
| Death overlay              | Yes (post death camera)   | Yes (immediate)           | N/A                           |
| Death camera               | Yes                       | No                        | N/A                           |
| Death overlay countdown    | Drives respawn            | Cosmetic only             | N/A                           |
| Actual respawn             | `onCountdownComplete`     | `PlayerRespawnEvent`      | `PlayerRespawnEvent`          |
| Enemy render mode          | Config-driven             | Same (enemies PvE only)    | N/A                           |
| Remote player death        | N/A                       | N/A                       | `playDeathAnimation()`        |
| Remote player respawn      | N/A                       | N/A                       | `resetAfterRespawn()`         |
| Damage indicator           | Yes                       | Yes                       | N/A                           |
| Low health overlay         | Yes                       | Yes                       | N/A                           |
| Screen glitch              | Yes                       | Yes                       | Yes (shared view)             |

---

## 7. Potential Multiplayer Enhancements

1. **Death camera for multiplayer**
   - Optional short death camera when local player dies before overlay
   - Reuse existing `updateDeathCamera` with killer position from `PlayerDeathEvent`

2. **Death overlay countdown sync**
   - Show server’s respawn time instead of fixed 3s
   - Requires server to expose respawn delay or countdown

3. **Remote player custom models**
   - Use `customPlayerModelPath` / `customCharacterModelPath` for remote avatars
   - Ensure `buildPlayerModelFromCharacter` supports death animation

4. **Remote player death poses**
   - Optional death pose (e.g. facing killer) if server sends direction
   - Currently: simple fall-forward + fade

5. **Hit feedback for remote victims**
   - Already: blood splatter, hit marker for shooter
   - Could add brief hit flash or stagger on remote model
