import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';
import { GameSettings } from '../../../core/game-settings';
import { getMoveDirection, type PathFollowState } from '../path-follower';

const ALERT_DURATION = 2.0;
const MOVE_SPEED = 2.5;
const ARRIVE_RADIUS = 1;

/**
 * Alert state: enemy heard something or was alerted by a nearby guard.
 * Uses navmesh to path toward last known position.
 * Transitions to 'attack' if player is spotted, or back to 'idle' after timeout.
 */
export function createAlertState(manager: EnemyManager): State<EnemyBase> {
  let timer = 0;
  let seenPlayerTimer = 0;
  let pathState: PathFollowState | null = null;

  return {
    name: 'alert',

    enter(enemy) {
      timer = ALERT_DURATION;
      pathState = null;
      enemy.model.play('alert');
      if (enemy.lastKnownPlayerPos) {
        enemy.lookAt(enemy.lastKnownPlayerPos);
      }
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      timer -= dt;

      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        seenPlayerTimer += dt;
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        if (seenPlayerTimer >= GameSettings.getAISightConfirmDuration()) {
          enemy.stateMachine.transition('attack', enemy);
          return;
        }
      } else {
        seenPlayerTimer = 0;
      }

      // Move toward last known position
      if (enemy.lastKnownPlayerPos) {
        const pos = enemy.group.position;
        const target = enemy.lastKnownPlayerPos;
        const dist = Math.sqrt(
          (target.x - pos.x) ** 2 + (target.z - pos.z) ** 2,
        );

        if (dist > ARRIVE_RADIUS) {
          enemy.model.play('walk');
          const navMesh = manager.getNavMesh();
          const now = performance.now() / 1000;
          const result = getMoveDirection(
            navMesh,
            pos,
            target.x,
            target.z,
            pathState,
            now,
          );
          if (result) {
            pathState = result.pathState;
            const { dir } = result;
            enemy.lookAt(new THREE.Vector3(pos.x + dir.x, pos.y, pos.z + dir.z));
            const repulsion = manager.getRepulsionForce(enemy);
            pos.x += (dir.x + repulsion.x * 0.8) * MOVE_SPEED * dt;
            pos.z += (dir.z + repulsion.z * 0.8) * MOVE_SPEED * dt;
            manager.syncPhysicsBody(enemy);
          }
        } else {
          enemy.model.play('alert');
          enemy.targetFacingAngle += dt * 2;
        }
      }

      // Timeout — go back to idle
      if (timer <= 0) {
        enemy.stateMachine.transition('idle', enemy);
      }

      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        timer = ALERT_DURATION;
      }
    },

    exit() {},
  };
}
