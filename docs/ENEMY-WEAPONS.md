# Enemy Weapons System

Reference for enemy weapon configuration and multiplayer integration.

## Overview

Enemies use the **same weapon types** as the player: `pistol`, `rifle`, `shotgun`, `sniper`. Stats (damage, fire rate, spread, range) are pulled from the player weapon definitions so they stay in sync. Enemies do not use generated or custom weapons.

## Weapon Types

| Type    | Player Class | Damage | Fire Rate | Range | Rays/Shot |
|---------|--------------|--------|-----------|-------|-----------|
| pistol  | Pistol (PP7) | 25     | 3/s       | 60    | 1         |
| rifle   | Rifle (KF7)  | 25     | 8/s       | 50    | 1         |
| shotgun | Shotgun      | 12×8   | 1.2/s     | 20    | 8         |
| sniper  | Sniper       | 80     | 0.8/s     | 150   | 1         |

*Stats live in `src/weapons/weapons/*.ts`. Enemy stats come from `src/weapons/weapon-stats-map.ts` (instantiates each weapon once to read stats).*

## Level Configuration

In level JSON (`public/levels/*.json`), each enemy can have a `weapon` field:

```json
{
  "enemies": [
    {"x": 4, "y": -2, "z": 4, "facingAngle": 0.5, "weapon": "pistol"},
    {"x": 12, "y": -2, "z": 20, "facingAngle": -0.5, "variant": "soldier", "weapon": "rifle"}
  ]
}
```

- **Default:** `"weapon": "pistol"` if omitted
- **Valid values:** `"pistol"`, `"rifle"`, `"shotgun"`, `"sniper"`

## Code Flow

1. **Schema:** `EnemySpawnDef.weapon?: EnemyWeaponType` — `src/levels/level-schema.ts`
2. **Spawn:** `EnemyManager.spawnEnemy()` receives `weapon` from level builder
3. **Enemy:** `EnemyBase` stores `weaponType` and `weaponStats` (from `getEnemyWeaponStats()`)
4. **Fire:** `EnemyManager.enemyFireAtPlayer()` uses `enemy.weaponStats` for damage, rays, spread, range
5. **Visuals:** `guard-model-factory.ts` builds weapon mesh based on `weaponType` (pistol/rifle/shotgun/sniper shapes)
6. **Audio:** `playGunshotWeapon(enemy.weaponType)` plays weapon-specific sound

## Key Files

| File | Purpose |
|------|---------|
| `src/weapons/weapon-stats-map.ts` | `ENEMY_WEAPON_STATS`, `getEnemyWeaponStats()` — single source for enemy weapon stats |
| `src/weapons/weapons/{pistol,rifle,shotgun,sniper}.ts` | Player weapon definitions (enemy stats mirror these) |
| `src/enemies/enemy-base.ts` | `weaponType`, `weaponStats`, `canFire()` |
| `src/enemies/enemy-manager.ts` | `enemyFireAtPlayer()` — multi-ray for shotgun |
| `src/enemies/model/guard-model-factory.ts` | Weapon mesh geometry per type |
| `src/levels/level-schema.ts` | `EnemySpawnDef.weapon` |

## Multiplayer: Future Integration

When adding AI enemies to multiplayer:

1. **Spawn sync:** Server spawns enemies from level data (`weapon` field). Broadcast `EnemySpawnedEvent` with `{ id, x, y, z, facingAngle, variant, weapon }`.

2. **Fire validation:** Server validates enemy hits:
   - Use same damage/fire-rate/range as client (`ENEMY_WEAPON_STATS` or server copy)
   - Shotgun: validate up to 8 rays, each `stats.damage` (12)
   - Sniper: single ray, `stats.damage` (80)

3. **State sync:** Remote clients render enemies with correct weapon model (`weaponType` in spawn payload). No per-shot network for enemies — server computes hit and broadcasts damage.

4. **Weapon consistency:** Ensure `server/game-room.ts` (or future enemy validation) uses the same weapon stats. Consider importing `getEnemyWeaponStats` or a shared constants module.

5. **Networking events:** Define `EnemySpawnedEvent`, `EnemyDamageEvent`, `EnemyKilledEvent` in `src/network/network-events.ts` when implementing.
