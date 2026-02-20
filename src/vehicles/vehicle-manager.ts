/**
 * VehicleManager — spawns, updates, and synchronizes all vehicles.
 *
 * Handles:
 * - Spawning vehicles from config
 * - Local player entry/exit (press E)
 * - Driving input when player is driver
 * - Gunner turret control and firing
 * - Network state serialization
 * - Collider-to-vehicle mapping for hitscan hit detection
 * - Remote vehicle state updates from server snapshots
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../core/physics-world';
import type { InputManager } from '../core/input-manager';
import type { FPSCamera } from '../player/fps-camera';
import { Vehicle } from './vehicle';
import {
  WARTHOG,
  SEAT_ORDER,
  SEAT_POSITIONS,
  SEAT_CAMERA_OFFSETS,
  emptyOccupancy,
  getFirstEmptySeat,
  getOccupantSeat,
  type VehicleDef,
  type VehicleSeatId,
  type VehicleNetState,
} from './vehicle-types';
import type { GameStateSnapshot, VehicleStateUpdate, VehicleOccupancyEvent } from '../network/network-events';
import {
  updateEngineSound,
  playVehicleGunFire,
  playVehicleBeep,
  playVehicleExplosion,
} from '../audio/vehicle-sounds';

// ─── Interpolation entry for remote vehicle smoothing ────────────────────────

interface VehicleSnapshot {
  state: VehicleNetState;
  receivedAt: number;
}

const INTERP_DELAY = 100; // ms behind real time

class VehicleInterpolator {
  private snapshots: VehicleSnapshot[] = [];

  record(state: VehicleNetState): void {
    this.snapshots.push({ state, receivedAt: performance.now() });
    // Keep only last 600ms
    const cutoff = performance.now() - 600;
    this.snapshots = this.snapshots.filter(s => s.receivedAt > cutoff);
  }

  /** Get interpolated state for rendering. */
  getInterpolated(): VehicleNetState | null {
    if (this.snapshots.length === 0) return null;
    const renderTime = performance.now() - INTERP_DELAY;

    // Find two snapshots bracketing renderTime
    let before: VehicleSnapshot | null = null;
    let after: VehicleSnapshot | null = null;

    for (let i = 0; i < this.snapshots.length; i++) {
      const s = this.snapshots[i];
      if (s.receivedAt <= renderTime) {
        before = s;
      } else {
        after = s;
        break;
      }
    }

    if (!before && after) return after.state;
    if (before && !after) return before.state;
    if (!before || !after) return this.snapshots[this.snapshots.length - 1]?.state ?? null;

    // Interpolate
    const t = (renderTime - before.receivedAt) / (after.receivedAt - before.receivedAt);
    const a = before.state;
    const b = after.state;

    const lerp = (x: number, y: number) => x + (y - x) * t;
    const lerpYaw = (x: number, y: number) => {
      let diff = y - x;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return x + diff * t;
    };

    return {
      ...a,
      position: {
        x: lerp(a.position.x, b.position.x),
        y: lerp(a.position.y, b.position.y),
        z: lerp(a.position.z, b.position.z),
      },
      yaw: lerpYaw(a.yaw, b.yaw),
      roll: lerp(a.roll, b.roll),
      pitch: lerp(a.pitch, b.pitch),
      turretYaw: lerpYaw(a.turretYaw, b.turretYaw),
      turretPitch: lerp(a.turretPitch, b.turretPitch),
    };
  }
}

// ─── VehicleManager ───────────────────────────────────────────────────────────

export class VehicleManager {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;

  /** All vehicles (local + remote). Keyed by vehicleId. */
  private vehicles = new Map<string, Vehicle>();
  /** Collider handle → vehicleId for hitscan. */
  private colliderToVehicle = new Map<number, string>();
  /** Interpolators for remote vehicles. */
  private interpolators = new Map<string, VehicleInterpolator>();

  /** Which vehicle (if any) the local player is currently in. */
  private localVehicleId: string | null = null;
  /** Which seat the local player occupies. */
  private localSeat: VehicleSeatId | null = null;
  /** Local player ID (set externally). */
  private localPlayerId: string | null = null;

  // Turret aim accumulators (mouse delta accumulation for gunner)
  private turretYawAccum = 0;
  private turretPitchAccum = 0;
  private turretYawSensitivity = 0.0018;
  private turretPitchSensitivity = 0.0015;

  // Third-person camera state (for driver)
  private cameraYaw = 0;
  private cameraPitch = -0.2;
  private readonly cameraDistance = 5.5;
  private readonly _camPos = new THREE.Vector3();
  private readonly _camTarget = new THREE.Vector3();
  private readonly _lookDir = new THREE.Vector3();

  // Reusable vectors
  private readonly _playerPos = new THREE.Vector3();
  private readonly _vehiclePos = new THREE.Vector3();

  // Callbacks for networking
  onSendVehicleState: ((state: VehicleStateUpdate) => void) | null = null;
  onSendVehicleOccupancy: ((event: VehicleOccupancyEvent) => void) | null = null;
  onVehicleGunFire: ((vehicleId: string, origin: THREE.Vector3, dir: THREE.Vector3) => void) | null = null;
  onVehicleDestroyed: ((vehicleId: string) => void) | null = null;

  // Ground height provider
  getGroundHeight?: (x: number, z: number, excludeCollider?: RAPIER.Collider) => number;

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────────

  spawnVehicle(def: VehicleDef): Vehicle {
    const id = def.id ?? `warthog_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let spawnY = def.y ?? 0;

    // Snap to terrain
    if (this.getGroundHeight) {
      spawnY = this.getGroundHeight(def.x, def.z) + WARTHOG.GROUND_CLEARANCE;
    } else if (spawnY < WARTHOG.GROUND_CLEARANCE) {
      spawnY = WARTHOG.GROUND_CLEARANCE;
    }

    const vehicle = new Vehicle(id, this.physics, def.x, spawnY, def.z, def.rotation ?? 0);
    this.scene.add(vehicle.mesh);
    this.vehicles.set(id, vehicle);
    this.colliderToVehicle.set(vehicle.collider.handle, id);
    this.interpolators.set(id, new VehicleInterpolator());

    console.log(`[VehicleManager] Spawned ${def.type} id=${id} at (${def.x}, ${spawnY.toFixed(2)}, ${def.z})`);
    return vehicle;
  }

  removeVehicle(id: string): void {
    const v = this.vehicles.get(id);
    if (!v) return;
    this.scene.remove(v.mesh);
    this.colliderToVehicle.delete(v.collider.handle);
    v.dispose(this.physics);
    this.vehicles.delete(id);
    this.interpolators.delete(id);

    if (this.localVehicleId === id) {
      this.localVehicleId = null;
      this.localSeat = null;
    }
  }

  // ── Local Player Entry / Exit ─────────────────────────────────────────────────

  /**
   * Try to enter the nearest vehicle. Call when player presses E.
   * Returns true if entered.
   */
  tryEnter(playerPos: THREE.Vector3): boolean {
    if (!this.localPlayerId) return false;
    if (this.localVehicleId) {
      // Already in a vehicle — exit
      this.exitVehicle();
      return false;
    }

    let nearest: Vehicle | null = null;
    let nearestDist = Infinity;

    for (const v of this.vehicles.values()) {
      const dist = playerPos.distanceTo(v.getPosition());
      if (dist < WARTHOG.ENTER_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearest = v;
      }
    }

    if (!nearest) return false;

    const seat = getFirstEmptySeat(nearest.occupancy);
    if (!seat) return false;

    this.localVehicleId = nearest.id;
    this.localSeat = seat;
    nearest.sit(this.localPlayerId, seat);

    // Initialize camera yaw to vehicle yaw for smooth transition
    this.cameraYaw = nearest.getYaw();
    this.cameraPitch = -0.2;

    playVehicleBeep();

    // Notify server
    this.onSendVehicleOccupancy?.({
      vehicleId: nearest.id,
      playerId: this.localPlayerId,
      seat,
      action: 'enter',
      timestamp: performance.now(),
    });

    console.log(`[VehicleManager] Player entered ${nearest.id} seat=${seat}`);
    return true;
  }

  exitVehicle(): void {
    if (!this.localVehicleId || !this.localPlayerId || !this.localSeat) return;

    const v = this.vehicles.get(this.localVehicleId);
    if (v) {
      v.vacate(this.localSeat);
    }

    this.onSendVehicleOccupancy?.({
      vehicleId: this.localVehicleId,
      playerId: this.localPlayerId,
      seat: this.localSeat,
      action: 'exit',
      timestamp: performance.now(),
    });

    console.log(`[VehicleManager] Player exited ${this.localVehicleId}`);
    playVehicleBeep();

    this.localVehicleId = null;
    this.localSeat = null;
  }

  isLocalPlayerInVehicle(): boolean {
    return this.localVehicleId !== null;
  }

  getLocalVehicle(): Vehicle | null {
    return this.localVehicleId ? (this.vehicles.get(this.localVehicleId) ?? null) : null;
  }

  getLocalSeat(): VehicleSeatId | null {
    return this.localSeat;
  }

  // ── Exit position — where to place player after exit ─────────────────────────

  getExitPosition(fallbackPos: THREE.Vector3): THREE.Vector3 {
    const v = this.getLocalVehicle();
    if (!v) return fallbackPos.clone();

    // Place player to the left side of vehicle
    const yaw = v.getYaw();
    const pos = v.getPosition();
    const exitOffset = new THREE.Vector3(
      Math.cos(yaw) * 2.5,
      0.8,
      -Math.sin(yaw) * 2.5,
    );
    return pos.clone().add(exitOffset);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────

  update(
    dt: number,
    input: InputManager,
    fpsCamera: FPSCamera,
    playerPos: THREE.Vector3,
    isMultiplayer: boolean,
  ): void {
    const localVehicle = this.getLocalVehicle();

    // ── E to enter/exit ──────────────────────────────────────────────────────────
    if (input.wasKeyJustPressed('e')) {
      if (localVehicle) {
        this.exitVehicle();
      } else {
        this.tryEnter(playerPos);
      }
    }

    // ── Driver input ──────────────────────────────────────────────────────────────
    if (localVehicle && this.localSeat === 'driver') {
      const fwd  = input.isKeyDown('w') || input.isKeyDown('arrowup');
      const back = input.isKeyDown('s') || input.isKeyDown('arrowdown');
      const left = input.isKeyDown('a') || input.isKeyDown('arrowleft');
      const right = input.isKeyDown('d') || input.isKeyDown('arrowright');
      const brake = input.isKeyDown(' ');

      localVehicle.setThrottle(fwd ? 1 : back ? -1 : 0);
      localVehicle.setSteering(left ? -1 : right ? 1 : 0);
      localVehicle.setBraking(brake && !fwd && !back);
      localVehicle.setHandbrake(brake && (fwd || back));

      // Third-person camera orbit using raw mouse movement
      this.cameraYaw   += input.mouseMovementX * 0.003;
      this.cameraPitch += input.mouseMovementY * 0.002;
      this.cameraPitch  = Math.max(-0.5, Math.min(0.6, this.cameraPitch));
    }

    // ── Gunner turret input ───────────────────────────────────────────────────────
    if (localVehicle && this.localSeat === 'gunner') {
      this.turretYawAccum   -= input.mouseMovementX * this.turretYawSensitivity * 60;
      this.turretPitchAccum -= input.mouseMovementY * this.turretPitchSensitivity * 60;

      localVehicle.setTurretAim(this.turretYawAccum, this.turretPitchAccum);

      // Fire with left mouse button
      if (input.mouseDown && localVehicle.turretFireCooldown <= 0) {
        localVehicle.turretFireCooldown = 1 / WARTHOG.GUN_FIRE_RATE;
        const origin = localVehicle.getGunTipWorld();
        const dir = localVehicle.getGunDirection();
        playVehicleGunFire();
        this.onVehicleGunFire?.(localVehicle.id, origin, dir);
      }
    }

    // ── Physics update (only for vehicle we're driving) ───────────────────────────
    for (const [id, vehicle] of this.vehicles) {
      const isLocalDriverVehicle = id === this.localVehicleId && this.localSeat === 'driver';

      if (isLocalDriverVehicle || !isMultiplayer) {
        vehicle.update(dt, this.getGroundHeight);
      }
    }

    // ── Remote vehicle interpolation ──────────────────────────────────────────────
    if (isMultiplayer) {
      for (const [id, vehicle] of this.vehicles) {
        if (id === this.localVehicleId && this.localSeat === 'driver') continue;
        const interp = this.interpolators.get(id);
        const state = interp?.getInterpolated();
        if (state) {
          vehicle.applyNetState(state);
        }
      }
    }

    // ── Engine sound ──────────────────────────────────────────────────────────────
    if (localVehicle) {
      const speed = localVehicle.getPosition().distanceTo(localVehicle.getPosition());
      // Estimate RPM from velocity
      const vel = new THREE.Vector3();
      // Just use throttle as proxy for RPM for sound
      updateEngineSound(0.3, true);
    } else {
      updateEngineSound(0, false);
    }

    // ── Camera override when in vehicle ───────────────────────────────────────────
    if (localVehicle) {
      this.applyVehicleCamera(localVehicle, fpsCamera);
    }

    // ── Send state to server (driver only, at caller's 20Hz rate) ─────────────────
    // Called by game.ts tick at 20Hz
  }

  /**
   * Send vehicle state to server (called by game.ts at 20Hz).
   */
  sendStateIfDriver(): VehicleStateUpdate | null {
    const v = this.getLocalVehicle();
    if (!v || this.localSeat !== 'driver' || !this.localPlayerId) return null;

    const pos = v.getPosition();
    return {
      vehicleId: v.id,
      playerId: this.localPlayerId,
      position: { x: pos.x, y: pos.y, z: pos.z },
      yaw: v.getYaw(),
      roll: (v as any).rollAngle ?? 0,
      pitch: (v as any).pitchAngle ?? 0,
      velocityX: 0,
      velocityZ: 0,
      turretYaw: v.turretYaw,
      turretPitch: v.turretPitch,
      occupancy: { ...v.occupancy },
      health: v.health,
      timestamp: performance.now(),
    };
  }

  // ── Camera ────────────────────────────────────────────────────────────────────

  private applyVehicleCamera(vehicle: Vehicle, camera: FPSCamera): void {
    const vPos = vehicle.getPosition();
    const vYaw = vehicle.getYaw();

    if (this.localSeat === 'driver') {
      // Third-person chase camera
      const camYaw = this.cameraYaw;
      const cosP = Math.cos(this.cameraPitch);
      const sinP = Math.sin(this.cameraPitch);
      const cosY = Math.cos(camYaw);
      const sinY = Math.sin(camYaw);

      this._camPos.set(
        vPos.x + sinY * cosP * this.cameraDistance,
        vPos.y + 1.5 + sinP * this.cameraDistance,
        vPos.z + cosY * cosP * this.cameraDistance,
      );

      // Target = vehicle center slightly above hood
      this._camTarget.set(vPos.x, vPos.y + 1.0, vPos.z);

      camera.camera.position.copy(this._camPos);
      camera.camera.lookAt(this._camTarget);

    } else if (this.localSeat === 'gunner') {
      // First-person gunner — camera at gun position looking along barrel
      const origin = vehicle.getGunTipWorld();
      origin.y -= 0.1; // slight offset for eye position
      camera.camera.position.copy(origin);

      const gunDir = vehicle.getGunDirection();
      this._camTarget.copy(origin).addScaledVector(gunDir, 5);
      camera.camera.lookAt(this._camTarget);

    } else {
      // Passenger — sit in seat, look forward
      const seatPos = vehicle.getSeatWorldPosition(this.localSeat!);
      camera.camera.position.copy(seatPos).add(new THREE.Vector3(0, 0.15, 0));
      this._camTarget.set(
        seatPos.x - Math.sin(vYaw) * 3,
        seatPos.y,
        seatPos.z - Math.cos(vYaw) * 3,
      );
      camera.camera.lookAt(this._camTarget);
    }
  }

  // ── Network: receive snapshot ─────────────────────────────────────────────────

  updateFromSnapshot(snapshot: GameStateSnapshot): void {
    if (!snapshot.vehicles) return;

    const activeIds = new Set<string>();

    for (const [id, state] of Object.entries(snapshot.vehicles)) {
      activeIds.add(id);

      let vehicle = this.vehicles.get(id);
      if (!vehicle) {
        // Spawn remote vehicle
        vehicle = this.spawnVehicle({
          id,
          type: 'warthog',
          x: state.position.x,
          y: state.position.y,
          z: state.position.z,
          rotation: state.yaw,
        });
      }

      // Record in interpolation buffer (don't apply directly — interp handles it)
      const interp = this.interpolators.get(id);
      if (interp) {
        interp.record(state);
      }

      // Apply occupancy immediately for UI
      vehicle.occupancy = { ...state.occupancy };

      // If this is our vehicle and we're not the driver, update from server
      if (id === this.localVehicleId && this.localSeat !== 'driver') {
        vehicle.applyNetState(state);
      }
    }

    // Clean up vehicles no longer in snapshot (only if they're not ours)
    for (const id of this.vehicles.keys()) {
      if (!activeIds.has(id) && id !== this.localVehicleId) {
        this.removeVehicle(id);
      }
    }
  }

  // ── Hit detection ─────────────────────────────────────────────────────────────

  getVehicleByCollider(collider: RAPIER.Collider): Vehicle | null {
    const id = this.colliderToVehicle.get(collider.handle);
    return id ? (this.vehicles.get(id) ?? null) : null;
  }

  getAllVehicles(): Vehicle[] {
    return Array.from(this.vehicles.values());
  }

  getVehicleNetStates(): Record<string, VehicleNetState> {
    const out: Record<string, VehicleNetState> = {};
    for (const [id, v] of this.vehicles) {
      out[id] = v.getNetState();
    }
    return out;
  }

  /**
   * Apply damage to a vehicle (from server broadcast).
   */
  applyVehicleDamage(vehicleId: string, damage: number): void {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    const destroyed = v.applyDamage(damage);
    if (destroyed) {
      playVehicleExplosion();
      this.onVehicleDestroyed?.(vehicleId);
    }
  }

  /**
   * Dispose all vehicles.
   */
  dispose(): void {
    for (const id of this.vehicles.keys()) {
      this.removeVehicle(id);
    }
    updateEngineSound(0, false);
  }
}
