import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function getOrCreate(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * strength;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
}

/** Dark gunmetal — pistol/rifle receiver, barrel */
export function weaponMetalDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-dark', 64, 64, (ctx) => {
    ctx.fillStyle = '#252528';
    ctx.fillRect(0, 0, 64, 64);
    // Subtle machining lines (horizontal)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 64; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    // Edge highlight
    ctx.fillStyle = 'rgba(80,82,88,0.4)';
    ctx.fillRect(0, 0, 64, 2);
    ctx.fillRect(0, 0, 2, 64);
    addNoise(ctx, 64, 64, 12);
  });
}

/** Slightly lighter metal — rifle body */
export function weaponMetalMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-mid', 64, 64, (ctx) => {
    ctx.fillStyle = '#333338';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 64; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(100,102,108,0.35)';
    ctx.fillRect(0, 0, 64, 1);
    addNoise(ctx, 64, 64, 10);
  });
}

/** Very dark — scope tube, bolt */
export function weaponMetalScopeTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-scope', 32, 32, (ctx) => {
    ctx.fillStyle = '#141418';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(60,62,70,0.3)';
    ctx.fillRect(0, 0, 32, 1);
    addNoise(ctx, 32, 32, 8);
  });
}

/** Rubberized grip — dark with slight texture */
export function weaponGripTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-grip', 32, 32, (ctx) => {
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(0, 0, 32, 32);
    // Crosshatch grip pattern
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 32; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(32, i);
      ctx.stroke();
    }
    addNoise(ctx, 32, 32, 15);
  });
}

/** Wood — rifle stock (warm brown) */
export function weaponWoodLightTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-light', 64, 64, (ctx) => {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(60,40,20,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = 8 + i * 6 + (Math.random() * 4 - 2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 16) {
        ctx.lineTo(x, y + (Math.random() * 4 - 2));
      }
      ctx.stroke();
    }
    addNoise(ctx, 64, 64, 18);
  });
}

/** Wood — shotgun (reddish brown) */
export function weaponWoodMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-mid', 64, 64, (ctx) => {
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(50,30,15,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = 4 + i * 6 + (Math.random() * 3 - 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 12) {
        ctx.lineTo(x, y + (Math.random() * 3 - 1.5));
      }
      ctx.stroke();
    }
    addNoise(ctx, 64, 64, 16);
  });
}

/** Wood — sniper (darker walnut) */
export function weaponWoodDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-dark', 64, 64, (ctx) => {
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(30,20,10,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = 2 + i * 5 + (Math.random() * 2 - 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 10) {
        ctx.lineTo(x, y + (Math.random() * 2 - 1));
      }
      ctx.stroke();
    }
    addNoise(ctx, 64, 64, 14);
  });
}
