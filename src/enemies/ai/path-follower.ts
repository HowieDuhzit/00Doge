/**
 * Path following helper for AI navigation.
 * Uses navmesh when available, falls back to direct movement.
 */

import * as THREE from 'three';
import type { NavMesh, PathPoint } from '../../navmesh/navmesh';

const PATH_ARRIVE_RADIUS = 0.5;
const RECOMPUTE_PATH_INTERVAL = 0.5; // Recompute path periodically in case of dynamic obstacles

/** Cached path and state for path following */
export interface PathFollowState {
  path: PathPoint[];
  index: number;
  lastRecomputeTime: number;
}

/**
 * Get movement direction toward a target, using navmesh pathfinding when available.
 * Returns the direction to move (normalized), or null if already at destination.
 * Updates pathFollowState in place.
 */
export function getMoveDirection(
  navMesh: NavMesh | null,
  pos: THREE.Vector3,
  targetX: number,
  targetZ: number,
  pathState: PathFollowState | null,
  now: number,
): { dir: THREE.Vector3; pathState: PathFollowState } | null {
  const dx = targetX - pos.x;
  const dz = targetZ - pos.z;
  const distSq = dx * dx + dz * dz;
  if (distSq < PATH_ARRIVE_RADIUS * PATH_ARRIVE_RADIUS) {
    return null; // At destination
  }

  if (!navMesh?.isBuilt) {
    // Fallback: direct movement
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return null;
    const dir = new THREE.Vector3(dx / len, 0, dz / len);
    return { dir, pathState: pathState ?? { path: [], index: 0, lastRecomputeTime: 0 } };
  }

  const state = pathState ?? { path: [], index: 0, lastRecomputeTime: 0 };
  const needRecompute =
    state.path.length === 0 ||
    state.index >= state.path.length ||
    now - state.lastRecomputeTime > RECOMPUTE_PATH_INTERVAL;

  if (needRecompute) {
    const path = navMesh.findPath(pos.x, pos.z, targetX, targetZ);
    state.path = path;
    state.index = 0;
    state.lastRecomputeTime = now;
    if (path.length === 0) {
      // No path - fallback to direct
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) return null;
      const dir = new THREE.Vector3(dx / len, 0, dz / len);
      return { dir, pathState: state };
    }
  }

  // Advance index if we've reached current waypoint
  while (state.index < state.path.length) {
    const pt = state.path[state.index];
    const pdx = pt.x - pos.x;
    const pdz = pt.z - pos.z;
    if (pdx * pdx + pdz * pdz < PATH_ARRIVE_RADIUS * PATH_ARRIVE_RADIUS) {
      state.index++;
    } else {
      break;
    }
  }

  if (state.index >= state.path.length) {
    // Reached end of path - check if we're at final target
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < PATH_ARRIVE_RADIUS) return null;
    const dir = new THREE.Vector3(dx / len, 0, dz / len);
    return { dir, pathState: state };
  }

  const pt = state.path[state.index];
  const toPx = pt.x - pos.x;
  const toPz = pt.z - pos.z;
  const len = Math.sqrt(toPx * toPx + toPz * toPz);
  if (len < 0.01) return null;
  const dir = new THREE.Vector3(toPx / len, 0, toPz / len);
  return { dir, pathState: state };
}
