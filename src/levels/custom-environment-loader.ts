/**
 * Load custom GLB environment for quickplay.
 * Extracts geometry for physics trimesh colliders and configures shadows.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface EnvironmentColliderData {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface LoadedEnvironment {
  scene: THREE.Group;
  colliderData: EnvironmentColliderData | null;
}

const gltfLoader = new GLTFLoader();

/** If player falls through terrain, try toggling this to flip triangle winding for Rapier. */
const TRIMESH_FLIP_WINDING = false;


/** Name substrings that identify sky dome / background meshes to scale out. */
const SKY_DOME_NAMES = ['sky', 'skydome', 'dome', 'background', 'environment'];

function isSkyDomeMesh(name: string): boolean {
  const n = name.toLowerCase();
  return SKY_DOME_NAMES.some((k) => n.includes(k));
}

/**
 * Extract vertices and indices from BufferGeometry, transformed by matrix.
 * Handles both indexed and non-indexed geometry.
 */
function extractGeometryData(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
): { vertices: Float32Array; indices: Uint32Array } {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) {
    return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
  }

  const vertexCount = posAttr.count;
  const vertices = new Float32Array(vertexCount * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < vertexCount; i++) {
    v.fromBufferAttribute(posAttr, i);
    v.applyMatrix4(matrixWorld);
    vertices[i * 3] = v.x;
    vertices[i * 3 + 1] = v.y;
    vertices[i * 3 + 2] = v.z;
  }

  let indices: Uint32Array;

  if (geometry.index) {
    const indexAttr = geometry.index;
    const indexCount = indexAttr.count;
    indices = new Uint32Array(indexCount);
    for (let i = 0; i < indexCount; i++) {
      indices[i] = indexAttr.getX(i);
    }
  } else {
    // Non-indexed: every 3 vertices = 1 triangle
    indices = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }
  }

  return { vertices, indices };
}

/**
 * Combine multiple geometry extractions into one vertices + indices.
 */
function combineColliderData(
  dataList: { vertices: Float32Array; indices: Uint32Array }[],
  flipWinding: boolean,
): EnvironmentColliderData {
  let totalVertices = 0;
  let totalIndices = 0;

  for (const d of dataList) {
    totalVertices += d.vertices.length / 3;
    totalIndices += d.indices.length;
  }

  const vertices = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let vertexCount = 0;
  let indexOffset = 0;

  for (const d of dataList) {
    const vCount = d.vertices.length / 3;
    vertices.set(d.vertices, vertexOffset * 3);
    vertexOffset += vCount;

    for (let i = 0; i < d.indices.length; i += 3) {
      const a = d.indices[i] + vertexCount;
      const b = d.indices[i + 1] + vertexCount;
      const c = d.indices[i + 2] + vertexCount;
      indices[indexOffset + i] = a;
      indices[indexOffset + i + 1] = flipWinding ? c : b;
      indices[indexOffset + i + 2] = flipWinding ? b : c;
    }
    vertexCount += vCount;
    indexOffset += d.indices.length;
  }

  return { vertices, indices };
}

/**
 * Load a GLB environment model and extract collider data for physics.
 * Traverses all meshes, enables shadows, and builds combined trimesh data.
 * If meshes named "collision" or "collider" exist, only those are used for physics;
 * otherwise all meshes are used.
 * Sky dome meshes (names containing sky/dome/background) are scaled by skyDomeScale
 * to push the horizon further out for large environments.
 */
export function loadEnvironmentGLB(
  url: string,
  options?: { skyDomeScale?: number },
): Promise<LoadedEnvironment> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        const colliderDataList: { vertices: Float32Array; indices: Uint32Array }[] = [];
        let useCollisionOnly = false;
        let hasCollisionMesh = false;

        scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          const mesh = obj as THREE.Mesh;
          const name = (mesh.name || '').toLowerCase();

          // Check for dedicated collision mesh
          if (name === 'collision' || name === 'collider') {
            hasCollisionMesh = true;
          }
        });

        useCollisionOnly = hasCollisionMesh;

        scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          const mesh = obj as THREE.Mesh;
          const name = (mesh.name || '').toLowerCase();
          const isCollisionMesh = name === 'collision' || name === 'collider';

          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMapIntensity = 1.0;
              }
            }
          }

          if (useCollisionOnly && !isCollisionMesh) return;

          const geometry = mesh.geometry;
          if (!geometry) return;

          mesh.updateMatrixWorld(true);
          const matrixWorld = mesh.matrixWorld.clone();

          const data = extractGeometryData(geometry, matrixWorld);
          if (data.vertices.length > 0 && data.indices.length >= 3) {
            colliderDataList.push(data);
          }
        });

        const colliderData =
          colliderDataList.length > 0 ? combineColliderData(colliderDataList, TRIMESH_FLIP_WINDING) : null;

        // Scale sky dome meshes outward so horizon stays beyond distant terrain
        const skyDomeScale = options?.skyDomeScale ?? 5;
        if (skyDomeScale > 1) {
          scene.traverse((obj) => {
            if (isSkyDomeMesh(obj.name)) {
              obj.scale.multiplyScalar(skyDomeScale);
            }
          });
        }

        resolve({ scene, colliderData });
      },
      undefined,
      reject,
    );
  });
}
