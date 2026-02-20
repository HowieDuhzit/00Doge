import * as THREE from 'three';

/**
 * Per-weapon tracer visual config.
 */
interface TracerConfig {
  length: number;       // metres (max visual streak length)
  coreColor: number;
  glowColor: number;
  coreOpacity: number;  // peak opacity of the bright core
  glowWidth: number;    // world-space half-width of the glow plane (metres)
  coreWidth: number;    // world-space half-width of the core plane
  lifetimeMs: number;
}

const WEAPON_TRACER_CONFIG: Record<string, TracerConfig> = {
  'PP7':         { length: 1.0, coreColor: 0xfff8d0, glowColor: 0xffe060, coreOpacity: 0.75, coreWidth: 0.003, glowWidth: 0.010, lifetimeMs:  70 },
  'Pistol':      { length: 1.0, coreColor: 0xfff8d0, glowColor: 0xffe060, coreOpacity: 0.75, coreWidth: 0.003, glowWidth: 0.010, lifetimeMs:  70 },
  'KF7 Soviet':  { length: 1.8, coreColor: 0xfffff0, glowColor: 0xffe880, coreOpacity: 0.85, coreWidth: 0.003, glowWidth: 0.012, lifetimeMs:  85 },
  'Rifle':       { length: 1.8, coreColor: 0xfffff0, glowColor: 0xffe880, coreOpacity: 0.85, coreWidth: 0.003, glowWidth: 0.012, lifetimeMs:  85 },
  'Shotgun':     { length: 0.6, coreColor: 0xfff4cc, glowColor: 0xffdd44, coreOpacity: 0.55, coreWidth: 0.002, glowWidth: 0.008, lifetimeMs:  50 },
  'Sniper Rifle':{ length: 4.0, coreColor: 0xffffff, glowColor: 0xaaddff, coreOpacity: 1.00, coreWidth: 0.004, glowWidth: 0.016, lifetimeMs: 130 },
  'Sniper':      { length: 4.0, coreColor: 0xffffff, glowColor: 0xaaddff, coreOpacity: 1.00, coreWidth: 0.004, glowWidth: 0.016, lifetimeMs: 130 },
  'M134 Minigun':{ length: 1.5, coreColor: 0xff9944, glowColor: 0xff4400, coreOpacity: 0.90, coreWidth: 0.003, glowWidth: 0.011, lifetimeMs:  75 },
  'Minigun':     { length: 1.5, coreColor: 0xff9944, glowColor: 0xff4400, coreOpacity: 0.90, coreWidth: 0.003, glowWidth: 0.011, lifetimeMs:  75 },
};

const DEFAULT_CONFIG: TracerConfig = {
  length: 1.2, coreColor: 0xfffff0, glowColor: 0xffe880,
  coreOpacity: 0.75, coreWidth: 0.003, glowWidth: 0.012, lifetimeMs: 80,
};

const POOL_SIZE = 48; // minigun fires at 20 rps, need plenty of slots

// Reusable scratch vectors — never allocated per-frame
const _side = new THREE.Vector3();
const _toCam = new THREE.Vector3();

interface TracerSlot {
  // Each tracer is two quads (4 verts each) backed by BufferGeometry.
  // We update the vertex positions directly each frame — no rotation needed.
  coreMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  corePositions: Float32Array;  // 4 verts × 3 floats
  glowPositions: Float32Array;
  // Tracer world-space start and end (updated at spawn)
  start: THREE.Vector3;
  end: THREE.Vector3;
  dir: THREE.Vector3;           // normalised direction start→end
  coreHalfW: number;
  glowHalfW: number;
  life: number;
  maxLife: number;
  corePeakOpacity: number;
}

/**
 * Build a simple two-triangle quad BufferGeometry (4 verts, 2 tris).
 * Vertex positions will be overwritten each frame; uvs and indices are fixed.
 */
function makeQuadGeo(): { geo: THREE.BufferGeometry; posArr: Float32Array } {
  const posArr = new Float32Array(4 * 3); // 4 vertices × xyz
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  // Two triangles: 0-1-2, 0-2-3
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  return { geo, posArr };
}

/**
 * Write the 4 world-space corner positions of a billboard quad into posArr.
 * The quad lies along `dir`, centred at `mid`, half-widths perpendicular to
 * both `dir` and `toCam`.
 *
 *   v0---v3
 *   |     |   ← width = halfW on each side of the streak axis
 *   v1---v2
 *
 * @param posArr  Float32Array with 12 elements (4×xyz)
 * @param start   world start of the streak
 * @param end     world end of the streak
 * @param side    unit vector perpendicular to dir AND pointing toward camera
 * @param halfW   half-width of the quad in world units
 */
function writeQuadVerts(
  posArr: Float32Array,
  start: THREE.Vector3,
  end: THREE.Vector3,
  side: THREE.Vector3,
  halfW: number,
): void {
  // v0 = start + side*halfW
  posArr[0] = start.x + side.x * halfW;
  posArr[1] = start.y + side.y * halfW;
  posArr[2] = start.z + side.z * halfW;
  // v1 = start - side*halfW
  posArr[3] = start.x - side.x * halfW;
  posArr[4] = start.y - side.y * halfW;
  posArr[5] = start.z - side.z * halfW;
  // v2 = end - side*halfW
  posArr[6] = end.x - side.x * halfW;
  posArr[7] = end.y - side.y * halfW;
  posArr[8] = end.z - side.z * halfW;
  // v3 = end + side*halfW
  posArr[9]  = end.x + side.x * halfW;
  posArr[10] = end.y + side.y * halfW;
  posArr[11] = end.z + side.z * halfW;
}

/**
 * Renders bullet tracer streaks using pooled world-space quad meshes.
 *
 * Each tracer is two overlapping quads (core + soft glow) whose vertices
 * are recomputed each frame so the quad always faces the camera while
 * lying precisely along the bullet's direction vector. This approach is
 * fully stable regardless of view angle, including dead-on shots.
 */
export class TracerSystem {
  private scene: THREE.Scene;
  private pool: TracerSlot[] = [];
  private active: TracerSlot[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this._buildPool();
  }

  private _buildPool(): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const { geo: coreGeo, posArr: corePos } = makeQuadGeo();
      const { geo: glowGeo, posArr: glowPos } = makeQuadGeo();

      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.visible = false;
      coreMesh.renderOrder = 10;
      coreMesh.frustumCulled = false; // verts are in world space, skip culling
      this.scene.add(coreMesh);

      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.visible = false;
      glowMesh.renderOrder = 9;
      glowMesh.frustumCulled = false;
      this.scene.add(glowMesh);

      this.pool.push({
        coreMesh, glowMesh,
        corePositions: corePos,
        glowPositions: glowPos,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, -1),
        coreHalfW: 0.003,
        glowHalfW: 0.010,
        life: 0,
        maxLife: 0,
        corePeakOpacity: 0,
      });
    }
  }

  /**
   * Spawn a tracer for a single ray.
   * @param spreadDir  Normalised direction (spread already applied)
   * @param origin     Ray start (camera world position)
   * @param hitPoint   Where the ray hit, or null if it missed
   * @param range      Weapon max range (used when miss)
   * @param weaponName weapon.stats.name
   */
  spawnTracer(
    spreadDir: THREE.Vector3,
    origin: THREE.Vector3,
    hitPoint: THREE.Vector3 | null,
    range: number,
    weaponName: string,
  ): void {
    const cfg = WEAPON_TRACER_CONFIG[weaponName] ?? DEFAULT_CONFIG;

    // Find a free pool slot
    let slot: TracerSlot | null = null;
    for (const s of this.pool) {
      if (s.life <= 0 && !s.coreMesh.visible) {
        slot = s;
        break;
      }
    }
    if (!slot) return; // pool exhausted

    // The tracer is a short streak at the FAR end of the bullet path —
    // it appears at the impact point and extends cfg.length back toward the gun.
    // This matches CoD/BF style where you see the streak arrive at the target.
    if (hitPoint) {
      // End at the impact point, start cfg.length back along the ray
      slot.end.copy(hitPoint);
      slot.start.copy(hitPoint).addScaledVector(spreadDir, -cfg.length);
      // Don't let start go behind the camera
      const minStart = origin.clone().addScaledVector(spreadDir, 0.40);
      const dotCheck = slot.start.clone().sub(origin).dot(spreadDir);
      if (dotCheck < 0.40) slot.start.copy(minStart);
    } else {
      // Miss — draw streak at max range, same approach
      slot.end.copy(origin).addScaledVector(spreadDir, range);
      slot.start.copy(slot.end).addScaledVector(spreadDir, -cfg.length);
      const minStart = origin.clone().addScaledVector(spreadDir, 0.40);
      const dotCheck = slot.start.clone().sub(origin).dot(spreadDir);
      if (dotCheck < 0.40) slot.start.copy(minStart);
    }

    slot.dir.copy(spreadDir); // already normalised
    slot.coreHalfW = cfg.coreWidth;
    slot.glowHalfW = cfg.glowWidth;
    slot.life = cfg.lifetimeMs / 1000;
    slot.maxLife = cfg.lifetimeMs / 1000;
    slot.corePeakOpacity = cfg.coreOpacity;

    const coreMat = slot.coreMesh.material as THREE.MeshBasicMaterial;
    const glowMat = slot.glowMesh.material as THREE.MeshBasicMaterial;
    coreMat.color.setHex(cfg.coreColor);
    glowMat.color.setHex(cfg.glowColor);

    slot.coreMesh.visible = true;
    slot.glowMesh.visible = true;

    this.active.push(slot);
  }

  /**
   * Called once per frame from ProjectileSystem.update().
   * Recomputes billboard quad vertices, updates opacity fade, retires expired tracers.
   */
  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;

      if (slot.life <= 0) {
        slot.coreMesh.visible = false;
        slot.glowMesh.visible = false;
        this.active.splice(i, 1);
        continue;
      }

      // Fade: sqrt gives fast initial brightness, smooth tail
      const frac = Math.max(0, slot.life / slot.maxLife);
      const fade = Math.sqrt(frac);

      const coreMat = slot.coreMesh.material as THREE.MeshBasicMaterial;
      const glowMat = slot.glowMesh.material as THREE.MeshBasicMaterial;
      coreMat.opacity = slot.corePeakOpacity * fade;
      glowMat.opacity = slot.corePeakOpacity * 0.40 * fade;

      // Billboard: compute the side vector perpendicular to the tracer direction
      // AND perpendicular to the vector from tracer midpoint toward the camera.
      // side = normalize( dir × toCam )
      // This is stable even when shooting directly toward or away from the camera.
      const midX = (slot.start.x + slot.end.x) * 0.5;
      const midY = (slot.start.y + slot.end.y) * 0.5;
      const midZ = (slot.start.z + slot.end.z) * 0.5;

      _toCam.set(
        camera.position.x - midX,
        camera.position.y - midY,
        camera.position.z - midZ,
      ).normalize();

      // side = dir × toCam  (perpendicular to both = the "width" axis of the streak)
      _side.crossVectors(slot.dir, _toCam);
      const sideLen = _side.length();
      if (sideLen < 0.001) {
        // Edge case: shooting exactly at camera — skip this frame
        continue;
      }
      _side.divideScalar(sideLen);

      // Write core quad vertices
      writeQuadVerts(slot.corePositions, slot.start, slot.end, _side, slot.coreHalfW);
      const coreAttr = slot.coreMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      coreAttr.needsUpdate = true;

      // Write glow quad vertices (same orientation, wider)
      writeQuadVerts(slot.glowPositions, slot.start, slot.end, _side, slot.glowHalfW);
      const glowAttr = slot.glowMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      glowAttr.needsUpdate = true;

      // Bounding box/sphere must be updated so WebGL doesn't cull the mesh incorrectly
      slot.coreMesh.geometry.computeBoundingSphere();
      slot.glowMesh.geometry.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const slot of this.pool) {
      this.scene.remove(slot.coreMesh);
      this.scene.remove(slot.glowMesh);
      slot.coreMesh.geometry.dispose();
      slot.glowMesh.geometry.dispose();
      (slot.coreMesh.material as THREE.MeshBasicMaterial).dispose();
      (slot.glowMesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.pool.length = 0;
    this.active.length = 0;
  }
}
