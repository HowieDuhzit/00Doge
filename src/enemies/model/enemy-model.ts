/**
 * Low-poly 3D enemy model — replaces EnemySprite.
 * Same public interface: mesh, shadowMesh, animator, update(), triggerHitFlash(), play(), dispose().
 * No billboarding — parent group's rotation.y controls facing.
 */

import * as THREE from 'three';
import type { GuardVariant } from '../sprite/guard-sprite-sheet';
import type { EnemyWeaponType } from '../../weapons/weapon-stats-map';
import type { Pose } from './pose-library';
import { createGuardModel } from './guard-model-factory';
import { PoseAnimator, type AnimationName } from './pose-animator';

export class EnemyModel {
  readonly mesh: THREE.Group;
  readonly shadowMesh: THREE.Mesh;
  readonly animator: PoseAnimator;

  private joints: ReturnType<typeof createGuardModel>['joints'];
  private hitFlashMeshes: THREE.Mesh[];
  private hitTintTimer = 0;

  constructor(variant: GuardVariant, weaponType: EnemyWeaponType = 'pistol') {
    const { rootGroup, joints, hitFlashMeshes } = createGuardModel(variant, weaponType);
    this.mesh = rootGroup;
    this.joints = joints;
    this.hitFlashMeshes = hitFlashMeshes;
    this.animator = new PoseAnimator();

    // Blob shadow at feet
    const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.02;
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.applyPose(this.animator.currentPose);

    // Hit flash tint
    if (this.hitTintTimer > 0) {
      this.hitTintTimer -= dt;
      for (const m of this.hitFlashMeshes) {
        (m.material as THREE.MeshStandardMaterial).color.setHex(0xff4444);
      }
    } else {
      for (const m of this.hitFlashMeshes) {
        const orig = (m.userData as Record<string, number>).originalColor;
        if (typeof orig === 'number') {
          (m.material as THREE.MeshStandardMaterial).color.setHex(orig);
        }
      }
    }
  }

  triggerHitFlash(): void {
    this.hitTintTimer = 0.12;
  }

  play(name: AnimationName, force = false): void {
    this.animator.play(name, force);
  }

  private applyPose(pose: Pose): void {
    const get = (k: keyof Pose) => (pose[k] ?? 0) as number;

    // Hips Y offset (crouch / death collapse)
    this.joints.hips.position.y = 0.9 + get('hipsY');

    // Torso
    this.joints.torso.rotation.x = get('torsoX');
    this.joints.torso.rotation.z = get('torsoZ');

    // Head
    this.joints.head.rotation.x = get('headX');
    this.joints.head.rotation.y = get('headY');
    this.joints.head.rotation.z = get('headZ');

    // Arms
    this.joints.leftShoulder.rotation.x = get('leftShoulderX');
    this.joints.leftShoulder.rotation.z = get('leftShoulderZ');
    this.joints.rightShoulder.rotation.x = get('rightShoulderX');
    this.joints.rightShoulder.rotation.z = get('rightShoulderZ');
    this.joints.leftElbow.rotation.x = get('leftElbowX');
    this.joints.rightElbow.rotation.x = get('rightElbowX');

    // Legs — rotation.x swings in YZ plane (forward/back), rotation.x on knee for bend
    this.joints.leftHip.rotation.set(get('leftHipX'), 0, 0);
    this.joints.rightHip.rotation.set(get('rightHipX'), 0, 0);
    this.joints.leftKnee.rotation.set(get('leftKneeX'), 0, 0);
    this.joints.rightKnee.rotation.set(get('rightKneeX'), 0, 0);
  }

  dispose(): void {
    this.shadowMesh.geometry.dispose();
    (this.shadowMesh.material as THREE.Material).dispose();
    for (const m of this.hitFlashMeshes) {
      (m.material as THREE.Material).dispose();
    }
  }
}
