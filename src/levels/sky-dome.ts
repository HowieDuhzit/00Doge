import * as THREE from 'three';

const SKY_RADIUS = 200;

/**
 * Create a procedural sky dome for outdoor desert levels.
 * Uses an inverted sphere with a Canvas2D gradient texture (blue sky, warm horizon).
 */
export function addSkyDome(scene: THREE.Scene): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Vertical gradient: deep blue at top -> lighter blue -> warm horizon
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4a7cb8');
  grad.addColorStop(0.4, '#6b9ed4');
  grad.addColorStop(0.65, '#87CEEB');
  grad.addColorStop(0.85, '#b8d4e8');
  grad.addColorStop(1, '#e8d4a0');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle sun disk (upper third, offset right)
  const sunX = 380;
  const sunY = 55;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 35);
  sunGrad.addColorStop(0, 'rgba(255, 252, 230, 0.95)');
  sunGrad.addColorStop(0.3, 'rgba(255, 245, 200, 0.6)');
  sunGrad.addColorStop(0.6, 'rgba(255, 235, 180, 0.2)');
  sunGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);
}
