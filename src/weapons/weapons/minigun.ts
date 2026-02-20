import { WeaponBase } from '../weapon-base';

/**
 * M134 Minigun — 6-barrel rotary machine gun.
 * Very high fire rate, moderate damage per bullet, needs spin-up before firing.
 * Heavy weapon: large spread, medium range.
 */
export class Minigun extends WeaponBase {
  constructor() {
    super({
      name: 'M134 Minigun',
      damage: 18,
      fireRate: 20,          // 20 rounds/sec (1200 rpm) — devastating sustained fire
      maxAmmo: 200,
      reserveAmmo: 400,
      reloadTime: 3.5,       // Long reload (heavy weapon)
      spread: 0.06,          // Wide spread — suppressive fire
      range: 45,
      automatic: true,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
