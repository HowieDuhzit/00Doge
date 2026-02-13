import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildPlayerModel, buildAnimatedPlayerFromCharacter, animatePlayerMovement, playFireAnimation, updateAimingPose, setPlayerWeapon } from './player-model';
import { getCachedAvatarModel } from '../core/model-loader';
import type { CustomPlayerAnimator } from './custom-player-animator';
import { InterpolationBuffer } from '../network/interpolation-buffer';
import type { PlayerStateUpdate } from '../network/network-events';
import type { PhysicsWorld } from '../core/physics-world';
import { WeaponViewModel } from '../weapons/weapon-view-model';
import type { WeaponType } from '../weapons/weapon-view-model';

/**
 * RemotePlayer represents another player in the multiplayer game.
 * Handles rendering, interpolation, animation, and physics collider.
 */
export class RemotePlayer {
  public id: string;
  public username: string;
  public model: THREE.Group;
  public shadowMesh: THREE.Mesh;
  public collider: RAPIER.Collider;
  private rigidBody: RAPIER.RigidBody;
  private interpolationBuffer: InterpolationBuffer;
  private currentState: PlayerStateUpdate | null = null;
  private lastUpdateTime = 0;
  private _isDead = false;

  /** Whether this player is currently dead (playing death animation). */
  get isDead(): boolean {
    return this._isDead;
  }
  private deathAnimationProgress = 0;
  private ragdollActive = false;
  private attackLockoutUntil = 0;
  private currentWeaponType: WeaponType = 'pistol';
  private weaponViewModel: WeaponViewModel;
  private flashlight: THREE.SpotLight;
  private flashlightOn = false;

  // Smoothed position for even smoother rendering
  private smoothedPosition = new THREE.Vector3();
  private smoothedRotation = 0;
  private hasInitialPosition = false;

  /** When set, drives animation for custom GLB/VRM models (replaces procedural animatePlayerMovement) */
  private customAnimator: CustomPlayerAnimator | null = null;

  constructor(id: string, username: string, scene: THREE.Scene, physics: PhysicsWorld) {
    this.id = id;
    this.username = username;

    const customChar = getCachedAvatarModel();
    if (customChar) {
      const result = buildAnimatedPlayerFromCharacter(id, customChar);
      this.model = result.model;
      this.customAnimator = result.animator;
    } else {
      this.model = buildPlayerModel(id);
      this.model.scale.setScalar(1.25);
    }
    scene.add(this.model);

    // Create blob shadow (scaled to match human-sized player)
    const shadowGeometry = new THREE.CircleGeometry(0.38, 16);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.01;
    scene.add(this.shadowMesh);

    // Create physics collider (kinematic capsule for hit detection)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0);
    this.rigidBody = physics.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.9, 0.3); // Standing capsule
    this.collider = physics.world.createCollider(colliderDesc, this.rigidBody);

    // Store player ID in collider user data for identification
    this.collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    // Create interpolation buffer for smooth movement
    this.interpolationBuffer = new InterpolationBuffer(100); // 100ms delay

    // Create weapon view model and attach weapon mesh
    this.weaponViewModel = new WeaponViewModel();
    if (this.customAnimator) {
      setPlayerWeapon(this.model, null, 'pistol');
    } else {
      const weaponMesh = this.weaponViewModel.buildWeaponMeshForPreview('pistol', 'default');
      setPlayerWeapon(this.model, weaponMesh);
    }

    // Create flashlight (spotlight attached to model - close to player, at chest/head height)
    this.flashlight = new THREE.SpotLight(0xffe8cc, 0, 30, Math.PI / 6, 0.35, 1.5);
    this.flashlight.position.set(0, 1.4, 0.15); // At chest height, slightly forward (weapon area)
    this.flashlight.target.position.set(0, 1.2, 1.5); // Point forward, closer so beam stays near player
    this.model.add(this.flashlight);
    this.model.add(this.flashlight.target);
  }

  /**
   * Update remote player state from server snapshot.
   */
  updateFromServer(state: PlayerStateUpdate): void {
    this.interpolationBuffer.addSnapshot(state.timestamp, state);
    this.currentState = state;
    this.lastUpdateTime = performance.now();
  }

  /**
   * Update player rendering (called each frame).
   */
  update(dt: number): void {
    if (!this.currentState) return;

    // Handle death animation
    if (this._isDead) {
      this.deathAnimationProgress += dt * 2; // 0.5 second animation

      if (this.customAnimator) {
        this.customAnimator.update(dt);
        if (!this.ragdollActive) {
          this.model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.transparent = true;
              child.material.opacity = 1 - this.deathAnimationProgress;
            }
          });
        } else {
          this.model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.transparent = true;
              child.material.opacity = Math.max(0, 1 - this.deathAnimationProgress * 1.2);
            }
          });
        }
      } else {
        // Procedural: fall down, rotate, sink, fade
        this.model.rotation.x = -Math.PI / 2 * this.deathAnimationProgress;
        this.model.position.y -= dt * 2;
        this.model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
            child.material.transparent = true;
            child.material.opacity = 1 - this.deathAnimationProgress;
          }
        });
      }

      if (this.deathAnimationProgress >= 1) {
        this.model.visible = false;
        this.shadowMesh.visible = false;
      }
      return;
    }

    // Get interpolated state
    const renderTime = performance.now();
    const interpolatedState = this.interpolationBuffer.getInterpolatedState(renderTime);

    if (interpolatedState) {
      // Initialize smoothed position on first update
      if (!this.hasInitialPosition) {
        this.smoothedPosition.set(
          interpolatedState.position.x,
          interpolatedState.position.y,
          interpolatedState.position.z
        );
        this.smoothedRotation = interpolatedState.rotation;
        this.hasInitialPosition = true;
      }

      // Apply exponential smoothing for extra smooth movement (lerp factor: 0.3 = aggressive smoothing)
      const smoothFactor = 0.3;
      this.smoothedPosition.x += (interpolatedState.position.x - this.smoothedPosition.x) * smoothFactor;
      this.smoothedPosition.y += (interpolatedState.position.y - this.smoothedPosition.y) * smoothFactor;
      this.smoothedPosition.z += (interpolatedState.position.z - this.smoothedPosition.z) * smoothFactor;

      // Smooth rotation (handle wrapping)
      let rotDiff = interpolatedState.rotation - this.smoothedRotation;
      if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      this.smoothedRotation += rotDiff * smoothFactor;

      // Update physics collider position (for hit detection) - use interpolated (not smoothed) for accuracy
      this.rigidBody.setTranslation(
        {
          x: interpolatedState.position.x,
          y: interpolatedState.position.y,
          z: interpolatedState.position.z,
        },
        true
      );

      // Update visual model position using smoothed values
      // Offset Y so feet touch ground. Capsule center is ~0.9m above feet.
      // Procedural: feet ~0.3 from root, capsule ~1.0 → use -1.3
      // Custom GLB/VRM: scaled to 1.7m, feet at scene origin → use -1.0 (less sink)
      const yOffset = this.customAnimator ? 1.0 : 1.3;
      this.model.position.set(
        this.smoothedPosition.x,
        this.smoothedPosition.y - yOffset,
        this.smoothedPosition.z
      );

      // Update rotation (yaw only, players rotate around Y axis)
      // Procedural model faces +Z → add PI so it faces -Z (camera forward).
      // Custom GLB/VRM typically face -Z already → no extra PI (adding it makes them appear backwards).
      this.model.rotation.y = this.smoothedRotation + (this.customAnimator ? 0 : Math.PI);

      // Update shadow position
      this.shadowMesh.position.x = interpolatedState.position.x;
      this.shadowMesh.position.z = interpolatedState.position.z;

      // Animate movement: custom animator (idle/walk) or procedural (bob, arm swing)
      if (this.customAnimator) {
        this.customAnimator.update(dt);
        if (performance.now() >= this.attackLockoutUntil) {
          const animState = interpolatedState.isMoving ? 'walk' : 'idle';
          this.customAnimator.play(animState);
        }
      } else {
        animatePlayerMovement(this.model, renderTime * 0.001, interpolatedState.isMoving);
        updateAimingPose(this.model);
      }

      // Update weapon if changed (normalize to canonical type for legacy/alternate names)
      const raw = interpolatedState.currentWeapon as string;
      const canonical: WeaponType =
        raw === 'rifle' || raw === 'shotgun' || raw === 'sniper' ? raw :
        raw === 'kf7-soviet' ? 'rifle' : raw === 'sniper-rifle' ? 'sniper' : 'pistol';
      if (canonical !== this.currentWeaponType) {
        this.currentWeaponType = canonical;
        if (this.customAnimator) {
          setPlayerWeapon(this.model, null, this.currentWeaponType);
        } else {
          const weaponMesh = this.weaponViewModel.buildWeaponMeshForPreview(this.currentWeaponType, 'default');
          setPlayerWeapon(this.model, weaponMesh);
        }
      }

      // TODO: Show crouch animation if crouching
    }
  }

  /**
   * Play weapon firing animation (muzzle flash, recoil, and attack clip for custom models).
   * Call when this player fires a weapon.
   */
  playFireAnimation(): void {
    playFireAnimation(this.model);
    this.attackLockoutUntil = performance.now() + 300;
    this.customAnimator?.play('attack');
  }

  /**
   * Get current position (for distance checks, etc.).
   */
  getPosition(): THREE.Vector3 {
    return this.model.position.clone();
  }

  /**
   * Get collider handle for identification.
   */
  getColliderHandle(): number {
    return this.collider.handle;
  }

  /**
   * Set flashlight state (on/off).
   */
  setFlashlight(isOn: boolean): void {
    this.flashlightOn = isOn;
    this.flashlight.intensity = isOn ? 40 : 0;
  }

  /**
   * Play death animation. Uses ragdoll for custom VRM models; otherwise death clip or procedural fall.
   */
  playDeathAnimation(): void {
    this._isDead = true;
    this.deathAnimationProgress = 0;
    this.ragdollActive = false;

    if (this.customAnimator && this.customAnimator.activateRagdoll) {
      const activated = this.customAnimator.activateRagdoll(this.physics, (pos, quat) => {
        this.model.position.copy(pos);
        this.model.quaternion.copy(quat);
      });
      if (activated) this.ragdollActive = true;
    }
    if (!this.ragdollActive) {
      this.customAnimator?.play('death');
    }
  }

  /**
   * Reset after respawn.
   */
  resetAfterRespawn(): void {
    this._isDead = false;
    this.deathAnimationProgress = 0;
    this.ragdollActive = false;
    this.attackLockoutUntil = 0;
    this.model.visible = true;
    this.model.rotation.x = 0;
    this.model.quaternion.identity();
    this.shadowMesh.visible = true;

    this.customAnimator?.disposeRagdoll?.();
    this.customAnimator?.resetMeshPosition?.();
    this.customAnimator?.play('idle');

    // Reset material opacity (death animation fades to 0)
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
        child.material.opacity = 1.0;
        child.material.transparent = false;
        child.material.needsUpdate = true;
      }
    });
  }

  /**
   * Cleanup and remove from scene.
   */
  dispose(scene: THREE.Scene, physics: PhysicsWorld): void {
    scene.remove(this.model);
    scene.remove(this.shadowMesh);

    // Remove physics collider
    physics.world.removeCollider(this.collider, true);

    // Dispose geometries and materials
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    this.shadowMesh.geometry.dispose();
    if (this.shadowMesh.material instanceof THREE.Material) {
      this.shadowMesh.material.dispose();
    }
  }
}
