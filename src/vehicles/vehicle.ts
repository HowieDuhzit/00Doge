/**
 * Vehicle — Warthog physics simulation and state.
 *
 * Physics model inspired by Halo CE's M12 Warthog:
 * - Kinematic rigid body (matches existing player architecture)
 * - Raycast suspension (4 virtual wheel spring contacts)
 * - Traction/grip model (speed-dependent steering, lateral friction)
 * - Engine power curve
 * - Rolls on hard cornering
 * - Can catch air and re-land
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../core/physics-world';
import {
  WARTHOG,
  SEAT_ORDER,
  emptyOccupancy,
  type VehicleOccupancy,
  type VehicleSeatId,
  type VehicleNetState,
} from './vehicle-types';
import { buildWarthogMesh, updateWarthogWheels } from './warthog-mesh';
import { playVehicleImpact } from '../audio/vehicle-sounds';

// ─── Wheel Ray Positions (local space, from vehicle center) ──────────────────
// Y offset = WHEEL_RADIUS - GROUND_CLEARANCE (same as visual wheel rest position)
// so that restHeight = position.y + wo.y - SUSPENSION_REST ≈ groundY at rest
const WHEEL_Y = WARTHOG.WHEEL_RADIUS - WARTHOG.GROUND_CLEARANCE; // ≈ -0.07
const WHEEL_OFFSETS = [
  { x: -1.1, y: WHEEL_Y, z:  1.18 }, // FL
  { x:  1.1, y: WHEEL_Y, z:  1.18 }, // FR
  { x: -1.1, y: WHEEL_Y, z: -1.0  }, // RL
  { x:  1.1, y: WHEEL_Y, z: -1.0  }, // RR
];

const DOWN = new THREE.Vector3(0, -1, 0);

export class Vehicle {
  readonly id: string;
  health: number;
  readonly maxHealth = WARTHOG.MAX_HEALTH;

  // Three.js visual
  mesh: THREE.Group;

  // Physics body (kinematic)
  private body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  // World-space kinematics
  private position = new THREE.Vector3();
  private velocity = new THREE.Vector3();        // world-space velocity
  private yaw = 0;                               // heading (radians)
  private angularVelocity = 0;                   // yaw rate (rad/s)
  private rollAngle = 0;                         // visual lean
  private pitchAngle = 0;                        // visual pitch (nose up/down)
  private airTime = 0;                           // time since last ground contact

  // Wheel suspension state
  private suspensionHeights = [0, 0, 0, 0];     // deviation from rest (m)
  private suspensionVelocities = [0, 0, 0, 0];  // for spring damping
  private wheelsOnGround: boolean[] = [false, false, false, false];

  // Input state (set by controller each frame)
  private throttle = 0;      // -1..1
  private steering = 0;      // -1..1 (target)
  private currentSteering = 0; // smoothed
  private braking = false;
  private handbrake = false;

  // Turret
  turretYaw = 0;
  turretPitch = 0;
  turretFireCooldown = 0;

  // Occupancy
  occupancy: VehicleOccupancy;

  // Reusable vectors
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _worldWheelPos = new THREE.Vector3();
  private readonly _nextPos = new THREE.Vector3();
  private readonly _quatFromYaw = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Last dt used — needed for frame-rate-correct wheel spin in updateMeshFromState
  private _lastDt = 1 / 60;

  private physics: PhysicsWorld;

  constructor(
    id: string,
    physics: PhysicsWorld,
    startX: number,
    startY: number,
    startZ: number,
    startYaw = 0,
  ) {
    this.id = id;
    this.physics = physics;
    this.health = WARTHOG.MAX_HEALTH;
    this.occupancy = emptyOccupancy();
    this.yaw = startYaw;
    this.position.set(startX, startY, startZ);

    // Build mesh
    this.mesh = buildWarthogMesh();
    this.mesh.position.copy(this.position);

    // Physics body — kinematic position-based (like player)
    const RAPIER = physics.rapier;
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(startX, startY + WARTHOG.HALF_HEIGHT + 0.05, startZ);
    this.body = physics.world.createRigidBody(bodyDesc);

    // Collider: box matching chassis
    const colDesc = RAPIER.ColliderDesc
      .cuboid(WARTHOG.HALF_WIDTH, WARTHOG.HALF_HEIGHT, WARTHOG.HALF_LENGTH)
      .setFriction(0.5)
      .setRestitution(0.2);
    this.collider = physics.world.createCollider(colDesc, this.body);

    this.updateMeshFromState();
  }

  // ── Input setters (called by VehicleManager from InputManager) ──────────────

  setThrottle(v: number): void { this.throttle = Math.max(-1, Math.min(1, v)); }
  setSteering(v: number): void { this.steering = Math.max(-1, Math.min(1, v)); }
  setBraking(v: boolean): void { this.braking = v; }
  setHandbrake(v: boolean): void { this.handbrake = v; }

  setTurretAim(yaw: number, pitch: number): void {
    // Clamp turret yaw relative to vehicle forward
    const halfRange = WARTHOG.TURRET_YAW_RANGE / 2;
    this.turretYaw = Math.max(-halfRange, Math.min(halfRange, yaw));
    this.turretPitch = Math.max(
      WARTHOG.TURRET_PITCH_MIN,
      Math.min(WARTHOG.TURRET_PITCH_MAX, pitch)
    );
  }

  isOccupied(): boolean {
    return SEAT_ORDER.some(s => this.occupancy[s] !== null);
  }

  isEmpty(): boolean {
    return SEAT_ORDER.every(s => this.occupancy[s] === null);
  }

  hasSeat(seat: VehicleSeatId): boolean {
    return this.occupancy[seat] === null;
  }

  sit(playerId: string, seat: VehicleSeatId): void {
    this.occupancy[seat] = playerId;
  }

  vacate(seat: VehicleSeatId): void {
    this.occupancy[seat] = null;
  }

  vacatePlayer(playerId: string): VehicleSeatId | null {
    for (const s of SEAT_ORDER) {
      if (this.occupancy[s] === playerId) {
        this.occupancy[s] = null;
        return s;
      }
    }
    return null;
  }

  getPlayerSeat(playerId: string): VehicleSeatId | null {
    for (const s of SEAT_ORDER) {
      if (this.occupancy[s] === playerId) return s;
    }
    return null;
  }

  /**
   * Get world-space position of a seat.
   */
  getSeatWorldPosition(seat: VehicleSeatId, out = new THREE.Vector3()): THREE.Vector3 {
    const offset = this.getSeatLocalOffset(seat);
    out.copy(this.position);
    out.y += offset.y;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    out.x += cos * offset.x - sin * offset.z;
    out.z += sin * offset.x + cos * offset.z;
    return out;
  }

  private getSeatLocalOffset(seat: VehicleSeatId): { x: number; y: number; z: number } {
    const OFFSETS = {
      driver:     { x: -0.65, y: 0.8, z:  0.55 },
      passenger1: { x:  0.65, y: 0.8, z:  0.55 },
      passenger2: { x: -0.65, y: 0.8, z: -0.4  },
      passenger3: { x:  0.65, y: 0.8, z: -0.4  },
      gunner:     { x:  0.0,  y: 1.1, z: -1.1  },
    };
    return OFFSETS[seat];
  }

  /**
   * Get gun barrel tip position in world space (for projectile origin).
   */
  getGunTipWorld(): THREE.Vector3 {
    const localOffset = { x: 0, y: 1.1, z: -2.0 }; // tip of barrel
    const out = new THREE.Vector3();

    const cos = Math.cos(this.yaw + this.turretYaw);
    const sin = Math.sin(this.yaw + this.turretYaw);
    out.x = this.position.x + cos * localOffset.x - sin * localOffset.z;
    out.z = this.position.z + sin * localOffset.x + cos * localOffset.z;
    out.y = this.position.y + localOffset.y + Math.sin(this.turretPitch) * 0.9;

    return out;
  }

  /**
   * Get gun fire direction in world space.
   */
  getGunDirection(): THREE.Vector3 {
    const totalYaw = this.yaw + this.turretYaw;
    return new THREE.Vector3(
      -Math.sin(totalYaw) * Math.cos(this.turretPitch),
      Math.sin(this.turretPitch),
      -Math.cos(totalYaw) * Math.cos(this.turretPitch)
    ).normalize();
  }

  // ── Physics Update ───────────────────────────────────────────────────────────

  update(dt: number, getGroundHeight?: (x: number, z: number, excludeCollider?: RAPIER.Collider) => number): void {
    // Clamp dt to prevent large jumps from tab switching / stalls
    dt = Math.min(dt, 1 / 20);
    this._lastDt = dt;
    this.turretFireCooldown = Math.max(0, this.turretFireCooldown - dt);

    // Forward / right vectors from yaw
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // ── Visual Suspension (cosmetic only — actual Y handled by ground clamp) ─────
    // Measures how far each wheel is compressed vs rest, for visual bounce
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    for (let i = 0; i < 4; i++) {
      const wo = WHEEL_OFFSETS[i];
      this._worldWheelPos.set(
        this.position.x + cos * wo.x - sin * wo.z,
        this.position.y + wo.y,
        this.position.z + sin * wo.x + cos * wo.z,
      );

      let gY = this.position.y - WARTHOG.GROUND_CLEARANCE; // default: flat ground at vehicle base
      if (getGroundHeight) {
        gY = getGroundHeight(this._worldWheelPos.x, this._worldWheelPos.z, this.collider);
      }

      // idealWheelY = where the wheel center should be if touching ground
      // restWheelY  = where the wheel center actually is in world space
      const idealWheelY = gY + WARTHOG.WHEEL_RADIUS;
      const restWheelY  = this.position.y + WHEEL_Y; // WHEEL_Y = WHEEL_RADIUS - GROUND_CLEARANCE
      const rawOffset   = idealWheelY - restWheelY;  // positive = terrain is above expected → compression

      const targetOffset = Math.max(
        -WARTHOG.SUSPENSION_TRAVEL * 0.9,
        Math.min(WARTHOG.SUSPENSION_TRAVEL * 0.5, rawOffset),
      );
      this.suspensionHeights[i] += (targetOffset - this.suspensionHeights[i]) * Math.min(1, dt * 15);
    }

    // ── Movement (based on previous-frame grounded state to avoid oscillation) ──
    // Use airTime hysteresis: treat vehicle as grounded if recently touched ground
    const wasGrounded = this.airTime < 0.12;

    const speed = this.velocity.length();
    const fwdSpeed = this.velocity.dot(this._fwd);

    if (wasGrounded) {
      // Steering smoothing (Halo-style: more responsive at low speed)
      const steerReduceFactor = Math.max(0.25, 1 - speed / (WARTHOG.MAX_SPEED * 1.8));
      this.currentSteering += (this.steering - this.currentSteering) * Math.min(1, dt * WARTHOG.STEER_RATE * steerReduceFactor * 4);

      // Apply steering → angular velocity
      const turnInput = this.currentSteering * steerReduceFactor * (fwdSpeed < 0 ? -1 : 1);
      const targetAngularVel = turnInput * WARTHOG.STEER_RATE * (speed > 0.1 ? 1 : 0);
      this.angularVelocity += (targetAngularVel - this.angularVelocity) * Math.min(1, dt * 8);

      // Braking
      if (this.braking || this.handbrake) {
        const brakeForce = WARTHOG.BRAKE_FORCE * (this.handbrake ? 2 : 1);
        const decel = Math.min(speed, brakeForce * dt);
        if (speed > 0.01) {
          this.velocity.addScaledVector(this.velocity.clone().normalize(), -decel);
        }
      }

      // Engine force
      if (!this.braking) {
        const maxSpeed = this.throttle > 0 ? WARTHOG.MAX_SPEED : WARTHOG.MAX_REVERSE_SPEED;
        const currentFwdSpeed = Math.abs(fwdSpeed);
        if (Math.abs(this.throttle) > 0.01 && currentFwdSpeed < maxSpeed) {
          const powerFactor = 1 - (currentFwdSpeed / maxSpeed) * 0.6;
          this.velocity.addScaledVector(this._fwd, this.throttle * WARTHOG.ACCELERATION * dt * powerFactor);
        }
      }

      // Natural drag
      if (speed > 0.01) {
        this.velocity.addScaledVector(this.velocity.clone().normalize(), -Math.min(speed, WARTHOG.DRAG * dt));
      }

      // Lateral friction — frame-rate independent via exponential decay.
      // gripCoeff ≈ 50 gives tight grip; ≈ 2 gives drifty handbrake feel.
      const gripCoeff = this.handbrake ? 2.0 : 50.0;
      const lateralSpeed = this.velocity.dot(this._right);
      const lateralFactor = 1.0 - Math.exp(-gripCoeff * dt);
      this.velocity.addScaledVector(this._right, -lateralSpeed * lateralFactor);

      // Don't let the vehicle sink through ground while grounded
      if (this.velocity.y < 0) this.velocity.y = 0;

    } else {
      // Airborne: gravity, minimal air drag
      this.velocity.y -= 9.81 * dt;
      this.velocity.x *= Math.exp(-0.3 * dt);
      this.velocity.z *= Math.exp(-0.3 * dt);
      // Angular damping in the air
      this.angularVelocity *= Math.exp(-2.0 * dt);
    }

    // ── Integrate Position ───────────────────────────────────────────────────────
    this.yaw += this.angularVelocity * dt;
    this._nextPos.copy(this.position).addScaledVector(this.velocity, dt);

    // ── Ground Clamping — ALWAYS applied, not conditional on grounded state ──────
    // This prevents the oscillation where vehicle falls through ground then snaps back.
    let onGround = false;
    if (getGroundHeight) {
      const gY = getGroundHeight(this._nextPos.x, this._nextPos.z, this.collider);
      const minY = gY + WARTHOG.GROUND_CLEARANCE;
      // Snap to ground if within 0.05m — prevents floating/oscillation
      if (this._nextPos.y < minY + 0.05) {
        if (this.velocity.y < -3 && this._nextPos.y < minY) {
          playVehicleImpact(Math.min(1, -this.velocity.y / 10));
        }
        this._nextPos.y = minY;
        this.velocity.y = 0;
        onGround = true;
      }
    } else {
      // Flat ground fallback
      if (this._nextPos.y < WARTHOG.GROUND_CLEARANCE + 0.05) {
        this._nextPos.y = WARTHOG.GROUND_CLEARANCE;
        this.velocity.y = 0;
        onGround = true;
      }
    }

    // Update airtime counter
    this.airTime = onGround ? 0 : this.airTime + dt;

    this.position.copy(this._nextPos);

    // ── Visual Roll ──────────────────────────────────────────────────────────────
    const targetRoll = -this.angularVelocity * Math.min(speed / 8, 1) * 0.22;
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1, dt * 5);

    const targetPitch = -this.throttle * 0.04 + (this.braking ? 0.06 : 0);
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, dt * 4);

    // ── Update Kinematic Body ────────────────────────────────────────────────────
    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y + WARTHOG.HALF_HEIGHT,
      z: this.position.z,
    });
    this._quatFromYaw.setFromEuler(new THREE.Euler(0, this.yaw, 0));
    this.body.setNextKinematicRotation(this._quatFromYaw);

    // ── Update Mesh ──────────────────────────────────────────────────────────────
    this.updateMeshFromState();
  }

  private updateMeshFromState(): void {
    this.mesh.position.copy(this.position);

    // Full rotation: yaw + visual roll + pitch
    this._euler.set(this.pitchAngle, this.yaw, this.rollAngle);
    this.mesh.quaternion.setFromEuler(this._euler);

    // Wheel spin: physically correct omega = v/r, delta_angle = omega * dt
    // Recompute fwd here because applyNetState may not have called update()
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const fwdSpeed = this.velocity.x * fx + this.velocity.z * fz;
    const spinAngle = (fwdSpeed / WARTHOG.WHEEL_RADIUS) * this._lastDt;
    updateWarthogWheels(
      this.mesh,
      spinAngle,
      this.currentSteering * (WARTHOG.MAX_STEER_ANGLE * 0.6),
      this.suspensionHeights as [number, number, number, number],
    );

    // Update turret orientation
    const gunMount = (this.mesh as any).gunMount as THREE.Group;
    const pitchGroup = (this.mesh as any).gunPitchGroup as THREE.Group;
    if (gunMount) gunMount.rotation.y = this.turretYaw;
    if (pitchGroup) pitchGroup.rotation.x = -this.turretPitch;
  }

  /**
   * Apply damage and return whether vehicle is destroyed.
   */
  applyDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  getNetState(): VehicleNetState {
    return {
      id: this.id,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      roll: this.rollAngle,
      pitch: this.pitchAngle,
      velocityX: this.velocity.x,
      velocityZ: this.velocity.z,
      turretYaw: this.turretYaw,
      turretPitch: this.turretPitch,
      occupancy: { ...this.occupancy },
      health: this.health,
      timestamp: performance.now(),
    };
  }

  /**
   * Apply network state update (for remote vehicles).
   */
  applyNetState(state: VehicleNetState): void {
    this.position.set(state.position.x, state.position.y, state.position.z);
    this.yaw = state.yaw;
    this.rollAngle = state.roll;
    this.pitchAngle = state.pitch;
    this.velocity.set(state.velocityX, 0, state.velocityZ);
    this.turretYaw = state.turretYaw;
    this.turretPitch = state.turretPitch;
    this.occupancy = { ...state.occupancy };
    this.health = state.health;
    this.updateMeshFromState();
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  getYaw(): number {
    return this.yaw;
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  getVelocity(): { x: number; z: number } {
    return { x: this.velocity.x, z: this.velocity.z };
  }

  dispose(physics: PhysicsWorld): void {
    physics.world.removeCollider(this.collider, false);
    physics.world.removeRigidBody(this.body);
  }
}
