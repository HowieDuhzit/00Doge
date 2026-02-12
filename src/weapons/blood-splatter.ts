import * as THREE from 'three';
import { bloodSplatterTexture } from '../levels/procedural-textures';

/**
 * Blood splatter particle system for player/enemy hits.
 * Can spawn in world space OR attached to an enemy (blood emanates from the hit).
 */

interface BloodParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface BloodDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface AttachedDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  parent: THREE.Object3D;
}

export class BloodSplatterSystem {
  private scene: THREE.Scene;
  private particlePool: THREE.Mesh[] = [];
  private activeParticles: BloodParticle[] = [];
  private decalPool: THREE.Mesh[] = [];
  private activeDecals: BloodDecal[] = [];
  private attachedDecals: AttachedDecal[] = [];
  private readonly poolSize = 30;
  private readonly decalPoolSize = 12;
  private particleGeo: THREE.PlaneGeometry;
  private decalGeo: THREE.PlaneGeometry;
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Shared geometry for all blood particles (slightly larger for visibility)
    this.particleGeo = new THREE.PlaneGeometry(0.12, 0.12);

    // Shared decal geometry (billboard quad)
    this.decalGeo = new THREE.PlaneGeometry(0.15, 0.15);

    // Pre-create particle pool
    for (let i = 0; i < this.poolSize; i++) {
      const tex = bloodSplatterTexture(i % 6);
      const pmat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        alphaTest: 0.08,
      });
      const mesh = new THREE.Mesh(this.particleGeo, pmat);
      mesh.visible = false;
      mesh.renderOrder = 50; // Draw after most scene objects
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }

    // Pre-create decal pool (blood splatter sprites)
    for (let i = 0; i < this.decalPoolSize; i++) {
      const tex = bloodSplatterTexture(i % 3);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false, // Always visible (draws on top) — blood should never be occluded
        side: THREE.DoubleSide,
        alphaTest: 0.1, // Discard transparent pixels
      });
      const mesh = new THREE.Mesh(this.decalGeo, mat);
      mesh.renderOrder = 100; // Draw on top of characters
      mesh.visible = false;
      this.scene.add(mesh);
      this.decalPool.push(mesh);
    }
  }

  /** Set camera for decal billboarding (call after construction). */
  setDecalCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Spawn blood ON an enemy — particles spray from hit point, decals attach to body.
   * Blood emanates from the enemy in 3D world space.
   */
  spawnOnEnemy(
    enemyGroup: THREE.Group,
    hitPointWorld: THREE.Vector3,
    direction: THREE.Vector3,
    count: number = 12,
  ): void {
    const localHit = hitPointWorld.clone();
    enemyGroup.worldToLocal(localHit);

    // Particles — sprite textures, spawn at hit and fly off
    let spawned = 0;
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= count) break;

      mesh.position.copy(hitPointWorld);
      mesh.scale.setScalar(0.2 + Math.random() * 0.15); // Bigger: 0.2–0.35
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Spray direction: more horizontal (left-right) dispersion
      const sprayDir = direction.clone().negate();
      const horizSpread = 1.4; // Extra left-right spread
      const vertSpread = 0.5;
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * horizSpread,
        sprayDir.y + (Math.random() - 0.5) * vertSpread + 0.2,
        sprayDir.z + (Math.random() - 0.5) * horizSpread,
      ).normalize().multiplyScalar(5 + Math.random() * 6);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.35 + Math.random() * 0.15 });
      spawned++;
    }

    // Decals — attach to enemy body, stay on as wounds
    for (let i = 0; i < 3; i++) {
      const tex = bloodSplatterTexture(Math.floor(Math.random() * 6));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: true, // Proper 3D depth — renders on body
        side: THREE.DoubleSide,
        alphaTest: 0.08,
      });
      const mesh = new THREE.Mesh(this.decalGeo, mat);
      mesh.position.copy(localHit);
      mesh.position.x += (Math.random() - 0.5) * 0.12;
      mesh.position.z += (Math.random() - 0.5) * 0.12;
      mesh.scale.setScalar(0.25 + Math.random() * 0.18); // Bigger body decals: 0.25–0.43
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.renderOrder = 10;

      enemyGroup.add(mesh);
      this.attachedDecals.push({
        mesh,
        life: 0,
        maxLife: 0.8 + Math.random() * 0.4, // Shorter so wounds don’t linger
        parent: enemyGroup,
      });
    }
  }

  /**
   * Spawn blood splatter in world space (legacy).
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count: number = 8): void {
    let spawned = 0;

    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= count) break;

      mesh.position.copy(position);
      mesh.scale.setScalar(0.08 + Math.random() * 0.08);
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Random velocity in cone — spray back toward shooter with spread
      const sprayDir = direction.clone().negate();
      const spread = 0.6;
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * spread,
        sprayDir.y + (Math.random() - 0.5) * spread + 0.2, // Slight upward
        sprayDir.z + (Math.random() - 0.5) * spread
      ).normalize().multiplyScalar(3 + Math.random() * 4);

      this.activeParticles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2, // 0.3-0.5 seconds
      });

      spawned++;
    }

    // Spawn 1–2 blood splatter decal sprites
    let decalsSpawned = 0;
    for (const mesh of this.decalPool) {
      if (decalsSpawned >= 2) break;
      const inUse = this.activeDecals.some((d) => d.mesh === mesh);
      if (inUse) continue;

      // Offset well in front of impact (toward camera) so decal isn't occluded by enemy
      mesh.position.copy(position).addScaledVector(direction, -0.18);
      mesh.scale.setScalar(0.4 + Math.random() * 0.2); // Large splatter (0.4–0.6)
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      mesh.layers.set(0); // Ensure default render layer
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Face camera immediately so decal is visible from spawn
      if (this.camera) {
        mesh.lookAt(this.camera.position);
      }

      this.activeDecals.push({
        mesh,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.5,
      });
      decalsSpawned++;
    }
  }

  /**
   * Update active blood particles and decal sprites.
   * Call this each frame from game loop.
   */
  update(dt: number): void {
    const gravity = -18;

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += dt;

      // Apply gravity
      p.velocity.y += gravity * dt;

      // Move particle
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Billboard sprite toward camera
      if (this.camera) p.mesh.lookAt(this.camera.position);

      // Fade out over lifetime
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;

      // Remove if dead — fully reset to avoid any lingering visuals
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        p.mesh.scale.setScalar(1);
        this.activeParticles.splice(i, 1);
      }
    }

    // Update attached decals (on enemy bodies): billboard, fade, remove when expired
    for (let i = this.attachedDecals.length - 1; i >= 0; i--) {
      const d = this.attachedDecals[i];
      d.life += dt;
      if (this.camera) d.mesh.lookAt(this.camera.position);
      const t = d.life / d.maxLife;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = t > 0.8 ? (1 - t) / 0.2 : 1;
      if (d.life >= d.maxLife) {
        if (d.parent) d.parent.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.attachedDecals.splice(i, 1);
      }
    }

    // Update decals: billboard toward camera, fade out
    for (let i = this.activeDecals.length - 1; i >= 0; i--) {
      const d = this.activeDecals[i];
      d.life += dt;

      if (this.camera) {
        d.mesh.lookAt(this.camera.position);
      }

      // Fade in first 0.1s, hold, then fade out
      const t = d.life / d.maxLife;
      const fadeOut = t > 0.7 ? (1 - t) / 0.3 : 1;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = fadeOut;

      if (d.life >= d.maxLife) {
        d.mesh.visible = false;
        this.activeDecals.splice(i, 1);
      }
    }
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const mesh of this.particlePool) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.particleGeo.dispose();
    this.particlePool = [];
    this.activeParticles = [];

    for (const d of this.attachedDecals) {
      if (d.parent) d.parent.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    this.attachedDecals = [];

    for (const mesh of this.decalPool) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.decalGeo.dispose();
    this.decalPool = [];
    this.activeDecals = [];
  }
}
