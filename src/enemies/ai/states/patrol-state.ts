import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';
import { GameSettings } from '../../../core/game-settings';
import { getMoveDirection, type PathFollowState } from '../path-follower';

const PATROL_SPEED = 1.8;
const WAYPOINT_RADIUS = 0.6;

/**
 * Patrol state: walk between waypoints when idle.
 * Uses navmesh for pathfinding when available.
 * Transitions to alert/attack on perception.
 */
export function createPatrolState(manager: EnemyManager): State<EnemyBase> {
  let waypointIndex = 0;
  let seenPlayerTimer = 0;
  let pathState: PathFollowState | null = null;

  return {
    name: 'patrol',

    enter(enemy) {
      if (enemy.waypoints.length === 0) return;
      waypointIndex = 0;
      pathState = null;
      enemy.model.play('walk');
      const first = enemy.waypoints[0];
      enemy.lookAt(new THREE.Vector3(first.x, enemy.group.position.y, first.z));
    },

    update(enemy, dt) {
      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        seenPlayerTimer += dt;
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        if (seenPlayerTimer >= GameSettings.getAISightConfirmDuration()) {
          enemy.stateMachine.transition('attack', enemy);
        }
        return;
      }
      seenPlayerTimer = 0;
      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('alert', enemy);
        return;
      }

      if (enemy.waypoints.length < 2) {
        enemy.stateMachine.transition('idle', enemy);
        return;
      }

      const pos = enemy.group.position;
      const target = enemy.waypoints[waypointIndex];
      const navMesh = manager.getNavMesh();
      const now = performance.now() / 1000;

      const result = getMoveDirection(navMesh, pos, target.x, target.z, pathState, now);
      if (result) {
        pathState = result.pathState;
        const { dir } = result;
        enemy.lookAt(new THREE.Vector3(pos.x + dir.x, pos.y, pos.z + dir.z));
        const repulsion = manager.getRepulsionForce(enemy);
        pos.x += (dir.x + repulsion.x * 0.5) * PATROL_SPEED * dt;
        pos.z += (dir.z + repulsion.z * 0.5) * PATROL_SPEED * dt;
        manager.syncPhysicsBody(enemy);
      } else {
        waypointIndex = (waypointIndex + 1) % enemy.waypoints.length;
        pathState = null;
      }
    },

    exit() {},
  };
}
