import * as THREE from 'three';
import {
  weaponMetalDarkTexture,
  weaponMetalMidTexture,
  weaponMetalScopeTexture,
  weaponGripTexture,
  weaponWoodLightTexture,
  weaponWoodMidTexture,
  weaponWoodDarkTexture,
} from './weapon-textures';

export type WeaponSkin = 'default' | 'gilded' | 'tiger' | 'flag';

const skinTextureCache = new Map<string, THREE.CanvasTexture>();

function getOrCreateSkin(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cached = skinTextureCache.get(key);
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
  skinTextureCache.set(key, tex);
  return tex;
}

/** Gilded gold — metallic gold tone */
function gildedMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-gilded-metal', 64, 64, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#c9a227');
    grad.addColorStop(0.3, '#e6c547');
    grad.addColorStop(0.5, '#d4af37');
    grad.addColorStop(0.7, '#b8962e');
    grad.addColorStop(1, '#9a7b20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 64; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,180,0.4)';
    ctx.fillRect(0, 0, 64, 2);
  });
}

function gildedWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-gilded-wood', 64, 64, (ctx) => {
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(60,45,10,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = 4 + i * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 16) ctx.lineTo(x, y + (Math.random() * 2 - 1));
      ctx.stroke();
    }
  });
}

/** Orange tiger stripe — orange base with black stripes */
function tigerMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-tiger-metal', 64, 64, (ctx) => {
    ctx.fillStyle = '#e07828';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#d86a18';
    ctx.fillRect(0, 0, 32, 64);
    // Black stripes (angled)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, 64);
    ctx.lineTo(28, 64);
    ctx.lineTo(8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(44, 64);
    ctx.lineTo(52, 64);
    ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48, 0);
    ctx.lineTo(64, 40);
    ctx.lineTo(64, 48);
    ctx.lineTo(56, 0);
    ctx.closePath();
    ctx.fill();
  });
}

function tigerWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-tiger-wood', 64, 64, (ctx) => {
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 5; i++) {
      const x = 8 + i * 14 + (i % 2) * 4;
      ctx.fillRect(x, 0, 6, 64);
    }
  });
}

/** Red, white, and blue flag style */
function flagMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-flag-metal', 64, 64, (ctx) => {
    const stripeH = 64 / 3;
    ctx.fillStyle = '#b22234';
    ctx.fillRect(0, 0, 64, stripeH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, stripeH, 64, stripeH);
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, stripeH * 2, 64, stripeH);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 64, 64);
  });
}

function flagWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-flag-wood', 64, 64, (ctx) => {
    const stripeH = 64 / 3;
    ctx.fillStyle = '#8b1528';
    ctx.fillRect(0, 0, 64, stripeH);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, stripeH, 64, stripeH);
    ctx.fillStyle = '#2a2960';
    ctx.fillRect(0, stripeH * 2, 64, stripeH);
  });
}

export type SkinTextureRole = 'metal' | 'metalMid' | 'wood' | 'woodMid' | 'woodDark' | 'grip' | 'scope';

/** Get the texture for a given skin and material role (used by view model). */
export function getTextureForSkin(skin: WeaponSkin, role: SkinTextureRole): THREE.CanvasTexture {
  if (skin === 'default') {
    switch (role) {
      case 'metal': return weaponMetalDarkTexture();
      case 'metalMid': return weaponMetalMidTexture();
      case 'wood': return weaponWoodLightTexture();
      case 'woodMid': return weaponWoodMidTexture();
      case 'woodDark': return weaponWoodDarkTexture();
      case 'grip': return weaponGripTexture();
      case 'scope': return weaponMetalScopeTexture();
      default: return weaponMetalDarkTexture();
    }
  }
  if (skin === 'gilded') {
    if (role === 'grip') return getOrCreateSkin('skin-gilded-grip', 32, 32, (ctx) => {
      ctx.fillStyle = '#5c4a0a';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'scope') return getOrCreateSkin('skin-gilded-scope', 32, 32, (ctx) => {
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'metal' || role === 'metalMid') return gildedMetalTexture();
    return gildedWoodTexture();
  }
  if (skin === 'tiger') {
    if (role === 'grip') return getOrCreateSkin('skin-tiger-grip', 32, 32, (ctx) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#e07828';
      ctx.fillRect(0, 0, 12, 32);
      ctx.fillRect(20, 0, 12, 32);
    });
    if (role === 'scope') return weaponMetalScopeTexture();
    if (role === 'metal' || role === 'metalMid') return tigerMetalTexture();
    return tigerWoodTexture();
  }
  if (skin === 'flag') {
    if (role === 'grip') return getOrCreateSkin('skin-flag-grip', 32, 32, (ctx) => {
      const sh = 32 / 3;
      ctx.fillStyle = '#b22234';
      ctx.fillRect(0, 0, 32, sh);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, sh, 32, sh);
      ctx.fillStyle = '#3c3b6e';
      ctx.fillRect(0, sh * 2, 32, sh);
    });
    if (role === 'scope') return getOrCreateSkin('skin-flag-scope', 32, 32, (ctx) => {
      ctx.fillStyle = '#3c3b6e';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'metal' || role === 'metalMid') return flagMetalTexture();
    return flagWoodTexture();
  }
  return weaponMetalDarkTexture();
}

export const WEAPON_SKIN_LABELS: Record<WeaponSkin, string> = {
  default: 'Default',
  gilded: 'Gilded Gold',
  tiger: 'Orange Tiger',
  flag: 'Red White Blue',
};

export const WEAPON_SKIN_LIST: WeaponSkin[] = ['default', 'gilded', 'tiger', 'flag'];

const previewCache = new Map<WeaponSkin, string>();

/** Draw a small weapon-strip preview (metal left, wood right) for the inventory UI. */
export function getSkinPreviewDataUrl(skin: WeaponSkin): string {
  const cached = previewCache.get(skin);
  if (cached) return cached;

  const w = 96;
  const h = 36;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const leftW = w / 2;
  const rightW = w - leftW;

  if (skin === 'default') {
    ctx.fillStyle = '#252528';
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = 'rgba(80,82,88,0.5)';
    ctx.fillRect(0, 0, leftW, 2);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.strokeStyle = 'rgba(60,40,20,0.4)';
    for (let y = 4; y < h; y += 6) ctx.fillRect(leftW, y, rightW, 1);
  } else if (skin === 'gilded') {
    const g = ctx.createLinearGradient(0, 0, leftW, h);
    g.addColorStop(0, '#c9a227');
    g.addColorStop(0.5, '#d4af37');
    g.addColorStop(1, '#9a7b20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.strokeStyle = 'rgba(60,45,10,0.5)';
    for (let y = 2; y < h; y += 4) ctx.fillRect(leftW, y, rightW, 1);
  } else if (skin === 'tiger') {
    ctx.fillStyle = '#e07828';
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, h);
    ctx.lineTo(24, h);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(44, h);
    ctx.lineTo(48, h);
    ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(leftW + 8, 0, 5, h);
    ctx.fillRect(leftW + 22, 0, 5, h);
  } else if (skin === 'flag') {
    const sh = h / 3;
    ctx.fillStyle = '#b22234';
    ctx.fillRect(0, 0, leftW, sh);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, sh, leftW, sh);
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, sh * 2, leftW, sh);
    ctx.fillStyle = '#8b1528';
    ctx.fillRect(leftW, 0, rightW, sh);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(leftW, sh, rightW, sh);
    ctx.fillStyle = '#2a2960';
    ctx.fillRect(leftW, sh * 2, rightW, sh);
  } else {
    ctx.fillStyle = '#252528';
    ctx.fillRect(0, 0, w, h);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/png');
  previewCache.set(skin, dataUrl);
  return dataUrl;
}
