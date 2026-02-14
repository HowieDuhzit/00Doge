import type {
  DoorDef,
  LevelSchema,
  PickupSpawnDef,
  PropDef,
  RoomDef,
  SpawnDef,
} from './level-schema';

interface ArenaLayoutConfig {
  seed: number;
}

const ROOM_Y = 2;
const ROOM_HEIGHT = 4;
const DOOR_HEIGHT = 2.1;
const DOOR_WIDTH = 2.2;

const DEFAULT_CONFIG: ArenaLayoutConfig = {
  seed: 7007,
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let v = Math.imul(t ^ (t >>> 15), 1 | t);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export type MultiplayerMapId = 'crossfire' | 'wasteland' | 'dust';

const CROSSFIRE_ROOM_COLORS = {
  spawn: { floor: 0xf0e5d2, wall: 0xe9ddc6 },
  lane: { floor: 0xede2cf, wall: 0xe5d8c0 },
  laneSouth: { floor: 0xeaddc8, wall: 0xe2d3ba },
  switch: { floor: 0xf5ead7, wall: 0xe9ddc6 },
};

const WASTELAND_ROOM_COLORS = {
  spawn: { floor: 0x6a6e62, wall: 0x5a5e52 },
  lane: { floor: 0x5e6258, wall: 0x54584c },
  laneSouth: { floor: 0x5a5e54, wall: 0x50544a },
  switch: { floor: 0x666a5e, wall: 0x585c50 },
};

function createRooms(mapId: MultiplayerMapId): RoomDef[] {
  const c = mapId === 'wasteland' ? WASTELAND_ROOM_COLORS : CROSSFIRE_ROOM_COLORS;
  const rooms: RoomDef[] = [
    {
      id: 'spawn_west',
      x: -30,
      y: ROOM_Y,
      z: 0,
      width: 12,
      depth: 16,
      height: ROOM_HEIGHT,
      floorColor: c.spawn.floor,
      wallColor: c.spawn.wall,
    },
    {
      id: 'spawn_east',
      x: 30,
      y: ROOM_Y,
      z: 0,
      width: 12,
      depth: 16,
      height: ROOM_HEIGHT,
      floorColor: c.spawn.floor,
      wallColor: c.spawn.wall,
    },
    {
      id: 'lane_north_west',
      x: -18,
      y: ROOM_Y,
      z: -6,
      width: 12,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.lane.floor,
      wallColor: c.lane.wall,
    },
    {
      id: 'lane_north_mid',
      x: 0,
      y: ROOM_Y,
      z: -6,
      width: 24,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.lane.floor,
      wallColor: c.lane.wall,
    },
    {
      id: 'lane_north_east',
      x: 18,
      y: ROOM_Y,
      z: -6,
      width: 12,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.lane.floor,
      wallColor: c.lane.wall,
    },
    {
      id: 'lane_south_west',
      x: -18,
      y: ROOM_Y,
      z: 6,
      width: 12,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.laneSouth.floor,
      wallColor: c.laneSouth.wall,
    },
    {
      id: 'lane_south_mid',
      x: 0,
      y: ROOM_Y,
      z: 6,
      width: 24,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.laneSouth.floor,
      wallColor: c.laneSouth.wall,
    },
    {
      id: 'lane_south_east',
      x: 18,
      y: ROOM_Y,
      z: 6,
      width: 12,
      depth: 8,
      height: ROOM_HEIGHT,
      floorColor: c.laneSouth.floor,
      wallColor: c.laneSouth.wall,
    },
    {
      id: 'switch_west',
      x: -9,
      y: ROOM_Y,
      z: 0,
      width: 6,
      depth: 4,
      height: ROOM_HEIGHT,
      floorColor: c.switch.floor,
      wallColor: c.switch.wall,
    },
    {
      id: 'switch_center',
      x: 0,
      y: ROOM_Y,
      z: 0,
      width: 6,
      depth: 4,
      height: ROOM_HEIGHT,
      floorColor: c.switch.floor,
      wallColor: c.switch.wall,
    },
    {
      id: 'switch_east',
      x: 9,
      y: ROOM_Y,
      z: 0,
      width: 6,
      depth: 4,
      height: ROOM_HEIGHT,
      floorColor: c.switch.floor,
      wallColor: c.switch.wall,
    },
  ];

  return rooms;
}

function createDoors(): DoorDef[] {
  return [
    // Spawn access (west/east)
    { id: 'd_spawn_w_n', x: -24, y: ROOM_Y, z: -6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 3 },
    { id: 'd_spawn_w_s', x: -24, y: ROOM_Y, z: 6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 3 },
    { id: 'd_spawn_e_n', x: 24, y: ROOM_Y, z: -6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 3 },
    { id: 'd_spawn_e_s', x: 24, y: ROOM_Y, z: 6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 3 },

    // Main lane segments
    { id: 'd_lane_n_wm', x: -12, y: ROOM_Y, z: -6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 2.6 },
    { id: 'd_lane_n_me', x: 12, y: ROOM_Y, z: -6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 2.6 },
    { id: 'd_lane_s_wm', x: -12, y: ROOM_Y, z: 6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 2.6 },
    { id: 'd_lane_s_me', x: 12, y: ROOM_Y, z: 6, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'x', type: 'proximity', proximityRadius: 2.6 },

    // Lane switch connectors (keeps two main lanes but allows controlled rotates)
    { id: 'd_sw_w_n', x: -9, y: ROOM_Y, z: -2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
    { id: 'd_sw_w_s', x: -9, y: ROOM_Y, z: 2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
    { id: 'd_sw_c_n', x: 0, y: ROOM_Y, z: -2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
    { id: 'd_sw_c_s', x: 0, y: ROOM_Y, z: 2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
    { id: 'd_sw_e_n', x: 9, y: ROOM_Y, z: -2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
    { id: 'd_sw_e_s', x: 9, y: ROOM_Y, z: 2, width: DOOR_WIDTH, height: DOOR_HEIGHT, axis: 'z', type: 'proximity', proximityRadius: 2.2 },
  ];
}

function createLaneCoverProps(seed: number): PropDef[] {
  const rand = mulberry32(seed);
  const props: PropDef[] = [];

  const laneXs = [-15, -9, -3, 3, 9, 15];
  const lanes = [-6, 6];

  for (const laneZ of lanes) {
    for (const x of laneXs) {
      const zJitter = (rand() - 0.5) * 1.2;
      const roll = rand();
      const propType: PropDef['type'] =
        roll < 0.16 ? 'barrel' : roll < 0.52 ? 'crate_metal' : 'crate';
      const scale = propType === 'barrel' ? 1 : 0.86 + rand() * 0.28;
      props.push({
        type: propType,
        x,
        y: 0,
        z: laneZ + zJitter,
        scale,
      });
    }
  }

  // Spawn-room hard cover so players are not exposed on immediate push-out.
  props.push(
    { type: 'crate_metal', x: -31.5, y: 0, z: -2.2, scale: 1.05 },
    { type: 'crate', x: -31.5, y: 0, z: 2.2, scale: 1.0 },
    { type: 'crate_metal', x: 31.5, y: 0, z: -2.2, scale: 1.05 },
    { type: 'crate', x: 31.5, y: 0, z: 2.2, scale: 1.0 },
  );

  return props;
}

function createPickups(): PickupSpawnDef[] {
  return [
    { type: 'weapon-rifle', x: -18, y: 0, z: -6, amount: 1 },
    { type: 'weapon-shotgun', x: 18, y: 0, z: 6, amount: 1 },
    { type: 'weapon-sniper', x: 0, y: 0, z: -6, amount: 1 },
    { type: 'ammo-rifle', x: -9, y: 0, z: -6, amount: 30 },
    { type: 'ammo-shotgun', x: 9, y: 0, z: 6, amount: 12 },
    { type: 'ammo-sniper', x: 0, y: 0, z: 6, amount: 8 },
    { type: 'health', x: -9, y: 0, z: 0, amount: 25 },
    { type: 'health', x: 9, y: 0, z: 0, amount: 25 },
    { type: 'armor', x: 0, y: 0, z: 0, amount: 50 },
    { type: 'ammo-pistol', x: -30, y: 0, z: 0, amount: 24 },
    { type: 'ammo-pistol', x: 30, y: 0, z: 0, amount: 24 },
  ];
}

export function getMultiplayerArenaSpawnPoints(): SpawnDef[] {
  return [
    { x: -30, y: 0.5, z: 0 },
    { x: -26, y: 0.5, z: -6 },
    { x: -26, y: 0.5, z: 6 },
    { x: 30, y: 0.5, z: 0 },
    { x: 26, y: 0.5, z: -6 },
    { x: 26, y: 0.5, z: 6 },
    { x: 0, y: 0.5, z: -6 },
    { x: 0, y: 0.5, z: 6 },
  ];
}

export function getMultiplayerArenaDefaultSpawnPoint(): SpawnDef {
  const [first] = getMultiplayerArenaSpawnPoints();
  return { ...first };
}

/** Dust District spawn points (from dust-district.json layout). */
export function getDustDistrictSpawnPoints(): SpawnDef[] {
  return [
    { x: -28, y: 0.5, z: 0 },
    { x: -26, y: 0.5, z: -4 },
    { x: -26, y: 0.5, z: 4 },
    { x: 28, y: 0.5, z: 0 },
    { x: 26, y: 0.5, z: -4 },
    { x: 26, y: 0.5, z: 4 },
    { x: 0, y: 0.5, z: -6 },
    { x: 0, y: 0.5, z: 6 },
    { x: -15, y: 0.5, z: 30 },
    { x: 12, y: 0.5, z: 35 },
    { x: 20, y: 0.5, z: 40 },
  ];
}

export const MULTIPLAYER_MAPS: { id: MultiplayerMapId; name: string; description: string }[] = [
  { id: 'crossfire', name: 'Crossfire Complex', description: 'Palace-style arena' },
  { id: 'wasteland', name: 'Wasteland Depot', description: 'Industrial wasteland arena' },
  { id: 'dust', name: 'Dust District', description: 'Desert outdoor map with vehicles' },
];

const MAP_META: Record<Exclude<MultiplayerMapId, 'dust'>, { name: string; theme: 'palace' | 'wasteland'; briefing: string }> = {
  crossfire: {
    name: 'Crossfire Complex',
    theme: 'palace',
    briefing:
      'Procedural close-quarters multiplayer arena with two dominant shooting lanes and three connector rooms for rotates.',
  },
  wasteland: {
    name: 'Wasteland Depot',
    theme: 'wasteland',
    briefing:
      'Industrial wasteland arena. Same layout as Crossfire — two shooting lanes, three connector rooms. Dusty and worn.',
  },
};

export function createMultiplayerArena(
  mapId: Exclude<MultiplayerMapId, 'dust'> = 'crossfire',
  config: Partial<ArenaLayoutConfig> = {},
): LevelSchema {
  const finalConfig: ArenaLayoutConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const meta = MAP_META[mapId];

  return {
    name: meta.name,
    theme: meta.theme,
    briefing: meta.briefing,
    rooms: createRooms(mapId),
    doors: createDoors(),
    playerSpawn: getMultiplayerArenaDefaultSpawnPoint(),
    enemies: [],
    pickups: createPickups(),
    objectives: [],
    triggers: [],
    props: createLaneCoverProps(finalConfig.seed),
  };
}

/** @deprecated Use createMultiplayerArena('crossfire', config) instead. */
export function createProceduralMultiplayerArena(
  config: Partial<ArenaLayoutConfig> = {},
): LevelSchema {
  return createMultiplayerArena('crossfire', config);
}

