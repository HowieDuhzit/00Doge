# Troubleshooting

Common issues and their fixes.

---

## Player model clipping through floor on respawn

**Symptom:** After dying and respawning in multiplayer, remote player models (or the local player if visible) sink into or clip through the ground. The lower body appears below the floor.

**Root cause:** The death animation in `CustomPlayerAnimator` sinks the mesh with `mesh.position.y = meshBaseY - DEATH_SINK * progress`. When switching back to idle after respawn, the mesh Y was never restored, so it stayed sunk.

**Fix:**

1. **Restore mesh when not in death** – In `src/player/custom-player-animator.ts`, add an `else` branch after the death-sink block:
   ```typescript
   if (clipName.includes('death')) {
     // ... sink logic
   } else {
     mesh.position.y = this.meshBaseY;
   }
   ```

2. **Reset on respawn** – Add `resetMeshPosition()` to `CustomPlayerAnimator`:
   ```typescript
   resetMeshPosition(): void {
     const mesh = this.mixer.getRoot() as THREE.Object3D;
     mesh.position.y = this.meshBaseY;
   }
   ```
   Call it from `RemotePlayer.resetAfterRespawn()` before `play('idle')`.

**Files to check:** `src/player/custom-player-animator.ts`, `src/player/remote-player.ts`
