/**
 * Procedural Warthog (M12 LRV) 3D mesh.
 * Military jeep with mounted gun — inspired by Halo Combat Evolved's M12 Warthog.
 * All geometry built from Three.js primitives and BufferGeometry.
 */

import * as THREE from 'three';
import { WARTHOG } from './vehicle-types';

// ─── Materials ────────────────────────────────────────────────────────────────

const BODY_COLOR    = 0x6b7c4a;   // Olive drab
const DARK_METAL    = 0x2a2a2a;
const MID_METAL     = 0x3d3d3d;
const LIGHT_METAL   = 0x888888;
const TIRE_COLOR    = 0x1a1a1a;
const RIM_COLOR     = 0x555555;
const GLASS_COLOR   = 0x88aacc;
const GUN_COLOR     = 0x222222;
const SEAT_COLOR    = 0x1a1a1a;
const ORANGE_LIGHT  = 0xff8800;
const WHITE_LIGHT   = 0xffffff;

function makeMat(color: number, metalness = 0.3, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

const matBody   = makeMat(BODY_COLOR,   0.2, 0.8);
const matDark   = makeMat(DARK_METAL,   0.6, 0.5);
const matMid    = makeMat(MID_METAL,    0.7, 0.4);
const matLight  = makeMat(LIGHT_METAL,  0.8, 0.3);
const matTire   = makeMat(TIRE_COLOR,   0.0, 0.9);
const matRim    = makeMat(RIM_COLOR,    0.8, 0.4);
const matGlass  = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, transparent: true, opacity: 0.35, metalness: 0.1, roughness: 0.0 });
const matGun    = makeMat(GUN_COLOR,    0.9, 0.2);
const matSeat   = makeMat(SEAT_COLOR,   0.1, 0.9);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, color?: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = color !== undefined ? makeMat(color) : matBody;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, segs = 16, x = 0, y = 0, z = 0, rotX = 0, mat?: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rt, rb, h, segs);
  const mesh = new THREE.Mesh(geo, mat ?? matBody);
  mesh.position.set(x, y, z);
  if (rotX) mesh.rotation.x = rotX;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function tube(outer: number, inner: number, h: number, segs = 16): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, matTire);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = -h / 2;
  return mesh;
}

// ─── Wheel Assembly ───────────────────────────────────────────────────────────

export function buildWheel(): THREE.Group {
  const g = new THREE.Group();

  // Tire
  const tireGeo = new THREE.CylinderGeometry(
    WARTHOG.WHEEL_RADIUS, WARTHOG.WHEEL_RADIUS, WARTHOG.WHEEL_WIDTH, 20
  );
  const tire = new THREE.Mesh(tireGeo, matTire);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);

  // Rim
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, WARTHOG.WHEEL_WIDTH + 0.02, 8);
  const rim = new THREE.Mesh(rimGeo, matRim);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);

  // Hub cap
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12);
  const hub = new THREE.Mesh(hubGeo, matLight);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = WARTHOG.WHEEL_WIDTH / 2 + 0.03;
  g.add(hub);

  // 5 lug nuts
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const lug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.07, 6),
      matLight
    );
    lug.rotation.z = Math.PI / 2;
    lug.position.x = WARTHOG.WHEEL_WIDTH / 2 + 0.05;
    lug.position.y = Math.sin(angle) * 0.18;
    lug.position.z = Math.cos(angle) * 0.18;
    g.add(lug);
  }

  // Sidewall tread bumps (8 tread blocks around circumference)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(WARTHOG.WHEEL_WIDTH - 0.02, 0.06, 0.1),
      matTire
    );
    tread.position.y = Math.sin(angle) * (WARTHOG.WHEEL_RADIUS - 0.02);
    tread.position.z = Math.cos(angle) * (WARTHOG.WHEEL_RADIUS - 0.02);
    tread.rotation.x = angle;
    g.add(tread);
  }

  return g;
}

// ─── Seat ─────────────────────────────────────────────────────────────────────

function buildSeat(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Cushion
  g.add(box(0.48, 0.1, 0.48, 0, 0, 0, SEAT_COLOR));
  // Backrest
  const back = box(0.48, 0.45, 0.1, 0, 0.27, -0.2, SEAT_COLOR);
  back.material = matSeat;
  g.add(back);
  return g;
}

// ─── Mounted Gun (M41 LAAG) ───────────────────────────────────────────────────

export function buildMountedGun(): THREE.Group {
  const g = new THREE.Group(); // This group rotates for yaw

  // Pivot base (stays fixed on vehicle)
  const base = box(0.55, 0.15, 0.55, 0, 0, 0, MID_METAL);
  base.material = matMid;
  g.add(base);

  // Rotation platform
  const platform = box(0.5, 0.1, 0.5, 0, 0.12, 0, DARK_METAL);
  platform.material = matDark;
  g.add(platform);

  // Pitch group (for vertical aim)
  const pitchGroup = new THREE.Group();
  pitchGroup.position.set(0, 0.17, 0);
  g.add(pitchGroup);

  // Gun mount arms
  const armL = box(0.06, 0.35, 0.06, -0.18, 0.17, 0, DARK_METAL);
  armL.material = matDark;
  pitchGroup.add(armL);
  const armR = box(0.06, 0.35, 0.06, 0.18, 0.17, 0, DARK_METAL);
  armR.material = matDark;
  pitchGroup.add(armR);

  // Triple barrel assembly (minigun style)
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.34, 0);
  pitchGroup.add(barrelGroup);

  // Three barrels in a cluster
  const barrelPositions = [
    { x: 0, z: 0.06 },
    { x: 0.052, z: -0.03 },
    { x: -0.052, z: -0.03 },
  ];
  for (const bp of barrelPositions) {
    const barrel = cyl(0.025, 0.025, 0.9, 8, bp.x, 0, bp.z + 0.45, Math.PI / 2, matGun);
    barrel.rotation.z = 0;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(bp.x, 0, bp.z);
    barrelGroup.add(barrel);

    // Muzzle flash guard
    const guard = cyl(0.04, 0.04, 0.04, 8, bp.x, 0, bp.z, 0, matDark);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(bp.x, 0, bp.z);
    barrelGroup.add(guard);
  }

  // Barrel shroud
  const shroud = cyl(0.085, 0.085, 0.7, 12, 0, 0, 0.35, Math.PI / 2, matDark);
  barrelGroup.add(shroud);

  // Ammo box
  const ammoBox = box(0.25, 0.2, 0.35, 0.2, -0.05, -0.1, DARK_METAL);
  ammoBox.material = matDark;
  pitchGroup.add(ammoBox);

  // Ammo belt (visual)
  const belt = box(0.06, 0.18, 0.06, 0.13, -0.02, 0.05, LIGHT_METAL);
  belt.material = matLight;
  pitchGroup.add(belt);

  // Gunner shield
  const shield = box(0.55, 0.4, 0.03, 0, 0.28, -0.22, MID_METAL);
  shield.material = matMid;
  pitchGroup.add(shield);

  // Store reference to pitch group for animation
  (g as any).pitchGroup = pitchGroup;
  (g as any).barrelGroup = barrelGroup;

  return g;
}

// ─── Full Warthog Body ────────────────────────────────────────────────────────

export function buildWarthogMesh(): THREE.Group {
  const root = new THREE.Group();
  root.castShadow = true;

  // ── Chassis / Frame ──────────────────────────────────────────────────────────
  // Main underbody
  const underbody = box(2.0, 0.22, 3.8, 0, 0, 0);
  underbody.material = matDark;
  root.add(underbody);

  // ── Body Panels ──────────────────────────────────────────────────────────────
  // Center body (cabin floor + engine)
  root.add(box(1.9, 0.35, 2.0, 0, 0.27, 0.35));

  // Hood (front, slightly higher)
  const hood = box(1.7, 0.25, 1.2, 0, 0.38, 1.35);
  hood.rotation.x = -0.07; // slight tilt
  root.add(hood);

  // Windshield frame
  const windFrame = box(1.5, 0.08, 0.08, 0, 0.82, 0.58);
  windFrame.material = matDark;
  root.add(windFrame);

  // Windshield glass
  const windGlass = box(1.35, 0.38, 0.06, 0, 0.72, 0.56);
  windGlass.material = matGlass;
  root.add(windGlass);

  // Rear body panel (gun mount area)
  root.add(box(1.9, 0.42, 1.2, 0, 0.31, -0.95));

  // Rear deck (flat platform for gun)
  root.add(box(1.9, 0.12, 1.4, 0, 0.6, -1.05));

  // ── Roll Cage / Frame Bars ───────────────────────────────────────────────────
  const rollBarMat = matDark;

  // A-pillars (windshield supports)
  for (const sx of [-0.68, 0.68]) {
    const pillar = box(0.07, 0.58, 0.07, sx, 0.78, 0.56);
    pillar.material = rollBarMat;
    root.add(pillar);
  }

  // B-pillars (cabin sides)
  for (const sx of [-0.7, 0.7]) {
    const bpillar = box(0.07, 0.52, 0.07, sx, 0.75, -0.12);
    bpillar.material = rollBarMat;
    root.add(bpillar);
  }

  // Roof bar (over cabin)
  const roofBar = box(1.5, 0.07, 0.07, 0, 1.06, 0.22);
  roofBar.material = rollBarMat;
  root.add(roofBar);

  // Rear roll bar (tall arch over gun mount)
  const rearRollLeft = box(0.07, 0.75, 0.07, -0.55, 0.98, -0.85);
  rearRollLeft.material = rollBarMat;
  root.add(rearRollLeft);
  const rearRollRight = box(0.07, 0.75, 0.07, 0.55, 0.98, -0.85);
  rearRollRight.material = rollBarMat;
  root.add(rearRollRight);
  const rearRollTop = box(1.17, 0.07, 0.07, 0, 1.37, -0.85);
  rearRollTop.material = rollBarMat;
  root.add(rearRollTop);

  // Side rail bars
  for (const sx of [-0.72, 0.72]) {
    const sideRail = box(0.055, 0.055, 1.25, sx, 1.08, 0.05);
    sideRail.material = rollBarMat;
    root.add(sideRail);
  }

  // ── Side Panels ──────────────────────────────────────────────────────────────
  for (const sx of [-0.98, 0.98]) {
    // Door panel
    root.add(box(0.08, 0.38, 0.95, sx, 0.7, 0.25));
    // Running board / step
    const step = box(0.25, 0.06, 1.1, sx * 1.05, 0.24, 0.22);
    step.material = matDark;
    root.add(step);
  }

  // ── Front Bumper & Grille ────────────────────────────────────────────────────
  const bumper = box(2.1, 0.18, 0.12, 0, 0.22, 1.98);
  bumper.material = matDark;
  root.add(bumper);

  // Grille
  const grille = box(1.5, 0.4, 0.06, 0, 0.42, 1.96);
  grille.material = matDark;
  root.add(grille);

  // Grille slats (horizontal bars)
  for (let i = 0; i < 5; i++) {
    const slat = box(1.48, 0.04, 0.04, 0, 0.28 + i * 0.08, 1.97);
    slat.material = matMid;
    root.add(slat);
  }

  // Headlights
  for (const sx of [-0.6, 0.6]) {
    const headlight = box(0.22, 0.14, 0.06, sx, 0.43, 1.97);
    headlight.material = new THREE.MeshStandardMaterial({ color: WHITE_LIGHT, emissive: WHITE_LIGHT, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.1 });
    root.add(headlight);
    // Housing
    const housing = box(0.26, 0.18, 0.04, sx, 0.43, 1.94);
    housing.material = matDark;
    root.add(housing);
  }

  // Winch / front guard
  const frontGuard = box(2.0, 0.06, 0.06, 0, 0.42, 2.02);
  frontGuard.material = matDark;
  root.add(frontGuard);

  // ── Rear Bumper & Spare Tire ─────────────────────────────────────────────────
  const rearBumper = box(2.1, 0.18, 0.12, 0, 0.22, -1.98);
  rearBumper.material = matDark;
  root.add(rearBumper);

  // Spare tire (on rear)
  const spareTire = buildWheel();
  spareTire.scale.set(0.85, 0.85, 0.85);
  spareTire.rotation.z = Math.PI / 2;
  spareTire.rotation.y = Math.PI / 2;
  spareTire.position.set(0, 0.6, -1.92);
  root.add(spareTire);

  // Tow hook
  const towHook = box(0.12, 0.12, 0.22, 0, 0.18, -2.04);
  towHook.material = matDark;
  root.add(towHook);

  // ── Wheel Hubs / Fenders ─────────────────────────────────────────────────────
  const fenderPositions = [
    { x: -1.0, z:  1.18 }, // front-left
    { x:  1.0, z:  1.18 }, // front-right
    { x: -1.0, z: -1.0  }, // rear-left
    { x:  1.0, z: -1.0  }, // rear-right
  ];

  for (const fp of fenderPositions) {
    const fender = box(0.3, 0.2, 0.65, fp.x, 0.35, fp.z);
    fender.material = matBody;
    root.add(fender);

    // Fender arch
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10, 1, true, 0, Math.PI),
      matBody
    );
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI;
    arch.position.set(fp.x, 0.42, fp.z);
    root.add(arch);
  }

  // ── Wheels ───────────────────────────────────────────────────────────────────
  // 4 wheels + axle stubs
  const wheelGroup = new THREE.Group();
  root.add(wheelGroup);

  const wheelDefs: { x: number; z: number; name: string }[] = [
    { x: -1.15, z:  1.18, name: 'fl' },
    { x:  1.15, z:  1.18, name: 'fr' },
    { x: -1.15, z: -1.0,  name: 'rl' },
    { x:  1.15, z: -1.0,  name: 'rr' },
  ];

  const wheels: THREE.Group[] = [];
  for (const wd of wheelDefs) {
    const w = buildWheel();
    w.position.set(wd.x, WARTHOG.GROUND_CLEARANCE - 0.05, wd.z);
    // Flip right-side wheels
    if (wd.x > 0) w.rotation.y = Math.PI;
    w.name = `wheel_${wd.name}`;
    wheelGroup.add(w);
    wheels.push(w);
  }
  (root as any).wheels = wheels;

  // ── Axle stubs ───────────────────────────────────────────────────────────────
  for (const wd of wheelDefs) {
    const stub = cyl(0.06, 0.06, 0.32, 8, wd.x * 0.85, WARTHOG.GROUND_CLEARANCE - 0.05, wd.z, 0, matDark);
    stub.rotation.z = Math.PI / 2;
    root.add(stub);
  }

  // ── Seats ────────────────────────────────────────────────────────────────────
  root.add(buildSeat(-0.65, 0.55, 0.55));   // driver
  root.add(buildSeat(0.65,  0.55, 0.55));   // passenger 1
  root.add(buildSeat(-0.65, 0.55, -0.4));   // passenger 2
  root.add(buildSeat(0.65,  0.55, -0.4));   // passenger 3

  // Steering wheel
  const steeringWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.02, 6, 16),
    matDark
  );
  steeringWheel.position.set(-0.65, 0.9, 0.32);
  steeringWheel.rotation.x = -Math.PI / 3;
  root.add(steeringWheel);

  // Steering column
  const column = cyl(0.025, 0.025, 0.35, 8, -0.65, 0.78, 0.25, 0, matDark);
  column.rotation.x = Math.PI / 3;
  root.add(column);

  // Dashboard
  const dash = box(1.45, 0.2, 0.35, 0, 0.8, 0.4);
  dash.material = matDark;
  root.add(dash);

  // ── Gun Mount ────────────────────────────────────────────────────────────────
  const gunMount = buildMountedGun();
  gunMount.position.set(0, 0.72, -1.1);
  root.add(gunMount);
  (root as any).gunMount = gunMount;
  (root as any).gunPitchGroup = (gunMount as any).pitchGroup;

  // Gunner standing platform / foot rest
  const platform = box(1.1, 0.08, 0.6, 0, 0.66, -1.0);
  platform.material = matDark;
  root.add(platform);

  // ── Exhaust Pipes ─────────────────────────────────────────────────────────────
  for (const sx of [-0.6, 0.6]) {
    const pipe = cyl(0.04, 0.04, 0.8, 8, sx, 0.3, -1.7, 0, matDark);
    pipe.rotation.x = Math.PI / 2;
    root.add(pipe);
    // Pipe end cap
    const cap = cyl(0.05, 0.04, 0.05, 8, sx, 0.3, -2.11, 0, matDark);
    cap.rotation.x = Math.PI / 2;
    root.add(cap);
  }

  // ── Fuel Jerry Cans ───────────────────────────────────────────────────────────
  for (const sx of [-0.85, 0.85]) {
    const can = box(0.14, 0.28, 0.2, sx, 0.74, -1.55, BODY_COLOR);
    can.material = makeMat(BODY_COLOR, 0.3, 0.7);
    root.add(can);
    const canCap = cyl(0.03, 0.03, 0.06, 6, sx, 0.9, -1.55, 0, matDark);
    root.add(canCap);
  }

  // ── Antenna ───────────────────────────────────────────────────────────────────
  const antenna = cyl(0.01, 0.005, 0.9, 6, 0.65, 1.55, -0.38, 0, matDark);
  root.add(antenna);

  return root;
}

/**
 * Update wheel rotation (spin based on speed) and suspension height.
 * @param root The warthog root group
 * @param spinAngle How much to rotate wheels (rad)
 * @param suspensionOffsets [fl, fr, rl, rr] Y offset from rest
 */
export function updateWarthogWheels(
  root: THREE.Group,
  spinAngle: number,
  steerAngle: number,
  suspensionOffsets: [number, number, number, number],
): void {
  const wheels = (root as any).wheels as THREE.Group[] | undefined;
  if (!wheels) return;

  for (let i = 0; i < 4; i++) {
    const w = wheels[i];
    if (!w) continue;

    // Suspension
    const baseZ = i < 2 ? 1.18 : -1.0;
    w.position.y = WARTHOG.GROUND_CLEARANCE - 0.05 + suspensionOffsets[i];

    // Spin
    w.rotation.z += spinAngle * (w.position.x < 0 ? 1 : -1);

    // Steer (front wheels only)
    if (i < 2) {
      w.rotation.y = (w.position.x > 0 ? Math.PI : 0) + steerAngle * (w.position.x < 0 ? 1 : -1);
    }
  }
}
