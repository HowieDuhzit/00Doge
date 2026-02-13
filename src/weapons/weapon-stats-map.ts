/**
 * Shared weapon stats for enemy AI.
 * Uses the exact same stats as player weapons (Pistol, Rifle, Shotgun, Sniper)
 * so damage/fireRate/range stay in sync.
 */
import type { WeaponStats } from './weapon-base';
import { Pistol } from './weapons/pistol';
import { Rifle } from './weapons/rifle';
import { Shotgun } from './weapons/shotgun';
import { Sniper } from './weapons/sniper';

export type EnemyWeaponType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

const _pistol = new Pistol();
const _rifle = new Rifle();
const _shotgun = new Shotgun();
const _sniper = new Sniper();

/** Stats for each weapon type — used by enemies. Must match player weapon stats. */
export const ENEMY_WEAPON_STATS: Record<EnemyWeaponType, WeaponStats> = {
  pistol: _pistol.stats,
  rifle: _rifle.stats,
  shotgun: _shotgun.stats,
  sniper: _sniper.stats,
};

export function getEnemyWeaponStats(type: EnemyWeaponType): WeaponStats {
  return ENEMY_WEAPON_STATS[type];
}
