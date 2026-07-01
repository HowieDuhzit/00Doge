/**
 * Vehicle — Warthog physics using Rapier DynamicRayCastVehicleController.
 *
 * Physics model:
 * - Dynamic rigid body (full collision response)
 * - DynamicRayCastVehicleController (spring-damper suspension, tire friction)
 * - Per-wheel engine force, braking, steering
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../core/physics-world';
import {
  WARTHOG,
  WARTHOG_PHYSICS,
  WHEEL_CONNECTION_POINTS,
  SEAT_ORDER,
  emptyOccupancy,
  type VehicleOccupancy,
  type VehicleSeatId,
  type VehicleNetState,
} from './vehicle-types';
import { buildWarthogMesh, updateWarthogWheels } from './warthog-mesh';
import { playVehicleImpact } from '../audio/vehicle-sounds';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractYawFromQuat(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function quatFromYaw(yaw: number): { x: number; y: number; z: number; w: number } {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export class Vehicle {
  readonly id: string;
  health: number;
  readonly maxHealth = WARTHOG.MAX_HEALTH;

  // Three.js visual
  mesh: THREE.Group;

  // Physics
  private body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private controller: RAPIER.DynamicRayCastVehicleController;
  private physics: PhysicsWorld;

  // World-space state (read back from physics body each frame)
  private position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private rollAngle = 0;
  private pitchAngle = 0;
  private _speed = 0;
  private _lastDt = 1 / 60;
  private _debugStep = 0;

  // Cached suspension lengths for mesh update (populated in update(), stale for remote)
  private _suspLengths: number[] = [
    WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH,
    WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH,
    WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH,
    WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH,
  ];

  // Input state (set by VehicleManager each frame)
  private throttle = 0;
  private steering = 0;
  private currentSteering = 0;
  private braking = false;
  private handbrake = false;

  // Turret
  turretYaw = 0;
  turretPitch = 0;
  turretFireCooldown = 0;

  // Occupancy
  occupancy: VehicleOccupancy;

  // Reusable Euler for mesh rotation
  private readonly _euler = new THREE.Euler(0, 0, 0, 'YXZ');

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

    const RAPIER = physics.rapier;
    const startQuat = quatFromYaw(startYaw);

    // Dynamic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, startY + WARTHOG.HALF_HEIGHT + 0.05, startZ)
      .setRotation(startQuat)
      .setLinearDamping(WARTHOG_PHYSICS.LINEAR_DAMPING)
      .setAngularDamping(WARTHOG_PHYSICS.ANGULAR_DAMPING);
    this.body = physics.world.createRigidBody(bodyDesc);

    // Collider with density derived from target mass
    const bodyVolume = 2 * WARTHOG.HALF_WIDTH * 2 * WARTHOG.HALF_HEIGHT * 2 * WARTHOG.HALF_LENGTH;
    const colDesc = RAPIER.ColliderDesc
      .cuboid(WARTHOG.HALF_WIDTH, WARTHOG.HALF_HEIGHT, WARTHOG.HALF_LENGTH)
      .setFriction(0.5)
      .setRestitution(0.1)
      .setDensity(WARTHOG_PHYSICS.MASS / bodyVolume);
    this.collider = physics.world.createCollider(colDesc, this.body);

    // Vehicle controller
    this.controller = physics.world.createVehicleController(this.body);

    // Explicitly set axis conventions: Y=up (1), Z=forward (2)
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;

    for (let i = 0; i < 4; i++) {
      const cp = WHEEL_CONNECTION_POINTS[i];
      this.controller.addWheel(
        { x: cp.x, y: cp.y, z: cp.z },  // chassis connection point (local)
        { x: 0, y: -1, z: 0 },           // suspension direction (down)
        { x: 1, y: 0, z: 0 },            // axle axis (X = rolling axis)
        WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH,
        WARTHOG.WHEEL_RADIUS,
      );
      this.controller.setWheelSuspensionStiffness(i,  WARTHOG_PHYSICS.SUSPENSION_STIFFNESS);
      this.controller.setWheelSuspensionCompression(i, WARTHOG_PHYSICS.SUSPENSION_DAMPING_COMP);
      this.controller.setWheelSuspensionRelaxation(i,  WARTHOG_PHYSICS.SUSPENSION_DAMPING_REL);
      this.controller.setWheelMaxSuspensionForce(i,    WARTHOG_PHYSICS.SUSPENSION_MAX_FORCE);
      this.controller.setWheelMaxSuspensionTravel(i,   WARTHOG_PHYSICS.SUSPENSION_MAX_TRAVEL);
      this.controller.setWheelFrictionSlip(i,          WARTHOG_PHYSICS.FRICTION_SLIP);
      this.controller.setWheelSideFrictionStiffness(i, WARTHOG_PHYSICS.SIDE_FRICTION);
    }

    this.updateMeshFromState();
  }

  // ── Input setters (called by VehicleManager from InputManager) ──────────────

  setThrottle(v: number): void { this.throttle = Math.max(-1, Math.min(1, v)); }
  setSteering(v: number): void { this.steering = Math.max(-1, Math.min(1, v)); }
  setBraking(v: boolean): void { this.braking = v; }
  setHandbrake(v: boolean): void { this.handbrake = v; }

  setTurretAim(yaw: number, pitch: number): void {
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
    const out = new THREE.Vector3();
    const mountLocal = { x: 0, y: 1.23, z: -1.1 };
    const vcos = Math.cos(this.yaw), vsin = Math.sin(this.yaw);
    out.x = this.position.x + vcos * mountLocal.x - vsin * mountLocal.z;
    out.z = this.position.z + vsin * mountLocal.x + vcos * mountLocal.z;
    out.y = this.position.y + mountLocal.y;
    out.addScaledVector(this.getGunDirection(), 0.6);
    return out;
  }

  /**
   * Get gun fire direction in world space.
   */
  getGunDirection(): THREE.Vector3 {
    const totalYaw = this.yaw + this.turretYaw;
    return new THREE.Vector3(
      Math.sin(totalYaw) * Math.cos(this.turretPitch),
      Math.sin(this.turretPitch),
      Math.cos(totalYaw) * Math.cos(this.turretPitch)
    ).normalize();
  }

  // ── Physics Step (called inside fixed loop, before world.step) ───────────────

  /**
   * Apply vehicle controller forces and read state back.
   * MUST be called once per fixed physics step, just before physics.world.step().
   * Calling it at render rate (variable dt) desynchronises forces from integration.
   */
  physicsStep(dt: number): void {
    // Apply wheel inputs
    const steerAngle = this.currentSteering * WARTHOG.MAX_STEER_ANGLE;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelEngineForce(i, this.throttle * WARTHOG_PHYSICS.ENGINE_FORCE);

      let brakeF = 0;
      if (this.braking) brakeF = WARTHOG_PHYSICS.MAX_BRAKE_FORCE;
      if (this.handbrake && i >= 2) brakeF = WARTHOG_PHYSICS.HANDBRAKE_FORCE;
      this.controller.setWheelBrake(i, brakeF);

      if (i < 2) this.controller.setWheelSteering(i, -steerAngle);
    }

    // Raycast suspension + apply forces to rigid body
    this.controller.updateVehicle(
      dt,
      undefined,
      undefined,
      (c) => c.handle !== this.collider.handle,
    );

    // --- DEBUG: log every 2 seconds to diagnose suspension issues ---
    this._debugStep++;
    if (this._debugStep % 120 === 1) {
      const t0 = this.body.translation();
      const contact0 = this.controller.wheelIsInContact(0);
      const suspLen0 = this.controller.wheelSuspensionLength(0);
      const suspForce0 = this.controller.wheelSuspensionForce(0);
      const hardPt0 = this.controller.wheelHardPoint(0);
      const contactPt0 = this.controller.wheelContactPoint(0);
      console.log(
        `[Vehicle ${this.id}] body.y=${t0.y.toFixed(3)}` +
        ` | w0: contact=${contact0}` +
        ` suspLen=${suspLen0?.toFixed(3) ?? 'N/A'}` +
        ` suspForce=${suspForce0?.toFixed(1) ?? 'N/A'}` +
        ` hardPt.y=${hardPt0?.y?.toFixed(3) ?? 'N/A'}` +
        ` contactPt.y=${contactPt0?.y?.toFixed(3) ?? 'N/A'}`,
      );
    }

    // Cache suspension lengths for visual wheel offsets
    for (let i = 0; i < 4; i++) {
      this._suspLengths[i] = this.controller.wheelSuspensionLength(i)
        ?? WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH;
    }

    // Read body state (position/velocity from previous world.step result)
    const t = this.body.translation();
    const prevVelY = this.velocity.y;
    this.position.set(t.x, t.y - WARTHOG.HALF_HEIGHT, t.z);

    const rot = this.body.rotation();
    this.yaw = extractYawFromQuat(rot);

    const v = this.body.linvel();
    this.velocity.set(v.x, v.y, v.z);
    this._speed = Math.sqrt(v.x * v.x + v.z * v.z);

    if (prevVelY < -3 && v.y > prevVelY * 0.5) {
      playVehicleImpact(Math.min(1, -prevVelY / 10));
    }
  }

  // ── Per-frame visual update ───────────────────────────────────────────────────

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this._lastDt = dt;
    this.turretFireCooldown = Math.max(0, this.turretFireCooldown - dt);

    // Smooth steering (more responsive at low speed)
    const speedFactor = Math.max(0.25, 1 - this._speed / (WARTHOG.MAX_SPEED * 1.8));
    this.currentSteering += (this.steering - this.currentSteering)
      * Math.min(1, dt * WARTHOG.STEER_RATE * speedFactor * 4);

    // Visual roll/pitch (cosmetic lean)
    const angVel = this.body.angvel();
    const targetRoll = -angVel.y * Math.min(this._speed / 8, 1) * 0.22;
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1, dt * 5);

    const targetPitch = -this.throttle * 0.04 + (this.braking ? 0.06 : 0);
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, dt * 4);

    this.updateMeshFromState();
  }

  private updateMeshFromState(): void {
    this.mesh.position.copy(this.position);

    // Full rotation: yaw + visual roll + pitch
    this._euler.set(this.pitchAngle, this.yaw, this.rollAngle);
    this.mesh.quaternion.setFromEuler(this._euler);

    // Wheel spin from forward speed
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fwdSpeed = this.velocity.x * fx + this.velocity.z * fz;
    const spinAngle = (fwdSpeed / WARTHOG.WHEEL_RADIUS) * this._lastDt;

    // Suspension offsets from cached controller lengths (compression = positive)
    const suspOffsets: [number, number, number, number] = [
      WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH - this._suspLengths[0],
      WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH - this._suspLengths[1],
      WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH - this._suspLengths[2],
      WARTHOG_PHYSICS.SUSPENSION_REST_LENGTH - this._suspLengths[3],
    ];

    updateWarthogWheels(
      this.mesh,
      spinAngle,
      this.currentSteering * (WARTHOG.MAX_STEER_ANGLE * 0.6),
      suspOffsets,
    );

    // Turret orientation
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
   * Teleports the dynamic body to the authoritative position; physics handles the rest.
   */
  applyNetState(state: VehicleNetState): void {
    const bodyY = state.position.y + WARTHOG.HALF_HEIGHT;
    this.body.setTranslation({ x: state.position.x, y: bodyY, z: state.position.z }, true);
    const q = quatFromYaw(state.yaw);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: state.velocityX, y: 0, z: state.velocityZ }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.position.set(state.position.x, state.position.y, state.position.z);
    this.yaw = state.yaw;
    this.rollAngle = state.roll;
    this.pitchAngle = state.pitch;
    this.velocity.set(state.velocityX, 0, state.velocityZ);
    this._speed = Math.sqrt(state.velocityX ** 2 + state.velocityZ ** 2);
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
    return this._speed;
  }

  getVelocity(): { x: number; z: number } {
    return { x: this.velocity.x, z: this.velocity.z };
  }

  dispose(): void {
    this.physics.world.removeVehicleController(this.controller);
    this.physics.world.removeCollider(this.collider, false);
    this.physics.world.removeRigidBody(this.body);
  }
}
