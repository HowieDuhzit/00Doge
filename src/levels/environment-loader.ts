/**
 * Load HDRI and skybox for custom quickplay environment.
 * Supports equirectangular HDR (recommended) and 6-face cube skybox.
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const rgbeLoader = new RGBELoader();

/**
 * Load equirectangular HDR and process with PMREM for PBR environment/background.
 * Returns the PMREM-processed texture suitable for scene.environment and scene.background.
 */
export function loadHDRI(
  url: string,
  renderer: THREE.WebGLRenderer,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    rgbeLoader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        const envMap = pmremGenerator.fromEquirectangular(texture).texture;

        texture.dispose();
        pmremGenerator.dispose();

        resolve(envMap);
      },
      undefined,
      reject,
    );
  });
}

/**
 * Load 6-face cube skybox from image URLs.
 * Order: +X, -X, +Y, -Y, +Z, -Z (px, nx, py, ny, pz, nz)
 */
export function loadSkyboxCube(urls: [
  string, string, string, string, string, string
]): Promise<THREE.CubeTexture> {
  const loader = new THREE.CubeTextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(urls, resolve, undefined, reject);
  });
}

/**
 * Load an LDR image (jpg/png) for use as skybox background.
 * Use when you want a separate skybox image distinct from the HDR lighting.
 */
export function loadSkyboxImage(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

/**
 * Apply environment map (lighting) and optionally a separate background (skybox) to scene.
 * When backgroundTexture is provided, it is used for scene.background; otherwise envMap is used for both.
 */
export function applyEnvironment(
  scene: THREE.Scene,
  envMap: THREE.Texture,
  options?: {
    /** Separate texture for skybox background (e.g. skybox.jpg). If set, used for scene.background. */
    backgroundTexture?: THREE.Texture;
    backgroundIntensity?: number;
    environmentIntensity?: number;
  },
): void {
  scene.environment = envMap;

  if (options?.backgroundTexture) {
    scene.background = options.backgroundTexture;
  } else {
    scene.background = envMap;
  }

  if (options?.backgroundIntensity !== undefined) {
    scene.backgroundIntensity = options.backgroundIntensity;
  }
  if (options?.environmentIntensity !== undefined) {
    scene.environmentIntensity = options.environmentIntensity;
  }
}
