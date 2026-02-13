# Custom Model Setup — Single-Player & Multiplayer

This guide explains how custom models (GLB/VRM) work in 007 Remix, how to configure them correctly for single-player, and how to fix the multiplayer T-pose issue.

---

## 1. Single-Player: Enemy Custom Models

### How It Works

Enemies use `EnemyCustomModel` (`src/enemies/model/enemy-custom-model.ts`), which:

- Clones the scene with `SkeletonUtils.clone()` (required for skinned animation)
- Creates an `AnimationMixer` and maps clips by name
- Plays idle, walk, alert, shoot, hit, death based on AI state
- Supports VRM (normalized→raw copy, foot IK, optional ragdoll) and GLB
- Uses clips from: embedded in model, or standalone GLBs in `customAnimationsPath`

### Config

```typescript
setEnemyRenderConfig({
  mode: 'model',
  customModelPath: 'enemies/voyager_1262MOTU.vrm',    // or path to your GLB/VRM
  customAnimationsPath: 'animations',                  // folder with idle.glb, walk.glb, etc.
});
```

### Required Animations (by clip name pattern)

| Clip pattern  | Use              | Example names                 |
|---------------|------------------|-------------------------------|
| idle          | Standing         | idle, Idle, stand             |
| walk          | Movement         | walk, Walk, locomotion, run   |
| death         | Death            | death, Death, Dying           |
| hit           | Hit reaction     | hit, Hit, Get Hit             |
| attack/shoot  | Firing           | attack, shoot, fire, aim      |

If a clip is missing, the first loaded clip is used as fallback for idle/walk.

### Animation Sources

1. **Embedded in GLB/VRM** — Animations inside the file are used.
2. **Standalone GLBs** — Place in `public/models/animations/` (or folder from `customAnimationsPath`):
   - `idle.glb`, `walk.glb`, `run.glb`, `death.glb`, `attack.glb`, `hit.glb`
   - Mixamo: export **"With Skin"**, same rig as model (e.g. X Bot)
   - Animation loader retargets Mixamo bone names to VRM humanoid bones

### Bone Names

- **VRM:** Uses `VRMHumanoidRig` (hips, spine, head, leftUpperArm, etc.)
- **Mixamo:** Loader maps `mixamorigHips` → `hips`, etc. See `animation-loader.ts` `MIXAMO_TO_HUMANOID`

### Loading Flow (enemies)

1. `preloadCustomEnemyModel(path)` or `loadAndCacheEnemyModelFromBuffer()` 
2. Loads model, then calls `loadAndMergeStandaloneAnimations(customAnimationsPath, …)`
3. Merged clips are stored on the character
4. `EnemyCustomModel` constructor creates mixer, maps clips, plays idle by default

---

## 2. Single-Player: Player / Character Models

### Config Slots

- **customPlayerModelPath** — Used for remote player avatars (multiplayer)
- **customCharacterModelPath** — Fallback avatar when player model not set
- **customModelPath** — Enemy models only (PvE)

These are set via Character Models screen (upload or path) and persisted in localStorage.

---

## 3. Multiplayer: Remote Player Custom Models — Current Problem

### Symptom

When using a custom player/character model in multiplayer, remote players appear in **T-pose** with **no animations**.

### Root Cause

| Component | Enemies (EnemyCustomModel) | Remote Players (buildPlayerModelFromCharacter) |
|-----------|---------------------------|-----------------------------------------------|
| Clone method | `SkeletonUtils.clone()` | `scene.clone(true)` — breaks skinned animation |
| AnimationMixer | Yes | **No** |
| Clip mapping | Yes (idle, walk, death, etc.) | **No** |
| preload merges animations | Yes (`loadAndMergeStandaloneAnimations`) | **No** — `preloadCustomPlayerModel` loads model only |
| animatePlayerMovement | N/A (mixer drives) | **Returns early** — `if (model.userData.isCustomModel) return` |
| updateAimingPose | N/A | **Returns early** for custom models |
| Death animation | Mixer plays death clip | Procedural fall — but custom models use `attachToRoot` so procedural rotation/position may not look right |

### Code Paths

**EnemyCustomModel (working):**
```
preloadCustomEnemyModel(path)
  → loadCharacterModel(path)
  → loadAndMergeStandaloneAnimations(animationsPath, char)
  → animations merged onto char
EnemyCustomModel(char)
  → SkeletonUtils.clone(scene)
  → mixer = new AnimationMixer(mesh)
  → clipMap built from animations
  → play('idle')
  → update(dt) → mixer.update(dt)
```

**Remote player (broken):**
```
preloadCustomPlayerModel(path)  // NO animation merge
  → loadCharacterModel(path)
  → char has animations[] but they are never used
buildPlayerModelFromCharacter(id, char)
  → scene.clone(true)  // NOT SkeletonUtils.clone
  → root.userData.isCustomModel = true
RemotePlayer.update(dt)
  → animatePlayerMovement() → return (early exit)
  → updateAimingPose() → return (early exit)
  → No mixer, no playback → T-pose
```

---

## 4. Implementation Roadmap: Fix Multiplayer Custom Model Animations

### Phase 1: Load Animations for Player/Character Models

**File:** `src/core/model-loader.ts`

1. Add `preloadCustomPlayerModelWithAnimations(path: string)` (or extend `preloadCustomPlayerModel`):
   - Load model with `loadCharacterModel(path)`
   - If `customAnimationsPath` is set (reuse `ENEMY_RENDER_CONFIG.customAnimationsPath` or add `customPlayerAnimationsPath`), call `loadAndMergeStandaloneAnimations()`
   - Cache the character with merged animations

2. For upload path (`loadCharacterModelFromBuffer`), also merge animations when storing as player/character:
   - In `character-models-panel.ts` when uploading to player slot, load and merge standalone animations before `setCachedPlayerModel`

### Phase 2: Add Animation Support to buildPlayerModelFromCharacter

**File:** `src/player/player-model.ts` or new `src/player/custom-player-animator.ts`

Options:

**Option A — Return animator with model (recommended)**  
Create a `CustomPlayerAnimator` (similar to EnemyCustomModel) that:
- Takes `LoadedCharacter` (with animations)
- Uses `SkeletonUtils.clone()` instead of `scene.clone(true)`
- Creates `AnimationMixer`, maps clips (idle, walk, run, death, attack)
- Exposes `update(dt)`, `play(name)`, `setState(isMoving, isDead, isFiring)`
- `buildPlayerModelFromCharacter` returns `{ model, animator }` when animations exist

**Option B — Inline in RemotePlayer**  
RemotePlayer holds mixer + clipMap, drives it from `update()` based on `interpolatedState.isMoving`, `_isDead`, and fire timing.

### Phase 3: Wire RemotePlayer to Animator

**File:** `src/player/remote-player.ts`

1. When building from custom character:
   - Use `SkeletonUtils.clone` if animations will be used
   - Create mixer + clip map from `char.animations`
   - Store `animator` or `mixer` on the instance

2. In `update(dt)`:
   - If custom model with animator:
     - `animator.update(dt)` or `mixer.update(dt)`
     - Drive state: idle vs walk (from `isMoving`), death (when `_isDead`), shoot (on `playFireAnimation`)
   - Else: keep current `animatePlayerMovement` / `updateAimingPose` for procedural model

3. For death:
   - If animator: `animator.play('death')` instead of procedural fall
   - Handle death sink / foot IK if VRM (reuse EnemyCustomModel patterns)
   - When `resetAfterRespawn`, stop death clip and reset to idle

4. For fire:
   - `playFireAnimation` already works (weapon recoil, muzzle flash)
   - Optionally: play attack/shoot clip for arms when custom model has it

### Phase 4: Config for Player Animations Path

**File:** `src/enemies/enemy-render-config.ts`

Add (optional):
```typescript
customPlayerAnimationsPath?: string;  // default: same as customAnimationsPath or 'animations'
```

So player models can use a different animations folder than enemies.

---

## 5. Checklist for Custom Model Setup (Single-Player Enemies)

- [ ] Model in `public/models/` (e.g. `enemies/your_model.vrm`)
- [ ] `setEnemyRenderConfig({ customModelPath: '…', customAnimationsPath: 'animations' })`
- [ ] Standalone anims in `public/models/animations/`: idle.glb, walk.glb, death.glb, etc.
- [ ] Mixamo: export **With Skin**, same skeleton as model
- [ ] Test in single-player (Quick Play or mission)

---

## 6. Checklist for Custom Model Setup (Multiplayer — Implemented)

- [x] Player/character model loaded (path or upload)
- [x] Animations merged in `preloadCustomPlayerModel` and `loadAndCachePlayerModelFromBuffer` / `loadAndCacheCharacterModelFromBuffer`
- [x] RemotePlayer uses `CustomPlayerAnimator` for custom models with animations
- [x] Same animation name patterns as enemies: idle, walk, death, attack
- [x] `buildAnimatedPlayerFromCharacter` uses `SkeletonUtils.clone` for skinned animation

---

## 7. File Reference

| File | Purpose |
|------|---------|
| `enemy-render-config.ts` | Config: paths, mode, sprite source |
| `model-loader.ts` | Load GLB/VRM, cache, merge animations |
| `animation-loader.ts` | Load standalone GLBs, retarget to VRM/GLB |
| `enemy-custom-model.ts` | Enemy animation: mixer, clips, VRM copy, ragdoll |
| `player-model.ts` | buildPlayerModel, buildPlayerModelFromCharacter, animatePlayerMovement |
| `remote-player.ts` | Remote player instance, interpolation, death, fire |
