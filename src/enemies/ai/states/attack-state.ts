import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';
import { getMoveDirection, type PathFollowState } from '../path-follower';

const ENGAGE_RANGE = 18;
const PREFERRED_RANGE = 8;
const MOVE_SPEED = 2;
const LOSE_SIGHT_TIMEOUT = 3;
const SHOOT_ANIM_MIN_DURATION = 0.25;
const CHASE_ARRIVE_RADIUS = 1;

/**
 * Attack state: enemy has spotted the player.
 * Faces player, fires at intervals. Uses navmesh when moving toward player or chasing.
 * If player is lost for a timeout, transitions to 'alert'.
 */
export function createAttackState(manager: EnemyManager): State<EnemyBase> {
  let lostSightTimer = 0;
  let strafeDir = 1;
  let strafeTimer = 0;
  let shootDisplayTimer = 0;
  let pathState: PathFollowState | null = null;

  return {
    name: 'attack',

    enter(enemy) {
      lostSightTimer = 0;
      pathState = null;
      strafeDir = Math.random() > 0.5 ? 1 : -1;
      strafeTimer = 1 + Math.random() * 2;
      enemy.model.play('shoot');
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      const perception = manager.getPerception(enemy);
      const playerPos = manager.getPlayerPosition();

      if (perception?.canSeePlayer) {
        lostSightTimer = 0;
        enemy.lastKnownPlayerPos = playerPos.clone();

        enemy.lookAt(playerPos);

        const now = performance.now() / 1000;
        if (shootDisplayTimer > 0) shootDisplayTimer -= dt;
        if (enemy.canFire(now)) {
          enemy.lastFireTime = now;
          enemy.model.play('shoot', true);
          manager.enemyFireAtPlayer(enemy);
          shootDisplayTimer = SHOOT_ANIM_MIN_DURATION;
        }

        const dist = perception.distanceToPlayer;
        const pos = enemy.group.position;
        const navMesh = manager.getNavMesh();

        if (dist > PREFERRED_RANGE + 2) {
          // Approach: use pathfinding when navmesh available
          const result = getMoveDirection(
            navMesh,
            pos,
            playerPos.x,
            playerPos.z,
            pathState,
            now,
          );
          if (result) {
            pathState = result.pathState;
            const { dir } = result;
            const repulsion = manager.getRepulsionForce(enemy);
            pos.x += (dir.x + repulsion.x * 0.8) * MOVE_SPEED * dt;
            pos.z += (dir.z + repulsion.z * 0.8) * MOVE_SPEED * dt;
          }
        } else if (dist < PREFERRED_RANGE - 2) {
          // Retreat: use pathfinding
          const awayX = pos.x - (playerPos.x - pos.x);
          const awayZ = pos.z - (playerPos.z - pos.z);
          const result = getMoveDirection(
            navMesh,
            pos,
            awayX,
            awayZ,
            pathState,
            now,
          );
          if (result) {
            pathState = result.pathState;
            const { dir } = result;
            const repulsion = manager.getRepulsionForce(enemy);
            pos.x += (dir.x + repulsion.x * 0.8) * MOVE_SPEED * 0.5 * dt;
            pos.z += (dir.z + repulsion.z * 0.8) * MOVE_SPEED * 0.5 * dt;
          }
        } else {
          // Within preferred range: strafe
          pathState = null;
          const toPlayer = new THREE.Vector3()
            .subVectors(playerPos, pos)
            .normalize();
          strafeTimer -= dt;
          if (strafeTimer <= 0) {
            strafeDir *= -1;
            strafeTimer = 1 + Math.random() * 2;
          }
          const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
          const repulsion = manager.getRepulsionForce(enemy);
          pos.x += (right.x * strafeDir * 0.5 + repulsion.x * 0.8) * MOVE_SPEED * dt;
          pos.z += (right.z * strafeDir * 0.5 + repulsion.z * 0.8) * MOVE_SPEED * dt;
        }

        if (shootDisplayTimer <= 0) enemy.model.play('walk');
        manager.syncPhysicsBody(enemy);
      } else {
        lostSightTimer += dt;

        if (enemy.lastKnownPlayerPos) {
          const pos = enemy.group.position;
          const target = enemy.lastKnownPlayerPos;
          const dist = Math.sqrt(
            (target.x - pos.x) ** 2 + (target.z - pos.z) ** 2,
          );
          if (dist > CHASE_ARRIVE_RADIUS) {
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
            }
          }
          manager.syncPhysicsBody(enemy);
        }

        if (lostSightTimer >= LOSE_SIGHT_TIMEOUT) {
          enemy.stateMachine.transition('alert', enemy);
        }
      }

      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = playerPos.clone();
        lostSightTimer = 0;
      }
    },

    exit() {},
  };
}
