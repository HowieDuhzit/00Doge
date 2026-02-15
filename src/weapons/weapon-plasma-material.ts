/**
 * Plasma accent material — animated emissive accents for weapon skins.
 * Uses onBeforeCompile for performance (reuses MeshStandardMaterial pipeline).
 */
import * as THREE from 'three';

/** Plasma accent colors (cyan/magenta sci-fi palette) */
const PLASMA_COLOR_A = new THREE.Color(0x00d4ff);
const PLASMA_COLOR_B = new THREE.Color(0xaa00ff);

/** Create a MeshStandardMaterial with animated plasma emissive accents along edges/ridges. */
export function createPlasmaAccentMaterial(
  baseMap: THREE.Texture | null,
  baseColor: THREE.Color,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: baseMap,
    color: baseColor,
    roughness: 0.4,
    metalness: 0.9,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.plasmaTime = { value: 0 };
    shader.uniforms.plasmaColorA = { value: PLASMA_COLOR_A.clone() };
    shader.uniforms.plasmaColorB = { value: PLASMA_COLOR_B.clone() };
    (mat.userData as Record<string, unknown>).shader = shader;

    shader.fragmentShader = 'uniform float plasmaTime;\nuniform vec3 plasmaColorA;\nuniform vec3 plasmaColorB;\n' + shader.fragmentShader;

    // Add plasma to totalEmissiveRadiance (exists after emissivemap_fragment)
    const plasmaCode = `
      vec2 plasmaUv = vMapUv;
      float plasmaPhase = plasmaUv.y * 4.0 + plasmaUv.x * 6.0 + plasmaTime * 2.0;
      float plasmaWave = sin(plasmaPhase) * 0.5 + 0.5;
      plasmaWave = smoothstep(0.4, 0.6, plasmaWave);
      float edgeGlow = 1.0 - abs(plasmaUv.y - 0.5) * 2.0;
      edgeGlow = smoothstep(0.3, 0.8, edgeGlow);
      totalEmissiveRadiance += mix(plasmaColorA, plasmaColorB, plasmaWave) * plasmaWave * edgeGlow * 0.5;
    `;

    // Inject after totalEmissiveRadiance is first set (in emissivemap_fragment)
    if (shader.fragmentShader.includes('totalEmissiveRadiance')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${plasmaCode}`,
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `${plasmaCode}
#include <output_fragment>`,
      );
    }
  };

  return mat;
}

/** Update plasma material time uniform (call each frame). */
export function updatePlasmaMaterial(material: THREE.Material, time: number): void {
  const shader = (material.userData as { shader?: { uniforms: { plasmaTime?: { value: number } } } }).shader;
  if (shader?.uniforms?.plasmaTime) {
    shader.uniforms.plasmaTime.value = time;
  }
}

/** Check if a material has plasma uniforms to update. */
export function isPlasmaMaterial(material: THREE.Material): boolean {
  return !!(material.userData as { shader?: { uniforms?: Record<string, unknown> } }).shader?.uniforms?.plasmaTime;
}
