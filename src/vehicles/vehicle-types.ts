/**
 * Vehicle type definitions for the Warthog multiplayer vehicle system.
 */

export type VehicleSeatId = 'driver' | 'passenger1' | 'passenger2' | 'passenger3' | 'gunner';

export const SEAT_ORDER: VehicleSeatId[] = ['driver', 'passenger1', 'passenger2', 'passenger3', 'gunner'];

/** Warthog dimensions (units) */
export const WARTHOG = {
  HALF_WIDTH: 1.2,
  HALF_HEIGHT: 0.55,
  HALF_LENGTH: 2.1,
  WHEEL_RADIUS: 0.45,
  WHEEL_WIDTH: 0.28,
  /** Ground clearance from chassis bottom */
  GROUND_CLEARANCE: 0.52,
  /** Full height from ground to roof */
  FULL_HEIGHT: 1.6,
  /** Max speed in units/sec */
  MAX_SPEED: 22,
  /** Reverse max speed */
  MAX_REVERSE_SPEED: 8,
  /** Engine acceleration (units/sec²) */
  ACCELERATION: 18,
  /** Braking deceleration */
  BRAKE_FORCE: 32,
  /** Natural drag when no input */
  DRAG: 4,
  /** Steering rate (rad/sec) */
  STEER_RATE: 2.2,
  /** Max steer angle at full turn */
  MAX_STEER_ANGLE: Math.PI / 5,
  /** Speed at which steering starts reducing */
  STEER_REDUCE_SPEED: 10,
  /** Suspension rest length */
  SUSPENSION_REST: 0.42,
  /** Suspension travel (above/below rest) */
  SUSPENSION_TRAVEL: 0.22,
  /** Spring stiffness (visual only) */
  SPRING_K: 18,
  /** Damper (visual only) */
  DAMPER: 6,
  /** Interaction radius — how close player must be to enter */
  ENTER_RADIUS: 3.5,
  /** Health */
  MAX_HEALTH: 500,
  /** Turret horizontal range (rad each side from vehicle forward) */
  TURRET_YAW_RANGE: Math.PI * 0.8,
  /** Turret pitch range */
  TURRET_PITCH_MIN: -0.15,
  TURRET_PITCH_MAX: 0.55,
  /** Gun fire rate (shots/sec) */
  GUN_FIRE_RATE: 6,
  /** Gun damage per shot */
  GUN_DAMAGE: 18,
  /** Gun range */
  GUN_RANGE: 80,
} as const;

/** Seat positions relative to vehicle center (local space) */
export const SEAT_POSITIONS: Record<VehicleSeatId, { x: number; y: number; z: number }> = {
  driver:      { x: -0.65, y: 0.7,  z:  0.55 },
  passenger1:  { x:  0.65, y: 0.7,  z:  0.55 },
  passenger2:  { x: -0.65, y: 0.7,  z: -0.4  },
  passenger3:  { x:  0.65, y: 0.7,  z: -0.4  },
  gunner:      { x:  0.0,  y: 1.05, z: -1.1  },
};

/** Camera offsets relative to seat (third-person driver, first-person others) */
export const SEAT_CAMERA_OFFSETS: Record<VehicleSeatId, { x: number; y: number; z: number }> = {
  driver:      { x: 0,    y: 1.5,  z:  4.2 }, // behind + above
  passenger1:  { x: 0.65, y: 0.85, z:  0.55 },
  passenger2:  { x:-0.65, y: 0.85, z: -0.4  },
  passenger3:  { x: 0.65, y: 0.85, z: -0.4  },
  gunner:      { x: 0,    y: 0.5,  z: -0.2  }, // first-person at gun
};

export interface VehicleOccupancy {
  driver:     string | null;
  passenger1: string | null;
  passenger2: string | null;
  passenger3: string | null;
  gunner:     string | null;
}

export function emptyOccupancy(): VehicleOccupancy {
  return { driver: null, passenger1: null, passenger2: null, passenger3: null, gunner: null };
}

export function getOccupantSeat(occ: VehicleOccupancy, playerId: string): VehicleSeatId | null {
  for (const seat of SEAT_ORDER) {
    if (occ[seat] === playerId) return seat;
  }
  return null;
}

export function getFirstEmptySeat(occ: VehicleOccupancy): VehicleSeatId | null {
  for (const seat of SEAT_ORDER) {
    if (occ[seat] === null) return seat;
  }
  return null;
}

export function countOccupants(occ: VehicleOccupancy): number {
  return SEAT_ORDER.filter(s => occ[s] !== null).length;
}

/** Full vehicle state (networked) */
export interface VehicleNetState {
  id: string;
  position: { x: number; y: number; z: number };
  yaw: number;
  /** Visual roll (radians) */
  roll: number;
  /** Visual pitch (radians) */
  pitch: number;
  velocityX: number;
  velocityZ: number;
  turretYaw: number;
  turretPitch: number;
  occupancy: VehicleOccupancy;
  health: number;
  timestamp: number;
}

/** Spawn definition from config.json */
export interface VehicleDef {
  id?: string;
  type: 'warthog';
  x: number;
  y?: number;
  z: number;
  rotation?: number; // initial yaw
}

/** Physics constants for DynamicRayCastVehicleController */
export const WARTHOG_PHYSICS = {
  MASS:                      2000,   // kg — used for collider density
  ENGINE_FORCE:              5500,   // N per driven wheel (AWD)
  MAX_BRAKE_FORCE:           3500,   // N per wheel (service brakes)
  HANDBRAKE_FORCE:           6000,   // N rear wheels only (drift)
  //
  // IMPORTANT: Rapier's DynamicRayCastVehicleController uses the same formula
  // as Bullet Physics: suspensionForce = stiffness * compression * chassis_mass
  // Stiffness and damping are therefore DIMENSIONLESS (not SI N/m or Ns/m).
  // The effective spring constant is stiffness * mass = 50 * 2000 = 100000 N/m.
  //
  SUSPENSION_STIFFNESS:       50,   // dimensionless (× chassis_mass = effective N/m)
  SUSPENSION_DAMPING_COMP:     4,   // compression damping (dimensionless, Bullet default ≈ 4.4)
  SUSPENSION_DAMPING_REL:      2,   // relaxation damping (dimensionless, Bullet default ≈ 2.3)
  SUSPENSION_MAX_FORCE:   100000,   // N per wheel (hard cap)
  SUSPENSION_REST_LENGTH:    0.25,  // m — distance from connection point to wheel center at rest
  SUSPENSION_MAX_TRAVEL:     0.70,  // m — total ray = REST+TRAVEL = 0.95 > connection_Y = 0.70
  FRICTION_SLIP:              1.5,  // forward traction
  SIDE_FRICTION:              1.0,  // lateral grip multiplier
  LINEAR_DAMPING:            0.05,  // air/rolling drag on body
  ANGULAR_DAMPING:           0.5,   // yaw damping
} as const;

/**
 * Wheel connection points in chassis body local space.
 *
 * Body spawns at world Y = GROUND_CLEARANCE + HALF_HEIGHT + 0.05 = 0.52 + 0.55 + 0.05 = 1.12
 * At rest, wheel center must be at WHEEL_RADIUS = 0.45 above ground.
 * connection_world_Y = WHEEL_RADIUS + REST_LENGTH = 0.45 + 0.25 = 0.70
 * connection_local_Y = connection_world_Y - body_world_Y = 0.70 - 1.12 = -0.42
 *
 * Total ray = REST_LENGTH + MAX_TRAVEL = 0.95, starting at 0.70 → reaches -0.25 (below ground) ✓
 */
export const WHEEL_CONNECTION_POINTS = [
  { x: -1.1, y: -0.42, z:  1.18 }, // FL
  { x:  1.1, y: -0.42, z:  1.18 }, // FR
  { x: -1.1, y: -0.42, z: -1.0  }, // RL
  { x:  1.1, y: -0.42, z: -1.0  }, // RR
] as const;
