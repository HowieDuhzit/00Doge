/**
 * Animation controller for custom GLB/VRM remote player models.
 * Uses AnimationMixer + clip mapping (same pattern as EnemyCustomModel).
 * Supports VRM normalized→raw copy for correct display.
 */

import * as THREE from 'three';
import { VRMHumanBoneList } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { solveTwoBoneIK } from '../core/two-bone-ik';
import type { LoadedCharacter } from '../core/model-loader';
import { isLoadedVRM } from '../core/model-loader';
import { Ragdoll, buildRagdollBoneMapping, type RagdollBoneMapping } from '../enemies/ragdoll';
import type { PhysicsWorld } from '../core/physics-world';

/** VRM normalized→raw copy params */
type VRMCopyParams = {
  bones: {
    boneName: string;
    rawName: string;
    normName: string;
    parentWorldRot: THREE.Quaternion;
    boneRot: THREE.Quaternion;
  }[];
};

function buildVRMCopyParams(vrm: VRM): VRMCopyParams | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const rig = (humanoid as { _normalizedHumanBones?: { _parentWorldRotations?: Record<string, THREE.Quaternion>; _boneRotations?: Record<string, THREE.Quaternion> } })._normalizedHumanBones;
  if (!rig?._parentWorldRotations || !rig?._boneRotations) return null;

  const bones: VRMCopyParams['bones'] = [];
  for (const boneName of VRMHumanBoneList) {
    const rawNode = humanoid.getRawBoneNode(boneName as never);
    const normNode = humanoid.getNormalizedBoneNode(boneName as never);
    const parentWorldRot = rig._parentWorldRotations[boneName];
    const boneRot = rig._boneRotations[boneName];
    if (rawNode && normNode && parentWorldRot && boneRot)
      bones.push({
        boneName,
        rawName: rawNode.name,
        normName: normNode.name,
        parentWorldRot: parentWorldRot.clone(),
        boneRot: boneRot.clone(),
      });
  }
  return { bones };
}

const _copyQ = new THREE.Quaternion();
const _copyV = new THREE.Vector3();
const _copyM = new THREE.Matrix4();

function copyNormalizedToRaw(mesh: THREE.Object3D, params: VRMCopyParams, copyHipsPosition: boolean): void {
  for (const { boneName, rawName, normName, parentWorldRot, boneRot } of params.bones) {
    const rawNode = mesh.getObjectByName(rawName);
    const normNode = mesh.getObjectByName(normName);
    if (!rawNode || !normNode) continue;

    _copyQ.copy(parentWorldRot).invert();
    rawNode.quaternion.copy(normNode.quaternion).multiply(parentWorldRot).premultiply(_copyQ).multiply(boneRot);

    if (copyHipsPosition && boneName === 'hips' && rawNode.parent) {
      normNode.getWorldPosition(_copyV);
      rawNode.parent.updateWorldMatrix(true, false);
      rawNode.position.copy(_copyV.applyMatrix4(_copyM.copy(rawNode.parent.matrixWorld).invert()));
    }
  }
}

/** Foot IK params for death sink */
type FootIKParams = { left: [string, string, string]; right: [string, string, string] };

function buildFootIKParams(vrm: VRM): FootIKParams | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const leftUpper = humanoid.getRawBoneNode('leftUpperLeg' as never);
  const leftLower = humanoid.getRawBoneNode('leftLowerLeg' as never);
  const leftFoot = humanoid.getRawBoneNode('leftFoot' as never);
  const rightUpper = humanoid.getRawBoneNode('rightUpperLeg' as never);
  const rightLower = humanoid.getRawBoneNode('rightLowerLeg' as never);
  const rightFoot = humanoid.getRawBoneNode('rightFoot' as never);
  if (!leftUpper || !leftLower || !leftFoot || !rightUpper || !rightLower || !rightFoot) return null;
  return {
    left: [leftUpper.name, leftLower.name, leftFoot.name],
    right: [rightUpper.name, rightLower.name, rightFoot.name],
  };
}

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _posC = new THREE.Vector3();
const _posT = new THREE.Vector3();
const _floorY = new THREE.Vector3();

function applyFootIK(mesh: THREE.Object3D, ik: FootIKParams, floorY: number): void {
  mesh.updateMatrixWorld(true);
  for (const [upperName, lowerName, footName] of [ik.left, ik.right]) {
    const upper = mesh.getObjectByName(upperName);
    const lower = mesh.getObjectByName(lowerName);
    const foot = mesh.getObjectByName(footName);
    if (!upper || !lower || !foot) continue;
    upper.getWorldPosition(_posA);
    lower.getWorldPosition(_posB);
    foot.getWorldPosition(_posC);
    _posT.set(_posC.x, floorY, _posC.z);
    solveTwoBoneIK(_posA, _posB, _posC, _posT, upper, lower);
  }
}

const DEATH_SINK = 0.9;

export type PlayerAnimState = 'idle' | 'walk' | 'death' | 'attack' | 'hit';

/** Called each frame with pelvis world position and rotation when ragdoll is active */
export type RagdollPelvisCallback = (pos: THREE.Vector3, quat: THREE.Quaternion) => void;

/**
 * Drives animation for custom player/character models in multiplayer.
 * Call update(dt) each frame and play(name) when state changes.
 */
export class CustomPlayerAnimator {
  private mesh: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private clipMap = new Map<string, { clip: THREE.AnimationClip; duration: number }>();
  private currentAction: THREE.AnimationAction | null = null;
  private vrmCopyParams: VRMCopyParams | null = null;
  private footIKParams: FootIKParams | null = null;
  private ragdollMapping: RagdollBoneMapping[] = [];
  private ragdoll: Ragdoll | null = null;
  private ragdollPelvisCallback: RagdollPelvisCallback | null = null;
  private meshBaseY = 0;

  constructor(
    mesh: THREE.Group,
    char: LoadedCharacter,
  ) {
    this.mesh = mesh;
    const { scene, animations } = { scene: char.scene, animations: char.animations };
    this.mixer = new THREE.AnimationMixer(mesh);

    if (isLoadedVRM(char)) {
      this.vrmCopyParams = buildVRMCopyParams(char.vrm);
      this.footIKParams = buildFootIKParams(char.vrm);
      this.ragdollMapping = buildRagdollBoneMapping(char.vrm);
    }

    // Build clip map (same logic as EnemyCustomModel)
    if (animations?.length) {
      const first = animations[0];
      const fallback = { clip: first, duration: first.duration };
      for (const clip of animations) {
        const nm = clip.name.toLowerCase().replace(/\s+/g, '_');
        if (!this.clipMap.has(nm)) this.clipMap.set(nm, { clip, duration: clip.duration });
        if (/\bidle\b|stand|default|pose|bind|tpose|t-pose|breathing/i.test(clip.name))
          this.clipMap.set('idle', { clip, duration: clip.duration });
        if (/\bwalk\b|locomotion|move|forward|run\b/i.test(clip.name))
          this.clipMap.set('walk', { clip, duration: clip.duration });
        if (/\bdeath\b|die|dead|dying/i.test(clip.name))
          this.clipMap.set('death', { clip, duration: clip.duration });
        if (/\b(attack|shoot|fire|aim|aiming)\b/i.test(clip.name) || /shoot|fire|attack|aim/i.test(nm)) {
          if (!this.clipMap.has('attack')) this.clipMap.set('attack', { clip, duration: clip.duration });
        }
        if (/\bhit\b|\bhurt\b|\bdamage\b|\brecoil\b/i.test(clip.name) || /hit|hurt|damage/i.test(nm))
          this.clipMap.set('hit', { clip, duration: clip.duration });
        if (/\brun\b/i.test(clip.name) && !this.clipMap.has('walk'))
          this.clipMap.set('walk', { clip, duration: clip.duration });
      }
      if (!this.clipMap.has('idle')) this.clipMap.set('idle', fallback);
      if (!this.clipMap.has('walk')) this.clipMap.set('walk', fallback);
    }

    // Base Y for death sink (mesh position is set by builder before animator is created)
    this.meshBaseY = mesh.position.y;
  }

  /** Activate ragdoll physics for death. Replaces death clip. Only for VRM with full rig. */
  activateRagdoll(physics: PhysicsWorld, onPelvisUpdate: RagdollPelvisCallback): boolean {
    if (this.ragdollMapping.length < 6) {
      if (this.ragdollMapping.length > 0) {
        console.warn('[CustomPlayerAnimator] Ragdoll skipped: need 6+ bones, got', this.ragdollMapping.length);
      }
      return false;
    }
    this.ragdoll?.dispose();
    this.ragdoll = new Ragdoll(physics, this.ragdollMapping);
    try {
      this.ragdoll.activate(this.mesh);
    } catch (e) {
      console.warn('[CustomPlayerAnimator] Ragdoll activation failed:', e);
      this.ragdoll.dispose();
      this.ragdoll = null;
      return false;
    }
    this.ragdollPelvisCallback = onPelvisUpdate;
    return true;
  }

  disposeRagdoll(): void {
    this.ragdoll?.dispose();
    this.ragdoll = null;
    this.ragdollPelvisCallback = null;
  }

  /** Restore mesh to correct height after respawn (undoes death sink). */
  resetMeshPosition(): void {
    const mesh = this.mixer.getRoot() as THREE.Object3D;
    mesh.position.y = this.meshBaseY;
  }

  /**
   * Full reset for respawn: dispose ragdoll, reset skeleton from ragdoll/death pose to bind pose,
   * then apply idle so the character stands correctly.
   */
  resetForRespawn(): void {
    this.disposeRagdoll();
    this.resetMeshPosition();

    // Reset skeleton to bind pose so ragdoll/death pose is cleared before applying idle
    const skinned = this.findSkinnedMesh(this.mesh);
    if (skinned?.skeleton) {
      skinned.skeleton.pose();
    }

    this.play('idle', true);
    this.mixer.update(0); // Apply idle pose immediately
  }

  private findSkinnedMesh(obj: THREE.Object3D): THREE.SkinnedMesh | null {
    if (obj instanceof THREE.SkinnedMesh) return obj;
    for (const c of obj.children) {
      const found = this.findSkinnedMesh(c);
      if (found) return found;
    }
    return null;
  }

  get isRagdollActive(): boolean {
    return this.ragdoll !== null;
  }

  update(dt: number): void {
    if (this.ragdoll) {
      const _p = new THREE.Vector3();
      const _q = new THREE.Quaternion();
      this.ragdoll.getPelvisPosition(_p);
      this.ragdoll.getPelvisQuaternion(_q);
      this.ragdollPelvisCallback?.(_p, _q);
      this.ragdoll.syncToSkeleton(this.mesh);
      return;
    }

    this.mixer.update(dt);

    if (this.vrmCopyParams) {
      const clipName = this.currentAction?.getClip().name?.toLowerCase() ?? '';
      const copyHips = clipName.includes('death') || clipName.includes('hit');
      copyNormalizedToRaw(this.mixer.getRoot() as THREE.Object3D, this.vrmCopyParams, copyHips);
    }

    // Death sink for VRM (pose has no Y translation)
    const clipName = this.currentAction?.getClip().name?.toLowerCase() ?? '';
    const mesh = this.mixer.getRoot() as THREE.Object3D;
    if (clipName.includes('death')) {
      const action = this.currentAction!;
      const clip = action.getClip();
      const duration = clip.duration;
      const t = duration > 0 ? Math.min(1, action.time / duration) : 1;
      const tSink = Math.min(1, t / 0.55);
      const progress = 1 - Math.pow(1 - tSink, 3);
      mesh.position.y = this.meshBaseY - DEATH_SINK * progress;
      if (this.footIKParams) {
        const ref = mesh.parent?.getWorldPosition(_floorY) ?? mesh.getWorldPosition(_floorY);
        const floorY = ref.y - 0.02;
        applyFootIK(mesh, this.footIKParams, floorY);
      }
    } else {
      mesh.position.y = this.meshBaseY;
    }
  }

  play(name: PlayerAnimState, force = false): void {
    if (this.clipMap.size === 0) return;
    const key = name.toLowerCase();
    let entry = this.clipMap.get(key);
    if (!entry) {
      entry = this.clipMap.get(key === 'attack' ? 'shoot' : key) ?? this.clipMap.get('idle');
    }
    if (!entry) return;

    // Don't override attack/death/hit while they're still playing (one-shot clips)
    const isOneShot = name === 'death' || name === 'attack' || name === 'hit';
    if (isOneShot) {
      const curClip = this.currentAction?.getClip();
      const isAttackDeathOrHit =
        curClip?.name?.toLowerCase().includes('attack') ||
        curClip?.name?.toLowerCase().includes('shoot') ||
        curClip?.name?.toLowerCase().includes('death') ||
        curClip?.name?.toLowerCase().includes('hit') ||
        curClip?.name?.toLowerCase().includes('hurt') ||
        curClip?.name?.toLowerCase().includes('damage');
      if (isAttackDeathOrHit && this.currentAction?.isRunning?.() && !force) return;
    } else {
      // When requesting idle/walk, don't cut off a playing attack or hit
      const curClip = this.currentAction?.getClip();
      const curIsOneShot =
        curClip?.name?.toLowerCase().includes('attack') ||
        curClip?.name?.toLowerCase().includes('shoot') ||
        curClip?.name?.toLowerCase().includes('hit') ||
        curClip?.name?.toLowerCase().includes('hurt') ||
        curClip?.name?.toLowerCase().includes('damage');
      if (curIsOneShot && this.currentAction?.isRunning?.()) return;
    }

    if (this.currentAction?.getClip() === entry.clip && !force) return;
    this.currentAction?.stop();
    this.currentAction = this.mixer.clipAction(entry.clip);
    this.currentAction.reset();
    this.currentAction.setLoop(
      name === 'death' || name === 'attack' || name === 'hit' ? THREE.LoopOnce : THREE.LoopRepeat,
      Infinity
    );
    this.currentAction.clampWhenFinished = name === 'death' || name === 'attack' || name === 'hit';
    this.currentAction.play();
  }

  get hasAnimations(): boolean {
    return this.clipMap.size > 0;
  }
}

