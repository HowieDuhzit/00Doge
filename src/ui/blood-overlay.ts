/**
 * 2D screen-space blood overlay — guaranteed visible hit feedback.
 * Projects 3D hit positions to screen and draws blood splats on a canvas overlay.
 */

import * as THREE from 'three';

interface BloodSplat {
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
  rotation: number;
}

export class BloodOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private splats: BloodSplat[] = [];
  private readonly maxSplats = 20;

  private boundResize = () => this.resize();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 800;
    `;
    document.body.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.boundResize);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for blood overlay');
    this.ctx = ctx;
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Spawn a blood splat at the given world position (projects to screen).
   */
  spawn(worldPosition: THREE.Vector3, camera: THREE.Camera): void {
    camera.updateMatrixWorld(true);
    const ndc = worldPosition.clone().project(camera);
    if (ndc.z > 1 || ndc.z < -1) return; // Behind camera
    const x = (ndc.x + 1) * 0.5 * this.canvas.width;
    const y = (1 - ndc.y) * 0.5 * this.canvas.height;
    if (x < -50 || x > this.canvas.width + 50 || y < -50 || y > this.canvas.height + 50) return;

    if (this.splats.length >= this.maxSplats) {
      this.splats.shift();
    }
    this.splats.push({
      x,
      y,
      size: 25 + Math.random() * 20,
      life: 0,
      maxLife: 1 + Math.random() * 0.5,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  update(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      this.splats[i].life += dt;
      if (this.splats[i].life >= this.splats[i].maxLife) {
        this.splats.splice(i, 1);
      }
    }
    this.draw();
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.splats) {
      const t = s.life / s.maxLife;
      const opacity = 1 - t;
      if (opacity <= 0) continue;

      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      this.ctx.translate(s.x, s.y);
      this.ctx.rotate(s.rotation);

      // Main splat — dark red ellipse
      this.ctx.fillStyle = `rgba(90, 15, 12, ${opacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, s.size * 0.9, s.size * 1.1, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Mid red
      this.ctx.fillStyle = `rgba(150, 30, 25, ${opacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, s.size * 0.6, s.size * 0.7, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Bright core
      this.ctx.fillStyle = `rgba(220, 50, 45, ${opacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, s.size * 0.3, s.size * 0.35, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.boundResize);
    if (document.body.contains(this.canvas)) {
      document.body.removeChild(this.canvas);
    }
  }
}
